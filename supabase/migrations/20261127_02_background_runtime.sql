-- Pip's own computers: the background runtime (Part B, Nov 26, 2026).
--
-- Work that happens for a business with nobody watching: a browser job inside the owner's software, a sign-in check,
-- a recorded skill being re-verified. It runs on Pip's servers only. Nothing here needs a customer's computer, or
-- Brayden's, to be on.
--
--   tool_identities   who Pip is, per business and per tool: the saved browser state and the vaulted login
--   work_jobs         the queue. A worker claims a job, holds it with a lease it keeps renewing, and gives it back
--   work_steps        what each job did, step by step, with the masked screenshot the model saw. Never a typed secret
--
-- A worker that dies never gives its job back, so the lease runs out and the next knock picks the job up where its
-- saved state left it. Three such deaths in a row end the job and tell a person. Every job has its own dollar cap,
-- held here in the database, and the global kill switch stops every claim.
--
-- Dark by default: a job can only be queued for a business on the TEST list until background_work_on is true.
-- Apply with the Supabase migration tool after the pull request is merged. The undo block is at the end.

-- ---------- who Pip is, per business and per tool ----------
create table if not exists public.tool_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  tool text not null check (char_length(tool) between 2 and 80),
  tool_key text not null check (tool_key ~ '^[a-z0-9_-]{2,60}$'),
  login_url text not null check (char_length(login_url) <= 300 and login_url ~ '^https://'),
  -- The tool's own site (its registrable domain). The vault fills a login on this site and nowhere else.
  site text not null check (char_length(site) between 3 and 120 and site ~ '^[a-z0-9.-]+$'),
  browser_context_id text check (browser_context_id is null or char_length(browser_context_id) <= 80),
  vault_item_id uuid references public.vault_items(id) on delete set null,
  -- True only when the owner chose to keep an authenticator secret for a separate "Pip" login in their vault.
  totp boolean not null default false,
  state text not null default 'unknown' check (state in ('unknown', 'signed_in', 'signed_out', 'needs_owner', 'retired')),
  reason text check (reason is null or char_length(reason) <= 300),
  checked_at timestamptz,
  signed_in_at timestamptz,
  silent_signins int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, tool_key)
);
alter table public.tool_identities enable row level security;
revoke all on public.tool_identities from anon, authenticated;
grant select, insert, update, delete on public.tool_identities to service_role;

-- ---------- the queue ----------
create table if not exists public.work_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  spec_id uuid references public.skill_specs(id) on delete set null,
  identity_id uuid references public.tool_identities(id) on delete set null,
  kind text not null check (kind in ('signin_check', 'screen', 'skill_verify')),
  title text not null check (char_length(title) between 3 and 160),           -- plain words, shown to the owner
  plan jsonb not null default '{}'::jsonb check (octet_length(plan::text) <= 32000),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 160),
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_owner', 'waiting_approval', 'done', 'failed', 'stopped')),
  state text not null default 'start' check (char_length(state) <= 40),        -- where the job's own steps have got to
  step int not null default 0 check (step between 0 and 500),
  max_steps int not null default 30 check (max_steps between 1 and 200),
  attempts int not null default 0,                                              -- tries that died without giving the job back
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  worker text check (worker is null or char_length(worker) <= 80),
  heartbeat_at timestamptz,
  browser_session_id text check (browser_session_id is null or char_length(browser_session_id) <= 80),
  cost_usd numeric not null default 0 check (cost_usd >= 0),
  cost_cap_usd numeric not null default 1 check (cost_cap_usd > 0 and cost_cap_usd <= 20),
  outcome text check (outcome is null or outcome in ('ok', 'nothing_to_do', 'needs_owner', 'failed', 'stopped')),
  summary text check (summary is null or char_length(summary) <= 600),          -- plain words for the owner
  reason text check (reason is null or char_length(reason) <= 300),
  alerted_at timestamptz,                                                       -- when the founder was emailed about a failure
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create unique index if not exists work_jobs_dedupe on public.work_jobs (business_id, dedupe_key) where dedupe_key is not null;
create index if not exists work_jobs_due on public.work_jobs (status, run_after);
create index if not exists work_jobs_business on public.work_jobs (business_id, created_at desc);
alter table public.work_jobs enable row level security;
revoke all on public.work_jobs from anon, authenticated;
grant select, insert, update, delete on public.work_jobs to service_role;

