-- Pip spend guard.
--
-- Anyone can type a website into Pip without signing in, and a scan buys data (Google Places, DataForSEO, Firecrawl)
-- and model time (Anthropic). This puts every limit on that spending in one table, public.pip_limits, and makes the
-- database the judge: a cap for the day, a cap for the month, a cap per visitor, and one switch that pauses all of it.
-- Change a number in pip_limits and it applies on the next request. Nothing has to be redeployed.
--
--   pause everything a visitor can spend on:   update forge_settings set value = 'true'  where key = 'public_pause';
--   resume:                                    update forge_settings set value = 'false' where key = 'public_pause';
--   see today and this month:                  select * from pip_guard_status();
--   change a limit:                            update pip_limits set per_day = 60 where kind = 'scans';

-- 1. spend_daily takes every metered kind. (It only allowed 'dfs_usd' and 'scans', so the Forge's 'forge_usd' rows
--    were refused and its daily cap never saw any spending.)
alter table public.spend_daily drop constraint if exists spend_daily_kind_check;
alter table public.spend_daily add constraint spend_daily_kind_check check (kind ~ '^[a-z0-9_]{2,40}$');

-- 2. the limits
create table if not exists public.pip_limits (
  kind text primary key check (kind ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  per_day numeric,            -- everyone together, per UTC day (null = no cap)
  per_month numeric,          -- everyone together, per UTC month
  per_visitor_hour numeric,   -- one visitor, this clock hour
  per_visitor_day numeric,    -- one visitor, last 24 hours
  fn_cap numeric,             -- the default cap inside the site-kit function, used only to read its "leave room" ask
  also_stop_if text,          -- also refuse while this other kind is over its cap (a count that follows a dollar meter)
  pausable boolean not null default true,  -- refused while forge_settings.public_pause is true
  note text,
  updated_at timestamptz not null default now()
);
alter table public.pip_limits enable row level security;

insert into public.pip_limits (kind, label, per_day, per_month, per_visitor_hour, per_visitor_day, fn_cap, also_stop_if, pausable, note) values
  ('scans',       'New business scans (site-kit, Pip in the Claude app)', 40, 300, null, null, 40, null, true,  'One per new website a day; opening the same website again within 24 hours is free.'),
  ('dfs_usd',     'DataForSEO dollars (reviews, Maps rank, search demand)', 3, 30, null, null, 3, null, true, 'Dollars, not calls.'),
  ('brain_scans', 'Brain scans started (scan-run)', 15, 150, null, 6, null, 'brain_usd', true, 'Per visitor is counted on the IP address saved with the scan.'),
  ('brain_usd',   'Brain dollars on the Anthropic key', 10, 60, null, null, null, null, true, 'Metered from brain_usage events. New Brain scans stop once it is reached; scans already running finish.'),
  ('web_scan',    'New scans on the website (/api/scan)', 25, 200, 3, 8, null, null, true, 'A saved scan replays free and is not counted.'),
  ('web_gather',  'Facts-only reads (/api/gather): site crawl plus Google Places', 60, 400, 30, 60, null, null, true, 'site-kit calls this once for each new scan, so it also bounds what a scan spends at Google.'),
  ('web_places',  'Google lookups from the website (Maps rank checks, /api/locate)', 150, 1500, 16, 40, null, null, true, 'Counted in Google searches.'),
  ('web_reviews', 'Review-history orders from the website (DataForSEO)', 10, 100, 3, 6, null, null, true, null),
  ('web_llm',     'Model replies on the website (Ask Pip, the demo front desk)', 600, 6000, 40, 120, null, 'web_llm_usd', true, 'Over the limit, Pip answers from its built-in replies instead of the model.'),
  ('web_llm_usd', 'Website model dollars on the Anthropic key', 2, 15, null, null, null, null, true, 'Metered from llm events.'),
  ('skill_turn',  'Live teammate chat turns (client chat widgets)', 3000, null, 60, 240, null, null, false, 'Clients'' own customers. Not stopped by the pause switch.'),
  ('skill_usd',   'Live teammate dollars on the Anthropic key', null, null, null, null, null, null, false, 'Metered only.'),
  ('web_voice',   'Call-demo tokens (ElevenLabs)', 20, 60, null, 3, null, null, true, 'The voice-token function keeps its own 20 a day and 25 a month as well.'),
  ('web_lead',    'Leads and orders sent', 200, null, 6, 15, null, null, false, 'Never paused: a lead costs nothing to take.')
on conflict (kind) do nothing;

-- 3. per-visitor counters. visitor is a salted hash of the IP address, never the address itself.
create table if not exists public.pip_hits (
  kind text not null,
  visitor text not null,
  hour timestamptz not null,
  n numeric not null default 0,
  primary key (kind, visitor, hour)
);
alter table public.pip_hits enable row level security;
create index if not exists pip_hits_hour_idx on public.pip_hits (hour);

-- 4. the pause switch, next to the Forge's kill switch
insert into public.forge_settings (key, value) values ('public_pause', 'false'::jsonb) on conflict (key) do nothing;

create or replace function public.pip_paused() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value::text from public.forge_settings where key = 'public_pause'), 'false') in ('true', '"true"')
$$;

