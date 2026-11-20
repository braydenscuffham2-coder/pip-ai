-- RECORD OF WHAT ALREADY EXISTS. Running this on the live database changes nothing.
--
-- The agent library and the funding tracker were made on the live database before their migrations were kept in this
-- repo. This file writes down their structure, read from the live catalog (information_schema and pg_catalog) on
-- November 18, 2026, so the repo says what the code in supabase/functions/pip-forge-mcp depends on.
--
--   agent_library          skeletons of built teammates, kept for reuse (library_* tools, forge_save)
--   agent_library_reused   counts a reuse (forge_save, when a build says which skeleton it started from)
--   api_funds              one row per paid provider: balance, when to warn (shelf_funds, funds_set, pip-shelf)
--   api_fund_snaps         daily readings per provider (pip-shelf)
--
-- Every statement is written so that it does nothing where the object is already there: "if not exists", a function
-- that is only created when missing, and rights that are already as stated. It holds structure only. The rows in
-- api_funds (which providers are tracked) are data and are not here.
--
-- Two things are recorded as they are, not as they should be (see docs/forge.md):
--   - api_funds and api_fund_snaps still carry the default rights for the website's roles. Row security with no policy
--     is what keeps them closed. agent_library has those rights taken away as well, which is the safer pattern.
--   - On a new project this file needs build_orders and skill_specs to exist first; those are not in the repo yet.

-- ---------- the agent library ----------
create table if not exists public.agent_library (
  id uuid primary key default gen_random_uuid(),
  source_spec_id uuid unique references public.skill_specs(id) on delete set null,
  source_order_id uuid references public.build_orders(id) on delete set null,
  industry text not null default 'other',
  power text not null default 'other',
  lane text not null default 'spec',
  uses text[] not null default '{}'::text[],
  job text not null,
  skeleton jsonb not null,
  quality jsonb not null default '{}'::jsonb,
  reuse_count integer not null default 0,
  status text not null default 'ready' check (status = any (array['ready'::text, 'retired'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  templated boolean not null default false
);
create index if not exists agent_library_power_idx on public.agent_library using btree (power) where (status = 'ready'::text);
create index if not exists agent_library_uses_idx on public.agent_library using gin (uses);
alter table public.agent_library enable row level security;
revoke all on public.agent_library from anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.agent_library to service_role;

do $$ begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'agent_library_reused') then
    create function public.agent_library_reused(lib uuid) returns void
    language sql security definer set search_path to 'public' as $f$
      update agent_library set reuse_count = reuse_count + 1, updated_at = now() where id = lib;
    $f$;
  end if;
end $$;
revoke execute on function public.agent_library_reused(uuid) from public, anon, authenticated;
grant execute on function public.agent_library_reused(uuid) to service_role;

-- ---------- the funding tracker ----------
create table if not exists public.api_funds (
  provider text primary key,
  label text not null,
  pays_for text,
  secret_name text,
  reader text not null default 'none',
  topup_url text,
  topup_label text not null default 'Add funds',
  low_usd numeric not null default 5,
  low_pct numeric not null default 20,
  allowance numeric,
  allowance_unit text,
  balance_usd numeric,
  balance_at timestamptz,
  last_reading jsonb,
  last_read_at timestamptz,
  alert_at timestamptz,
  sort integer not null default 50,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.api_funds enable row level security;
grant select, insert, update, delete, truncate, references, trigger on public.api_funds to service_role;

create table if not exists public.api_fund_snaps (
  id bigserial primary key,
  provider text not null references public.api_funds(provider) on delete cascade,
  at timestamptz not null default now(),
  source text not null,
  balance_usd numeric,
  credits_left numeric,
  credits_limit numeric,
  spend_usd numeric
);
create index if not exists api_fund_snaps_provider_at on public.api_fund_snaps using btree (provider, at desc);
alter table public.api_fund_snaps enable row level security;
grant select, insert, update, delete, truncate, references, trigger on public.api_fund_snaps to service_role;