-- ---------- what each job did ----------
create table if not exists public.work_steps (
  job_id uuid not null references public.work_jobs(id) on delete cascade,
  seq int not null check (seq between 0 and 2000),
  at timestamptz not null default now(),
  did text not null check (char_length(did) <= 40),                             -- the kind of thing that happened
  detail jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 4000), -- labels and reasons, never typed text
  cost_usd numeric not null default 0,
  shot text check (shot is null or octet_length(shot) <= 600000),               -- the masked screenshot the model saw (base64 JPEG)
  primary key (job_id, seq)
);
alter table public.work_steps enable row level security;
revoke all on public.work_steps from anon, authenticated;
grant select, insert, update, delete on public.work_steps to service_role;

-- ---------- switches and the spend line ----------
insert into public.forge_settings (key, value) values
  ('background_work_on', 'false'::jsonb),   -- false: only TEST businesses may have background jobs
  ('work_paused', 'false'::jsonb)           -- true: no worker claims anything (the global kill_switch does the same)
on conflict (key) do nothing;
insert into public.pip_limits (kind, label, per_day, per_month, per_visitor_hour, per_visitor_day, fn_cap, also_stop_if, pausable, note)
values ('work_usd', 'Background work dollars (model calls while a teammate works in a browser)', 10, 60, null, null, null, null, true,
        'Each job also stops at its own cost_cap_usd ($1 by default).')
on conflict (kind) do nothing;

