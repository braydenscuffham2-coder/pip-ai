// vault-writer: the only code that holds the 1Password token, and the only place a client's password passes through.
// No model runs here. The Setup Agent page (setup.html) sends a one-time ticket, a username and a password:
//
//   POST /vault-writer/keys  { ticket, username, password }  ->  { ok, code }
//
// It saves the login to the client's own 1Password vault (one vault per client), keeps only the op:// reference in
// vault_items, types the two values into the login form the setup tagged, and answers with a code. Nothing it receives
// is logged, stored in Pip's database, sent back, or shown to a model. The logic is in ../_shared/setup/keybox.ts.
//
// Secrets: OP_SERVICE_ACCOUNT_TOKEN (a 1Password Service Account created with --can-create-vaults), BROWSERBASE_API_KEY,
// optional BROWSERBASE_PROJECT_ID.
import { keybox, type KeyboxDeps } from "../_shared/setup/keybox.ts";
import { Cdp, fillLogin, openPage } from "../_shared/setup/cdp.ts";
import { browserbase, onePassword, type Vault } from "../_shared/setup/vendors.ts";
import { sliceHashes } from "../_shared/setup/guards.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OP = Deno.env.get("OP_SERVICE_ACCOUNT_TOKEN") ?? "";
const bb = browserbase({ apiKey: Deno.env.get("BROWSERBASE_API_KEY") ?? "", projectId: Deno.env.get("BROWSERBASE_PROJECT_ID") || undefined });

// The Portal and its previews only. The ticket is the real lock; this keeps other sites' pages from even trying.
const ORIGIN_OK = (o: string) => /^https:\/\/(www\.)?hirepip\.com$/.test(o) || /^https:\/\/pip-ai[a-z0-9-]*\.vercel\.app$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
const cors = (req: Request) => { const o = req.headers.get("origin") ?? ""; return { "access-control-allow-origin": ORIGIN_OK(o) ? o : "https://www.hirepip.com", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" }; };
const json = (req: Request, o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "no-store" } });
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...((init.headers as Record<string, string>) || {}) }, signal: AbortSignal.timeout(10000) });
const rows = async (path: string) => { const r = await db(path); return r.ok ? await r.json() : []; };
const setting = async (k: string) => (await rows(`forge_settings?key=eq.${k}&select=value`))?.[0]?.value;

let vault: Vault | null = null;
const sockets: Cdp[] = [];

const deps: KeyboxDeps = {
  async ticket(hash) { return (await rows(`setup_tickets?hash=eq.${hash}&select=setup_id,expires_at,used_at`))?.[0] ?? null; },
  async useTicket(hash) {
    const r = await db(`setup_tickets?hash=eq.${hash}&used_at=is.null`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ used_at: new Date().toISOString() }) });
    return r.ok && ((await r.json()) as unknown[]).length === 1;
  },
  async setup(id) { return (await rows(`setup_sessions?id=eq.${id}&select=id,business_id,tool,tool_key,login_url,state,browser_session_id,plan`))?.[0] ?? null; },
  async vault() { if (!OP) return null; vault ??= await onePassword(OP); return vault; },
  async page(sessionId) {
    const url = await bb.connectUrl(sessionId); if (!url) return null;
    const c = await Cdp.connect(url); sockets.push(c);
    return await openPage(c);
  },
  fill: fillLogin,
  async saveRef(r) {
    const res = await db("vault_items", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ business_id: r.business_id, tool_name: r.tool_name.slice(0, 120), login_url: r.login_url, vault_provider: "1password", vault_ref: r.vault_ref, username_hint: r.username_hint, status: "stored", created_by: "setup-agent" }) });
    const id = res.ok ? ((await res.json()) as any[])?.[0]?.id ?? null : null;
    if (id) await db(`setup_sessions?id=eq.${r.setup_id}`, { method: "PATCH", body: JSON.stringify({ vault_item_id: id, updated_at: new Date().toISOString() }) }).then((x) => x.body?.cancel());
    return id;
  },
  async note(setupId, what) {
    const s = (await rows(`setup_sessions?id=eq.${setupId}&select=log,owner_taps`))?.[0];
    const log = [...(s?.log ?? []).slice(-150), { at: new Date().toISOString(), ...what }];
    await db(`setup_sessions?id=eq.${setupId}`, { method: "PATCH", body: JSON.stringify({ log, owner_taps: (s?.owner_taps ?? 0) + 1, updated_at: new Date().toISOString() }) }).then((x) => x.body?.cancel());
  },
  // Test runs only: hashes of every 8-character slice, so the leak check can look for the login without knowing it.
  async canaries(setupId, secrets) {
    if ((await setting("setup_leak_check")) !== true) return;
    const s = (await rows(`setup_sessions?id=eq.${setupId}&select=business_id`))?.[0];
    const sandbox = await setting("act_sandbox_businesses");
    if (!s || !Array.isArray(sandbox) || !sandbox.includes(s.business_id)) return;
    const hashes = [...new Set((await Promise.all(secrets.filter((x) => x.length >= 8).map(sliceHashes))).flat())];
    await db("setup_canaries?on_conflict=setup_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ setup_id: setupId, hashes }) }).then((x) => x.body?.cancel());
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST" || !new URL(req.url).pathname.endsWith("/keys")) return json(req, { ok: false, code: "not_found" }, 404);
  const text = await req.text().catch(() => "");
  if (text.length > 4000) return json(req, { ok: false, code: "bad_input" }, 400);
  let body: unknown = null; try { body = JSON.parse(text); } catch { /* bad json */ }
  try {
    const r = await keybox(body, deps);
    return json(req, { ok: r.status === 200, code: r.code }, r.status);
  } catch {
    // Deliberately nothing logged: the request held a password.
    return json(req, { ok: false, code: "server" }, 500);
  } finally {
    for (const c of sockets.splice(0)) c.close();
  }
});
