-- The live tables and helpers the operator migration touches, cut down to the columns it uses (shapes read from the live
-- project on 2026-11-22). The two live functions it re-creates are in portal_golive_gate.sql and portal_compile_manifest.sql.
create role anon; create role authenticated; create role service_role;
create table businesses (id uuid primary key, name text, status text, timezone text, state text, price_accepted_at timestamptz, health_lane boolean not null default false, updated_at timestamptz);
create table build_orders (id uuid primary key, business_id uuid, "order" jsonb);
create table skill_specs (id uuid primary key, business text, skill_id text, version int default 1, status text default 'sandbox', spec jsonb, brain jsonb, quote jsonb, order_id uuid);
create table connection_catalog (slot text primary key, label text, kind text, blocks text[], choices jsonb, scopes jsonb, access jsonb, blocks_golive boolean default false, lead_time text, phi_exposure boolean default false, sort int default 0);
create table business_connections (business_id uuid, slot text, blocks_golive boolean, status text, agents text[]);
create table agent_manifests (spec_id uuid primary key, business_id uuid, skill_id text, manifest jsonb, compiled_at timestamptz default now());
create table business_agreements (business_id uuid, kind text, status text);
create table jurisdiction_rules (state text primary key, biometric text);
create table activity_log (id bigserial primary key, business_id uuid, spec_id uuid, agent text, job text, kind text, summary text, outcome text, actor text);
create table forge_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table primitives (id text primary key, kind text not null, label text not null, how text not null, limits text not null, runtime text not null, tier text not null, effort smallint not null,
  cost_band text not null, risk text[] not null default '{}', needs_hardware boolean not null default false, needs_baa boolean not null default false, needs_owner_oauth boolean not null default false,
  providers jsonb not null default '[]', inputs text[] not null default '{}', outputs text[] not null default '{}', test_strategy text not null, outbound boolean not null default false,
  requires text[] not null default '{}', setup text, legacy_tier smallint, version int not null default 1, updated_at timestamptz not null default now(),
  constraint primitives_kind_check check (kind = any (array['channel','trigger','connection','sense','reason','act','sink','compute','knowledge','guard'])),
  constraint primitives_runtime_check check (runtime = any (array['shared','custom','onprem'])),
  constraint primitives_tier_check check (tier = any (array['ready','needs_setup','build','hardware'])),
  constraint primitives_cost_band_check check (cost_band = any (array['none','low','mid','high'])),
  constraint primitives_effort_check check (effort >= 1 and effort <= 4));
insert into primitives (id, kind, label, how, limits, runtime, tier, effort, cost_band, test_strategy) values
  ('social_posting','act','Social posting','x','x','shared','build',3,'low','unit'), ('owner_approval','guard','Owner approval','x','x','shared','ready',1,'none','unit'),
  ('draft_for_approval','act','Draft','x','x','shared','ready',1,'none','unit'), ('consent_ledger','guard','Consent','x','x','shared','ready',1,'none','unit'),
  ('email','channel','Email','x','x','shared','ready',1,'none','unit'), ('handoff','act','Handoff','x','x','shared','ready',1,'none','unit');
create table agent_pauses (id bigint generated always as identity primary key, business_id uuid not null, spec_id uuid, job text, reason text not null, detail text,
  prior_status text, paused_at timestamptz not null default now(), paused_by text, resumed_at timestamptz, resumed_by text,
  constraint agent_pauses_reason_check check (reason = any (array['owner','staff','expired_access','password_changed','mfa','out_of_scope','supervisor','billing','disconnect','gate','founder','missing_connection','missing_agreement'])));
create function portal_flag(p_key text, p_default boolean) returns boolean language sql stable set search_path to '' as $$
  select coalesce((select case when value = 'true'::jsonb then true when value = 'false'::jsonb then false end from public.forge_settings where key = p_key), p_default) $$;
create function portal_arr(j jsonb) returns jsonb language sql immutable set search_path to '' as $$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create function portal_sync_connections(p uuid) returns void language sql as $$ select 1 $$;
create function portal_notify(p_business uuid, p_to text, p_subject text, p_title text, p_lines text[]) returns void language sql as $$ select 1 $$;
create function portal_health_missing(p_business uuid, p_spec uuid) returns table (party text) language sql as $$ select null::text where false $$;
create function portal_spec_ctx(p_spec uuid, out business_id uuid, out teammate text, out spec_status text) language sql stable as $$
  select o.business_id, s.skill_id::text, s.status::text from public.skill_specs s join public.build_orders o on o.id = s.order_id where s.id = p_spec $$;
create function portal_contact_hash(p_business uuid, p_kind text, p_contact text) returns text language sql immutable set search_path to '' as $$
  select encode(sha256(convert_to(p_business::text || ':' || p_kind || ':' || lower(btrim(coalesce(p_contact, ''))), 'UTF8')), 'hex') $$;
