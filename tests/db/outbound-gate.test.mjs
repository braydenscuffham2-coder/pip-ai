// The one outbound gate in the database: one switch stops every channel, texting first is off until switched on and
// then needs consent on file, a reply needs none, STOP wins over everything. Run on the real gate (a copy of the live
// portal_outbound_check) plus the real migrations.
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
  await db.exec("create table forge_settings (key text primary key, value jsonb); insert into jurisdiction_rules values ('US', '{\"mon_sat\":[\"00:00\",\"24:00\"],\"sun\":[\"00:00\",\"24:00\"]}', 3), ('ID', '{\"mon_sat\":[\"00:00\",\"24:00\"],\"sun\":[\"00:00\",\"24:00\"]}', 3);");
  await db.exec(read("../../supabase/migrations/20261127_13_outbound_gate.sql"));
  return db;
}
const one = async (db, q, p = []) => (await db.query(q, p)).rows[0];
const ask = async (db, channel, to, first = false, chat = false) => (await one(db, "select outbound_gate($1,$2,$3,$4,$5,$6) g", [BIZ, SPEC, channel, to, first, chat])).g;
const consent = (db, kind, channel, who, status = "granted", method = "web_form") => db.query(
  "insert into consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, spec_id) values ($1, portal_contact_hash($1,$2,$3), '0100', $2, $4, 'transactional', $5, $6, $7)", [BIZ, kind, who, channel, status, method, SPEC]);
const PHONE = "+12085550100";

test("texting first is off until switched on; then it needs consent on file; STOP ends it", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.deepEqual(await ask(db, "sms", PHONE, true), { allowed: false, reason: "texting_first_off" });
  await consent(db, "phone", "sms", PHONE);
  assert.equal((await ask(db, "sms", PHONE, true)).reason, "texting_first_off", "consent alone does not switch it on");
  await db.query("update forge_settings set value = 'true' where key = 'sms_first_on'");
  assert.equal((await ask(db, "sms", "(208) 555-0100", true)).allowed, true, "the same number written another way is the same person");
  assert.equal((await ask(db, "sms", "+12085550199", true)).reason, "no_consent_on_file", "a number with no consent on file is refused");
  await consent(db, "phone", "sms", PHONE, "revoked", "keyword_stop");
  assert.equal((await ask(db, "sms", PHONE, true)).reason, "opted_out");
  assert.equal((await ask(db, "sms", PHONE, false)).reason, "opted_out", "not even a reply after STOP");
});

test("a reply to someone who texted needs no consent on file, and a bad number is refused", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await ask(db, "sms", "+12085550123", false)).allowed, true);
  for (const bad of ["555", "call me", "", null]) assert.equal((await ask(db, "sms", bad, false)).reason, "bad_request");
});

test("email goes through the email gate unchanged", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await ask(db, "email", "dana@example.test", false, true)).allowed, true, "an address typed in the chat is consent the first time");
  await consent(db, "email", "email", "sam@example.test", "revoked", "keyword_stop");
  assert.equal((await ask(db, "email", "sam@example.test")).reason, "opted_out");
  assert.equal((await ask(db, "email", "not an address")).reason, "bad_request");
});

test("one switch stops every channel; a business that left cannot post; unknown channels are refused", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await ask(db, "post", null)).allowed, true);
  assert.equal((await ask(db, "fax", "x")).reason, "bad_request");
  await db.query("update forge_settings set value = 'true' where key = 'outbound_paused'");
  for (const [ch, to] of [["email", "dana@example.test"], ["sms", PHONE], ["post", null]]) assert.deepEqual(await ask(db, ch, to), { allowed: false, reason: "paused" }, ch);
  await db.exec("update forge_settings set value = 'false' where key = 'outbound_paused'; update businesses set status = 'cancelled'");
  assert.equal((await ask(db, "post", null)).reason, "business_disconnected");
  assert.equal((await ask(db, "sms", PHONE)).reason, "business_disconnected");
  for (const role of ["anon", "authenticated"]) assert.equal((await one(db, "select has_function_privilege($1, 'public.outbound_gate(uuid, uuid, text, text, boolean, boolean)', 'execute') p", [role])).p, false);
});
