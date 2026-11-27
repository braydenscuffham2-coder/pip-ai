// Screen work's approvals and earned trust, run as the real migrations on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8");

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text not null default 'setup');
    create table skill_specs (id uuid primary key default gen_random_uuid());
    create table vault_items (id uuid primary key default gen_random_uuid());
    create table forge_settings (key text primary key, value jsonb);
    create table pip_limits (kind text primary key, label text, per_day numeric, per_month numeric, per_visitor_hour numeric, per_visitor_day numeric, fn_cap numeric, also_stop_if text, pausable boolean, note text);
    create table activity_log (id bigserial primary key, business_id uuid, spec_id uuid, agent text, job text, at timestamptz default now(),
      kind text check (kind = any (array['action','pause','resume','alert','error','supervisor','system','owner','connection'])),
      summary text check (char_length(summary) between 1 and 500),
      outcome text check (outcome = any (array['ok','failed','skipped','paused','info'])), cost_usd numeric, actor text, ref jsonb);
  `);
  await db.exec(read("20261127_02_background_runtime.sql"));
  await db.exec(read("20261127_05_screen_work.sql"));
  await db.exec(read("20261127_06_fresh_step_budget.sql"));
  const biz = (await db.query("insert into businesses (name) values ('TEST Fork') returning id")).rows[0].id;
  await db.query("insert into forge_settings (key, value) values ('act_sandbox_businesses', $1::jsonb)", [JSON.stringify([biz])]);
  const one = async (q, p = []) => (await db.query(q, p)).rows[0];
  const waiting = async () => {
    const id = (await one("select work_enqueue($1, 'screen', 'Add a refill request', $2::jsonb) as id", [biz, JSON.stringify({ goal: "x", pending: { label: "Add refill request", url: "https://example.test/refills", form: { patient: "Biscuit", quantity: "30" } } })])).id;
    await db.query("select * from work_claim('w1', 60)");
    await one("select work_release($1, 'w1', 'waiting_approval', null, 'Pip is ready to press Add refill request.')", [id]);
    return id;
  };
  return { db, biz, one, waiting };
}

test("a task nobody has seen needs the owner's yes; after three approved runs it does not", { skip: !PGlite }, async () => {
  const { biz, one } = await fresh();
  const needs = async () => (await one("select screen_needs_approval($1, 'practice-tool', 'add-refill') as b", [biz])).b;
  assert.equal(await needs(), true);
  for (const n of [1, 2]) { assert.equal((await one("select screen_trust_note($1, 'practice-tool', 'add-refill') as n", [biz])).n, n); assert.equal(await needs(), true); }
  await one("select screen_trust_note($1, 'practice-tool', 'add-refill')", [biz]);
  assert.equal(await needs(), false);
  assert.equal((await one("select screen_needs_approval($1, 'practice-tool', 'another-task') as b", [biz])).b, true, "trust is per task");
  assert.equal((await one("select screen_needs_approval($1, 'another-tool', 'add-refill') as b", [biz])).b, true, "and per tool");
});

test("the owner's yes queues the job again with exactly the values they saw", { skip: !PGlite }, async () => {
  const { db, one, waiting } = await fresh();
  const id = await waiting();
  assert.equal((await one("select work_approve($1, true, 'owner@example.test') as r", [id])).r, "approved");
  const j = await one("select status, state, plan from work_jobs where id = $1", [id]);
  assert.equal(j.status, "queued"); assert.equal(j.state, "start");
  assert.equal(j.plan.approved, true);
  assert.deepEqual(j.plan.approved_form, { patient: "Biscuit", quantity: "30" });
  assert.equal(j.plan.started, false);
  assert.equal((await one("select work_approve($1, true) as r", [id])).r, "not_waiting", "a yes cannot be given twice");
  const line = (await db.query("select kind, outcome, summary from activity_log order by id desc limit 1")).rows[0];
  assert.deepEqual([line.kind, line.outcome], ["owner", "ok"]);
});

test("the owner's no stops the job and says nothing was saved", { skip: !PGlite }, async () => {
  const { one, waiting } = await fresh();
  const id = await waiting();
  assert.equal((await one("select work_approve($1, false) as r", [id])).r, "declined");
  const j = await one("select status, outcome, summary from work_jobs where id = $1", [id]);
  assert.deepEqual([j.status, j.outcome], ["stopped", "stopped"]);
  assert.match(j.summary, /did not save anything/);
});

test("resume only moves a job that is waiting for a person, and starts it from its first page", { skip: !PGlite }, async () => {
  const { db, biz, one } = await fresh();
  const id = (await one("select work_enqueue($1, 'screen', 'Read a record', '{\"started\": true}'::jsonb) as id", [biz])).id;
  assert.equal((await one("select work_resume($1) as ok", [id])).ok, false, "a queued job is left alone");
  await db.query("select * from work_claim('w1', 60)");
  await one("select work_release($1, 'w1', 'waiting_owner', null, 'A captcha appeared.')", [id]);
  assert.equal((await one("select work_resume($1) as ok", [id])).ok, true);
  const j = await one("select status, state, plan from work_jobs where id = $1", [id]);
  assert.deepEqual([j.status, j.state, j.plan.started], ["queued", "start", false]);
});

test("a job that starts again after a yes, or after a person helped, gets a fresh step budget but keeps its cost", { skip: !PGlite }, async () => {
  const { db, one, waiting } = await fresh();
  const id = await waiting();
  await db.query("update work_jobs set step = 11, cost_usd = 0.04 where id = $1", [id]);
  await one("select work_approve($1, true)", [id]);
  let j = await one("select step, cost_usd from work_jobs where id = $1", [id]);
  assert.equal(j.step, 0); assert.equal(Number(j.cost_usd), 0.04);
  await db.query("select * from work_claim('w1', 60)");
  await db.query("update work_jobs set step = 7 where id = $1", [id]);
  await one("select work_release($1, 'w1', 'waiting_owner', null, 'A captcha appeared.')", [id]);
  await one("select work_resume($1)", [id]);
  j = await one("select step from work_jobs where id = $1", [id]);
  assert.equal(j.step, 0);
});
