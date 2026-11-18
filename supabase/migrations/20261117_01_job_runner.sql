-- Lane 01: the job runner's tables and rules.
-- A teammate's jobs can now start on their own (a schedule, an event, the owner). Each start is one row in job_runs.
-- Every real change a run makes is one row in job_actions, written BEFORE the change is attempted, so a retry can see
-- what already happened and never does it twice. The rules that matter are here in the database, where two copies of
-- a function running at once cannot both win:
--   job_enqueue       starts a run at most once per job and key, never for a paused job, never past the day's limit
--   job_claim         lets exactly one worker hold a run at a time, and ends a run whose workers keep dying
--   job_action_begin  a numbered action in a run is attempted at most once, ever
--   job_finish        done, try again later, or stop: three failures pause the job and tell the business;
--                     a dead end opens a supervisor issue instead of looping

-- ---------- tool_catalog: which kind of record a row touches, and how ----------
alter table public.tool_catalog add column if not exists record text check (record is null or record ~ '^[a-z_]{2,40}$');
alter table public.tool_catalog add column if not exists level text check (level is null or level in ('read', 'add', 'update'));
update public.tool_catalog set record = 'busy_time', level = 'read' where slug = 'GOOGLECALENDAR_EVENTS_LIST' and record is null;
update public.tool_catalog set record = 'appointment', level = 'add' where slug = 'GOOGLECALENDAR_CREATE_EVENT' and record is null;
update public.tool_catalog set record = 'message', level = 'add' where slug = 'GMAIL_SEND_EMAIL' and record is null;
update public.tool_catalog set record = 'row', level = 'add' where slug in ('GOOGLESHEETS_CREATE_GOOGLE_SHEET1', 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND') and record is null;

-- ---------- runs ----------
create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  spec_id uuid not null references public.skill_specs(id) on delete cascade,
  job_id text not null check (job_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  trigger text not null check (trigger in ('schedule', 'event', 'owner', 'manual')),
  key text not null check (char_length(key) between 1 and 200),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'dead_end')),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  due_at timestamptz not null default now(),
  lease_until timestamptz,
  input jsonb not null default '{}'::jsonb check (octet_length(input::text) <= 20000),
  state jsonb,
  steps integer not null default 0,
  summary text check (summary is null or char_length(summary) <= 1000),
  error text check (error is null or char_length(error) <= 500),
  cost_usd numeric not null default 0,
  local_day date not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (spec_id, job_id, key)
);
create index if not exists job_runs_due on public.job_runs (due_at) where status in ('queued', 'running');
create index if not exists job_runs_day on public.job_runs (spec_id, job_id, local_day);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;
grant select, insert, update, delete on public.job_runs to service_role;

-- ---------- actions: the record that stops a retry from repeating a real change ----------
create table if not exists public.job_actions (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.job_runs(id) on delete cascade,
  seq integer not null check (seq >= 1),
  business_id uuid not null,
  spec_id uuid not null,
  job_id text not null,
  local_day date not null,
  tool text not null check (char_length(tool) <= 80),
  records text not null check (char_length(records) <= 40),
  level text not null check (level in ('add', 'update')),
  args_hash text not null check (char_length(args_hash) <= 64),
  status text not null default 'started' check (status in ('started', 'done', 'failed', 'unknown', 'test')),
  result text check (result is null or char_length(result) <= 2000),
  at timestamptz not null default now(),
  ended_at timestamptz,
  unique (run_id, seq)
);
create index if not exists job_actions_day on public.job_actions (spec_id, job_id, local_day);
alter table public.job_actions enable row level security;
revoke all on public.job_actions from anon, authenticated;
grant select, insert, update, delete on public.job_actions to service_role;

-- ---------- start a run ----------
-- Returns the new run's id, or null with nothing changed when: this key already started a run, the job or the whole
-- teammate is paused, or the job has had its runs for the day.
create or replace function public.job_enqueue(p_spec uuid, p_job text, p_trigger text, p_key text, p_local_day date,
  p_input jsonb default '{}'::jsonb, p_max_runs integer default null, p_max_attempts integer default 3)
