// Job 1: every message that is sent leaves a record that cites the consent_ledger row it relied on, and STOP by email
// ends email for good. Runs the real migration on an in-memory Postgres, against a copy of the live consent gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const migration = read("../../supabase/migrations/20261122_01_outbound_record.sql");
const gate = read("./fixtures/portal_outbound_check.sql");

const BIZ = "11111111-1111-1111-1111-111111111111", SPEC = "22222222-2222-2222-2222-222222222222";

async function fresh() {
  const db = new PGlite();
  // The tables and helper functions as they are live today, cut down to the columns the gate and the new code touch.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key, name text, status text, timezone text, state text);
    create table jurisdiction_rules (state text primary key, outbound_hours jsonb, max_attempts_24h int);
    create table usage_events (id bigserial primary key, business_id uuid, spec_id uuid, unit text, qty int, provider text);
    create table consent_ledger (id bigserial primary key, business_id uuid not null, contact_hash text not null check (contact_hash ~ '^[0-9a-f]{64}$'),
      contact_hint text check (contact_hint is null or char_length(contact_hint) <= 12), contact_kind text not null check (contact_kind in ('phone','email')),
      channel text not null check (channel in ('sms','voice','email','any')), purpose text not null check (purpose in ('transactional','marketing','any')),
      status text not null check (status in ('granted','revoked')),
      method text not null check (method in ('web_form','inbound_message','verbal_on_call','written','imported_by_business','keyword_stop','portal')),
      proof jsonb not null default '{}', spec_id uuid, recorded_by text, at timestamptz not null default now());
    create table compliance_events (id bigserial primary key, business_id uuid, spec_id uuid, at timestamptz not null default now(), kind text not null,
      channel text, contact_hash text, detail jsonb not null default '{}',
      constraint compliance_events_detail_check check (octet_length(detail::text) <= 4000),
      constraint compliance_events_kind_check check (kind = any (array['ai_disclosure','recording_notice','opt_out','outbound_allowed','outbound_blocked','golive_blocked','terms_accepted','price_accepted'])));
    create function portal_contact_norm(p_kind text, p_contact text) returns text language sql immutable set search_path to '' as $$
      select case when p_kind = 'phone' then (select case when length(d) = 10 then '1' || d else d end from (select regexp_replace(coalesce(p_contact, ''), '\\D', '', 'g') as d) x)
      else lower(btrim(coalesce(p_contact, ''))) end $$;
    create function portal_contact_hash(p_business uuid, p_kind text, p_contact text) returns text language sql immutable set search_path to '' as $$
      select encode(sha256(convert_to(p_business::text || ':' || p_kind || ':' || public.portal_contact_norm(p_kind, p_contact), 'UTF8')), 'hex') $$;
    -- The old 3-argument text-billing function, exactly as migration 20261116_portal_07 made it.
    create function portal_sms_out(p_business uuid, p_spec uuid, p_segments integer) returns void language plpgsql security definer set search_path to '' as $$
      begin insert into public.usage_events (business_id, spec_id, unit, qty, provider) values (p_business, p_spec, 'sms', greatest(1, coalesce(p_segments, 1)), 'twilio'); end $$;
    insert into businesses values ('${BIZ}', 'TEST Fork', 'live', 'America/Boise', 'ID');
  `);
  await db.exec(gate);
  await db.exec(migration);
  return db;
}
const one = async (db, q, p = []) => (await db.query(q, p)).rows[0];
const hashOf = async (db, kind, who) => (await one(db, "select portal_contact_hash($1,$2,$3) as h", [BIZ, kind, who])).h;
const events = async (db, kind) => (await db.query("select * from compliance_events where kind = $1 order by id", [kind])).rows;
const grantText = (db, phone = "+12085551234") => db.query(
  "insert into consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, spec_id) values ($1, portal_contact_hash($1,'phone',$2), '1234', 'phone', 'sms', 'transactional', 'granted', 'inbound_message', $3)", [BIZ, phone, SPEC]);

test("the migration applies on top of today's tables, and the old 3-argument texting call still works", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("select portal_sms_out($1,$2,3)", [BIZ, SPEC]);
  assert.equal((await one(db, "select count(*)::int as n from usage_events")).n, 1);
  assert.equal((await events(db, "outbound_sent")).length, 0, "no recipient given, so nothing to record");
});

test("a text that is sent is counted and recorded, citing the consent row, and the number is never stored", { skip: !PGlite }, async () => {
  const db = await fresh(); await grantText(db);
  const ledgerId = (await one(db, "select id from consent_ledger")).id;
  await db.query("select portal_sms_out($1,$2,2,'+1 (208) 555-1234',true,true)", [BIZ, SPEC]);
  const [ev] = await events(db, "outbound_sent");
  assert.equal(ev.channel, "sms");
  assert.equal(ev.contact_hash, await hashOf(db, "phone", "2085551234"), "the same number written another way is the same person");
  assert.deepEqual(ev.detail, { ledger_id: Number(ledgerId), ledger_status: "granted", ledger_method: "inbound_message", ai_disclosed: true, opt_out_offered: true });
  assert.ok(!JSON.stringify(ev).includes("5551234"), "no part of the number is stored");
  assert.equal((await one(db, "select qty from usage_events")).qty, 2);
});

test("a send to someone with no consent row still records, with no ledger id, so the gap is visible", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("select portal_sms_out($1,$2,1,'+12085550000',false,false)", [BIZ, SPEC]);
  const [ev] = await events(db, "outbound_sent");
  assert.equal(ev.detail.ledger_id, null);
});

test("the record cites the newest consent row, so a later revoke is what is cited", { skip: !PGlite }, async () => {
  const db = await fresh(); await grantText(db);
  await db.query("insert into consent_ledger (business_id, contact_hash, contact_kind, channel, purpose, status, method) values ($1, portal_contact_hash($1,'phone','+12085551234'), 'phone', 'any', 'any', 'revoked', 'keyword_stop')", [BIZ]);
  const rev = (await one(db, "select max(id) as id from consent_ledger")).id;
  await db.query("select portal_outbound_sent($1,$2,'+12085551234','phone','sms',false,false)", [BIZ, SPEC]);
  const [ev] = await events(db, "outbound_sent");
  assert.equal(ev.detail.ledger_id, Number(rev)); assert.equal(ev.detail.ledger_status, "revoked");
});

test("bad input records nothing", { skip: !PGlite }, async () => {
  const db = await fresh();
  for (const args of [["", "phone", "sms"], ["x", "fax", "sms"], ["x", "phone", "pigeon"]]) {
    const r = await one(db, "select portal_outbound_sent($1,$2,$3,$4,$5,false,false) as r", [BIZ, SPEC, ...args]);
    assert.equal(r.r.recorded, false);
  }
  assert.equal((await events(db, "outbound_sent")).length, 0);
});

test("email: an address typed in a chat is recorded as consent once, and the send is allowed", { skip: !PGlite }, async () => {
  const db = await fresh();
  const r1 = await one(db, "select portal_email_gate($1,$2,'Sam@Customer.example',true) as r", [BIZ, SPEC]);
  assert.equal(r1.r.allowed, true);
  const rows = (await db.query("select * from consent_ledger")).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].channel, rows[0].status, rows[0].method, rows[0].contact_kind], ["email", "granted", "web_form", "email"]);
  await one(db, "select portal_email_gate($1,$2,'sam@customer.example',true) as r", [BIZ, SPEC]);
  assert.equal((await db.query("select * from consent_ledger")).rows.length, 1, "not recorded twice");
});

test("email: an address that was never given in a chat is still a reply, but no consent is invented for it", { skip: !PGlite }, async () => {
  const db = await fresh();
  const r = await one(db, "select portal_email_gate($1,$2,'sam@customer.example',false) as r", [BIZ, SPEC]);
  assert.equal(r.r.allowed, true);
  assert.equal((await db.query("select * from consent_ledger")).rows.length, 0);
});

test("email: STOP revokes email for that address, the gate then refuses, and the opt-out is logged", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("select portal_email_in($1,$2,'sam@customer.example','message')", [BIZ, SPEC]);
  const stop = await one(db, "select portal_email_in($1,$2,'SAM@customer.example','stop') as r", [BIZ, SPEC]);
  assert.deepEqual(stop.r, { allowed: false, reason: "opted_out" });
  const g = await one(db, "select portal_email_gate($1,$2,'sam@customer.example',true) as r", [BIZ, SPEC]);
  assert.deepEqual(g.r, { allowed: false, reason: "opted_out" });
  assert.equal((await events(db, "opt_out")).length, 1);
  const after = await one(db, "select portal_email_in($1,$2,'sam@customer.example','message') as r", [BIZ, SPEC]);
  assert.equal(after.r.allowed, false, "writing again does not undo a STOP");
});

test("email: a STOP does not touch anyone else, nor a phone number that happens to match", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("select portal_email_in($1,$2,'sam@customer.example','stop')", [BIZ, SPEC]);
  assert.equal((await one(db, "select portal_email_gate($1,$2,'pat@customer.example',true) as r", [BIZ, SPEC])).r.allowed, true);
});

test("email: a first email records that they wrote first, once", { skip: !PGlite }, async () => {
  const db = await fresh();
  for (let i = 0; i < 2; i++) await db.query("select portal_email_in($1,$2,'sam@customer.example','message')", [BIZ, SPEC]);
  const rows = (await db.query("select method, status from consent_ledger")).rows;
  assert.deepEqual(rows, [{ method: "inbound_message", status: "granted" }]);
});

test("email: bad addresses and kinds are refused", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await one(db, "select portal_email_gate($1,$2,'not-an-email',false) as r", [BIZ, SPEC])).r.allowed, false);
  assert.equal((await one(db, "select portal_email_in($1,$2,'a@b.example','start') as r", [BIZ, SPEC])).r.allowed, false);
});

test("a sent email is recorded citing the consent row", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("select portal_email_gate($1,$2,'sam@customer.example',true)", [BIZ, SPEC]);
  const id = (await one(db, "select id from consent_ledger")).id;
  await db.query("select portal_outbound_sent($1,$2,'sam@customer.example','email','email',true,true)", [BIZ, SPEC]);
  const [ev] = await events(db, "outbound_sent");
  assert.deepEqual(ev.detail, { ledger_id: Number(id), ledger_status: "granted", ledger_method: "web_form", ai_disclosed: true, opt_out_offered: true });
});

test("only the service role can run the new functions", { skip: !PGlite }, async () => {
  const db = await fresh();
  for (const f of ["portal_outbound_sent(uuid,uuid,text,text,text,boolean,boolean)", "portal_sms_out(uuid,uuid,integer,text,boolean,boolean)", "portal_email_gate(uuid,uuid,text,boolean)", "portal_email_in(uuid,uuid,text,text)"]) {
    const r = await one(db, "select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u, has_function_privilege('service_role', $1, 'execute') s", [f]);
    assert.deepEqual(r, { a: false, u: false, s: true }, f);
  }
});

test("the rollback in the migration's header puts the old function back", { skip: !PGlite }, async () => {
  const db = await fresh();
  const header = migration.split("\n").filter((l) => l.startsWith("--   ") ).map((l) => l.slice(5)).join("\n");
  const steps = header.split(/\n(?=drop |create |alter )/).filter((x) => /^(drop|create|alter)/.test(x)).map((x) => x.replace(/\(then re-run[\s\S]*$/, "").trim());
  for (const s of steps) await db.exec(s);
  assert.equal((await db.query("select 1 from pg_proc where proname in ('portal_email_in','portal_email_gate','portal_outbound_sent')")).rows.length, 0);
  await db.query("select portal_sms_out($1,$2,3)", [BIZ, SPEC]);
  await assert.rejects(() => db.query("insert into compliance_events (kind) values ('outbound_sent')"));
});
