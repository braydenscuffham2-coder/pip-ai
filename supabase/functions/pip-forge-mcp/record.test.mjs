// supabase/migrations/20261118_05_record_library_and_funds.sql says it is a record of what already exists on the live
// database. This runs it on an empty Postgres (PGlite) and compares what it makes with what the live catalog showed on
// November 18, 2026, so the record cannot drift into a guess. No network, no keys.
//   npm i --no-save @electric-sql/pglite && node --test supabase/functions/pip-forge-mcp/record.test.mjs
// Skips itself when PGlite is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let PGlite;
try { ({ PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite")); } catch { /* not installed */ }
const MIGRATION = readFileSync(new URL("../../migrations/20261118_05_record_library_and_funds.sql", import.meta.url), "utf8");
// Only what the record leans on: the three roles every Supabase project has, and the two tables it points at.
const STUBS = `
create role anon; create role authenticated; create role service_role;
create table public.build_orders (id uuid primary key default gen_random_uuid());
create table public.skill_specs (id uuid primary key default gen_random_uuid());
`;

// Read from the live catalog. Columns in order: name, type, "not null", default.
const LIVE = {
  columns: {
    agent_library: "id uuid not null default gen_random_uuid(); source_spec_id uuid; source_order_id uuid; industry text not null default 'other'::text; power text not null default 'other'::text; lane text not null default 'spec'::text; uses ARRAY not null default '{}'::text[]; job text not null; skeleton jsonb not null; quality jsonb not null default '{}'::jsonb; reuse_count integer not null default 0; status text not null default 'ready'::text; created_at timestamp with time zone not null default now(); updated_at timestamp with time zone not null default now(); templated boolean not null default false",
    api_fund_snaps: "id bigint not null default nextval('api_fund_snaps_id_seq'::regclass); provider text not null; at timestamp with time zone not null default now(); source text not null; balance_usd numeric; credits_left numeric; credits_limit numeric; spend_usd numeric",
    api_funds: "provider text not null; label text not null; pays_for text; secret_name text; reader text not null default 'none'::text; topup_url text; topup_label text not null default 'Add funds'::text; low_usd numeric not null default 5; low_pct numeric not null default 20; allowance numeric; allowance_unit text; balance_usd numeric; balance_at timestamp with time zone; last_reading jsonb; last_read_at timestamp with time zone; alert_at timestamp with time zone; sort integer not null default 50; active boolean not null default true; updated_at timestamp with time zone not null default now()",
  },
  constraints: {
    agent_library_pkey: "PRIMARY KEY (id)",
    agent_library_source_order_id_fkey: "FOREIGN KEY (source_order_id) REFERENCES build_orders(id) ON DELETE SET NULL",
    agent_library_source_spec_id_fkey: "FOREIGN KEY (source_spec_id) REFERENCES skill_specs(id) ON DELETE SET NULL",
    agent_library_source_spec_id_key: "UNIQUE (source_spec_id)",
    agent_library_status_check: "CHECK ((status = ANY (ARRAY['ready'::text, 'retired'::text])))",
    api_fund_snaps_pkey: "PRIMARY KEY (id)",
    api_fund_snaps_provider_fkey: "FOREIGN KEY (provider) REFERENCES api_funds(provider) ON DELETE CASCADE",
    api_funds_pkey: "PRIMARY KEY (provider)",
  },
  indexes: {
    agent_library_pkey: "CREATE UNIQUE INDEX agent_library_pkey ON public.agent_library USING btree (id)",
    agent_library_power_idx: "CREATE INDEX agent_library_power_idx ON public.agent_library USING btree (power) WHERE (status = 'ready'::text)",
    agent_library_source_spec_id_key: "CREATE UNIQUE INDEX agent_library_source_spec_id_key ON public.agent_library USING btree (source_spec_id)",
    agent_library_uses_idx: "CREATE INDEX agent_library_uses_idx ON public.agent_library USING gin (uses)",
    api_fund_snaps_pkey: "CREATE UNIQUE INDEX api_fund_snaps_pkey ON public.api_fund_snaps USING btree (id)",
    api_fund_snaps_provider_at: "CREATE INDEX api_fund_snaps_provider_at ON public.api_fund_snaps USING btree (provider, at DESC)",
    api_funds_pkey: "CREATE UNIQUE INDEX api_funds_pkey ON public.api_funds USING btree (provider)",
  },
  // Row security is on for all three, with no policy: only the service role gets through.
  rls: { agent_library: true, api_fund_snaps: true, api_funds: true },
  policies: 0,
  service_role: "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
  // agent_library has the website roles' rights taken away. (api_funds and api_fund_snaps still carry the project's
  // default rights for them on live; those defaults come from the project, not from this file.)
  agent_library_grantees: ["postgres", "service_role"],
  fn: { args: "lib uuid", returns: "void", security_definer: true, lang: "sql", config: ["search_path=public"], body: "update agent_library set reuse_count = reuse_count + 1, updated_at = now() where id = lib;", acl: ["postgres:EXECUTE", "service_role:EXECUTE"] },
};
const T = "('agent_library','api_funds','api_fund_snaps')";

async function catalog(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  const pairs = (rows) => Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const fn = (await q(`select pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as returns, p.prosecdef as security_definer, l.lanname as lang, p.proconfig as config, btrim(p.prosrc, E' \\n\\t') as body,
      (select array_agg(r.rolname || ':' || a.privilege_type order by r.rolname) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a join pg_roles r on r.oid = a.grantee) as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang where n.nspname = 'public' and p.proname = 'agent_library_reused'`))[0];
  return {
    columns: pairs(await q(`select table_name as k, string_agg(column_name || ' ' || data_type || case when is_nullable = 'NO' then ' not null' else '' end || coalesce(' default ' || left(column_default, 60), ''), '; ' order by ordinal_position) as v from information_schema.columns where table_schema = 'public' and table_name in ${T} group by table_name`)),
    constraints: pairs(await q(`select con.conname as k, pg_get_constraintdef(con.oid) as v from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ${T} and con.contype <> 'n'`)), // newer Postgres also lists NOT NULL here; the columns above already cover it
    indexes: pairs(await q(`select indexname as k, indexdef as v from pg_indexes where schemaname = 'public' and tablename in ${T}`)),
    rls: pairs(await q(`select c.relname as k, c.relrowsecurity as v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ${T}`)),
    policies: (await q(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename in ${T}`))[0].n,
    grants: await q(`select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema = 'public' and table_name in ${T} group by table_name, grantee order by 1, 2`),
    fn,
  };
}

test("the record of the library and funding tables matches the live catalog, and running it again changes nothing", { skip: !PGlite && "PGlite is not installed" }, async () => {
  const db = new PGlite();
  await db.exec(STUBS);
  await db.exec(MIGRATION);
  const made = await catalog(db);
  assert.deepEqual(made.columns, LIVE.columns);
  assert.deepEqual(made.constraints, LIVE.constraints);
  assert.deepEqual(made.indexes, LIVE.indexes);
  assert.deepEqual(made.rls, LIVE.rls);
  assert.equal(made.policies, LIVE.policies);
  for (const t of ["agent_library", "api_funds", "api_fund_snaps"]) assert.equal(made.grants.find((g) => g.table_name === t && g.grantee === "service_role")?.privs, LIVE.service_role, t);
  assert.deepEqual(made.grants.filter((g) => g.table_name === "agent_library").map((g) => g.grantee), LIVE.agent_library_grantees);
  assert.deepEqual(made.fn, LIVE.fn);

  // A second run, as on the live database where everything is already there: no error and nothing different.
  await db.exec("insert into public.api_funds (provider, label) values ('twilio', 'Twilio'); insert into public.agent_library (job, skeleton) values ('Front desk', '{}');");
  await db.exec(MIGRATION);
  assert.deepEqual(await catalog(db), made);
  assert.equal((await db.query("select count(*)::int as n from public.api_funds")).rows[0].n, 1, "rows are left alone");

  // And where the function is already there with a different body, the record does not overwrite it.
  await db.exec("create or replace function public.agent_library_reused(lib uuid) returns void language sql security definer set search_path to 'public' as $f$ select 1; $f$;");
  await db.exec(MIGRATION);
  assert.equal((await db.query("select btrim(prosrc, E' \\n\\t') as b from pg_proc where proname = 'agent_library_reused'")).rows[0].b, "select 1;");
});

test("the record never drops, deletes or rewrites", () => {
  const sql = MIGRATION.replace(/--.*$/gm, "");
  for (const word of [/\bdrop\b/i, /\bdelete\s+from\b/i, /\btruncate\s+(table|public)/i, /\bcreate or replace\b/i, /\balter table [a-z_.]+ (add|drop|alter|rename)/i, /\binsert\s+into\b/i, /\bcreate policy\b/i])
    assert.doesNotMatch(sql, word);
  assert.equal((sql.match(/create table (?!if not exists)/gi) ?? []).length, 0, "every table is created only if it is not there");
  assert.equal((sql.match(/create (unique )?index (?!if not exists)/gi) ?? []).length, 0);
});