returns uuid language plpgsql security definer set search_path to '' as $$
declare c record; v_id uuid; v_n integer;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_spec::text || '/' || p_job, 0));
  if exists (select 1 from public.agent_pauses p where p.spec_id = p_spec and p.resumed_at is null and (p.job is null or p.job = 'job:' || p_job)) then return null; end if;
  if p_max_runs is not null then
    select count(*) into v_n from public.job_runs r where r.spec_id = p_spec and r.job_id = p_job and r.local_day = p_local_day;
    if v_n >= p_max_runs then return null; end if;
  end if;
  insert into public.job_runs (business_id, spec_id, job_id, trigger, key, local_day, input, max_attempts)
  values (c.business_id, p_spec, p_job, p_trigger, left(p_key, 200), p_local_day, coalesce(p_input, '{}'::jsonb), least(greatest(coalesce(p_max_attempts, 3), 1), 3))
  on conflict (spec_id, job_id, key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------- hold a run ----------
-- One worker at a time. A run is free when it is queued and due, or when the worker holding it went quiet.
-- A worker that is killed, times out or crashes never reaches job_finish, so its failed try is counted here: when the
-- hold on a run has run out and the run has already had max_attempts tries, it is not handed out again. It is marked
-- failed, the job is paused and the business is told (portal_job_pause, the same door job_finish uses after the last
-- reported failure), and the caller gets nothing. Without this a dead worker would be replaced on every tick, for ever.
create or replace function public.job_claim(p_run uuid, p_seconds integer default 120)
returns public.job_runs language plpgsql security definer set search_path to '' as $$
declare r public.job_runs;
begin
  select * into r from public.job_runs
  where id = p_run and status = 'running' and lease_until < now() and attempts >= max_attempts for update;
  if r.id is not null then
    update public.job_runs set status = 'failed', lease_until = null, finished_at = now(),
      error = 'The last try stopped without finishing: it was cut off, timed out or crashed.'
    where id = p_run;
    perform public.portal_job_pause(r.spec_id, 'job:' || r.job_id, 'supervisor',
      'It failed ' || r.attempts || ' times in a row: the last try stopped without finishing.');
    return null;
  end if;
  update public.job_runs set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
    lease_until = now() + make_interval(secs => least(greatest(coalesce(p_seconds, 120), 30), 300))
  where id = p_run and ((status = 'queued' and due_at <= now()) or (status = 'running' and lease_until < now()))
  returning * into r;
  return r;
end $$;

-- ---------- one numbered action, at most once ----------
-- 'fresh' means go ahead. Anything else is what an earlier try left behind: its status and result. The caller must not
-- do the action again; for 'started' and 'unknown' nobody knows whether it happened, so the run stops for a person.
create or replace function public.job_action_begin(p_run uuid, p_seq integer, p_tool text, p_records text, p_level text, p_hash text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r public.job_runs; a public.job_actions;
begin
  select * into r from public.job_runs where id = p_run;
  if r.id is null or r.status <> 'running' then return jsonb_build_object('status', 'no_run'); end if;
  insert into public.job_actions (run_id, seq, business_id, spec_id, job_id, local_day, tool, records, level, args_hash)
  values (p_run, p_seq, r.business_id, r.spec_id, r.job_id, r.local_day, left(p_tool, 80), left(p_records, 40), p_level, left(p_hash, 64))
  on conflict (run_id, seq) do nothing;
  if found then return jsonb_build_object('status', 'fresh'); end if;
  select * into a from public.job_actions where run_id = p_run and seq = p_seq;
  if a.status = 'started' then update public.job_actions set status = 'unknown', ended_at = now() where id = a.id; a.status := 'unknown'; end if;
  return jsonb_build_object('status', a.status, 'result', a.result, 'tool', a.tool, 'same', a.args_hash = left(p_hash, 64));
end $$;

create or replace function public.job_action_end(p_run uuid, p_seq integer, p_status text, p_result text default null)
returns void language sql security definer set search_path to '' as $$
  update public.job_actions set status = p_status, result = left(p_result, 2000), ended_at = now()
  where run_id = p_run and seq = p_seq and status = 'started' and p_status in ('done', 'failed', 'unknown', 'test');
$$;

-- ---------- end a try ----------
--   done      finished
--   continue  ran out of time, not a failure: carry on from the saved state on the next tick
--   retry     this try failed. After max_attempts failed tries the run is failed, the job pauses and the business is told.
--   dead_end  cannot go on and trying again would not help: stop and open a supervisor issue. Never loops.
--   blocked   a tool this job needs is missing or lost access: stop and pause the job (the tool's own pause tells the owner why)
create or replace function public.job_finish(p_run uuid, p_outcome text, p_summary text default null, p_error text default null,
  p_state jsonb default null, p_steps integer default null, p_cost_usd numeric default 0)
returns text language plpgsql security definer set search_path to '' as $$
declare r public.job_runs; c record; v_status text; v_label text;
begin
  select * into r from public.job_runs where id = p_run for update;
  if r.id is null or r.status <> 'running' then return null; end if;
  select * into c from public.portal_spec_ctx(r.spec_id);
  v_label := 'job:' || r.job_id;
  if p_outcome = 'done' then v_status := 'done';
  elsif p_outcome = 'continue' then v_status := 'queued';
  elsif p_outcome = 'retry' then v_status := case when r.attempts >= r.max_attempts then 'failed' else 'queued' end;
  elsif p_outcome in ('dead_end', 'blocked') then v_status := case p_outcome when 'blocked' then 'failed' else 'dead_end' end;
  else return null; end if;

  update public.job_runs set status = v_status, lease_until = null,
    attempts = case when p_outcome = 'continue' then greatest(attempts - 1, 0) else attempts end,
    due_at = case when v_status = 'queued' and p_outcome = 'retry' then now() + make_interval(mins => 5 * attempts) else due_at end,
    state = coalesce(p_state, state), steps = coalesce(p_steps, steps), cost_usd = cost_usd + coalesce(p_cost_usd, 0),
    summary = coalesce(left(p_summary, 1000), summary), error = left(p_error, 500),
    finished_at = case when v_status in ('done', 'failed', 'dead_end') then now() else null end
  where id = p_run;

  if v_status = 'done' then
    insert into public.activity_log (business_id, spec_id, agent, job, kind, summary, outcome, cost_usd, actor, ref)
    values (r.business_id, r.spec_id, c.teammate, v_label, 'action', left(coalesce(nullif(btrim(p_summary), ''), c.teammate || ' finished a job'), 500), 'ok', nullif(r.cost_usd + coalesce(p_cost_usd, 0), 0), 'agent', jsonb_build_object('run', r.id));
  elsif v_status = 'failed' then
    perform public.portal_job_pause(r.spec_id, v_label, case when p_outcome = 'blocked' then 'missing_connection' else 'supervisor' end,
      left(case when p_outcome = 'blocked' then 'A tool this job needs is not available: ' else 'It failed ' || r.attempts || ' times in a row: ' end || coalesce(p_error, 'no reason recorded'), 500));
  elsif v_status = 'dead_end' then
    insert into public.portal_issues (business_id, spec_id, opened_by, body, status)
    values (r.business_id, r.spec_id, 'supervisor', left(c.teammate || ' stopped a job (' || r.job_id || ') and needs a person: ' || coalesce(p_error, p_summary, 'no reason recorded'), 2000), 'open');
    insert into public.activity_log (business_id, spec_id, agent, job, kind, summary, outcome, actor, ref)
    values (r.business_id, r.spec_id, c.teammate, v_label, 'supervisor', left(c.teammate || ' stopped and asked for a person: ' || coalesce(p_error, p_summary, 'no reason recorded'), 500), 'failed', 'agent', jsonb_build_object('run', r.id));
  end if;
  return v_status;
end $$;

do $$ declare f text; begin
  foreach f in array array['job_enqueue(uuid,text,text,text,date,jsonb,integer,integer)', 'job_claim(uuid,integer)', 'job_action_begin(uuid,integer,text,text,text,text)',
    'job_action_end(uuid,integer,text,text)', 'job_finish(uuid,text,text,text,jsonb,integer,numeric)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;

-- ---------- the timer ----------
-- Every 5 minutes the database knocks on pip-jobs. The knock carries no instructions: pip-jobs works out for itself
-- what is due, so knocking more often, or from outside, starts nothing extra.
--
-- Which project to knock on is NOT written here. It is read, at every knock, from public.forge_settings, key
-- 'functions_url': this project's own functions address, as a JSON string that ends in /functions/v1. A database with
-- no such setting, or one that is not a plain address of that shape, knocks on nothing. So running this migration on a
-- test project can never make the test database call the live function. To switch the timer on, run this once on the
-- project, with that project's own address (the statement is also in supabase/README.md):
--   insert into public.forge_settings (key, value) values ('functions_url', to_jsonb('<this project's address>/functions/v1'::text))
--   on conflict (key) do update set value = excluded.value;
--
-- /tick needs no pass. It ignores knocks closer together than 45 seconds, but that gate reads the last knock and then
-- writes the new one as two steps, so two knocks that arrive at the same moment can both get through and each do the
-- full scan. That costs two scans, not two runs: job_enqueue and job_claim above decide what starts and who holds it.
select cron.schedule('pip-jobs-tick', '*/5 * * * *', $c$select net.http_post(url := rtrim(f.value #>> '{}', '/') || '/pip-jobs/tick', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 120000) from public.forge_settings f where f.key = 'functions_url' and (f.value #>> '{}') ~ '^https://[a-z0-9.-]+/functions/v1/?$' and (exists (select 1 from public.skill_specs s where s.spec ? 'jobs') or exists (select 1 from public.job_runs r where r.status in ('queued', 'running')))$c$);
