// The job runner's database rules, run against a real Postgres engine in memory (PGlite). No network, no keys.
//   npm i --no-save @electric-sql/pglite && node --test supabase/functions/pip-jobs/rules.test.mjs
// Skips itself when PGlite is not installed. Only the pieces of Pip's database these rules touch are stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let PGlite;
try { ({ PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite")); } catch { /* not installed */ }
const MIGRATION = readFileSync(new URL("../../migrations/20261117_01_job_runner.sql", import.meta.url), "utf8");
const STUBS = `
create role anon; create role authenticated; create role service_role;
create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as 'select 1::bigint';
create table public.businesses (id uuid primary key default gen_random_uuid(), name text);
create table public.skill_specs (id uuid primary key default gen_random_uuid(), business_id uuid, spec jsonb default '{}');
create table public.tool_catalog (slug text primary key);
create table public.agent_pauses (id bigint generated always as identity, business_id uuid, spec_id uuid, job text, reason text, detail text, resumed_at timestamptz);
create table public.activity_log (id bigint generated always as identity, business_id uuid, spec_id uuid, agent text, job text, kind text, summary text, outcome text, cost_usd numeric, actor text, ref jsonb);
create table public.portal_issues (id bigint generated always as identity, business_id uuid, spec_id uuid, opened_by text, body text, status text);
create function public.portal_spec_ctx(p_spec uuid, out business_id uuid, out skill_id text, out teammate text, out spec_status text, out business_status text)
  language sql stable as $$ select s.business_id, 'x', 'Hallie', 'sandbox', 'active' from public.skill_specs s where s.id = p_spec $$;
create function public.portal_job_pause(p_spec uuid, p_job text, p_reason text, p_detail text default null) returns bigint language plpgsql as $$
  declare v bigint; begin insert into public.agent_pauses (business_id, spec_id, job, reason, detail) select business_id, p_spec, p_job, p_reason, p_detail from public.skill_specs where id = p_spec returning id into v; return v; end $$;
`;
const DAY = "2026-11-18";

async function fresh() {
  const db = new PGlite();
  await db.exec(STUBS);
  await db.exec(MIGRATION);
  const biz = (await db.query("insert into businesses (name) values ('TEST Fork') returning id")).rows[0].id;
  const spec = (await db.query("insert into skill_specs (business_id) values ($1) returning id", [biz])).rows[0].id;
  const one = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0] ?? {})[0];
  const enqueue = (key, o = {}) => one("select job_enqueue($1, $2, 'schedule', $3, $4::date, '{}'::jsonb, $5, $6)", [spec, o.job ?? "daily_line", key, o.day ?? DAY, o.maxRuns ?? null, o.maxAttempts ?? 3]);
  const claim = async (id) => (await db.query("select * from job_claim($1)", [id])).rows[0];
  const run = async (id) => (await db.query("select * from job_runs where id = $1", [id])).rows[0];
  return { db, spec, one, enqueue, claim, run };
}

test("database rules", { skip: !PGlite && "PGlite is not installed" }, async (t) => {
  await t.test("one slot starts one run, however many times the timer asks", async () => {
    const { enqueue, one } = await fresh();
    const a = await enqueue("2026-11-18T07:30");
    assert.ok(a);
    assert.equal(await enqueue("2026-11-18T07:30"), null);
    assert.equal(await enqueue("2026-11-18T07:30"), null);
    assert.ok(await enqueue("2026-11-19T07:30", { day: "2026-11-19" }), "the next day's slot is a new run");
    assert.equal(Number(await one("select count(*) from job_runs")), 2);
  });

  await t.test("the day's run limit holds, and a paused job or teammate starts nothing", async () => {
    const { enqueue, db, spec } = await fresh();
    assert.ok(await enqueue("a", { maxRuns: 2 })); assert.ok(await enqueue("b", { maxRuns: 2 }));
    assert.equal(await enqueue("c", { maxRuns: 2 }), null);
    assert.ok(await enqueue("d", { maxRuns: 2, day: "2026-11-19" }), "a new day starts a new count");
    await db.query("insert into agent_pauses (spec_id, job, reason) values ($1, 'job:daily_line', 'owner')", [spec]);
    assert.equal(await enqueue("e"), null, "this job is paused");
    assert.ok(await enqueue("f", { job: "other_job" }), "the teammate's other jobs keep running");
    await db.query("insert into agent_pauses (spec_id, job, reason) values ($1, 'Calendar', 'expired_access')", [spec]);
    assert.ok(await enqueue("g", { job: "other_job" }), "a paused tool does not stop a job from starting");
    await db.query("insert into agent_pauses (spec_id, job, reason) values ($1, null, 'billing')", [spec]);
    assert.equal(await enqueue("h", { job: "other_job" }), null, "the whole teammate is paused");
    await db.query("update agent_pauses set resumed_at = now()");
    assert.ok(await enqueue("i"), "resumed");
  });

  await t.test("only one worker can hold a run; a finished run cannot be picked up again", async () => {
    const { enqueue, claim, one, run } = await fresh();
    const id = await enqueue("k");
    const first = await claim(id);
    assert.equal(first.status, "running"); assert.equal(first.attempts, 1);
    assert.equal((await claim(id)).id, null, "a second worker gets nothing while the first holds it");
    assert.equal(await one("select job_finish($1, 'done', 'Added the line.')", [id]), "done");
    assert.equal((await claim(id)).id, null, "a forced retry of a finished run is refused");
    assert.equal(await one("select job_finish($1, 'retry')", [id]), null, "and it cannot be un-finished");
    assert.equal((await run(id)).status, "done");
    assert.equal(await one("select summary from activity_log where job = 'job:daily_line'"), "Added the line.");
  });

  await t.test("a worker that went quiet loses the run after its lease", async () => {
    const { enqueue, claim, db } = await fresh();
    const id = await enqueue("k");
    await claim(id);
    await db.query("update job_runs set lease_until = now() - interval '1 second' where id = $1", [id]);
    const again = await claim(id);
    assert.equal(again.status, "running"); assert.equal(again.attempts, 2);
  });

  await t.test("a numbered action happens at most once", async () => {
    const { enqueue, claim, one } = await fresh();
    const id = await enqueue("k"); await claim(id);
    const begin = (seq, tool = "save_to_sheet") => one("select job_action_begin($1, $2, $3, 'row', 'add', 'h1')", [id, seq, tool]);
    assert.deepEqual(await begin(1), { status: "fresh" });
    assert.equal((await begin(1)).status, "unknown", "started but never finished: nobody knows, so it is not fresh");
    assert.equal((await begin(1)).status, "unknown", "and it stays that way");
    assert.deepEqual(await begin(2), { status: "fresh" });
    await one("select job_action_end($1, 2, 'done', 'Done.')", [id]);
    assert.deepEqual(await begin(2), { status: "done", result: "Done.", tool: "save_to_sheet", same: true });
    await one("select job_action_end($1, 2, 'failed', 'changed my mind')", [id]);
    assert.equal((await begin(2)).status, "done", "a finished action cannot be rewritten");
    await one("select job_finish($1, 'done')", [id]);
    assert.deepEqual(await begin(3), { status: "no_run" }, "a run that is over can do nothing more");
  });

  await t.test("three failed tries pause that job and no other; the wait between tries grows", async () => {
    const { enqueue, claim, one, run, db } = await fresh();
    const id = await enqueue("k");
    for (const n of [1, 2]) {
      await claim(id);
      assert.equal(await one("select job_finish($1, 'retry', null, 'The sheet said no.')", [id]), "queued");
      const r = await run(id);
      assert.ok(new Date(r.due_at) - Date.now() > (n * 5 - 1) * 60000, `try ${n} waits about ${n * 5} minutes`);
      assert.equal((await claim(id)).id, null, "not due yet");
      await db.query("update job_runs set due_at = now() where id = $1", [id]);
    }
    await claim(id);
    assert.equal(await one("select job_finish($1, 'retry', null, 'The sheet said no.')", [id]), "failed");
    const p = (await db.query("select job, reason, detail from agent_pauses")).rows;
    assert.deepEqual(p, [{ job: "job:daily_line", reason: "supervisor", detail: "It failed 3 times in a row: The sheet said no." }]);
    assert.equal(await enqueue("next"), null, "the paused job starts nothing new");
    assert.ok(await enqueue("x", { job: "other_job" }), "another job of the same teammate still starts");
  });

  await t.test("out of time is not a failure; a dead end opens a supervisor issue and never retries", async () => {
    const { enqueue, claim, one, run, db } = await fresh();
    const id = await enqueue("k");
    for (let i = 0; i < 6; i++) { await claim(id); assert.equal(await one("select job_finish($1, 'continue', null, null, $2::jsonb, 3)", [id, JSON.stringify({ v: 1, at: i })]), "queued"); }
    const r = await run(id);
    assert.equal(r.attempts, 0, "carrying on does not count as a failed try"); assert.equal(r.state.at, 5); assert.equal(r.steps, 3);
    await claim(id);
    assert.equal(await one("select job_finish($1, 'dead_end', null, 'Nobody knows whether the row was added.')", [id]), "dead_end");
    assert.equal((await claim(id)).id, null);
    assert.match(await one("select body from portal_issues where opened_by = 'supervisor'"), /Hallie stopped a job \(daily_line\) and needs a person: Nobody knows/);
    assert.equal(Number(await one("select count(*) from agent_pauses")), 0, "a dead end stops the run, not the job");
    const b = await enqueue("b"); await claim(b);
    assert.equal(await one("select job_finish($1, 'blocked', null, 'sheets is not available.')", [b]), "failed");
    assert.equal(await one("select reason from agent_pauses"), "missing_connection");
    assert.equal(await one("select job_finish($1, 'made_up')", [b]), null);
    await db.query("select 1");
  });

  await t.test("the tables are closed to the public roles", async () => {
    const { one } = await fresh();
    for (const role of ["anon", "authenticated"]) for (const tbl of ["job_runs", "job_actions"]) assert.equal(await one("select has_table_privilege($1, $2, 'select')", [role, "public." + tbl]), false);
    for (const fn of ["job_claim(uuid,integer)", "job_finish(uuid,text,text,text,jsonb,integer,numeric)", "job_enqueue(uuid,text,text,text,date,jsonb,integer,integer)"]) assert.equal(await one("select has_function_privilege('anon', $1, 'execute')", ["public." + fn]), false);
    assert.equal(await one("select relrowsecurity from pg_class where relname = 'job_runs'"), true);
  });
});
