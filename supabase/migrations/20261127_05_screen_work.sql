-- Screen work: approvals and earned trust (Part C, Nov 26, 2026).
--
-- A teammate that changes something inside an owner's software waits for the owner's yes the first few times it does
-- a given task. After enough approved runs of the same task in the same tool, it carries on by itself.
--
--   screen_trust       per business, tool and task: how many runs the owner has approved, and how many are needed
--   work_approve       the owner's yes or no to a job that is waiting to save something
--   work_resume        a person did what was needed (signed in again, answered a captcha): the job goes back in the queue
-- Needs 20261127_02_background_runtime.sql. Apply with the Supabase migration tool after the pull request is merged.

create table if not exists public.screen_trust (
  business_id uuid not null references public.businesses(id) on delete cascade,
  tool_key text not null check (tool_key ~ '^[a-z0-9_-]{2,60}$'),
  task_key text not null check (char_length(task_key) between 2 and 80),
  approved_runs int not null default 0 check (approved_runs >= 0),
  required int not null default 3 check (required between 0 and 20),   -- the first N write runs need the owner's yes
  updated_at timestamptz not null default now(),
  primary key (business_id, tool_key, task_key)
);
alter table public.screen_trust enable row level security;
revoke all on public.screen_trust from anon, authenticated;
grant select, insert, update, delete on public.screen_trust to service_role;

-- Does this task still need the owner's yes before it saves? A task nobody has seen yet always does.
create or replace function public.screen_needs_approval(p_business uuid, p_tool text, p_task text)
returns boolean language sql security definer set search_path to '' as $$
  select coalesce((select approved_runs < required from public.screen_trust where business_id = p_business and tool_key = p_tool and task_key = p_task), true);
$$;

-- One more approved run of this task finished cleanly.
create or replace function public.screen_trust_note(p_business uuid, p_tool text, p_task text)
returns integer language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  insert into public.screen_trust (business_id, tool_key, task_key, approved_runs) values (p_business, p_tool, p_task, 1)
  on conflict (business_id, tool_key, task_key) do update set approved_runs = public.screen_trust.approved_runs + 1, updated_at = now()
  returning approved_runs into n;
  return n;
end $$;

-- The owner's answer to a job waiting to save. Yes: the job runs again and may save exactly the values the owner saw.
-- No: the job stops and nothing is saved. Either way the answer is written to the owner's activity.
create or replace function public.work_approve(p_job uuid, p_ok boolean, p_by text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare r public.work_jobs;
begin
  select * into r from public.work_jobs where id = p_job and status = 'waiting_approval' for update;
  if r.id is null then return 'not_waiting'; end if;
  if coalesce(p_ok, false) then
    update public.work_jobs set status = 'queued', state = 'start', run_after = now(), reason = null, updated_at = now(),
      plan = plan || jsonb_build_object('approved', true, 'approved_form', coalesce(plan->'pending'->'form', '{}'::jsonb), 'approved_by', left(coalesce(p_by, 'owner'), 120), 'started', false)
    where id = p_job;
    insert into public.activity_log (business_id, kind, summary, outcome, spec_id, actor)
    values (r.business_id, 'owner', left(r.title || ': you said yes. Pip will save it now.', 500), 'ok', r.spec_id, left(coalesce(p_by, 'owner'), 120));
    return 'approved';
  end if;
  update public.work_jobs set status = 'stopped', outcome = 'stopped', finished_at = now(), updated_at = now(),
    summary = 'You said no, so Pip did not save anything.', reason = 'declined'
  where id = p_job;
  insert into public.activity_log (business_id, kind, summary, outcome, spec_id, actor)
  values (r.business_id, 'owner', left(r.title || ': you said no. Nothing was saved.', 500), 'skipped', r.spec_id, left(coalesce(p_by, 'owner'), 120));
  return 'declined';
end $$;

-- A person did what was needed. The job starts again from its first page.
create or replace function public.work_resume(p_job uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  update public.work_jobs set status = 'queued', state = 'start', run_after = now(), reason = null, updated_at = now(),
    plan = plan || jsonb_build_object('started', false)
  where id = p_job and status = 'waiting_owner';
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.screen_needs_approval(uuid, text, text) from public, anon, authenticated;
revoke all on function public.screen_trust_note(uuid, text, text) from public, anon, authenticated;
revoke all on function public.work_approve(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.work_resume(uuid) from public, anon, authenticated;
grant execute on function public.screen_needs_approval(uuid, text, text) to service_role;
grant execute on function public.screen_trust_note(uuid, text, text) to service_role;
grant execute on function public.work_approve(uuid, boolean, text) to service_role;
grant execute on function public.work_resume(uuid) to service_role;

-- undo (by hand):
-- drop function if exists public.work_resume(uuid); drop function if exists public.work_approve(uuid, boolean, text);
-- drop function if exists public.screen_trust_note(uuid, text, text); drop function if exists public.screen_needs_approval(uuid, text, text);
-- drop table if exists public.screen_trust;
