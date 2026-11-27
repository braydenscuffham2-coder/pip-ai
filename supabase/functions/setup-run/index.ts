// setup-run: the Setup Agent's runner. One state per call, chained like scan-run, with its state in setup_sessions.
//
//   POST /setup-run/step  { setup_id }   internal (service key): run one step, then chain the next unless it waits
//   POST /setup-run/live  { setup_id }   internal (service key): the live-view link for pip-portal to hand the owner
//   POST /setup-run/stop  { setup_id }   internal (service key): close the browser and stop
//
// The steps themselves live in ../_shared/setup/engine.ts and the limits in ../_shared/setup/guards.ts.
// Secrets: ANTHROPIC_API_KEY, BROWSERBASE_API_KEY, optional BROWSERBASE_PROJECT_ID and SETUP_MODEL. No 1Password token:
// only vault-writer holds that.
import { type Deps, type SetupRow, step } from "../_shared/setup/engine.ts";
import { Cdp, openPage } from "../_shared/setup/cdp.ts";
import { browserbase } from "../_shared/setup/vendors.ts";
import { type Action, leaks, sessionMinutes } from "../_shared/setup/guards.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("SETUP_MODEL") ?? "claude-sonnet-5-5";
const BBKEY = Deno.env.get("BROWSERBASE_API_KEY") ?? "";
const bb = browserbase({ apiKey: BBKEY, projectId: Deno.env.get("BROWSERBASE_PROJECT_ID") || undefined });
const SELF = `${SB_URL}/functions/v1/setup-run`;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...((init.headers as Record<string, string>) || {}) }, signal: AbortSignal.timeout(10000) });
const rows = async (path: string) => { const r = await db(path); return r.ok ? await r.json() : []; };
const rpc = async (fn: string, args: unknown) => { const r = await db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }); return r.ok ? await r.json().catch(() => null) : null; };
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// One open socket per session per call; closed when the call ends.
const sockets = new Map<string, Cdp>();
async function pageOf(sessionId: string) {
  try {
    let c = sockets.get(sessionId);
    if (!c) { const url = await bb.connectUrl(sessionId); if (!url) return null; c = await Cdp.connect(url); sockets.set(sessionId, c); }
    return await openPage(c);
  } catch { return null; }
}

async function setting(key: string) { return (await rows(`forge_settings?key=eq.${key}&select=value`))?.[0]?.value; }

// ---------- the leak check (TEST businesses with setup_leak_check on) ----------
// Every prompt is checked against the hashes of the test login before it is sent, and every masked screenshot the model
// sees is saved (setup_shots) so scripts/setup-leak-check.mjs can read it. Off for real clients.
async function leakCheck(row: SetupRow): Promise<Set<string> | null> {
  if ((await setting("setup_leak_check")) !== true) return null;
  const sandbox = await setting("act_sandbox_businesses");
  if (!Array.isArray(sandbox) || !sandbox.includes(row.business_id)) return null;
  const c = (await rows(`setup_canaries?setup_id=eq.${row.id}&select=hashes`))?.[0];
  return new Set<string>(c?.hashes ?? []);
}
async function keepShot(row: SetupRow, image: string) {
  await db("setup_shots?on_conflict=setup_id,step,state", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ setup_id: row.id, step: row.step, state: row.state, jpeg_b64: image }) }).then((r) => r.body?.cancel()).catch(() => {});
}

/** The model's one next action, as JSON, read from a masked screenshot. Never given a secret: see engine.ts. */
async function model(input: { system: string; text: string; image: string }, row: SetupRow): Promise<{ action: Action; usage: Record<string, number> }> {
  const canaries = await leakCheck(row);
  if (canaries) {
    await keepShot(row, input.image);
    if (canaries.size && (await leaks(`${input.system}\n${input.text}`, canaries)) > 0) throw new Error("leak_blocked: a test login was about to reach a prompt");
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(60000),
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: input.image } }, { type: "text", text: input.text }] }] }),
  });
  const j = await r.json().catch(() => ({}));
  const text = ((j.content || []) as any[]).filter((c) => c.type === "text").map((c) => c.text).join("");
  let action: Action = { type: "need_owner", reason: "Pip could not read the page." };
  try { const m = text.match(/\{[\s\S]*\}/); if (m) action = JSON.parse(m[0]); } catch { /* keep need_owner */ }
  return { action, usage: j.usage ?? {} };
}

