// vault-writer's second job: put a login the owner already saved back into the tool's own sign-in page, when Pip has
// been signed out in the background. No model runs here and nothing is returned but a code.
//
// The one rule that matters most: the vault fills on the tool's own sign-in host and nowhere else. The page's address
// is read from the browser itself, and unless its host is exactly the sign-in page's host (or one the owner themselves
// signed in on), the vault is never even opened. A shared parent domain is not enough.
import type { Page } from "./engine.ts";
import type { Vault } from "./vendors.ts";
import { signInHostOk, TAG_LOGIN_JS } from "./guards.ts";

export type FillAnswer = "submitted" | "filled" | "wrong_site" | "no_form" | "no_login" | "no_code" | "vault_failed" | "bad_request" | "browser_closed";
export interface FillIdentity { id: string; login_url: string; signin_hosts: string[]; vault_item_id: string | null; totp: boolean }
export interface KeyfillDeps {
  identity(id: string): Promise<FillIdentity | null>;
  vaultRef(vaultItemId: string): Promise<string | null>;     // the op:// reference kept in vault_items
  vault(): Promise<Vault | null>;
  page(sessionId: string): Promise<Page | null>;
  fill(page: Page, username: string, password: string): Promise<{ user: boolean; pass: boolean; submitted: boolean }>;
  fillCode(page: Page, code: string): Promise<{ field: boolean; submitted: boolean }>;
  used(vaultItemId: string, ok: boolean): Promise<void>;       // last_used_at / last_ok_at, never a value
  wait?(ms: number): Promise<void>;
}
type Tags = { user: boolean; pass: boolean; submit: boolean; twoStep: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only when the page the browser is on right now is an https page on the tool's own sign-in host. */
async function onOwnSite(page: Page, id: FillIdentity): Promise<boolean> {
  const href = await page.evaluate<string>("location.href").catch(() => "");
  return signInHostOk(href, id.login_url, id.signin_hosts ?? []);
}

export async function fillSaved(body: unknown, mode: "login" | "code", deps: KeyfillDeps): Promise<{ status: number; code: FillAnswer }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const identityId = typeof b.identity_id === "string" && UUID.test(b.identity_id) ? b.identity_id : "";
  const sessionId = typeof b.session_id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(b.session_id) ? b.session_id : "";
  if (!identityId || !sessionId) return { status: 400, code: "bad_request" };
  const id = await deps.identity(identityId);
  if (!id || !id.vault_item_id) return { status: 409, code: "no_login" };
  if (mode === "code" && !id.totp) return { status: 409, code: "no_code" };
  const page = await deps.page(sessionId);
  if (!page) return { status: 409, code: "browser_closed" };
  // Before the vault is opened at all.
  if (!(await onOwnSite(page, id))) return { status: 409, code: "wrong_site" };
  const ref = await deps.vaultRef(id.vault_item_id);
  const vault = ref ? await deps.vault() : null;
  if (!ref || !vault) return { status: 503, code: "vault_failed" };
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (mode === "login") {
    let tags = await page.evaluate<Tags>(TAG_LOGIN_JS);
    if (!tags.user && !tags.pass) return { status: 409, code: "no_form" };
    let login: { username: string; password: string };
    try { login = await vault.getLogin(ref); } catch { await deps.used(id.vault_item_id, false).catch(() => {}); return { status: 502, code: "vault_failed" }; }
    if (tags.twoStep) {
      // Username first, password on the next screen. Fill the username, wait for the password field, and check the
      // site again before typing the password: the first screen must not be able to send the password elsewhere.
      await deps.fill(page, login.username, "");
      for (let i = 0; i < 12; i++) { await wait(500); tags = await page.evaluate<Tags>(TAG_LOGIN_JS).catch(() => tags); if (tags.pass) break; }
      if (!tags.pass) return { status: 200, code: "filled" };
      if (!(await onOwnSite(page, id))) return { status: 409, code: "wrong_site" };
      const r = await deps.fill(page, tags.user ? login.username : "", login.password);
      await deps.used(id.vault_item_id, r.pass).catch(() => {});
      return { status: 200, code: r.submitted ? "submitted" : "filled" };
    }
    const r = await deps.fill(page, login.username, login.password);
    await deps.used(id.vault_item_id, r.pass).catch(() => {});
    return { status: 200, code: r.submitted ? "submitted" : r.user || r.pass ? "filled" : "no_form" };
  }

  let code: string | null;
  try { code = (await vault.getLogin(ref)).code; } catch { return { status: 502, code: "vault_failed" }; }
  if (!code) return { status: 409, code: "no_code" };
  const r = await deps.fillCode(page, code);
  if (!r.field) return { status: 409, code: "no_form" };
  return { status: 200, code: r.submitted ? "submitted" : "filled" };
}
