-- Pip's edges: the doors a business's own world can knock on to start a teammate's job, and the one door Pip can
-- knock on in theirs (Part D, Nov 27, 2026).
--
--   webhook  another system posts to a Pip address with a secret. The secret is shown once; only its hash is kept.
--   email    mail sent to a per-business Pip address.
--   form     a form on Pip's domain that the business's customers fill in.
--   out      an address in the owner's own system that a teammate may post to (set by the owner, never by a model).
--   zapier   one connection for an app like Zapier: it posts in like a webhook, and reads what teammates left for it
--            (a feed) with the same secret. Nothing is pushed to it.
--
-- A knock never carries instructions. What arrives is stored as data, capped, and handed to the job as information.
-- Only teammates that may act for real (live, or on a TEST business) are ever started: that rule lives in pip-jobs.
-- Needs the businesses table and the pgcrypto extension (already on). Apply with the Supabase migration tool after
-- the pull request is merged.

create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('webhook', 'email', 'form', 'out', 'zapier')),
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (char_length(label) between 2 and 80),
  secret_hash text,                                   -- webhook, zapier: sha256 of the caller's secret. out: not used.
  sign_key text,                                      -- out: the key Pip signs each post with (the owner reads it once to check signatures)
  address text unique check (address ~ '^in-[a-z0-9-]{6,48}$'), -- email: the part before @hirepip.com
  form jsonb check (form is null or (jsonb_typeof(form) = 'object' and octet_length(form::text) <= 6000)),
  url text check (url is null or (url ~ '^https://[a-z0-9.-]+(:[0-9]{2,5})?(/[^[:space:]]*)?$' and char_length(url) <= 400)), -- out only
  enabled boolean not null default true,
  per_hour int not null default 60 check (per_hour between 1 and 600),
  per_day int not null default 500 check (per_day between 1 and 5000),
  created_by text,
  created_at timestamptz not null default now(),
  last_at timestamptz,
  unique (business_id, kind, name),
  check ((kind in ('webhook', 'zapier')) = (secret_hash is not null)),
  check ((kind = 'email') = (address is not null)),
  check ((kind = 'form') = (form is not null)),
  check ((kind = 'out') = (url is not null and sign_key is not null))
);
create index if not exists edges_business_idx on public.edges (business_id);
alter table public.edges enable row level security;
revoke all on public.edges from anon, authenticated;
grant select, insert, update, delete on public.edges to service_role;

-- Every knock, kept 30 days. `data` is what arrived after cleaning (see _shared/edges.ts): never a secret-named field.
create table if not exists public.edge_events (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references public.edges(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  direction text not null default 'in' check (direction in ('in', 'out')),
  key text not null check (char_length(key) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 9000),
  status text not null default 'received' check (status in ('received', 'started', 'no_job', 'failed', 'sent', 'refused')),
  started int not null default 0,
  note text,
  received_at timestamptz not null default now(),
  unique (edge_id, direction, key)
);
create index if not exists edge_events_recent_idx on public.edge_events (edge_id, received_at desc);
create index if not exists edge_events_business_idx on public.edge_events (business_id, received_at desc);
alter table public.edge_events enable row level security;
revoke all on public.edge_events from anon, authenticated;
grant select, insert, update, delete on public.edge_events to service_role;

insert into public.forge_settings (key, value) values ('edges_paused', 'false'::jsonb) on conflict (key) do nothing;

-- The integration ladder's decisions: which rung Pip reaches each tool by, for each business, and why
-- (_shared/ladder.ts). Written when the Forge decides; read by the founder and shown to the owner in plain words.
create table if not exists public.tool_routes (
  business_id uuid not null references public.businesses(id) on delete cascade,
  tool_key text not null check (tool_key ~ '^[a-z0-9_-]{2,60}$'),
  tool text not null check (char_length(tool) between 2 and 80),
  rung text check (rung in ('api', 'partner', 'zapier', 'edges', 'screen', 'onsite', 'build')), -- null: nothing reaches it today
  why text not null check (char_length(why) <= 600),
  decision jsonb not null check (octet_length(decision::text) <= 8000),
  facts jsonb not null default '{}'::jsonb check (octet_length(facts::text) <= 4000),
  decided_by text,
  decided_at timestamptz not null default now(),
  primary key (business_id, tool_key)
);
alter table public.tool_routes enable row level security;
revoke all on public.tool_routes from anon, authenticated;
grant select, insert, update, delete on public.tool_routes to service_role;
-- Which rungs Pip can run today. Change a value here when a rung becomes real; nothing is redeployed.
insert into public.forge_settings (key, value) values ('ladder_ready', '{"api": true, "partner": false, "zapier": false, "edges": true, "screen": false, "onsite": false, "build": false}'::jsonb) on conflict (key) do nothing;

-- Make a door. Returns its id, and once only: the webhook secret, the email address, or the signing key of an out door.
create or replace function public.edge_make(p_business uuid, p_kind text, p_name text, p_label text, p_form jsonb default null, p_url text default null, p_by text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_secret text; v_addr text; v_slug text; v_name text;
begin
  if p_kind not in ('webhook', 'email', 'form', 'out', 'zapier') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  select name into v_name from public.businesses where id = p_business;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_business'); end if;
  if (select count(*) from public.edges where business_id = p_business) >= 40 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  if exists (select 1 from public.edges where business_id = p_business and kind = p_kind and name = p_name) then return jsonb_build_object('ok', false, 'error', 'name_taken'); end if;
  if p_kind in ('webhook', 'out', 'zapier') then v_secret := encode(extensions.gen_random_bytes(24), 'hex'); end if;
  if p_kind = 'email' then
    v_slug := trim(both '-' from left(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), 24));
    v_addr := 'in-' || case when v_slug = '' then 'pip' else v_slug end || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  end if;
  insert into public.edges (business_id, kind, name, label, secret_hash, sign_key, address, form, url, created_by)
  values (p_business, p_kind, p_name, p_label,
    case when p_kind in ('webhook', 'zapier') then encode(extensions.digest(v_secret, 'sha256'), 'hex') end,
    case when p_kind = 'out' then v_secret end, v_addr,
    case when p_kind = 'form' then p_form end, case when p_kind = 'out' then p_url end, left(p_by, 120))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id) || case when v_secret is not null then jsonb_build_object('secret', v_secret) else '{}'::jsonb end
    || case when v_addr is not null then jsonb_build_object('address', v_addr || '@hirepip.com') else '{}'::jsonb end;
