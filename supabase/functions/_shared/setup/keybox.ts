// vault-writer's one route, with everything outside it passed in (keybox.test.ts runs it with fakes).
// The owner's page sends a one-time ticket, a username and a password. This saves them to the client's own 1Password
// vault, types them into the login form the setup tagged, and answers with codes only. The values are never logged,
// stored in Pip's database, returned, or shown to a model.
import type { Page } from "./engine.ts";
import type { Vault } from "./vendors.ts";
import { siteOf } from "./guards.ts";

export interface KeyboxDeps {
  ticket(hash: string): Promise<{ setup_id: string; expires_at: string; used_at: string | null } | null>;
  useTicket(hash: string): Promise<boolean>;                  // marks it used; false if someone used it first
  setup(id: string): Promise<{ id: string; business_id: string; tool: string; tool_key: string; login_url: string | null; state: string; browser_session_id: string | null; plan: Record<string, any> } | null>;
  vault(): Promise<Vault | null>;
  page(sessionId: string): Promise<Page | null>;
  fill(page: Page, username: string, password: string): Promise<{ user: boolean; pass: boolean; submitted: boolean }>;
  saveRef(row: { business_id: string; tool_name: string; login_url: string | null; vault_ref: string; username_hint: string; setup_id: string; has_authenticator?: boolean }): Promise<string | null>;
  terms?(toolKey: string): Promise<"allowed" | "forbidden" | "unknown">; // what Pip knows about this tool's rules on automated sign-in
  note(setupId: string, what: Record<string, unknown>): Promise<void>;
  canaries?(setupId: string, secrets: string[]): Promise<void>; // test runs only: slice hashes for the leak check
}

export const hint = (u: string) => {
  const at = u.indexOf("@");
  if (at > 0) return `${u[0]}••••${u.slice(at, at + 7)}`.slice(0, 12);
  return `${u[0] ?? ""}••••`.slice(0, 12);
};
async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The authenticator setup key for a separate "Pip" login, as the tool shows it when two-step sign-in is switched on:
 * either the otpauth:// link or the bare key. Returned as an otpauth link for the vault, or null if it is neither.
 */
export function authenticatorOf(raw: string): string | null {
  const v = raw.trim();
  if (/^otpauth:\/\/totp\//i.test(v)) return v.length <= 500 && /[?&]secret=[A-Za-z2-7]{16,}/.test(v) ? v : null;
  const key = v.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z2-7]{16,64}$/.test(key) ? `otpauth://totp/Pip?secret=${key}` : null;
}

export async function keybox(body: unknown, deps: KeyboxDeps): Promise<{ status: number; code: string }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const ticket = typeof b.ticket === "string" ? b.ticket : "", username = typeof b.username === "string" ? b.username : "", password = typeof b.password === "string" ? b.password : "";
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(ticket)) return { status: 400, code: "bad_ticket" };
  if (!username.trim() || username.length > 200 || !password || password.length > 500) return { status: 400, code: "bad_input" };
  const rawAuth = typeof b.authenticator === "string" ? b.authenticator.trim() : "";
  const authenticator = rawAuth ? authenticatorOf(rawAuth) : null;
  if (rawAuth && !authenticator) return { status: 400, code: "bad_authenticator" };
  const h = await sha(ticket);
  const t = await deps.ticket(h);
  if (!t || t.used_at || Date.parse(t.expires_at) < Date.now()) return { status: 403, code: "ticket_expired" };
  const s = await deps.setup(t.setup_id);
  if (!s || s.state !== "owner_control" || !s.browser_session_id) return { status: 409, code: "not_waiting_for_sign_in" };
  // An authenticator secret lets Pip sign in with nobody there. Pip keeps one only for a tool whose terms it has
  // checked and found to allow automated sign-in. Refused before the ticket is spent, so the owner can send again without it.
  if (authenticator && (await deps.terms?.(s.tool_key)) !== "allowed") return { status: 409, code: "authenticator_not_allowed" };
  if (!(await deps.useTicket(h))) return { status: 403, code: "ticket_expired" };
  const vault = await deps.vault();
  if (!vault) return { status: 503, code: "vault_not_configured" };
  const page = await deps.page(s.browser_session_id);
  if (!page) return { status: 409, code: "browser_closed" };
  // The vault only ever serves the tool's own site. If the browser has ended up anywhere else, nothing is saved or typed.
  const href = await page.evaluate<string>("location.href").catch(() => "");
  const site = siteOf(s.login_url ?? "");
  if (!/^https:\/\//i.test(href) || !site || siteOf(href) !== site) { await deps.note(s.id, { did: "wrong_site" }); return { status: 409, code: "wrong_site" }; }

  // Vault first: if it fails, nothing is typed anywhere and the owner can type on the page instead.
  let ref: string;
  try {
    const vid = await vault.vaultFor(s.business_id, s.tool);
    ref = (await vault.putLogin(vid, { title: s.tool, url: s.login_url ?? "", username: username.trim(), password, ...(authenticator ? { authenticator } : {}) })).ref;
  } catch {
    await deps.note(s.id, { did: "vault_failed" });
    return { status: 502, code: "vault_failed" };
  }
  const itemId = await deps.saveRef({ business_id: s.business_id, tool_name: s.tool, login_url: s.login_url, vault_ref: ref, username_hint: hint(username.trim()), setup_id: s.id, has_authenticator: !!authenticator });
  if (deps.canaries) await deps.canaries(s.id, [username.trim(), password, ...(authenticator ? [authenticator.split("secret=")[1].split("&")[0]] : [])]).catch(() => {});
  const filled = await deps.fill(page, username.trim(), password).catch(() => ({ user: false, pass: false, submitted: false }));
  await deps.note(s.id, { did: "keybox", vault: !!itemId, user: filled.user, pass: filled.pass, submitted: filled.submitted });
  return { status: 200, code: filled.submitted ? "submitted" : filled.user || filled.pass ? "filled" : "saved_not_filled" };
}
