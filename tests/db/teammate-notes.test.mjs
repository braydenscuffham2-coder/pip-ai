// Weekly notes in the database: the facts of a teammate's week are counted from its own runs and pauses, a note is due
// only for teammates that may act (live, or on a TEST business), and there is one note per teammate per week.
// Run as the real migration on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null, pgcrypto = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); ({ pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto")); } catch { /* not installed */ }
const ready = !!(PGlite && pgcrypto);
const read = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8");
const FROM = "2026-11-16T00:00:00Z", TO = "2026-11-23T00:00:00Z";

async function fresh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text not null default 'active');
    create table forge_settings (key text primary key, value jsonb);
    create table build_orders (id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id));
    create table skill_specs (id uuid primary key default gen_random_uuid(), order_id uuid references build_orders(id), skill_id text, status text not null default 'sandbox', spec jsonb, brain jsonb, updated_at timestamptz default now());
    create table job_runs (id uuid primary key default gen_random_uuid(), business_id uuid, spec_id uuid, job_id text, status text, summary text, error text, cost_usd numeric default 0, created_at timestamptz default now());
    create table agent_pauses (id uuid primary key default gen_random_uuid(), business_id uuid, spec_id uuid, job text, reason text, paused_at timestamptz default now(), resumed_at timestamptz);
  `);
  await db.exec(read("20261127_12_teammate_notes.sql"));
  const one = async (q, p = []) => (await db.query(q, p)).rows[0];
  const biz = async (name, status = "active") => (await one("insert into businesses (name, status) values ($1, $2) returning id", [name, status])).id;
  const mate = async (b, status, jobs = true, name = "Front Desk") => {
    const o = (await one("insert into build_orders (business_id) values ($1) returning id", [b])).id;
    return (await one("insert into skill_specs (order_id, skill_id, status, spec) values ($1, 'front_desk', $2, $3::jsonb) returning id", [o, status, JSON.stringify({ board: { teammate: { name } }, ...(jobs ? { jobs: [{ id: "book" }] } : {}) })])).id;
  };
  const run = async (spec, status, at, extra = {}) => (await one("insert into job_runs (spec_id, job_id, status, summary, error, cost_usd, created_at) values ($1, $2, $3, $4, $5, $6, $7) returning id", [spec, extra.job ?? "book", status, extra.summary ?? null, extra.error ?? null, extra.cost ?? 0.01, at])).id;
  return { db, one, biz, mate, run };
}

test("a week's facts are counted from the teammate's own runs and pauses, inside the week only", { skip: !ready }, async () => {
  const { db, one, biz, mate, run } = await fresh();
  const b = await biz("TEST Fork"), s = await mate(b, "sandbox"), other = await mate(b, "sandbox");
  await run(s, "done", "2026-11-17T10:00:00Z", { summary: "Booked a table for four." });
  await run(s, "done", "2026-11-18T10:00:00Z", { job: "remind" });
  const bad = await run(s, "failed", "2026-11-19T10:00:00Z", { error: "The calendar did not answer." });
  const ask = await run(s, "dead_end", "2026-11-20T10:00:00Z", { summary: "Needs a person: party of 30." });
  await run(s, "failed", "2026-11-23T00:00:00Z");                  // the next week
  await run(s, "failed", "2026-11-15T23:59:59Z");                  // the week before
  await run(other, "failed", "2026-11-19T10:00:00Z");              // another teammate
  await db.query("insert into agent_pauses (spec_id, job, reason, paused_at) values ($1, 'book', 'too_many_failures', '2026-11-19T11:00:00Z'), ($1, 'book', 'old', '2026-11-01T00:00:00Z')", [s]);
  const f = (await one("select teammate_week($1, $2, $3) f", [s, FROM, TO])).f;
  assert.equal(f.runs, 4); assert.equal(f.done, 2); assert.equal(f.failed, 1); assert.equal(f.asked_for_a_person, 1);
  assert.equal(Number(f.cost_usd), 0.04);
  assert.deepEqual(f.trouble.map((t) => t.run).sort(), [bad, ask].sort(), "trouble lists the failed run and the one that asked for a person");
  assert.equal(f.trouble.find((t) => t.run === bad).what, "The calendar did not answer.");
  assert.equal(f.good.length, 2); assert.equal(f.pauses.length, 1); assert.equal(f.pauses[0].reason, "too_many_failures");
  assert.deepEqual(f.by_job.find((j) => j.job === "book"), { job: "book", runs: 3, done: 1, failed: 1, asked: 1 });
});

test("a quiet week still gives facts: zeros and empty lists, never nulls", { skip: !ready }, async () => {
  const { one, biz, mate } = await fresh();
  const f = (await one("select teammate_week($1, $2, $3) f", [await mate(await biz("TEST Fork"), "sandbox"), FROM, TO])).f;
  assert.equal(f.runs, 0); assert.equal(Number(f.cost_usd), 0); assert.deepEqual(f.trouble, []); assert.deepEqual(f.by_job, []); assert.deepEqual(f.pauses, []);
});

test("a note is due for live teammates and for sandbox teammates on a TEST business, and for nobody else", { skip: !ready }, async () => {
  const { db, one, biz, mate } = await fresh();
  const t = await biz("TEST Fork"), real = await biz("A real business"), gone = await biz("Left", "disconnected");
  await db.query("insert into forge_settings (key, value) values ('act_sandbox_businesses', $1::jsonb)", [JSON.stringify([t])]);
  const sandboxOnTest = await mate(t, "sandbox"), liveReal = await mate(real, "live", true, "Night Host");
  await mate(real, "sandbox");                 // not live, not on the TEST list
  await mate(t, "sandbox", false);             // no declared jobs: nothing it could have done
  await mate(gone, "live");                    // a business that left
  await mate(t, "draft");                      // not yet through the Forge
  const due = async () => (await one("select teammate_notes_due('2026-11-16'::date, 25) d")).d;
  const d = await due();
  assert.deepEqual(d.map((x) => x.spec).sort(), [sandboxOnTest, liveReal].sort());
  assert.equal(d.find((x) => x.spec === liveReal).teammate, "Night Host"); assert.equal(d.find((x) => x.spec === liveReal).test, false);
  assert.equal(d.find((x) => x.spec === sandboxOnTest).test, true);
  // once written, it is not due again that week, and a second note for the same week is refused
  const ins = "insert into teammate_notes (business_id, spec_id, week_start, teammate, did, facts) values ($1, $2, '2026-11-16', 'Front Desk', 'Booked 12 tables.', '{}'::jsonb)";
  await db.query(ins, [t, sandboxOnTest]);
  assert.deepEqual((await due()).map((x) => x.spec), [liveReal]);
  await assert.rejects(db.query(ins, [t, sandboxOnTest]), /duplicate|unique/i);
  assert.equal((await one("select teammate_notes_due('2026-11-23'::date, 25) d")).d.length, 2, "the next week it is due again");
});

test("a note's answer is one of two words, and nobody outside the service may read the table", { skip: !ready }, async () => {
  const { db, one, biz, mate } = await fresh();
  const b = await biz("TEST Fork"), s = await mate(b, "sandbox");
  const id = (await one("insert into teammate_notes (business_id, spec_id, week_start, teammate, did, facts, proposal) values ($1, $2, '2026-11-16', 'Front Desk', 'Booked 12 tables.', '{}'::jsonb, $3::jsonb) returning id", [b, s, JSON.stringify({ change: "Send the reminder at 9am.", why: "Three stops before 9.", evidence: [] })])).id;
  await assert.rejects(db.query("update teammate_notes set decision = 'apply_it' where id = $1", [id]), /check/i);
  await db.query("update teammate_notes set decision = 'good_idea', decided_by = 'owner@example.test', decided_at = now() where id = $1", [id]);
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await one("select has_table_privilege($1, 'public.teammate_notes', 'select') p", [role])).p, false, role);
    assert.equal((await one("select has_function_privilege($1, 'public.teammate_week(uuid, timestamptz, timestamptz)', 'execute') p", [role])).p, false, role);
  }
  assert.equal((await one("select has_table_privilege('service_role', 'public.teammate_notes', 'delete') p")).p, false, "no delete grant");
  assert.equal((await one("select value from forge_settings where key = 'notes_on'")).value, true);
});
