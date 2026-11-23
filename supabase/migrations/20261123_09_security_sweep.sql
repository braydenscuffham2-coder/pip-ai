-- Security and cost sweep, November 23, 2026 (engineering-seat report, findings 1, 3, 4 and 5).
-- Apply with the Supabase migration tool after the pull request is merged. Safe to run twice.

-- 1. pip-turn now logs that it removed a card number, SSN, password, code or bank number from a customer's message.
--    The log carries the kind only, never the value.
alter table public.compliance_events drop constraint if exists compliance_events_kind_check;
alter table public.compliance_events add constraint compliance_events_kind_check check (kind = any (array[
  'ai_disclosure', 'recording_notice', 'opt_out', 'outbound_allowed', 'outbound_blocked', 'golive_blocked',
  'terms_accepted', 'price_accepted', 'pii_redacted']));

-- 3. The emailed code that turns a visitor's pass into one that can open a demo call. Only a hash of the code is kept,
--    tied to the pass id (10 characters of the email's hash). Rows older than a day are of no use and are removed.
create table if not exists public.email_codes (
  pass_id text primary key check (pass_id ~ '^[A-Za-z0-9_-]{10}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  tries int not null default 0 check (tries between 0 and 100),
  sent_at timestamptz not null default now(),
  verified_at timestamptz
);
alter table public.email_codes enable row level security;
revoke all on public.email_codes from anon, authenticated;
grant select, insert, update, delete on public.email_codes to service_role;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('email-codes-cleanup', '17 4 * * *', $c$delete from public.email_codes where sent_at < now() - interval '1 day'$c$);
  end if;
end $$;

-- 5. The public keys never needed these. Nothing in the repo inserts leads or reads scan_events with them: leads come
--    in through pip-reader and pip-forge (service key), and scan-run serves a scan's events itself.
revoke all on public.leads, public.scan_events from anon, authenticated;
drop policy if exists "public can submit leads" on public.leads;
drop policy if exists "anon can read scan events" on public.scan_events;

-- 4. One monthly ceiling over every dollar Pip spends on its own behalf: the website, the Brain, DataForSEO, the Forge
--    and the Setup Agent. Clients' own teammates (skill_turn, skill_usd) are never counted or stopped: no cap cuts a
--    client off. $300 a month keeps three months inside the $1,000 budget. Change it in pip_limits, no deploy needed.
insert into public.pip_limits (kind, label, per_day, per_month, per_visitor_hour, per_visitor_day, fn_cap, also_stop_if, pausable, note)
values ('all_usd', 'Every dollar Pip spends on its own behalf, all kinds together', null, 300, null, null, null, null, true,
        'Sum of the month''s *_usd meters except skill_usd. Once reached, every pausable limit refuses and API-key Forge builds wait. Client teammates are never stopped.')
on conflict (kind) do nothing;

create or replace function public.pip_all_over() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare cap numeric; spent numeric; m date := date_trunc('month', (now() at time zone 'utc'))::date;
begin
  select per_month into cap from public.pip_limits where kind = 'all_usd';
  if cap is null then return false; end if;
  select coalesce(sum(units), 0) into spent from public.spend_daily
   where day >= m and kind like '%\_usd' escape '\' and kind not in ('skill_usd', 'all_usd');
  return spent >= cap;
end $$;
revoke all on function public.pip_all_over() from public, anon, authenticated;
grant execute on function public.pip_all_over() to service_role;

-- pip_take as it stands on live (20261115_spend_guard.sql), with one line added: the ceiling, for pausable kinds.
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
  if l.pausable and p_kind <> 'all_usd' and public.pip_all_over() then perform public.pip_cap_hit('all_usd', 'monthly_limit'); return 'monthly_limit'; end if;
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

-- claim_build_job as it stands on live, with one line added: API-key Forge builds wait while the ceiling is reached.
create or replace function public.claim_build_job() returns setof public.build_jobs
language plpgsql set search_path = '' as $$
declare j public.build_jobs; fb interval; spent numeric; cap numeric;
begin
  if coalesce(public.forge_setting('kill_switch')::text, 'false') = 'true' then return; end if;
  if public.pip_all_over() then perform public.pip_cap_hit('all_usd', 'monthly_limit'); return; end if;
  cap := coalesce(public.forge_setting('daily_cap_usd')::text::numeric, 15);
  select units into spent from public.spend_daily where day = (now() at time zone 'utc')::date and kind = 'forge_usd';
  if coalesce(spent, 0) >= cap then return; end if;
  fb := make_interval(hours => coalesce(public.forge_setting('fallback_hours')::text::int, 6));
  select bj.* into j from public.build_jobs bj join public.build_orders o on o.id = bj.order_id
   where (bj.status = 'queued' or (bj.status = 'running' and bj.locked_at < now() - interval '15 minutes'))
     and (o.engine = 'key'
          or (o.created_at < now() - fb
              and (o.engine is null or o.board_seen_at is null or o.board_seen_at < now() - interval '45 minutes')))
   order by bj.created_at
   for update of bj skip locked
   limit 1;
  if not found then return; end if;
  update public.build_orders set engine = 'key', updated_at = now() where id = j.order_id and engine is distinct from 'key';
  update public.build_jobs set status = 'running', locked_by = 'pip-forge', locked_at = now(), updated_at = now() where id = j.id;
  j.status := 'running';
  return next j;
end $$;
