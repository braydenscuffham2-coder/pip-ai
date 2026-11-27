// setup-run: the Setup Agent's runner. One state per call, chained like scan-run, with its state in setup_sessions.
//
//   POST /setup-run/step  { setup_id }   internal (service key): run one step, then chain the next unless it waits
//   POST /setup-run/live  { setup_id }   internal (service key): the live-view link for pip-portal to hand the owner
//   POST /setup-run/hold  { setup_id }   internal: connect to this setup's browser and stay connected until the setup
//                                        lets go. Only used when the browser is kept alive by the plan (see below).
//   POST /setup-run/probe {}             internal, or a founder test ticket: opens a throwaway browser for a few seconds and reports whether a
//                                        second connection can come and go without closing it. No page is opened.
//                                        {mode:"stay"}: can a second connection join and stay? {mode:"linger",seconds}:
//                                        holds an empty browser open and returns its live view, to test what watching
//                                        does. {check:<session id>}: is that browser still running?
//
// Two ways to keep the browser open, chosen by forge_settings 'browser_keep_alive':
//   true   (Browserbase Developer and up) the browser survives a connection leaving, so each step is its own request.
//   false  (the Free plan) the browser ends when ANY connection leaves. One request, the runner, connects once and
//          does every step itself (_shared/setup/solo.ts). /step only makes sure a runner is alive.
//   POST /setup-run/stop  { setup_id }   internal (service key): close the browser and stop
//
// The steps themselves live in ../_shared/setup/engine.ts and the limits in ../_shared/setup/guards.ts.
// Secrets: ANTHROPIC_API_KEY, BROWSERBASE_API_KEY, optional BROWSERBASE_PROJECT_ID and SETUP_MODEL. No 1Password token:
// only vault-writer holds that.
import { type Deps, type SetupRow, step } from "../_shared/setup/engine.ts";
import { hold, RELEASED } from "../_shared/setup/hold.ts";
import { BROWSER_STATES, runSolo, SOLO } from "../_shared/setup/solo.ts";
import { Cdp, openPage } from "../_shared/setup/cdp.ts";
import { browserbase } from "../_shared/setup/vendors.ts";
import { type Action, leaks, sessionMinutes, siteOf } from "../_shared/setup/guards.ts";

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

// One open socket per session per call, closed when the call ends. Each call (and each runner) has its own set, so
// one request ending can never close a connection another is using.
type Sockets = Map<string, Cdp>;
async function pageIn(sockets: Sockets, sessionId: string) {
  try {
    let c = sockets.get(sessionId);
    if (!c) { const url = await bb.connectUrl(sessionId); if (!url) return null; c = await Cdp.connect(url); sockets.set(sessionId, c); }
    return await openPage(c);
  } catch { return null; }
}
const closeAll = (sockets: Sockets) => { for (const c of sockets.values()) c.close(); sockets.clear(); };

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

/**
 * A tool that was connected in the browser becomes one of Pip's saved sign-ins: the browser state and the vaulted login,
 * per business and per tool, so background work can use it later. Jobs that were waiting on this tool go back in the queue.
 */
