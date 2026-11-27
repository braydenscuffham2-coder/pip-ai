// pip-work: Pip's background worker. It does work for a business with nobody watching, on Pip's own servers.
//
//   POST /tick     The database knocks every minute while something is due. No pass is needed and the knock carries
//                  no instructions: this claims jobs already in the queue (work_claim), runs their steps for about a
//                  minute, and gives each one back (work_release). Two knocks at once cannot take the same job.
//   POST /enqueue  internal (service key): { business, kind, title, plan?, identity?, spec?, key?, cap?, max_steps?, by? }
//   POST /resume   internal (service key): { job }  a person did what was needed; the job goes back in the queue
//   POST /approve  internal (service key): { job, ok, by? }  the owner's yes or no to a job waiting to save something
//   POST /stop     internal (service key): { job }  close its browser and stop it
//
// A worker that dies mid-job never gives the job back. Its lease runs out, the next knock claims the job again, and
// the job carries on from the state it last saved. The steps live in ../_shared/work/engine.ts.
// A screen job (kind 'screen') also uses a model: one masked screenshot in, one proposed action out, and
// ../_shared/work/screen.ts decides whether that action happens. ANTHROPIC_API_KEY, optional SCREEN_MODEL.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BROWSERBASE_API_KEY, optional BROWSERBASE_PROJECT_ID,
// RESEND_API_KEY + LEAD_ALERT_TO + LEAD_ALERT_FROM (failure emails to the founder). No vault token: only vault-writer has it.
import { type FillCode, type Identity, type Out, step, type WorkDeps, type WorkJob } from "../_shared/work/engine.ts";
import { Cdp, openPage } from "../_shared/setup/cdp.ts";
import { browserbase } from "../_shared/setup/vendors.ts";
import { sessionMinutes } from "../_shared/setup/guards.ts";
import { failureEmail, FILL_CODES, nextRelease } from "../_shared/work/worker.ts";
import { type ScreenAction, type ScreenDeps, type ScreenPlan, screenStep } from "../_shared/work/screen.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BBKEY = Deno.env.get("BROWSERBASE_API_KEY") ?? "";
const bb = browserbase({ apiKey: BBKEY, projectId: Deno.env.get("BROWSERBASE_PROJECT_ID") || undefined });
const SELF = `${SB_URL}/functions/v1/pip-work`;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("SCREEN_MODEL") ?? "claude-sonnet-5-5";
const TICK_MS = 75_000;   // how long one knock keeps working
const LEASE_S = 90;       // how long a claim holds without a heartbeat

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...((init.headers as Record<string, string>) || {}) }, signal: AbortSignal.timeout(10000) });
const rows = async (path: string) => { const r = await db(path); return r.ok ? await r.json() : []; };
const rpc = async (fn: string, args: unknown) => { const r = await db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }); return r.ok ? await r.json().catch(() => null) : null; };
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const setting = async (key: string) => (await rows(`forge_settings?key=eq.${key}&select=value`))?.[0]?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One open socket per browser session per call; all closed when the call ends.
const sockets = new Map<string, Cdp>();
async function pageOf(sessionId: string) {
  try {
    let c = sockets.get(sessionId);
    if (!c) { const url = await bb.connectUrl(sessionId); if (!url) return null; c = await Cdp.connect(url); sockets.set(sessionId, c); }
    return await openPage(c);
  } catch { return null; }
}
async function vault(path: "fill" | "code", identity: string, session: string): Promise<FillCode> {
  const r = await fetch(`${SB_URL}/functions/v1/vault-writer/${path}`, { method: "POST", headers: { authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ identity_id: identity, session_id: session }), signal: AbortSignal.timeout(45000) }).catch(() => null);
  const code = r ? (await r.json().catch(() => null))?.code : null;
  return FILL_CODES.includes(code) ? code : "unavailable";
}

