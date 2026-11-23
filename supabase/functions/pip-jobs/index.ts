// pip-jobs: starts a teammate's jobs when nobody asked. It decides WHEN a job runs; pip-turn does the work.
//   POST /tick   The database knocks every 5 minutes. No pass is needed and the knock carries no instructions:
//                this works out for itself which scheduled jobs are due (in each business's own time zone), starts
//                each due slot at most once (job_enqueue), and wakes every run that is waiting. Knocking again, or
//                from outside, starts nothing extra. (Two knocks at the very same moment can both get past the
//                45-second gate and both scan; see tick() below. They still start nothing twice.)
//                The database finds this function through forge_settings 'functions_url', never a fixed address.
//   POST /event  { business, from, event, records?, key, data? }  A tool, Pip itself or a box says something happened.
//                Starts the jobs of that business whose trigger matches, at most once per key. `data` is passed to the
//                job as information only. Callers: other Pip functions (service bearer) or a founder test ticket.
//   POST /run    { spec, job }  Start a job now. For the owner's "Run now" (the job must list that trigger), and for
//                founder testing on a TEST business.
//   POST /poke   { run }  Wake one run again. A finished run answers with what it did and changes nothing.
// A job only ever starts for a teammate that may act for real: it is live, or its business is on the TEST list.
// Limits, permissions and retry safety are not here. They are in the database rules (job_enqueue, job_claim,
// job_action_begin, job_finish) and in pip-turn's job engine, so nothing this function is told can widen them.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { type Job, jobsOf } from "../_shared/teammate-spec.ts";
import { dueSlot, localDay } from "../_shared/schedule.ts";
import { isCaseDriven, operatorJobs } from "../_shared/operate.ts";
import { dueRun, eventPlan, inCallingHours } from "../_shared/operate-run.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
// deno-lint-ignore no-explicit-any
type J = any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function caller(req: Request): Promise<"internal" | "ticket" | null> {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && same(bearer, SERVICE)) return "internal";
  const ticket = req.headers.get("x-pip-ticket");
  if (ticket) {
    const { data } = await db.from("forge_settings").select("value").eq("key", "run_ticket").maybeSingle();
    const v = data?.value as { hash?: string; expires?: string } | null;
    if (v?.hash && v.expires && new Date(v.expires).getTime() > Date.now() && same(await sha256(ticket), v.hash)) return "ticket";
  }
  return null;
}

type Mate = { spec: string; business: string; tz: string; jobs: Job[]; test: boolean; doc: J };
/** Teammates that declare jobs and may act for real, with their checked job lists. */
async function mates(only?: { spec?: string; business?: string }): Promise<{ list: Mate[]; invalid: number }> {
  let q = db.from("skill_specs").select("id,status,spec,order_id").in("status", ["live", "approved", "sandbox"]).not("spec->jobs", "is", null).limit(300);
  if (only?.spec) q = q.eq("id", only.spec);
  const [{ data: specs }, { data: sb }] = await Promise.all([q, db.from("forge_settings").select("value").eq("key", "act_sandbox_businesses").maybeSingle()]);
  const sandbox: string[] = Array.isArray(sb?.value) ? sb.value : [];
  const orders = [...new Set((specs ?? []).map((s: J) => s.order_id).filter(Boolean))];
  const { data: os } = orders.length ? await db.from("build_orders").select("id,business_id").in("id", orders) : { data: [] };
  const bizIds = [...new Set((os ?? []).map((o: J) => o.business_id).filter(Boolean))];
  const { data: bs } = bizIds.length ? await db.from("businesses").select("id,status,timezone").in("id", bizIds) : { data: [] };
  const list: Mate[] = [];
  let invalid = 0;
  for (const s of specs ?? []) {
    const biz = (bs ?? []).find((b: J) => b.id === (os ?? []).find((o: J) => o.id === s.order_id)?.business_id);
    if (!biz || ["disconnected", "cancelled"].includes(biz.status)) continue;
    if (only?.business && biz.id !== only.business) continue;
    const test = sandbox.includes(biz.id);
    if (s.status !== "live" && !test) continue;
    const found = jobsOf(s.spec);
    if (found.legacy || !found.jobs.length) { invalid++; continue; }
    list.push({ spec: s.id, business: biz.id, tz: biz.timezone || "America/Boise", jobs: found.jobs, test, doc: s.spec });
  }
  return { list, invalid };
}