async function rememberIdentity(row: SetupRow) {
  const site = siteOf(row.login_url || "");
  if (!row.browser_context_id || !row.login_url || !site) return;
  const vaultItem = (row as unknown as { vault_item_id?: string | null }).vault_item_id ?? null;
  const totp = vaultItem ? !!(await rows(`vault_items?id=eq.${vaultItem}&select=has_authenticator`))?.[0]?.has_authenticator : false;
  const t = new Date().toISOString();
  const r = await db("tool_identities?on_conflict=business_id,tool_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ business_id: row.business_id, tool: row.tool, tool_key: row.tool_key, login_url: row.login_url, site, signin_hosts: (Array.isArray(row.plan?.signin_hosts) ? row.plan.signin_hosts : []).filter((h: unknown) => typeof h === "string").slice(0, 6), browser_context_id: row.browser_context_id, vault_item_id: vaultItem, totp, state: "signed_in", reason: null, checked_at: t, signed_in_at: t, updated_at: t }) });
  const id = r.ok ? ((await r.json()) as { id: string }[])?.[0]?.id : null;
  if (id) await db(`work_jobs?identity_id=eq.${id}&status=eq.waiting_owner`, { method: "PATCH", body: JSON.stringify({ status: "queued", state: "start", run_after: t, reason: null, updated_at: t }) }).then((x) => x.body?.cancel());
}

const depsFor = (sockets: Sockets): Deps => ({
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
      const s = await bb.session(contextId, sessionMinutes(await setting("setup_session_minutes")), (await setting("browser_keep_alive")) === true);
      return { sessionId: s.id, contextId };
    },
    page: (id) => pageIn(sockets, id),
    // Ask the browser to end first, so its context keeps the sign-in; then drop our own connection.
    async close(id) { await bb.release(id); sockets.get(id)?.close(); sockets.delete(id); },
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
      if (ok) await rememberIdentity(row).catch(() => {});
  },
  async reSignIn(row) {
    const owners = await rows(`members?business_id=eq.${row.business_id}&role=eq.owner&status=neq.removed&select=email`);
    for (const o of owners ?? []) await db("portal_outbox", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ business_id: row.business_id, to_email: o.email, template: "setup_resignin", data: { tool: row.tool, setup_id: row.id } }) }).then((r) => r.body?.cancel());
  },
});

