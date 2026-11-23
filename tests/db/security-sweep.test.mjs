// supabase/migrations/20261123_09_security_sweep.sql on an in-memory Postgres. Skips itself when PGlite is not installed
// (npm i --no-save @electric-sql/pglite to run it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8");
const sql = read("20261123_09_security_sweep.sql");

// What live has that the migration touches, cut to the columns it uses.
async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.businesses (id uuid primary key);
    create table public.compliance_events (id bigserial primary key, business_id uuid, spec_id uuid, at timestamptz default now(), kind text not null, channel text, contact_hash text, detail jsonb default '{}'::jsonb,
      constraint compliance_events_kind_check check (kind = any (array['ai_disclosure','recording_notice','opt_out','outbound_allowed','outbound_blocked','golive_blocked','terms_accepted','price_accepted'])));
    create table public.leads (id uuid primary key default gen_random_uuid(), name text, email text, phone text, notified_at timestamptz);
    alter table public.leads enable row level security;
    create policy "public can submit leads" on public.leads for insert to anon with check (notified_at is null);
    create table public.scan_events (id bigserial primary key, domain text, payload jsonb);
    alter table public.scan_events enable row level security;
    create policy "anon can read scan events" on public.scan_events for select to anon, authenticated using (true);
    grant all on public.leads, public.scan_events to anon, authenticated, service_role;
    create table public.pip_limits (kind text primary key, label text not null, per_day numeric, per_month numeric, per_visitor_hour numeric, per_visitor_day numeric, fn_cap numeric, also_stop_if text, pausable boolean not null default true, note text, updated_at timestamptz not null default now());
    create table public.spend_daily (day date, kind text, units numeric not null default 0, primary key (day, kind));
    create table public.events (id bigserial primary key, kind text, domain text, detail jsonb, created_at timestamptz default now());
    create table public.forge_settings (key text primary key, value jsonb);
    create function public.forge_setting(k text) returns jsonb language sql stable set search_path = '' as $$ select value from public.forge_settings where key = k $$;
    create function public.pip_paused() returns boolean language sql stable as $$ select false $$;
    create function public.pip_over(p_kind text) returns boolean language sql stable as $$ select false $$;
    create function public.pip_cap_hit(p_kind text, p_reason text) returns void language sql as $$ insert into public.events (kind, detail) values ('cap_hit', jsonb_build_object('limit', p_kind, 'reason', p_reason)) $$;
    create table public.build_orders (id uuid primary key, engine text, created_at timestamptz default now() - interval '1 day', board_seen_at timestamptz, updated_at timestamptz);
    create table public.build_jobs (id bigserial primary key, order_id uuid, status text, locked_by text, locked_at timestamptz, created_at timestamptz default now(), updated_at timestamptz);
    insert into public.pip_limits (kind, label, per_day, per_month, pausable) values ('brain_scans', 'Brain scans', 15, 150, true), ('skill_turn', 'Client turns', 3000, null, false);
    insert into public.forge_settings values ('daily_cap_usd', '5'), ('kill_switch', 'false');
    insert into public.build_orders (id, engine) values ('33333333-3333-4333-8333-333333333333', 'key');
    insert into public.build_jobs (order_id, status) values ('33333333-3333-4333-8333-333333333333', 'queued');
  `);
  await db.exec(sql);
  return db;
}
const can = async (db, role, tbl, priv) => (await db.query("select has_table_privilege($1, $2, $3) as ok", [role, tbl, priv])).rows[0].ok;
const spend = (db, kind, usd) => db.query("insert into public.spend_daily (day, kind, units) values ((now() at time zone 'utc')::date, $1, $2) on conflict (day, kind) do update set units = excluded.units", [kind, usd]);

test("it runs twice without error", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
});

test("a redaction can be logged, by kind only; an unknown kind still cannot", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("insert into public.compliance_events (kind, detail) values ('pii_redacted', '{\"kinds\":[\"card\"]}')");
  await assert.rejects(db.query("insert into public.compliance_events (kind) values ('anything_else')"));
});

test("the public keys lose every right on leads and scan_events, and both open policies are gone", { skip: !PGlite }, async () => {
  const db = await fresh();
  for (const t of ["public.leads", "public.scan_events"]) for (const role of ["anon", "authenticated"]) for (const p of ["select", "insert", "update", "delete", "truncate"]) assert.equal(await can(db, role, t, p), false, `${role} ${p} ${t}`);
  assert.equal(await can(db, "service_role", "public.leads", "insert"), true, "the functions keep theirs");
  const left = (await db.query("select count(*)::int n from pg_policies where tablename in ('leads','scan_events')")).rows[0].n;
  assert.equal(left, 0);
});

test("email_codes keeps only a hash, and the public keys cannot touch it", { skip: !PGlite }, async () => {
  const db = await fresh();
  await assert.rejects(db.query("insert into public.email_codes (pass_id, code_hash, expires_at) values ('abcdefghij', '482913', now())"), "a raw code is not a 64-character hash");
  await db.query("insert into public.email_codes (pass_id, code_hash, expires_at) values ('abcdefghij', repeat('a', 64), now())");
  for (const p of ["select", "insert", "update", "delete"]) assert.equal(await can(db, "anon", "public.email_codes", p), false);
});

test("under the $300 monthly ceiling, pip_take works as before", { skip: !PGlite }, async () => {
  const db = await fresh();
  await spend(db, "brain_usd", 120);
  assert.equal((await db.query("select public.pip_take('brain_scans', 1) as why")).rows[0].why, null);
});

test("at the ceiling, every pausable limit refuses, and a client's teammate is never stopped", { skip: !PGlite }, async () => {
  const db = await fresh();
  await spend(db, "brain_usd", 150); await spend(db, "forge_usd", 100); await spend(db, "dfs_usd", 50);
  assert.equal((await db.query("select public.pip_take('brain_scans', 1) as why")).rows[0].why, "monthly_limit");
  assert.equal((await db.query("select public.pip_take('skill_turn', 1) as why")).rows[0].why, null, "rule 6: no cap cuts a client off");
  const hit = (await db.query("select detail from public.events where kind = 'cap_hit'")).rows[0].detail;
  assert.deepEqual(hit, { limit: "all_usd", reason: "monthly_limit" });
});

test("client teammate dollars do not count toward the ceiling", { skip: !PGlite }, async () => {
  const db = await fresh();
  await spend(db, "skill_usd", 5000);
  assert.equal((await db.query("select public.pip_all_over() as over")).rows[0].over, false);
});

test("at the ceiling, API-key Forge builds wait; under it, they are claimed as before", { skip: !PGlite }, async () => {
  const db = await fresh();
  await spend(db, "brain_usd", 300);
  assert.equal((await db.query("select * from public.claim_build_job()")).rows.length, 0);
  await spend(db, "brain_usd", 10);
  assert.equal((await db.query("select * from public.claim_build_job()")).rows.length, 1);
});
