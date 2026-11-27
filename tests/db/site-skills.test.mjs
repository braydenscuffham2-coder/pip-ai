// Site skills: keeping what a run learned, and the weekly check. Run as the real migrations on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8");
const STEPS = JSON.stringify([{ do: "click", url: "", el: { tag: "a", type: "", text: "Open {{pet}}", name: "", id: "" } }, { do: "click", url: "", el: { tag: "button", type: "submit", text: "Save patient", name: "", id: "" }, write: true }]);

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text not null default 'setup');
    create table skill_specs (id uuid primary key default gen_random_uuid());
    create table vault_items (id uuid primary key default gen_random_uuid());
    create table forge_settings (key text primary key, value jsonb);
    create table pip_limits (kind text primary key, label text, per_day numeric, per_month numeric, per_visitor_hour numeric, per_visitor_day numeric, fn_cap numeric, also_stop_if text, pausable boolean, note text);
    create table activity_log (id bigserial primary key, business_id uuid, spec_id uuid, agent text, job text, at timestamptz default now(), kind text, summary text, outcome text, cost_usd numeric, actor text, ref jsonb);
  `);
  for (const f of ["20261127_02_background_runtime.sql", "20261127_05_screen_work.sql", "20261127_06_fresh_step_budget.sql", "20261127_07_site_skills.sql"]) await db.exec(read(f));
  const one = async (q, p = []) => (await db.query(q, p)).rows[0];
  const biz = (await one("insert into businesses (name) values ('TEST Fork') returning id")).id;
  const other = (await one("insert into businesses (name) values ('Not a test business') returning id")).id;
  await db.query("insert into forge_settings (key, value) values ('act_sandbox_businesses', $1::jsonb)", [JSON.stringify([biz])]);
  const ident = async (b) => (await one("insert into tool_identities (business_id, tool, tool_key, login_url, site) values ($1, 'Practice Tool', 'practice-vet', 'https://www.hirepip.com/practice/x/home', 'hirepip.com') returning id", [b])).id;
  const save = (b, id, repair = false) => one("select site_skill_save($1, 'practice-vet', 'comfort-card-pause', $2, 'update', '[\"/practice/x/patients*\"]'::jsonb, 'https://www.hirepip.com/practice/x/patients', $3::jsonb, '{\"pet\":\"Biscuit\"}'::jsonb, null, $4) as v", [b, id, STEPS, repair]);
  return { db, one, biz, other, ident, save };
}

test("the first good run is kept as version 1; a repair replaces the steps and is counted", { skip: !PGlite }, async () => {
  const { one, biz, ident, save } = await fresh();
  const id = await ident(biz);
  assert.equal((await save(biz, id)).v, 1);
  assert.equal((await save(biz, id, true)).v, 2);
  const s = await one("select version, repairs, status, steps, sample_inputs from site_skills");
  assert.deepEqual([s.version, s.repairs, s.status], [2, 1, "ready"]);
  assert.equal(s.steps[0].el.text, "Open {{pet}}", "the job's own values are kept as names");
  assert.deepEqual(s.sample_inputs, { pet: "Biscuit" });
  assert.equal((await one("select site_skill_save($1, 'practice-vet', 'x', $2, 'read', '[]'::jsonb, 'https://x.test/', '[]'::jsonb, '{}'::jsonb, null) as v", [biz, id])).v, null, "an empty run teaches nothing");
});

test("a clean replay counts as a use; steps that no longer fit mark the skill for repair", { skip: !PGlite }, async () => {
  const { one, biz, ident, save } = await fresh();
  await save(biz, await ident(biz));
  await one("select site_skill_mark($1, 'practice-vet', 'comfort-card-pause', true, true)", [biz]);
  let s = await one("select uses, status, last_used_at from site_skills");
  assert.equal(s.uses, 1); assert.ok(s.last_used_at);
  await one("select site_skill_mark($1, 'practice-vet', 'comfort-card-pause', false)", [biz]);
  s = await one("select uses, status from site_skills");
  assert.deepEqual([s.uses, s.status], [1, "needs_repair"]);
});

test("the weekly check queues one check-only job per stale skill, once a week, and skips a business that may not have background work", { skip: !PGlite }, async () => {
  const { db, one, biz, other, ident, save } = await fresh();
  await save(biz, await ident(biz));
  await db.query("update forge_settings set value = 'true' where key = 'background_work_on'");
  await save(other, await ident(other));
  await db.query("update forge_settings set value = 'false' where key = 'background_work_on'");
  assert.equal((await one("select site_skills_enqueue_checks() as n")).n, 0, "a skill checked this week is left alone");
  await db.query("update site_skills set verified_at = now() - interval '8 days'");
  assert.equal((await one("select site_skills_enqueue_checks() as n")).n, 1, "only the TEST business's skill is queued");
  assert.equal((await one("select site_skills_enqueue_checks() as n")).n, 1, "asking again the same week finds the same job");
  const jobs = (await db.query("select kind, business_id, plan from work_jobs")).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, "skill_verify"); assert.equal(jobs[0].business_id, biz);
  assert.equal(jobs[0].plan.replay.dry, true, "the check never types or saves");
  assert.deepEqual(jobs[0].plan.inputs, { pet: "Biscuit" });
});
