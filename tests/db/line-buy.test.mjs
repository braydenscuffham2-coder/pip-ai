// The database half of buying a business's Pip number: the switch, one number per business, the cap on numbers, one
// buy at a time, and what gets written. Runs the real migration on tables cut down to the columns it touches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261127_18_line_buy.sql", import.meta.url)), "utf8");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", GONE = "33333333-3333-4333-8333-333333333333";
const ORDER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ORDER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPEC_A = "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0", SPEC_B = "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0";
const SID = "PN" + "a".repeat(32), SID2 = "PN" + "b".repeat(32);

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key, name text, status text);
    create table build_orders (id uuid primary key, business_id uuid);
    create table skill_specs (id uuid primary key, order_id uuid, status text);
    create table forge_settings (key text primary key, value jsonb, updated_at timestamptz);
    create table activity_log (id bigserial primary key, business_id uuid not null, kind text not null default 'action', summary text not null, outcome text not null default 'ok', actor text,
      constraint activity_log_kind_check check (kind = any (array['action','pause','resume','alert','error','supervisor','system','owner','connection'])));
    create table phone_lines (business_id uuid primary key references businesses(id), business_number text, carrier text, pip_number text,
      status text not null check (status = any (array['requested','number_assigned','forwarding_set','verified','released'])),
      verified_at timestamptz, updated_at timestamptz not null default now(), spec_id uuid references skill_specs(id) on delete set null, handoff_number text, handoff_hours jsonb);
    insert into businesses values ('${A}', 'TEST Fork', 'building'), ('${B}', 'TEST Novelty Vet', 'building'), ('${GONE}', 'Closed Co', 'cancelled');
    insert into build_orders values ('${ORDER_A}', '${A}'), ('${ORDER_B}', '${B}');
    insert into skill_specs values ('${SPEC_A}', '${ORDER_A}', 'sandbox'), ('${SPEC_B}', '${ORDER_B}', 'sandbox');
  `);
  await db.exec(migration);
  return db;
}
const one = async (db, q, p = []) => (await db.query(q, p)).rows[0];
const claim = async (db, b) => (await one(db, "select line_claim($1) r", [b])).r;
const assign = async (db, b, n, sid, spec = null) => (await one(db, "select line_assign($1,$2,$3,$4) r", [b, n, sid, spec])).r;
const line = (db, b) => one(db, "select * from phone_lines where business_id = $1", [b]);
const cfg = (db, v) => db.query("update forge_settings set value = $1 where key = 'line_buy'", [JSON.stringify(v)]);

test("the switch starts on with room for exactly one number, at the approved ceiling", { skip: !PGlite }, async () => {
  const db = await fresh();
  const v = (await one(db, "select value from forge_settings where key = 'line_buy'")).value;
  assert.equal(v.on, true); assert.equal(v.max_lines, 1); assert.equal(v.max_monthly_usd, 1.2);
});

test("a claim, then the number is written with the teammate that answers", { skip: !PGlite }, async () => {
  const db = await fresh();
  const c = await claim(db, A);
  assert.equal(c.ok, true); assert.equal(Number(c.max_monthly_usd), 1.2);
  assert.ok((await line(db, A)).buying_at, "the claim is marked");
  assert.deepEqual(await claim(db, A), { ok: false, reason: "in_progress" });
  const r = await assign(db, A, "+12085550103", SID, SPEC_A);
  assert.deepEqual(r, { ok: true, number: "+12085550103", spec: SPEC_A });
  const l = await line(db, A);
  assert.equal(l.pip_number, "+12085550103"); assert.equal(l.provider_sid, SID); assert.equal(l.status, "number_assigned"); assert.equal(l.spec_id, SPEC_A); assert.equal(l.buying_at, null);
  const log = await one(db, "select kind, summary, actor from activity_log where business_id = $1", [A]);
  assert.equal(log.kind, "connection"); assert.match(log.summary, /\+12085550103/); assert.equal(log.actor, "Pip");
});

test("a business that has a number never gets a second claim", { skip: !PGlite }, async () => {
  const db = await fresh();
  await claim(db, A); await assign(db, A, "+12085550103", SID);
  const again = await claim(db, A);
  assert.equal(again.ok, false); assert.equal(again.reason, "has_number"); assert.equal(again.number, "+12085550103");
  assert.equal((await assign(db, A, "+12085550199", SID2)).reason, "has_number", "and a different number cannot be written over it");
  assert.equal((await assign(db, A, "+12085550103", SID)).ok, true, "writing the same number again is harmless");
});

test("the cap on numbers counts numbers in use and buys in flight, across every business", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await claim(db, A)).ok, true);
  assert.deepEqual(await claim(db, B), { ok: false, reason: "cap", have: 1, max: 1 }, "a buy in flight for A uses the one slot");
  await assign(db, A, "+12085550103", SID);
  assert.equal((await claim(db, B)).reason, "cap");
  await cfg(db, { on: true, max_monthly_usd: 1.2, max_lines: 2 });
  assert.equal((await claim(db, B)).ok, true, "raising the cap by hand allows the next one");
  await db.query("update phone_lines set status = 'released' where business_id = $1", [A]);
  await cfg(db, { on: true, max_monthly_usd: 1.2, max_lines: 1 });
  await db.query("select line_unclaim($1)", [B]);
  assert.equal((await claim(db, B)).ok, true, "a released number no longer counts");
});

test("off, a missing ceiling, an unknown business and a closed business all refuse", { skip: !PGlite }, async () => {
  const db = await fresh();
  await cfg(db, { on: false, max_monthly_usd: 1.2, max_lines: 1 });
  assert.deepEqual(await claim(db, A), { ok: false, reason: "off" });
  await cfg(db, { on: "true", max_monthly_usd: 1.2, max_lines: 1 });
  assert.deepEqual(await claim(db, A), { ok: false, reason: "off" }, "only a real true turns it on");
  await cfg(db, { on: true, max_lines: 1 });
  assert.deepEqual(await claim(db, A), { ok: false, reason: "no_ceiling" });
  await cfg(db, { on: true, max_monthly_usd: "1.2", max_lines: 1 });
  assert.deepEqual(await claim(db, A), { ok: false, reason: "no_ceiling" });
  await db.query("delete from forge_settings where key = 'line_buy'");
  assert.deepEqual(await claim(db, A), { ok: false, reason: "off" });
  await db.query(`insert into forge_settings values ('line_buy', '{"on":true,"max_monthly_usd":1.2,"max_lines":1}', now())`);
  assert.deepEqual(await claim(db, "44444444-4444-4444-8444-444444444444"), { ok: false, reason: "no_business" });
  assert.deepEqual(await claim(db, GONE), { ok: false, reason: "closed" });
  assert.equal(await line(db, A), undefined, "a refused claim leaves no line behind for a business that had none");
});

test("a refused buy can be tried again at once; a stale claim lapses on its own", { skip: !PGlite }, async () => {
  const db = await fresh();
  await claim(db, A);
  await db.query("select line_unclaim($1)", [A]);
  assert.equal((await claim(db, A)).ok, true);
  await db.query("update phone_lines set buying_at = now() - interval '4 minutes' where business_id = $1", [A]);
  assert.equal((await claim(db, A)).ok, true);
});

test("only a US number, only Twilio's id, and only this business's own teammate are written", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await assign(db, A, "+12085550103", SID)).reason, "no_claim", "nothing is written without a claim");
  await claim(db, A);
  for (const [n, s] of [["+442071234567", SID], ["2085550103", SID], ["+12085550103", "PNnope"], [null, SID], ["+12085550103", null]]) assert.equal((await assign(db, A, n, s)).reason, "bad_input");
  const r = await assign(db, A, "+12085550103", SID, SPEC_B);
  assert.equal(r.ok, true); assert.equal(r.spec, null, "another business's teammate is not put on the line");
  assert.equal((await line(db, A)).spec_id, null);
});

test("two businesses can never hold the same number", { skip: !PGlite }, async () => {
  const db = await fresh();
  await cfg(db, { on: true, max_monthly_usd: 1.2, max_lines: 5 });
  await claim(db, A); await assign(db, A, "+12085550103", SID);
  await claim(db, B);
  await assert.rejects(() => assign(db, B, "+12085550103", SID2), /phone_lines_pip_number_in_use|duplicate key/);
});

test("an owner's own details on the line survive, and a line already checked keeps its status", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("insert into phone_lines (business_id, business_number, carrier, status) values ($1, '+12085551000', 'Verizon', 'requested')", [A]);
  await claim(db, A); await assign(db, A, "+12085550103", SID, SPEC_A);
  const l = await line(db, A);
  assert.equal(l.business_number, "+12085551000"); assert.equal(l.carrier, "Verizon"); assert.equal(l.status, "number_assigned");
});

test("the three functions are closed to the public key", { skip: !PGlite }, async () => {
  const db = await fresh();
  const rows = (await db.query("select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('service_role', p.oid, 'execute') s from pg_proc p where p.proname in ('line_claim','line_assign','line_unclaim')")).rows;
  assert.equal(rows.length, 3);
  for (const r of rows) assert.deepEqual([r.a, r.u, r.s], [false, false, true], r.proname);
});
