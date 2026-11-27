// The background runtime's queue rules, run as the real migration on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261127_02_background_runtime.sql", import.meta.url)), "utf8");

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text not null default 'setup');
    create table skill_specs (id uuid primary key default gen_random_uuid());
    create table vault_items (id uuid primary key default gen_random_uuid());
    create table forge_settings (key text primary key, value jsonb);
    create table pip_limits (kind text primary key, label text, per_day numeric, per_month numeric, per_visitor_hour numeric, per_visitor_day numeric, fn_cap numeric, also_stop_if text, pausable boolean, note text);
    -- activity_log with the live table's own checks (read Nov 26, 2026), so a line the live database would refuse fails here too.
    create table activity_log (id bigserial primary key, business_id uuid, spec_id uuid, agent text, job text, at timestamptz default now(),
      kind text check (kind = any (array['action','pause','resume','alert','error','supervisor','system','owner','connection'])),
      summary text check (char_length(summary) between 1 and 500),
      outcome text check (outcome = any (array['ok','failed','skipped','paused','info'])), cost_usd numeric, actor text, ref jsonb);
  `);
  await db.exec(sql);
  const test_biz = (await db.query("insert into businesses (name) values ('TEST Fork') returning id")).rows[0].id;
  const real_biz = (await db.query("insert into businesses (name) values ('A real business') returning id")).rows[0].id;
  await db.query("insert into forge_settings (key, value) values ('act_sandbox_businesses', $1::jsonb), ('kill_switch', 'false')", [JSON.stringify([test_biz])]);
  return { db, test_biz, real_biz };
}
const one = async (db, q, p = []) => (await db.query(q, p)).rows[0];
const enqueue = async (db, biz, key = null, extra = "") => (await one(db, `select work_enqueue($1, 'signin_check', 'Check the sign-in to Practice Tool', '{}'::jsonb, null, null, $2${extra}) as id`, [biz, key])).id;
const claim = async (db, worker = "w1") => (await db.query("select * from work_claim($1, 60)", [worker])).rows[0] ?? null;
const job = (db, id) => one(db, "select * from work_jobs where id = $1", [id]);

test("background work is dark by default: only a TEST business may have a job until the switch is on", { skip: !PGlite }, async () => {
  const { db, test_biz, real_biz } = await fresh();
  assert.ok(await enqueue(db, test_biz));
  await assert.rejects(enqueue(db, real_biz), /not switched on/);
  await db.query("update forge_settings set value = 'true' where key = 'background_work_on'");
  assert.ok(await enqueue(db, real_biz));
  await db.query("update businesses set status = 'disconnected' where id = $1", [real_biz]);
  await assert.rejects(enqueue(db, real_biz), /has left/);
});

test("asking twice with the same key queues one job", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const a = await enqueue(db, test_biz, "daily-check:2026-11-27"), b = await enqueue(db, test_biz, "daily-check:2026-11-27");
  assert.equal(a, b);
  assert.equal((await one(db, "select count(*)::int as n from work_jobs")).n, 1);
});

test("two workers never hold the same job, and a job that is not due yet is left alone", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const id = await enqueue(db, test_biz);
  const later = await enqueue(db, test_biz, null, ", 1, 30, now() + interval '1 hour'");
  const first = await claim(db, "w1");
  assert.equal(first.id, id);
  assert.equal(first.status, "running");
  assert.equal(await claim(db, "w2"), null, "the only due job is held; the later one is not due");
  assert.equal((await job(db, later)).status, "queued");
});

test("the kill switch and the work pause both stop every claim", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  await enqueue(db, test_biz);
  await db.query("update forge_settings set value = 'true' where key = 'kill_switch'");
  assert.equal(await claim(db), null);
  await db.exec("update forge_settings set value = 'false' where key = 'kill_switch'; update forge_settings set value = 'true' where key = 'work_paused'");
  assert.equal(await claim(db), null);
  await db.query("update forge_settings set value = 'false' where key = 'work_paused'");
  assert.ok(await claim(db));
});

test("a worker that dies is replaced when its hold runs out, and the job keeps its saved state", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const id = await enqueue(db, test_biz);
  await claim(db, "w1");
  await db.query("update work_jobs set state = 'check', step = 4, lease_until = now() - interval '1 second' where id = $1", [id]);
  assert.equal((await one(db, "select work_heartbeat($1, 'w1', 60) as ok", [id])).ok, false, "the dead worker's hold is gone");
  const again = await claim(db, "w2");
  assert.equal(again.id, id);
  assert.equal(again.worker, "w2");
  assert.equal(again.state, "check");
  assert.equal(again.step, 4);
  assert.equal(again.attempts, 2);
});

test("three deaths in a row end the job and say so; it is not handed out a fourth time", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const id = await enqueue(db, test_biz);
  for (const w of ["w1", "w2", "w3"]) { assert.ok(await claim(db, w)); await db.query("update work_jobs set lease_until = now() - interval '1 second' where id = $1", [id]); }
  assert.equal(await claim(db, "w4"), null);
  const j = await job(db, id);
  assert.equal(j.status, "failed");
  assert.match(j.reason, /3 times in a row/);
  assert.equal(j.alerted_at, null, "left for pip-work to email the founder");
});

test("giving a job back proves the worker was alive: the death count starts again, and only the holder may do it", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const id = await enqueue(db, test_biz);
  await claim(db, "w1");
  assert.equal((await one(db, "select work_release($1, 'someone-else', 'done') as ok", [id])).ok, false);
  assert.equal((await one(db, "select work_release($1, 'w1', 'queued', now()) as ok", [id])).ok, true);
  const j = await job(db, id);
  assert.equal(j.status, "queued"); assert.equal(j.attempts, 0); assert.equal(j.worker, null);
  assert.equal((await one(db, "select count(*)::int as n from activity_log")).n, 0, "nothing is written to the owner for a job that is only continuing");
});

test("an ending and a wait for the owner are written to the owner's activity in plain words the table accepts", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const a = await enqueue(db, test_biz), b = await enqueue(db, test_biz), c = await enqueue(db, test_biz);
  await claim(db, "w1"); await one(db, "select work_release($1, 'w1', 'done', null, 'Pip is still signed in to Practice Tool.')", [a]);
  await claim(db, "w1"); await one(db, "select work_release($1, 'w1', 'waiting_owner', null, 'Practice Tool is showing a captcha.', 'captcha')", [b]);
  await claim(db, "w1"); await one(db, "select work_release($1, 'w1', 'failed', null, 'Pip could not finish this job.', 'A step failed three times in a row.')", [c]);
  const lines = (await db.query("select kind, outcome, summary from activity_log order by id")).rows;
  assert.deepEqual(lines.map((l) => [l.kind, l.outcome]), [["action", "ok"], ["alert", "paused"], ["error", "failed"]]);
  assert.equal(lines[0].summary, "Check the sign-in to Practice Tool: Pip is still signed in to Practice Tool.");
  assert.equal((await job(db, a)).outcome, "ok");
  assert.equal((await job(db, b)).outcome, "needs_owner");
  assert.ok((await job(db, c)).finished_at);
});

test("the dollar cap is held by the database: a job that reaches it ends there, whatever the worker wrote", { skip: !PGlite }, async () => {
  const { db, test_biz } = await fresh();
  const id = await enqueue(db, test_biz, null, ", 0.5");
  await claim(db, "w1");
  await db.query("update work_jobs set cost_usd = 0.2 where id = $1", [id]);
  assert.equal((await job(db, id)).status, "running");
  await db.query("update work_jobs set cost_usd = 0.5 where id = $1", [id]);
  const j = await job(db, id);
  assert.equal(j.status, "failed");
  assert.match(j.reason, /\$0\.50 cap/);
  assert.equal((await one(db, "select work_heartbeat($1, 'w1', 60) as ok", [id])).ok, false, "the worker finds out on its next heartbeat");
});

test("every new table has row-level security and is closed to visitors and signed-in users", { skip: !PGlite }, async () => {
  const { db } = await fresh();
  const t = (await db.query("select relname, relrowsecurity from pg_class where relname in ('work_jobs','work_steps','tool_identities')")).rows;
  assert.equal(t.length, 3);
  assert.ok(t.every((r) => r.relrowsecurity));
  const grants = (await db.query("select count(*)::int as n from information_schema.role_table_grants where table_name in ('work_jobs','work_steps','tool_identities') and grantee in ('anon','authenticated')")).rows[0].n;
  assert.equal(grants, 0);
});