/** The model's one proposed action for a screen job, read from a masked screenshot. It is only a proposal: screen.ts decides. */
const screenDeps: ScreenDeps = {
  async model(input) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(60000),
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: input.image } }, { type: "text", text: input.text }] }] }),
    });
    const j = await r.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const text = ((j.content || []) as any[]).filter((c) => c.type === "text").map((c) => c.text).join("");
    let action: ScreenAction = { type: "need_owner", reason: "Pip could not read the page." };
    try { const m = text.match(/\{[\s\S]*\}/); if (m) action = JSON.parse(m[0]); } catch { /* keep need_owner */ }
    return { action, usage: j.usage ?? {} };
  },
  async take(usd) { const why = await rpc("pip_take", { p_kind: "work_usd", p_units: Math.round(usd * 10000) / 10000, p_room: 0 }); return typeof why === "string" ? why : null; },
};

function depsFor(seq: { n: number }, kind: string): WorkDeps {
  return {
    ...(kind === "screen" ? { work: (job, identity, page, deps) => screenStep(job, identity, page, deps, screenDeps) } : {}),
    async identity(id) { return (await rows(`tool_identities?id=eq.${id}&select=id,business_id,tool,tool_key,login_url,site,signin_hosts,browser_context_id,vault_item_id,totp,state,silent_signins`))?.[0] ?? null; },
    async saveIdentity(id, patch) { await db(`tool_identities?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }).then((r) => r.body?.cancel()); },
    browser: {
      async open(contextId) {
        const ctx = contextId || await bb.context();
        const s = await bb.session(ctx, Math.min(sessionMinutes(await setting("setup_session_minutes")), 15));
        return { sessionId: s.id, contextId: ctx };
      },
      page: pageOf,
      async close(id) { sockets.get(id)?.close(); sockets.delete(id); await bb.release(id); },
    },
    vaultFill: (identity, session) => vault("fill", identity, session),
    vaultCode: (identity, session) => vault("code", identity, session),
    async log(job, did, detail = {}, extra = {}) {
      await db("work_steps", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ job_id: job.id, seq: seq.n++, did: did.slice(0, 40), detail, cost_usd: extra.cost ?? 0, shot: extra.shot ?? null }) }).then((r) => r.body?.cancel()).catch(() => {});
    },
  };
}

/** Saves the job's progress, only while this worker still holds it. Returns the row, or null when the hold is gone. */
async function save(job: WorkJob, worker: string, patch: Partial<WorkJob>): Promise<(WorkJob & { status: string }) | null> {
  if (!Object.keys(patch).length) return job;
  const r = await db(`work_jobs?id=eq.${job.id}&worker=eq.${worker}&status=eq.running`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  const out = r.ok ? await r.json() : [];
  return out?.[0] ?? null;
}
async function ownersOf(business: string): Promise<string[]> {
  return ((await rows(`members?business_id=eq.${business}&role=eq.owner&status=neq.removed&select=email`)) ?? []).map((m: { email: string }) => m.email);
}

/** Runs one claimed job until it ends, waits for a person, or this knock is out of time. */
async function runJob(job: WorkJob, worker: string, deadline: number) {
  const seq = { n: (await rows(`work_steps?job_id=eq.${job.id}&select=seq&order=seq.desc&limit=1`))?.[0]?.seq + 1 || 0 };
  const deps = depsFor(seq, job.kind);
  let out: Out = { patch: {}, next: "again" };
  if (job.kind === "screen" && job.identity_id) {
    const plan = job.plan as ScreenPlan;
    if (!ANTHROPIC) { await rpc("work_release", { p_job: job.id, p_worker: worker, p_status: "failed", p_summary: "Pip could not start this job.", p_reason: "The model key is not set for background work." }); return; }
    // The first runs of a task that saves something wait for the owner's yes. Decided once, when the job first starts.
    if (plan.require_approval === undefined && plan.level !== "read") {
      const id = (await rows(`tool_identities?id=eq.${job.identity_id}&select=tool_key`))?.[0];
      const needs = await rpc("screen_needs_approval", { p_business: job.business_id, p_tool: id?.tool_key ?? "", p_task: plan.task_key || job.title.slice(0, 80) });
      const saved = await save(job, worker, { plan: { ...job.plan, require_approval: needs !== false } });
      if (!saved) return;
      job = { ...job, ...saved };
    }
  }
  try {
    for (;;) {
      out = await step(job, deps);
      const saved = await save(job, worker, out.patch);
      if (!saved || saved.status !== "running") {
        // The hold is gone or the dollar cap ended the job in the database: stop touching it.
        if (job.browser_session_id || out.patch.browser_session_id) await deps.browser.close((out.patch.browser_session_id ?? job.browser_session_id)!).catch(() => {});
        return;
      }
      job = { ...job, ...saved };
      if (out.next !== "again") break;
      const wait = Math.min(out.waitSeconds ?? 0, 10) * 1000;
      if (Date.now() + wait + 20_000 > deadline) break;
      if (wait) await sleep(wait);
      if (!(await rpc("work_heartbeat", { p_job: job.id, p_worker: worker, p_seconds: LEASE_S }))) return;
    }
  } catch (e) {
    // A step threw: log what kind of thing went wrong, never a value. The job is given back and tried again in a
    // minute; the third such failure ends it (counted in plan.errors).
    console.error("[pip-work]", job.id, String((e as Error)?.message ?? e).slice(0, 160));
    const errors = (job.plan?.errors ?? 0) + 1;
    await save(job, worker, { plan: { ...job.plan, errors } });
    out = errors >= 3
      ? { patch: {}, next: "failed", reason: "A step failed three times in a row.", summary: "Pip could not finish this job. Nothing more was changed. Pip's team has been told." }
      : { patch: {}, next: "again", waitSeconds: 60 };
  }
  const rel = nextRelease(out);
  await rpc("work_release", { p_job: job.id, p_worker: worker, p_status: rel.status, p_run_after: rel.runAfterSeconds ? new Date(Date.now() + rel.runAfterSeconds * 1000).toISOString() : null, p_summary: out.summary ?? null, p_reason: out.reason ?? null, p_outcome: out.outcome ?? null });
  if ((rel.status === "waiting_owner" || rel.status === "waiting_approval") && out.alert !== false && out.summary && job.identity_id) {
    // One email per owner when a tool needs a person, or a job needs their yes. The words are Pip's own, never the page's.
    const id = (await rows(`tool_identities?id=eq.${job.identity_id}&select=tool`))?.[0];
    for (const email of await ownersOf(job.business_id)) await db("portal_outbox", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ business_id: job.business_id, to_email: email, template: "tool_needs_you", data: { tool: id?.tool ?? "A tool", why: out.summary } }) }).then((r) => r.body?.cancel()).catch(() => {});
  }
  if ((rel.status === "failed" || rel.status === "done" || rel.status === "waiting_owner") && job.browser_session_id) await deps.browser.close(job.browser_session_id).catch(() => {});
  // A run the owner approved finished cleanly and saved something: one step closer to doing this task without asking.
  if (rel.status === "done" && job.kind === "screen" && job.plan?.approved && (job.plan?.writes ?? 0) > 0 && job.identity_id) {
    const id = (await rows(`tool_identities?id=eq.${job.identity_id}&select=tool_key`))?.[0];
    if (id?.tool_key) await rpc("screen_trust_note", { p_business: job.business_id, p_tool: id.tool_key, p_task: job.plan.task_key || job.title.slice(0, 80) });
  }
}

/** Every failed job is emailed to the founder once, with the job and the reason. Also catches jobs the database ended. */
async function alertFailures() {
  const key = Deno.env.get("RESEND_API_KEY") ?? "", to = Deno.env.get("LEAD_ALERT_TO") ?? "", from = Deno.env.get("LEAD_ALERT_FROM") ?? "";
  if (!key || !to || !from) return 0;
  const failed = await rows(`work_jobs?status=eq.failed&alerted_at=is.null&select=id,business_id,kind,title,reason,summary,step,cost_usd,finished_at,businesses(name)&order=finished_at.asc&limit=10`);
  let sent = 0;
  for (const j of failed ?? []) {
    const mail = failureEmail(j);
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text }), signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (r?.ok) { sent++; await db(`work_jobs?id=eq.${j.id}`, { method: "PATCH", body: JSON.stringify({ alerted_at: new Date().toISOString() }) }).then((x) => x.body?.cancel()); }
    r?.body?.cancel().catch(() => {});
  }
  return sent;
}

async function tick() {
  const worker = crypto.randomUUID().slice(0, 12), deadline = Date.now() + TICK_MS;
  let ran = 0;
  while (Date.now() + 25_000 < deadline) {
    const job = ((await rpc("work_claim", { p_worker: worker, p_seconds: LEASE_S })) as WorkJob[] | null)?.[0];
    if (!job) break;
    ran++;
    await runJob(job, worker, deadline);
  }
  const alerted = await alertFailures().catch(() => 0);
  const more = await rows(`work_jobs?status=eq.queued&run_after=lte.${new Date(Date.now() + 5000).toISOString()}&select=id&limit=1`);
  if (ran && more?.length) EdgeRuntime.waitUntil(fetch(`${SELF}/tick`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.body?.cancel()).catch(() => {}));
  return { ok: true, ran, alerted };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-work/, "") || "/";
  try {
    if (path === "/tick") {
      if (!BBKEY) return json({ ok: false, error: "not_configured" }, 503);
      return json(await tick());
    }
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!SB_KEY || !same(bearer, SB_KEY)) return json({ error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
    if (path === "/enqueue") {
      const business = uuid(body.business); if (!business || typeof body.kind !== "string" || typeof body.title !== "string") return json({ error: "bad_request" }, 400);
      const r = await db("rpc/work_enqueue", { method: "POST", body: JSON.stringify({ p_business: business, p_kind: body.kind, p_title: body.title, p_plan: body.plan ?? {}, p_identity: uuid(body.identity), p_spec: uuid(body.spec), p_key: typeof body.key === "string" ? body.key : null, p_cap: typeof body.cap === "number" ? body.cap : 1, p_max_steps: typeof body.max_steps === "number" ? body.max_steps : 30, p_by: typeof body.by === "string" ? body.by.slice(0, 120) : null }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) return json({ ok: false, error: "refused", message: String(j?.message ?? "").slice(0, 200) }, 409);
      return json({ ok: true, job: j });
    }
    const id = uuid(body.job); if (!id) return json({ error: "bad_request" }, 400);
    if (path === "/resume") return json({ ok: true, resumed: (await rpc("work_resume", { p_job: id })) === true });
    if (path === "/approve") {
      const answer = await rpc("work_approve", { p_job: id, p_ok: body.ok === true, p_by: typeof body.by === "string" ? body.by.slice(0, 120) : null });
      return json({ ok: answer === "approved" || answer === "declined", answer });
    }
    if (path === "/stop") {
      const j = (await rows(`work_jobs?id=eq.${id}&select=browser_session_id,status`))?.[0];
      if (!j) return json({ error: "not_found" }, 404);
      if (j.browser_session_id) await bb.release(j.browser_session_id).catch(() => {});
      await db(`work_jobs?id=eq.${id}&status=in.(queued,running,waiting_owner,waiting_approval)`, { method: "PATCH", body: JSON.stringify({ status: "stopped", outcome: "stopped", lease_until: null, worker: null, browser_session_id: null, summary: "Stopped.", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).then((r) => r.body?.cancel());
      return json({ ok: true });
    }
    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error("[pip-work]", path, String((e as Error)?.message ?? e).slice(0, 160));
    return json({ ok: false, error: "server" }, 500);
  } finally {
    for (const c of sockets.values()) c.close();
    sockets.clear();
  }
});