exception when check_violation then return jsonb_build_object('ok', false, 'error', 'bad_value');
end $$;

-- A new webhook secret; the old one stops working at once.
create or replace function public.edge_rotate(p_edge uuid) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_secret text := encode(extensions.gen_random_bytes(24), 'hex'); n int;
begin
  update public.edges set secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex') where id = p_edge and kind in ('webhook', 'zapier');
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'secret', v_secret);
end $$;

-- One knock. Everything is decided here, in one step: is the door open, is the secret right, is it under its limits,
-- have we seen this key before. Pass the edge id (webhook, form) or the address (email).
create or replace function public.edge_take(p_edge uuid, p_address text, p_kind text, p_secret text, p_key text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare e public.edges; v_status text; v_event uuid; h int; d int;
begin
  if coalesce((select value from public.forge_settings where key = 'edges_paused'), 'false'::jsonb) = 'true'::jsonb then return jsonb_build_object('ok', false, 'error', 'paused'); end if;
  if p_edge is not null then select * into e from public.edges where id = p_edge and (kind = p_kind or (p_kind = 'webhook' and kind = 'zapier')) for update;
  else select * into e from public.edges where address = lower(split_part(coalesce(p_address, ''), '@', 1)) and kind = 'email' and p_kind = 'email' for update; end if;
  if e.id is null or not e.enabled then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if e.kind in ('webhook', 'zapier') and (p_secret is null or e.secret_hash <> encode(extensions.digest(p_secret, 'sha256'), 'hex')) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select status into v_status from public.businesses where id = e.business_id;
  if v_status is null or v_status in ('disconnected', 'cancelled', 'deleted') then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_key is null or char_length(p_key) not between 1 and 120 or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 9000 then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select count(*) filter (where received_at > now() - interval '1 hour'), count(*) into h, d from public.edge_events where edge_id = e.id and direction = 'in' and received_at > now() - interval '1 day';
  if h >= e.per_hour or d >= e.per_day then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into public.edge_events (edge_id, business_id, key, data) values (e.id, e.business_id, p_key, p_data) on conflict (edge_id, direction, key) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  update public.edges set last_at = now() where id = e.id;
  return jsonb_build_object('ok', true, 'event', v_event, 'business', e.business_id, 'name', e.name, 'kind', case when e.kind = 'zapier' then 'webhook' else e.kind end);
end $$;

-- What became of a knock.
create or replace function public.edge_done(p_event uuid, p_started int, p_status text, p_note text default null) returns void
language sql security definer set search_path to '' as $$
  update public.edge_events set started = greatest(0, coalesce(p_started, 0)), status = p_status, note = left(p_note, 200) where id = p_event;
$$;

-- An out door a teammate may post to. Counts the post against the door's limits and records it; the caller then sends.
create or replace function public.edge_out_take(p_business uuid, p_name text, p_key text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare e public.edges; v_event uuid; h int; d int;
begin
  if coalesce((select value from public.forge_settings where key = 'edges_paused'), 'false'::jsonb) = 'true'::jsonb then return jsonb_build_object('ok', false, 'error', 'paused'); end if;
  select * into e from public.edges where business_id = p_business and kind in ('out', 'zapier') and name = p_name for update;
  if e.id is null or not e.enabled then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_key is null or char_length(p_key) not between 1 and 120 or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 9000 then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select count(*) filter (where received_at > now() - interval '1 hour'), count(*) into h, d from public.edge_events where edge_id = e.id and direction = 'out' and received_at > now() - interval '1 day';
  if h >= e.per_hour or d >= e.per_day then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into public.edge_events (edge_id, business_id, direction, key, data) values (e.id, e.business_id, 'out', p_key, p_data) on conflict (edge_id, direction, key) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  update public.edges set last_at = now() where id = e.id;
  if e.kind = 'zapier' then
    update public.edge_events set status = 'sent', note = 'left in the feed' where id = v_event;
    return jsonb_build_object('ok', true, 'event', v_event, 'feed', true);
  end if;
  return jsonb_build_object('ok', true, 'event', v_event, 'url', e.url, 'sign_key', e.sign_key);
end $$;

-- Who a secret belongs to (a connection test), and what teammates left in a zapier door's feed, newest first.
create or replace function public.edge_who(p_edge uuid, p_secret text) returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('ok', true, 'business', b.name, 'door', e.label, 'kind', e.kind)
  from public.edges e join public.businesses b on b.id = e.business_id
  where e.id = p_edge and e.enabled and e.kind in ('webhook', 'zapier') and p_secret is not null
    and e.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex') and b.status not in ('disconnected', 'cancelled', 'deleted');
$$;
create or replace function public.edge_feed(p_edge uuid, p_secret text, p_limit int default 50) returns jsonb language plpgsql security definer set search_path to '' as $$
declare e public.edges;
begin
  if coalesce((select value from public.forge_settings where key = 'edges_paused'), 'false'::jsonb) = 'true'::jsonb then return jsonb_build_object('ok', false, 'error', 'paused'); end if;
  select * into e from public.edges where id = p_edge and kind = 'zapier' and enabled;
  if e.id is null or p_secret is null or e.secret_hash <> encode(extensions.digest(p_secret, 'sha256'), 'hex') then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', v.id, 'sent_at', v.received_at, 'data', v.data) order by v.received_at desc)
    from (select id, received_at, data from public.edge_events where edge_id = e.id and direction = 'out' order by received_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) v), '[]'::jsonb));
