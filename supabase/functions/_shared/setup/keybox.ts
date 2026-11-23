// vault-writer's one route, with everything outside it passed in (keybox.test.ts runs it with fakes).
// The owner's page sends a one-time ticket, a username and a password. This saves them to the client's own 1Password
// vault, types them into the login form the setup tagged, and answers with codes only. The values are never logged,
// stored in Pip's database, returned, or shown to a model.
import type { Page } from "./engine.ts";
import type { Vault } from "./vendors.ts";

export interface KeyboxDeps {
  ticket(hash: string): Promise<{ setup_id: string; expires_at: string; used_at: string | null } | null>;
  useTicket(hash: string): Promise<boolean>;                  // marks it used; false if someone used it first
  setup(id: string): Promise<{ id: string; business_id: string; tool: string; tool_key: string; login_url: string | null; state: string; browser_session_id: string | null; plan: Record<string, any> } | null>;
  vault(): Promise<Vault | null>;
  page(sessionId: string): Promise<Page | null>;
  fill(page: Page, username: string, password: string): Promise<{ user: boolean; pass: boolean; submitted: boolean }>;
  saveRef(row: { business_id: string; tool_name: string; login_url: string | null; vault_ref: string; username_hint: string; setup_id: string }): Promise<string | null>;
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

export async function keybox(body: unknown, deps: KeyboxDeps): Promise<{ status: number; code: string }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const ticket = typeof b.ticket === "string" ? b.ticket : "", username = typeof b.username === "string" ? b.username : "", password = typeof b.password === "string" ? b.password : "";
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(ticket)) return { status: 400, code: "bad_ticket" };
  if (!username.trim() || username.length > 200 || !password || password.length > 500) return { status: 400, code: "bad_input" };
  const h = await sha(ticket);
  const t = await deps.ticket(h);
  if (!t || t.used_at || Date.parse(t.expires_at) < Date.now()) return { status: 403, code: "ticket_expired" };
  const s = await deps.setup(t.setup_id);
  if (!s || s.state !== "owner_control" || !s.browser_session_id) return { status: 409, code: "not_waiting_for_sign_in" };
  if (!(await deps.useTicket(h))) return { status: 403, code: "ticket_expired" };
  const vault = await deps.vault();
  if (!vault) return { status: 503, code: "vault_not_configured" };
  const page = await deps.page(s.browser_session_id);
  if (!page) return { status: 409, code: "browser_closed" };

  // Vault first: if it fails, nothing is typed anywhere and the owner can type on the page instead.
  let ref: string;
  try {
    const vid = await vault.vaultFor(s.business_id, s.tool);
    ref = (await vault.putLogin(vid, { title: s.tool, url: s.login_url ?? "", username: username.trim(), password })).ref;
  } catch {
    await deps.note(s.id, { did: "vault_failed" });
    return { status: 502, code: "vault_failed" };
  }
  const itemId = await deps.saveRef({ business_id: s.business_id, tool_name: s.tool, login_url: s.login_url, vault_ref: ref, username_hint: hint(username.trim()), setup_id: s.id });
  if (deps.canaries) await deps.canaries(s.id, [username.trim(), password]).catch(() => {});
  const filled = await deps.fill(page, username.trim(), password).catch(() => ({ user: false, pass: false, submitted: false }));
  await deps.note(s.id, { did: "keybox", vault: !!itemId, user: filled.user, pass: filled.pass, submitted: filled.submitted });
  return { status: 200, code: filled.submitted ? "submitted" : filled.user || filled.pass ? "filled" : "saved_not_filled" };
}
