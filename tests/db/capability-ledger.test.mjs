// The capability list and the pipeline scorecard: an unknown capability never counts as working, a switched-on tool
// lifts a capability without editing the list, and the scorecard sorts imagined teammates by what they are missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261127_26_capability_ledger.sql", import.meta.url)), "utf8");
const pkg = (agents) => JSON.stringify({ package: { agents } });

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table build_orders (id serial primary key, "order" jsonb not null, source text);
    create table skill_specs (id serial primary key, spec jsonb not null default '{}', status text not null default 'sandbox');
    create table tool_catalog (slug text primary key, block text, enabled boolean default true);
  `);
  await db.exec(migration);
  return db;
}
const card = async (db) => (await db.query("select public.pipeline_scorecard() as c")).rows[0].c;
const status = async (db, k) => (await db.query("select public.capability_status($1) as s", [k])).rows[0].s;

test("an unknown capability is not built, and a listed one is what its row says", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal(await status(db, "teleportation"), "not_built");
  assert.equal(await status(db, "calendar"), "proven");
  assert.equal(await status(db, "send_text"), "blocked");
  assert.equal(await status(db, "crm"), "not_built");
});

test("switching on a tool lifts a capability to built, never past a block and never to proven", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec("insert into tool_catalog values ('HUBSPOT_CREATE_CONTACT', 'crm', true), ('X_OFF', 'pos', false), ('TWILIO_X', 'send_text', true)");
  assert.equal(await status(db, "crm"), "built");
  assert.equal(await status(db, "pos"), "not_built", "a tool that is switched off lifts nothing");
  assert.equal(await status(db, "send_text"), "blocked");
});

test("the scorecard sorts imagined teammates by what they are missing and counts real jobs", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query(`insert into build_orders ("order", source) values ($1, 'pip-reader'), ($2, 'pip-reader'), ($3, 'test-fixture')`, [
    pkg([{ agent_id: "front-desk", uses: ["inbound_message", "calendar", "email"] }, { agent_id: "texter", uses: ["inbound_message", "send_text"] }, { agent_id: "chat", uses: ["web_chat", "notify_owner"] }]),
    pkg([{ agent_id: "crm-bot", uses: ["crm", "email"] }, { agent_id: "pos-bot", uses: ["pos", "crm"] }, { agent_id: "odd", uses: "not a list" }]),
    pkg([{ agent_id: "fixture", uses: ["pos"] }]),
  ]);
  await db.exec(`insert into skill_specs (spec, status) values ('{"jobs":[{"id":"a"}]}', 'sandbox'), ('{"jobs":[]}', 'sandbox'), ('{}', 'live')`);
  const c = await card(db);
  assert.equal(c.imagined, 6, "test fixtures are not counted");
  assert.equal(c.could_run_all_proven, 1, "front-desk");
  assert.equal(c.nothing_listed, 1, "a teammate that lists nothing is not counted as able to run");
  assert.equal(c.could_run_some_unproven, 1);
  assert.equal(c.waiting_on_something_outside, 1);
  assert.equal(c.cannot_run, 2);
  assert.deepEqual(c.most_needed, [{ capability: "crm", teammates: 2 }, { capability: "pos", teammates: 1 }]);
  assert.equal(c.specs, 3); assert.equal(c.specs_with_jobs, 1); assert.equal(c.specs_live, 1);
});