async function load(id: string): Promise<SetupRow | null> { return (await rows(`setup_sessions?id=eq.${id}&select=*`))?.[0] ?? null; }
async function save(id: string, patch: Partial<SetupRow>) {
  await db(`setup_sessions?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }).then((r) => r.body?.cancel());
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- one connection for the whole setup (the Free plan) ----------
/** Writes a step's result only while the row is still in the state the step started from. */
async function saveIf(id: string, patch: Partial<SetupRow>, ifState: string): Promise<boolean> {
  const r = await db(`setup_sessions?id=eq.${id}&state=eq.${encodeURIComponent(ifState)}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  if (!r.ok) { await r.body?.cancel(); throw new Error("save failed"); }
  return ((await r.json()) as unknown[]).length === 1;
}
/** Take the setup for this runner, if no runner has said it is alive lately. */
async function claimRunner(id: string, runner: string): Promise<boolean> {
  const stale = new Date(Date.now() - SOLO.stale).toISOString();
  const r = await db(`setup_sessions?id=eq.${id}&or=(runner_beat.is.null,runner_beat.lt.${encodeURIComponent(stale)})`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ runner_id: runner, runner_beat: new Date().toISOString() }) });
  if (!r.ok) { await r.body?.cancel(); return false; }
  return ((await r.json()) as unknown[]).length === 1;
}
async function beatRunner(id: string, runner: string): Promise<boolean> {
  const r = await db(`setup_sessions?id=eq.${id}&runner_id=eq.${runner}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ runner_beat: new Date().toISOString() }) });
  if (!r.ok) { await r.body?.cancel(); return true; }               // a failed write is not a lost claim
  return ((await r.json()) as unknown[]).length === 1;
}
async function freeRunner(id: string, runner: string) {
  await db(`setup_sessions?id=eq.${id}&runner_id=eq.${runner}`, { method: "PATCH", body: JSON.stringify({ runner_id: null, runner_beat: null }) }).then((r) => r.body?.cancel()).catch(() => {});
}
/** The runner: every step of one setup's time in the browser, on one connection that only it holds. */
async function runner(id: string, me: string) {
  const sockets: Sockets = new Map();
  const d = depsFor(sockets);
  let end = "error";
  try {
    end = await runSolo({
      async load() { const r = await db(`setup_sessions?id=eq.${id}&select=*`); if (!r.ok) { await r.body?.cancel(); throw new Error("read failed"); } return (await r.json())?.[0] ?? null; },
      step: (row) => step(row, d),
      save: (patch, ifState) => saveIf(id, patch, ifState),
      beat: () => beatRunner(id, me),
      closeBrowser: (sid) => d.browser.close(sid),
      sleep, now: () => Date.now(),
    });
  } catch (e) {
    console.error("[setup-run] runner", id, String((e as Error)?.message ?? e).slice(0, 160)); // never a typed value: steps hold none
    const row = await load(id).catch(() => null);
    if (row && BROWSER_STATES.has(row.state)) {
      if (row.browser_session_id) await d.browser.close(row.browser_session_id).catch(() => {});
      await saveIf(id, { state: "failed", browser_session_id: null, reason: "Something went wrong in the secure browser. Pip saved where it got to." }, row.state).catch(() => false);
    }
  } finally {
    closeAll(sockets);
    await freeRunner(id, me);
    console.log("[setup-run] runner", id, end);
  }
}
/** The setup's row for the holder. Throws when the read fails, so a network blip never looks like "the setup ended". */
async function rowForHold(id: string) {
  const r = await db(`setup_sessions?id=eq.${id}&select=state,browser_session_id`);
  if (!r.ok) { await r.body?.cancel(); throw new Error("read failed"); }
  return (await r.json())?.[0] ?? null;
}
/** Ask for a holder. True only once it is connected to the browser. */
async function startHold(id: string): Promise<boolean> {
  const r = await fetch(`${SELF}/hold`, { method: "POST", headers: { authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ setup_id: id }), signal: AbortSignal.timeout(25000) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  return j?.ok === true;
}
/** Does a second connection end the browser when it leaves? Measured, not assumed. Uses a few seconds of browser time. */
async function probe(body: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ok: false, at: "context" };
  let sid = "";
  if (typeof body.check === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(body.check)) return { ok: true, running: !!(await bb.connectUrl(body.check)) };
  if (body.mode === "linger") {
    // An empty browser held open on one connection for a short while, with its live view, so what watching does to
    // it can be measured from outside. No page is opened and nothing is typed.
    const secs = Math.max(10, Math.min(Number(body.seconds) || 40, 120));
    const s = await bb.session(await bb.context(), 3, false);
    const a = await Cdp.connect(s.connectUrl);
    EdgeRuntime.waitUntil((async () => { await sleep(secs * 1000); const alive = await a.send("Browser.getVersion", {}, undefined, 8000).then(() => true).catch(() => false); console.log("[setup-run] probe linger", s.id, "first connection alive at end:", alive); await bb.release(s.id).catch(() => {}); a.close(); })());
    return { ok: true, session: s.id, live: await bb.liveView(s.id), seconds: secs };
  }
  if (body.mode === "stay") {
    // Can a second connection join and stay, with the browser alive and both working? (Leaving is what ends it.)
    try {
      const s = await bb.session(await bb.context(), 2, false); sid = s.id; out.at = "first_connection";
      const a = await Cdp.connect(s.connectUrl); out.at = "second_connection";
      const b = await Cdp.connect(s.connectUrl); out.second_connected = await b.send("Browser.getVersion", {}, undefined, 8000).then(() => true).catch(() => false); out.at = "both_stay";
      await sleep(20000);
      out.running_with_both = !!(await bb.connectUrl(sid));
      out.first_works = await a.send("Browser.getVersion", {}, undefined, 8000).then(() => true).catch(() => false);
      out.second_works = await b.send("Browser.getVersion", {}, undefined, 8000).then(() => true).catch(() => false); out.at = "release";
      await bb.release(sid); await sleep(4000);
      out.running_after_release = !!(await bb.connectUrl(sid));
      a.close(); b.close(); out.ok = true; out.at = "done"; sid = "";
    } catch (e) { out.error = String((e as Error)?.message ?? e).slice(0, 160); }
    if (sid) await bb.release(sid).catch(() => {});
    return out;
  }
  try {
    const keep = (await setting("browser_keep_alive")) === true; out.keep_alive = keep;
    const s = await bb.session(await bb.context(), 1, keep); sid = s.id; out.at = "first_connection";
    const a = await Cdp.connect(s.connectUrl); out.at = "second_connection";
    const b = await Cdp.connect(s.connectUrl); await b.send("Browser.getVersion", {}, undefined, 8000); out.second_connected = true; out.at = "second_leaves";
    b.close(); await sleep(5000);
    out.running_after_second_left = !!(await bb.connectUrl(sid));
    out.first_still_works = await a.send("Browser.getVersion", {}, undefined, 8000).then(() => true).catch(() => false); out.at = "third_connection";
    const c = await Cdp.connect(s.connectUrl).catch(() => null); out.can_connect_again = !!c; c?.close(); await sleep(3000);
    out.first_works_after_third_left = await a.send("Browser.getVersion", {}, undefined, 8000).then(() => true).catch(() => false); out.at = "all_leave";
    a.close(); await sleep(5000);
    out.running_after_all_left = !!(await bb.connectUrl(sid));
    out.ok = true; out.at = "done";
  } catch (e) { out.error = String((e as Error)?.message ?? e).slice(0, 160); }
  if (sid) await bb.release(sid).catch(() => {});
  return out;
}
async function ticketOk(ticket: string | null): Promise<boolean> {
  if (!ticket || ticket.length < 24 || ticket.length > 200) return false;
  const v = await setting("run_ticket");
  if (!v?.hash || !v.expires || new Date(v.expires).getTime() <= Date.now()) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket));
  return same([...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""), String(v.hash));
}
function chain(id: string) {
  EdgeRuntime.waitUntil(fetch(`${SELF}/step`, { method: "POST", headers: { authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ setup_id: id }) }).then((r) => r.body?.cancel()).catch(() => {}));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const path = new URL(req.url).pathname.replace(/^.*\/setup-run/, "") || "/";
  // The probe opens no page and touches no business, so a founder's short-lived test ticket may run it too (the same
  // ticket pip-jobs accepts: only its hash is stored, in forge_settings 'run_ticket', with an expiry).
  const internal = !!SB_KEY && same(bearer, SB_KEY);
  if (path === "/probe" && (internal || await ticketOk(req.headers.get("x-pip-ticket")))) return json(BBKEY ? await probe(await req.json().catch(() => ({}))) : { ok: false, error: "not_configured" });
  if (!internal) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const sockets: Sockets = new Map();
  const deps = depsFor(sockets);
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
    if (path === "/hold") {
      const sid = row.browser_session_id;
      const url = sid ? await bb.connectUrl(sid) : null;
      if (!sid || !url) return json({ ok: false, error: "browser_gone" });
      const c = await Cdp.connect(url);
      const conn = { ping: () => c.send("Browser.getVersion", {}, undefined, 8000).then(() => true), close: () => c.close() };
      EdgeRuntime.waitUntil(hold(conn, sid, { row: () => rowForHold(id), next: () => startHold(id), sleep, now: () => Date.now() })
        .then((end) => console.log("[setup-run] holder", id, end)).catch(() => {}));
      return json({ ok: true });
    }
    if (path !== "/step") return json({ error: "not_found" }, 404);
    if (!ANTHROPIC || !BBKEY) { await save(id, { state: "failed", reason: "The Setup Agent is not configured yet." }); return json({ ok: false, error: "not_configured" }, 503); }
    if ((await setting("browser_keep_alive")) !== true && BROWSER_STATES.has(row.state)) {
      // One connection for the whole setup. This request only makes sure a runner is alive: a live one notices the
      // owner's tap by itself, and a dead one took its browser with it, so a new one starts (and says so if it is gone).
      const me = crypto.randomUUID();
      if (await claimRunner(id, me)) EdgeRuntime.waitUntil(runner(id, me));
      return json({ ok: true, state: row.state, next: "runner" });
    }
    const out = await step(row, deps);
    await save(id, out.patch);
    // A browser was just opened in this request (kept-alive plans only). It must have a holder before this request lets go of it.
    const opened = typeof out.patch.browser_session_id === "string" && out.patch.browser_session_id !== row.browser_session_id && !RELEASED.has(String(out.patch.state ?? row.state));
    if (opened && !(await startHold(id))) {
      await deps.browser.close(out.patch.browser_session_id as string).catch(() => {});
      await save(id, { state: "paused", browser_session_id: null, reason: "The secure browser could not be kept open. Nothing was saved. Tap Open it again." });
      return json({ ok: false, state: "paused", error: "no_holder" });
    }
    if (out.next === "again") chain(id);
    return json({ ok: true, state: out.patch.state ?? row.state, next: out.next });
  } catch (e) {
    console.error("[setup-run]", id, String((e as Error)?.message ?? e).slice(0, 160)); // never a typed value: steps hold none
    await save(id, { state: "failed", reason: "Something went wrong in the secure browser. Pip saved where it got to." });
    return json({ ok: false, error: "server" }, 500);
  } finally {
    closeAll(sockets);
  }
});