-- One events row per limit, reason and day, so a tripped cap is visible without filling the table.
create or replace function public.pip_cap_hit(p_kind text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.events (kind, domain, detail)
  select 'cap_hit', null, jsonb_build_object('limit', p_kind, 'reason', p_reason)
  where not exists (
    select 1 from public.events
     where kind = 'cap_hit' and detail->>'limit' = p_kind and detail->>'reason' = p_reason
       and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc');
exception when others then null;
end $$;

-- Is this kind at or over its cap for today or this month?
create or replace function public.pip_over(p_kind text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare l public.pip_limits; d date := (now() at time zone 'utc')::date; du numeric; mu numeric;
begin
  select * into l from public.pip_limits where kind = p_kind;
  if not found then return false; end if;
  select coalesce(sum(units) filter (where day = d), 0), coalesce(sum(units), 0) into du, mu
    from public.spend_daily where kind = p_kind and day >= date_trunc('month', d)::date;
  return (l.per_day is not null and du >= l.per_day) or (l.per_month is not null and mu >= l.per_month);
end $$;

-- Adds to a meter with no questions asked (money that has already been spent).
create or replace function public.pip_add(p_kind text, p_units numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'utc')::date;
begin
  if p_kind is null or p_units is null or p_units <= 0 then return; end if;
  insert into public.spend_daily (day, kind, units) values (d, p_kind, p_units)
  on conflict (day, kind) do update set units = public.spend_daily.units + excluded.units;
end $$;

-- Takes units from today's budget. Returns null when taken, or why not: paused, daily_limit, monthly_limit.
-- A negative amount gives units back. p_room asks that this much be left after the take.
create or replace function public.pip_take(p_kind text, p_units numeric, p_room numeric default 0) returns text
language plpgsql security definer set search_path = '' as $$
declare l public.pip_limits; d date := (now() at time zone 'utc')::date; mu numeric; took boolean; room numeric := greatest(0, coalesce(p_room, 0));
begin
  if p_kind is null or p_units is null then return 'bad_request'; end if;
  select * into l from public.pip_limits where kind = p_kind;
  if not found then return 'unknown_limit'; end if;
  insert into public.spend_daily (day, kind, units) values (d, p_kind, 0) on conflict (day, kind) do nothing;
  if p_units < 0 then
    update public.spend_daily set units = greatest(0, units + p_units) where day = d and kind = p_kind;
    return null;
  end if;
  if l.pausable and public.pip_paused() then perform public.pip_cap_hit(p_kind, 'paused'); return 'paused'; end if;
  if l.also_stop_if is not null and public.pip_over(l.also_stop_if) then perform public.pip_cap_hit(l.also_stop_if, 'daily_limit'); return 'daily_limit'; end if;
  if l.per_month is not null then
    select coalesce(sum(units), 0) into mu from public.spend_daily where kind = p_kind and day >= date_trunc('month', d)::date;
    if mu + p_units + room > l.per_month then perform public.pip_cap_hit(p_kind, 'monthly_limit'); return 'monthly_limit'; end if;
  end if;
  update public.spend_daily set units = units + p_units
   where day = d and kind = p_kind and (l.per_day is null or units + p_units + room <= l.per_day)
  returning true into took;
  if not coalesce(took, false) then perform public.pip_cap_hit(p_kind, 'daily_limit'); return 'daily_limit'; end if;
  return null;
end $$;

-- site-kit's own call, same name and shape as before. The cap it passes is its built-in default minus the room it
-- wants left; the limit itself now comes from pip_limits, so it can be raised or lowered here.
create or replace function public.spend_take(p_kind text, p_units numeric, p_cap numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.pip_limits;
begin
  if p_kind is null or p_units is null or p_cap is null or p_kind not in ('dfs_usd', 'scans') then return false; end if;
  select * into l from public.pip_limits where kind = p_kind;
  if not found then return false; end if;
  return public.pip_take(p_kind, p_units, greatest(0, coalesce(l.fn_cap, p_cap) - p_cap)) is null;
end $$;

-- The website's gate: one visitor's hourly and daily allowance first, then everyone's budget.
create or replace function public.pip_gate_inner(p_kind text, p_visitor text, p_units numeric default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.pip_limits; h timestamptz := date_trunc('hour', now()); uh numeric; ud numeric; why text;
  v text := left(coalesce(p_visitor, ''), 64); u numeric := p_units;
begin
  select * into l from public.pip_limits where kind = p_kind;
  if not found then return jsonb_build_object('ok', false, 'why', 'unknown_limit'); end if;
  if u is null or u <= 0 or u > 100 then u := 1; end if;
  if v <> '' and (l.per_visitor_hour is not null or l.per_visitor_day is not null) then
    perform pg_advisory_xact_lock(hashtextextended(p_kind || '|' || v, 0));
    select coalesce(sum(n) filter (where hour = h), 0), coalesce(sum(n), 0) into uh, ud
      from public.pip_hits where kind = p_kind and visitor = v and hour > now() - interval '24 hours';
    if l.per_visitor_hour is not null and uh + u > l.per_visitor_hour then return jsonb_build_object('ok', false, 'why', 'visitor_hour'); end if;
    if l.per_visitor_day is not null and ud + u > l.per_visitor_day then return jsonb_build_object('ok', false, 'why', 'visitor_day'); end if;
  end if;
  why := public.pip_take(p_kind, u, 0);
  if why is not null then return jsonb_build_object('ok', false, 'why', why); end if;
  if v <> '' then
    insert into public.pip_hits (kind, visitor, hour, n) values (p_kind, v, h, u)
    on conflict (kind, visitor, hour) do update set n = public.pip_hits.n + excluded.n;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- What the Next.js server calls (public key plus the server secret, like every other pip_ function).
create or replace function public.pip_gate(p_secret text, p_kind text, p_visitor text, p_units numeric default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pip_ok(p_secret) then raise exception 'denied'; end if;
  return public.pip_gate_inner(p_kind, p_visitor, p_units);
end $$;

-- 5. the Brain (scan-run). A new scan that is over a limit is saved as failed with the reason, so nothing runs
--    and the page can say why. The pause switch also stops a scan between stages.
create or replace function public.pip_scan_jobs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare why text; l public.pip_limits; mine int;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'running' then return new; end if;
    select * into l from public.pip_limits where kind = 'brain_scans';
    if found and l.per_visitor_day is not null and coalesce(new.ip, '') not in ('', 'unknown') then
      select count(*) into mine from public.scan_jobs where ip = new.ip and created_at > now() - interval '24 hours';
      if mine >= l.per_visitor_day then why := 'rate_limited'; end if;
    end if;
    if why is null then why := public.pip_take('brain_scans', 1, 0); end if;
  elsif new.status = 'running' and old.status = 'running' and public.pip_paused() then
    why := 'paused';
  end if;
  if why is not null then new.status := 'failed'; new.error := why; new.state := null; end if;
  return new;
end $$;
drop trigger if exists pip_scan_jobs_guard on public.scan_jobs;
create trigger pip_scan_jobs_guard before insert or update on public.scan_jobs
  for each row execute function public.pip_scan_jobs_guard();

-- 6. dollar meters, fed by the usage rows the code already writes
create or replace function public.pip_events_meter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'brain_usage' then
    perform public.pip_add('brain_usd', (new.detail->>'usd')::numeric);
  elsif new.kind = 'llm' then
    perform public.pip_add(case when coalesce(new.detail->>'purpose', '') like 'skill:%' then 'skill_usd' else 'web_llm_usd' end, (new.detail->>'usd')::numeric);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists pip_events_meter on public.events;
create trigger pip_events_meter after insert on public.events
  for each row when (new.kind in ('brain_usage', 'llm')) execute function public.pip_events_meter();

-- 7. today and this month against every limit
create or replace function public.pip_guard_status()
returns table (kind text, label text, today numeric, per_day numeric, this_month numeric, per_month numeric, per_visitor_hour numeric, per_visitor_day numeric, paused boolean)
language sql stable security definer set search_path = '' as $$
  select l.kind, l.label,
         coalesce((select sum(s.units) from public.spend_daily s where s.kind = l.kind and s.day = (now() at time zone 'utc')::date), 0),
         l.per_day,
         coalesce((select sum(s.units) from public.spend_daily s where s.kind = l.kind and s.day >= date_trunc('month', (now() at time zone 'utc')::date)::date), 0),
         l.per_month, l.per_visitor_hour, l.per_visitor_day,
         l.pausable and public.pip_paused()
    from public.pip_limits l order by l.kind
$$;

-- 8. who may call what. Only pip_gate is reachable with the public key, and it needs the server secret.
revoke execute on function public.pip_paused() from public, anon, authenticated;
revoke execute on function public.pip_cap_hit(text, text) from public, anon, authenticated;
revoke execute on function public.pip_over(text) from public, anon, authenticated;
revoke execute on function public.pip_add(text, numeric) from public, anon, authenticated;
revoke execute on function public.pip_take(text, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.pip_gate_inner(text, text, numeric) from public, anon, authenticated;
revoke execute on function public.pip_scan_jobs_guard() from public, anon, authenticated;
revoke execute on function public.pip_events_meter() from public, anon, authenticated;
revoke execute on function public.pip_guard_status() from public, anon, authenticated;
revoke execute on function public.spend_take(text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.pip_take(text, numeric, numeric), public.pip_add(text, numeric), public.pip_over(text),
  public.pip_gate_inner(text, text, numeric), public.pip_guard_status(), public.spend_take(text, numeric, numeric) to service_role;
grant execute on function public.pip_gate(text, text, text, numeric) to anon, authenticated, service_role;

-- 9. visitor counters older than two days are no use
select cron.unschedule(jobid) from cron.job where jobname = 'pip-hits-clean';
select cron.schedule('pip-hits-clean', '17 9 * * *', $$delete from public.pip_hits where hour < now() - interval '2 days'$$);