const enqueue = async (m: Mate, job: Job, trigger: string, key: string, day: string, input: J = {}) =>
  (await db.rpc("job_enqueue", { p_spec: m.spec, p_job: job.id, p_trigger: trigger, p_key: key.slice(0, 200), p_local_day: day, p_input: input, p_max_runs: job.limits.per_day?.runs ?? null, p_max_attempts: job.pause.after_failures })).data as string | null;

async function poke(run: string): Promise<J> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/pip-turn/job`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE}` }, body: JSON.stringify({ run }), signal: AbortSignal.timeout(120000) });
    return await r.json().catch(() => ({ run, error: `pip-turn answered ${r.status}` }));
  } catch (e) { return { run, error: String((e as Error).message).slice(0, 120) }; }
}
/** Wakes every run that is waiting and due, or whose worker went quiet. Each one is held by at most one worker. */
async function wake(limit = 8): Promise<J[]> {
  const now = new Date().toISOString();
  const { data } = await db.from("job_runs").select("id").or(`and(status.eq.queued,due_at.lte."${now}"),and(status.eq.running,lease_until.lt."${now}")`).order("due_at", { ascending: true }).limit(limit);
  const out = await Promise.all((data ?? []).map((r: J) => poke(r.id)));
  return out.map((o: J) => ({ run: o.run, status: o.status ?? null, outcome: o.outcome ?? null, error: o.error ?? null }));
}

// ---- operators: a customer process starts a run only for a case the cadence says is due ----
// The switch. Anything but a clean true reads as off, including a failed read, so with the lane off none of this runs.
const laneOn = async () => (await db.rpc("portal_flag", { p_key: "operate_lane", p_default: false })).data === true;
/** Starts one run for each case that is due now. The database decides which are due; the run key makes starting one twice impossible. */
async function driveCases(m: Mate, now: Date): Promise<string[]> {
  const stages = operatorJobs(m.doc);
  if (!stages.process || !stages.caseDriven.size || !inCallingHours(now, m.tz)) return [];
  const runs: string[] = [];
  for (const job of m.jobs) {
    if (!stages.caseDriven.has(job.id)) continue;
    const { data } = await db.rpc("operator_case_due", { p_spec: m.spec, p_limit: 20 });
    for (const c of Array.isArray(data) ? data : []) {
      if (typeof c?.case_key !== "string" || !Number.isInteger(c?.touches)) continue;
      const r = dueRun({ case_key: c.case_key, touches: c.touches, context: c.context });
      const id = await enqueue(m, job, "case", r.key, localDay(now, m.tz), r.input);
      if (id) runs.push(id);
    }
  }
  return runs;
}

async function tick() {
  // Knocks closer together than 45 seconds are ignored, so hammering this address costs almost nothing.
  // This gate is read-then-write, two steps and not one: two knocks that land at the same moment can both read the old
  // time, both pass, and each do the full scan below. That costs a second scan and nothing more. A slot still starts
  // one run (job_enqueue) and a run is still held by one worker (job_claim); those are single steps in the database.
  const { data: last } = await db.from("forge_settings").select("value").eq("key", "jobs_tick").maybeSingle();
  if (last?.value?.at && Date.now() - new Date(last.value.at).getTime() < 45000) return json({ ok: true, skipped: "too_soon" });
  await db.from("forge_settings").upsert({ key: "jobs_tick", value: { at: new Date().toISOString() } });
  const { list, invalid } = await mates();
  const now = new Date();
  let started = 0;
  for (const m of list) for (const job of m.jobs) for (const t of job.triggers) {
    if (t.type !== "schedule") continue;
    const slot = dueSlot(t, m.tz, now);
    if (slot && (await enqueue(m, job, "schedule", `s:${slot.key}`, localDay(slot.at, m.tz), { slot: slot.key }))) started++;
  }
  if (list.some((m) => operatorJobs(m.doc).caseDriven.size) && (await laneOn())) for (const m of list) started += (await driveCases(m, now)).length;
  const woke = await wake();
  await db.from("forge_settings").upsert({ key: "jobs_tick", value: { at: now.toISOString(), teammates: list.length, invalid, started, woke: woke.length } });
  return json({ ok: true, teammates: list.length, invalid, started, woke });
}