const deps: Deps = {
  async paused() { return (await setting("kill_switch")) === true || (await setting("setup_paused")) === true; },
  async take(usd) { const why = await rpc("pip_take", { p_kind: "setup_usd", p_units: Math.round(usd * 10000) / 10000, p_room: 0 }); return typeof why === "string" ? why : null; },
  async terms(key) { return (await rows(`tool_terms?tool_key=eq.${encodeURIComponent(key)}&select=automation`))?.[0]?.automation ?? "unknown"; },
  async healthBlocked(bid) {
    const b = (await rows(`businesses?id=eq.${bid}&select=health_lane`))?.[0];
    if (!b?.health_lane) return false;
    const signed = await rows(`business_agreements?business_id=is.null&kind=eq.baa_vendor&status=eq.signed&select=party`);
    const have = new Set((signed ?? []).map((x: any) => String(x.party).toLowerCase()));
    return !(have.has("browserbase") && have.has("anthropic"));
  },
  async steps(row) {
    const listed = Array.isArray(row.plan?.steps) ? row.plan.steps.filter((s: unknown) => typeof s === "string").slice(0, 12) : [];
    return listed.length ? listed : ["Confirm you are signed in and can see the main dashboard. Change nothing."];
  },
  browser: {
    async open(row) {
      const contextId = row.browser_context_id || await bb.context();
      const s = await bb.session(contextId, sessionMinutes(await setting("setup_session_minutes")));
      return { sessionId: s.id, contextId };
    },
    page: pageOf,
    async close(id) { sockets.get(id)?.close(); sockets.delete(id); await bb.release(id); },
  },
  model,
  async composioTest(row) {
    const slug = row.plan?.test_slug;
    if (typeof slug !== "string" || !/^[A-Z0-9_]{3,80}$/.test(slug)) return null;
    const r = await fetch(`${SB_URL}/functions/v1/pip-turn/diag`, { method: "POST", headers: { authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ probe: { business: row.business_id, slug, args: row.plan?.test_args ?? {} } }), signal: AbortSignal.timeout(30000) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    return !!j?.probe?.successful;
  },
  async done(row, ok) {
    if (row.plan?.connection_id) await db(`business_connections?id=eq.${row.plan.connection_id}`, { method: "PATCH", body: JSON.stringify({ status: ok ? "active" : "failed", checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).then((r) => r.body?.cancel());
    await db("activity_log", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ business_id: row.business_id, kind: "connection", summary: ok ? `${row.tool} is connected and its test passed.` : `${row.tool} could not be connected. Pip will tell you what it needs.`, outcome: ok ? "ok" : "failed", actor: "pip" }) }).then((r) => r.body?.cancel());
  },
  async reSignIn(row) {
    const owners = await rows(`members?business_id=eq.${row.business_id}&role=eq.owner&status=neq.removed&select=email`);
    for (const o of owners ?? []) await db("portal_outbox", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ business_id: row.business_id, to_email: o.email, template: "setup_resignin", data: { tool: row.tool, setup_id: row.id } }) }).then((r) => r.body?.cancel());
  },
};

async function load(id: string): Promise<SetupRow | null> { return (await rows(`setup_sessions?id=eq.${id}&select=*`))?.[0] ?? null; }
async function save(id: string, patch: Partial<SetupRow>) {
  await db(`setup_sessions?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }).then((r) => r.body?.cancel());
}
function chain(id: string) {
  EdgeRuntime.waitUntil(fetch(`${SELF}/step`, { method: "POST", headers: { authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ setup_id: id }) }).then((r) => r.body?.cancel()).catch(() => {}));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!SB_KEY || !same(bearer, SB_KEY)) return json({ error: "forbidden" }, 403);
  const path = new URL(req.url).pathname.replace(/^.*\/setup-run/, "") || "/";
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.setup_id === "string" && /^[0-9a-f-]{36}$/i.test(body.setup_id) ? body.setup_id : "";
  if (!id) return json({ error: "bad_request" }, 400);
  const row = await load(id);
  if (!row) return json({ error: "not_found" }, 404);
  try {
    if (path === "/live") return json({ url: row.browser_session_id ? await bb.liveView(row.browser_session_id) : null });
    if (path === "/stop") {
      if (row.browser_session_id) await deps.browser.close(row.browser_session_id).catch(() => {});
      await save(id, { state: "stopped", reason: "Stopped by the owner.", browser_session_id: null, ended_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (path !== "/step") return json({ error: "not_found" }, 404);
    if (!ANTHROPIC || !BBKEY) { await save(id, { state: "failed", reason: "The Setup Agent is not configured yet." }); return json({ ok: false, error: "not_configured" }, 503); }
    const out = await step(row, deps);
    await save(id, out.patch);
    if (out.next === "again") chain(id);
    return json({ ok: true, state: out.patch.state ?? row.state, next: out.next });
  } catch (e) {
    console.error("[setup-run]", id, String((e as Error)?.message ?? e).slice(0, 160)); // never a typed value: steps hold none
    await save(id, { state: "failed", reason: "Something went wrong in the secure browser. Pip saved where it got to." });
    return json({ ok: false, error: "server" }, 500);
  } finally {
    for (const c of sockets.values()) c.close();
    sockets.clear();
  }
});