-- ---------- queue a job ----------
-- At most one job per business and key: asking again hands back the first one. Refused for a business that is not on
-- the TEST list while background_work_on is off, and for a business that has left.
create or replace function public.work_enqueue(p_business uuid, p_kind text, p_title text, p_plan jsonb default '{}'::jsonb,
  p_identity uuid default null, p_spec uuid default null, p_key text default null, p_cap numeric default 1,
  p_max_steps integer default 30, p_run_after timestamptz default null, p_by text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_on boolean; v_test jsonb; v_id uuid; v_status text;
begin
  if p_business is null or p_kind is null or p_title is null then raise exception 'work_enqueue: business, kind and title are needed'; end if;
  select status into v_status from public.businesses where id = p_business;
  if v_status is null then raise exception 'work_enqueue: no such business'; end if;
  if v_status in ('disconnected', 'cancelled') then raise exception 'work_enqueue: this business has left'; end if;
  select coalesce((select value = 'true'::jsonb from public.forge_settings where key = 'background_work_on'), false) into v_on;
  select coalesce((select value from public.forge_settings where key = 'act_sandbox_businesses'), '[]'::jsonb) into v_test;
  if not v_on and not (jsonb_typeof(v_test) = 'array' and v_test ? p_business::text) then
    raise exception 'work_enqueue: background work is not switched on for this business';
  end if;
  if p_key is not null then
    select id into v_id from public.work_jobs where business_id = p_business and dedupe_key = p_key;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.work_jobs (business_id, spec_id, identity_id, kind, title, plan, dedupe_key, cost_cap_usd, max_steps, run_after, created_by)
  values (p_business, p_spec, p_identity, p_kind, left(p_title, 160), coalesce(p_plan, '{}'::jsonb), p_key,
          least(greatest(coalesce(p_cap, 1), 0.01), 20), least(greatest(coalesce(p_max_steps, 30), 1), 200), coalesce(p_run_after, now()), p_by)
  on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.work_jobs where business_id = p_business and dedupe_key = p_key; end if;
  return v_id;
end $$;

-- ---------- claim the next job ----------
-- One job per call, the oldest one that is due or whose worker went quiet. Nothing while a switch is on.
-- A job whose worker died max_attempts times in a row is ended here instead of being handed out again.
create or replace function public.work_claim(p_worker text, p_seconds integer default 90)
returns setof public.work_jobs language plpgsql security definer set search_path to '' as $$
declare r public.work_jobs; v_secs integer := least(greatest(coalesce(p_seconds, 90), 20), 300);
begin
  if coalesce((select value = 'true'::jsonb from public.forge_settings where key = 'kill_switch'), false)
     or coalesce((select value = 'true'::jsonb from public.forge_settings where key = 'work_paused'), false) then
    return;
  end if;
  update public.work_jobs set status = 'failed', outcome = 'failed', lease_until = null, worker = null, finished_at = now(), updated_at = now(),
    reason = 'It stopped without finishing ' || attempts || ' times in a row: the worker was cut off or crashed.',
    summary = coalesce(summary, 'Pip could not finish this. Nothing more was changed. Pip''s team has been told.')
  where status = 'running' and lease_until < now() and attempts >= max_attempts;
  select * into r from public.work_jobs
  where (status = 'queued' and run_after <= now()) or (status = 'running' and lease_until < now())
  order by run_after, created_at
  for update skip locked limit 1;
  if r.id is null then return; end if;
  update public.work_jobs set status = 'running', worker = p_worker, attempts = attempts + 1,
    lease_until = now() + make_interval(secs => v_secs), heartbeat_at = now(),
    started_at = coalesce(started_at, now()), updated_at = now()
  where id = r.id returning * into r;
  return next r;
end $$;

-- ---------- keep holding it ----------
-- False means the lease is gone (someone else has the job, or it was stopped): the worker must stop at once.
create or replace function public.work_heartbeat(p_job uuid, p_worker text, p_seconds integer default 90)
returns boolean language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  update public.work_jobs set lease_until = now() + make_interval(secs => least(greatest(coalesce(p_seconds, 90), 20), 300)),
    heartbeat_at = now(), updated_at = now()
  where id = p_job and worker = p_worker and status = 'running' and lease_until >= now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ---------- give it back ----------
-- queued: more to do, come back at p_run_after. waiting_owner / waiting_approval: a person is needed.
-- done / failed / stopped: over. Giving a job back means the worker was alive, so the dead-worker count starts again.
-- An ending is written to the owner's activity in plain words.
create or replace function public.work_release(p_job uuid, p_worker text, p_status text, p_run_after timestamptz default null,
  p_summary text default null, p_reason text default null, p_outcome text default null)
returns boolean language plpgsql security definer set search_path to '' as $$
declare r public.work_jobs; v_over boolean := p_status in ('done', 'failed', 'stopped');
begin
  if p_status not in ('queued', 'waiting_owner', 'waiting_approval', 'done', 'failed', 'stopped') then raise exception 'work_release: bad status'; end if;
  update public.work_jobs set status = p_status, lease_until = null, worker = null, attempts = 0,
    run_after = coalesce(p_run_after, now()), updated_at = now(),
    summary = coalesce(left(p_summary, 600), summary), reason = left(p_reason, 300),
    outcome = case when v_over then coalesce(p_outcome, case p_status when 'done' then 'ok' when 'failed' then 'failed' else 'stopped' end)
                   when p_status in ('waiting_owner', 'waiting_approval') then 'needs_owner' else outcome end,
    finished_at = case when v_over then now() else finished_at end,
    browser_session_id = case when v_over then null else browser_session_id end
  where id = p_job and worker = p_worker and status = 'running'
  returning * into r;
  if r.id is null then return false; end if;
  if v_over or p_status in ('waiting_owner', 'waiting_approval') then
    insert into public.activity_log (business_id, kind, summary, outcome, spec_id, actor)
    values (r.business_id,
            case when p_status = 'done' then 'action' when p_status in ('waiting_owner', 'waiting_approval') then 'alert' else 'error' end,
            left(r.title || ': ' || coalesce(r.summary, r.reason, 'finished.'), 500),
            case when p_status = 'done' then 'ok' when p_status in ('waiting_owner', 'waiting_approval') then 'paused' when p_status = 'stopped' then 'skipped' else 'failed' end,
            r.spec_id, 'pip');
  end if;
  return true;
end $$;

-- ---------- the dollar cap, held in the database ----------
-- Whatever a worker writes, a running job whose cost has reached its cap ends there.
create or replace function public.work_cost_cap() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.status = 'running' and new.cost_usd >= new.cost_cap_usd then
    new.status := 'failed'; new.outcome := 'failed'; new.lease_until := null; new.worker := null; new.finished_at := now();
    new.reason := 'Stopped at this job''s $' || trim(to_char(new.cost_cap_usd, 'FM990.00')) || ' cap.';
    new.summary := coalesce(new.summary, 'Pip stopped this job when it reached its spending cap. Pip''s team has been told.');
  end if;
  return new;
end $$;
drop trigger if exists work_jobs_cost_cap on public.work_jobs;
create trigger work_jobs_cost_cap before update of cost_usd on public.work_jobs for each row execute function public.work_cost_cap();

revoke all on function public.work_enqueue(uuid, text, text, jsonb, uuid, uuid, text, numeric, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.work_claim(text, integer) from public, anon, authenticated;
revoke all on function public.work_heartbeat(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.work_release(uuid, text, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.work_enqueue(uuid, text, text, jsonb, uuid, uuid, text, numeric, integer, timestamptz, text) to service_role;
grant execute on function public.work_claim(text, integer) to service_role;
grant execute on function public.work_heartbeat(uuid, text, integer) to service_role;
grant execute on function public.work_release(uuid, text, text, timestamptz, text, text, text) to service_role;

-- ---------- the timers ----------
-- Every minute the database knocks on pip-work, only while something is due or a worker has gone quiet. The knock
-- needs no pass and carries no instructions: the function can only work through jobs already in the queue.
-- Screenshots are kept 14 days.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pip-work-tick', '* * * * *', $c$select net.http_post(url := rtrim(f.value #>> '{}', '/') || '/pip-work/tick', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 120000) from public.forge_settings f where f.key = 'functions_url' and (f.value #>> '{}') ~ '^https://[a-z0-9.-]+/functions/v1/?$' and exists (select 1 from public.work_jobs j where (j.status = 'queued' and j.run_after <= now()) or (j.status = 'running' and j.lease_until < now()))$c$);
    perform cron.schedule('pip-work-shots-cleanup', '17 9 * * *', $c$update public.work_steps set shot = null where shot is not null and at < now() - interval '14 days'$c$);
  end if;
end $$;

-- ---------- undo (run by hand, newest first) ----------
-- select cron.unschedule('pip-work-tick'); select cron.unschedule('pip-work-shots-cleanup');
-- drop trigger if exists work_jobs_cost_cap on public.work_jobs; drop function if exists public.work_cost_cap();
-- drop function if exists public.work_release(uuid, text, text, timestamptz, text, text, text);
-- drop function if exists public.work_heartbeat(uuid, text, integer);
-- drop function if exists public.work_claim(text, integer);
-- drop function if exists public.work_enqueue(uuid, text, text, jsonb, uuid, uuid, text, numeric, integer, timestamptz, text);
-- drop table if exists public.work_steps; drop table if exists public.work_jobs; drop table if exists public.tool_identities;
-- delete from public.pip_limits where kind = 'work_usd';
-- delete from public.forge_settings where key in ('background_work_on', 'work_paused');