function passes(cond: J, data: J): boolean {
  if (!cond) return true;
  const v = data && typeof data === "object" ? data[cond.field] : undefined;
  if (cond.is !== undefined) return v === cond.is || (v != null && String(v) === String(cond.is));
  const n = typeof v === "number" ? v : Number.NaN;
  return cond.over !== undefined ? n > cond.over : n < cond.under;
}
async function event(b: J) {
  const ok = typeof b?.business === "string" && UUID.test(b.business) && typeof b.from === "string" && /^[a-z0-9_:]{2,70}$/.test(b.from) && typeof b.event === "string" && /^[a-z_]{3,40}$/.test(b.event) && typeof b.key === "string" && b.key.length >= 1 && b.key.length <= 120;
  if (!ok) return json({ error: "bad_request" }, 400);
  const data = b.data && typeof b.data === "object" && JSON.stringify(b.data).length <= 8000 ? b.data : {};
  const { list } = await mates({ business: b.business });
  const runs: string[] = [];
  // A customer operator's stage job is never started by its own trigger. The event opens (or closes) a case, and the
  // case starts the run when the cadence allows it. With the lane off nothing here happens at all.
  let lane: boolean | null = null, cases = 0;
  const touched: Mate[] = [];
  for (const m of list) for (const job of m.jobs) {
    if (!isCaseDriven(m.doc, job.id)) continue;
    const plan = eventPlan(m.doc, job, { ...b, data });
    if (plan.kind === "none") continue;
    lane ??= await laneOn();
    if (!lane) continue;
    if (plan.kind === "open") {
      const { data } = await db.rpc("operator_case_open", { p_spec: m.spec, p_process: operatorJobs(m.doc).process, p_case_key: plan.case_key, p_contact: plan.contact, p_contact_kind: "email", p_stage: plan.stage, p_context: plan.context });
      if (typeof data === "string") { cases++; touched.push(m); }
    } else await db.rpc("operator_case_signal", { p_spec: m.spec, p_case_key: plan.case_key, p_completed: true });
  }
  for (const m of new Set(touched)) runs.push(...(await driveCases(m, new Date())));
  for (const m of list) for (const job of m.jobs) for (const t of job.triggers) {
    if (isCaseDriven(m.doc, job.id)) continue;
    if (t.type !== "event" || t.from !== b.from || t.event !== b.event || (t.records ?? null) !== (b.records ?? null) || !passes(t.if, data)) continue;
    const id = await enqueue(m, job, "event", `e:${b.from}:${b.event}:${b.key}`, localDay(new Date(), m.tz), { from: b.from, event: b.event, ...(b.records ? { records: b.records } : {}), data });
    if (id) runs.push(id);
  }
  return json({ ok: true, started: runs.length, ...(cases ? { cases } : {}), results: await Promise.all(runs.map(poke)) });
}

async function runNow(b: J, who: "internal" | "ticket") {
  if (typeof b?.spec !== "string" || !UUID.test(b.spec) || typeof b.job !== "string") return json({ error: "bad_request" }, 400);
  const { list } = await mates({ spec: b.spec });
  const m = list[0], job = m?.jobs.find((j) => j.id === b.job);
  if (!m || !job) return json({ error: "not_found" }, 404);
  // The owner's button only starts jobs built to be started that way. A founder ticket may start any job, on TEST businesses only.
  const listed = job.triggers.some((t) => t.type === "owner" && t.on === "run_now");
  if (!listed && !(who === "ticket" && m.test)) return json({ error: "not_allowed" }, 403);
  if (job.triggers.every((t) => t.type === "message")) return json({ error: "not_allowed" }, 403);
  const id = await enqueue(m, job, "manual", `m:${crypto.randomUUID()}`, localDay(new Date(), m.tz), {});
  if (!id) return json({ ok: false, started: false, why: "paused_or_at_todays_limit" }, 409);
  return json({ ok: true, started: true, result: await poke(id) });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-jobs/, "") || "/";
  try {
    if (path === "/tick") return await tick();
    const who = await caller(req);
    if (!who) return json({ error: path === "/event" || path === "/run" || path === "/poke" ? "forbidden" : "not_found" }, path === "/event" || path === "/run" || path === "/poke" ? 403 : 404);
    const body = await req.json().catch(() => ({}));
    if (path === "/event") return await event(body);
    if (path === "/run") return await runNow(body, who);
    if (path === "/poke" && typeof body?.run === "string" && UUID.test(body.run)) return json(await poke(body.run));
    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error("[jobs]", String(e).slice(0, 200));
    return json({ error: "server" }, 500);
  }
});