end $$;

-- The public face of a form: its title, intro and fields, and the business's name. Nothing else about the business.
create or replace function public.edge_form(p_edge uuid) returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', e.id, 'business', b.name, 'label', e.label, 'form', e.form)
  from public.edges e join public.businesses b on b.id = e.business_id
  where e.id = p_edge and e.kind = 'form' and e.enabled and b.status not in ('disconnected', 'cancelled', 'deleted')
    and coalesce((select value from public.forge_settings where key = 'edges_paused'), 'false'::jsonb) <> 'true'::jsonb;
$$;

revoke all on function public.edge_make(uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.edge_rotate(uuid) from public, anon, authenticated;
revoke all on function public.edge_take(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.edge_done(uuid, int, text, text) from public, anon, authenticated;
revoke all on function public.edge_out_take(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.edge_form(uuid) from public, anon, authenticated;
revoke all on function public.edge_who(uuid, text) from public, anon, authenticated;
revoke all on function public.edge_feed(uuid, text, int) from public, anon, authenticated;
grant execute on function public.edge_make(uuid, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.edge_rotate(uuid) to service_role;
grant execute on function public.edge_take(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.edge_done(uuid, int, text, text) to service_role;
grant execute on function public.edge_out_take(uuid, text, text, jsonb) to service_role;
grant execute on function public.edge_form(uuid) to service_role;
grant execute on function public.edge_who(uuid, text) to service_role;
grant execute on function public.edge_feed(uuid, text, int) to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pip-edge-events-cleanup', '23 9 * * *', $c$delete from public.edge_events where received_at < now() - interval '30 days'$c$);
  end if;
end $$;

-- undo (by hand): select cron.unschedule('pip-edge-events-cleanup');
-- drop function if exists public.edge_feed(uuid, text, int); drop function if exists public.edge_who(uuid, text); drop function if exists public.edge_form(uuid); drop function if exists public.edge_out_take(uuid, text, text, jsonb);
-- drop function if exists public.edge_done(uuid, int, text, text); drop function if exists public.edge_take(uuid, text, text, text, text, jsonb);
-- drop function if exists public.edge_rotate(uuid); drop function if exists public.edge_make(uuid, text, text, text, jsonb, text, text);
-- drop table if exists public.edge_events; drop table if exists public.edges; drop table if exists public.tool_routes;
-- delete from public.forge_settings where key in ('edges_paused', 'ladder_ready');
