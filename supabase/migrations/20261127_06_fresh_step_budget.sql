-- A job that starts again gets a fresh step budget (found on the first live update proof, Nov 27, 2026).
--
-- After the owner's yes, or after a person did what was needed, a screen job runs its task again from the first page.
-- Its step count carried over from the earlier try, so a job that had used 8 of 16 steps ran out half-way through the
-- second try and was stopped one step before saving. Both functions now set step back to 0. Each try still has the
-- same budget, and the dollar cap still counts across tries.

create or replace function public.work_approve(p_job uuid, p_ok boolean, p_by text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare r public.work_jobs;
begin
  select * into r from public.work_jobs where id = p_job and status = 'waiting_approval' for update;
  if r.id is null then return 'not_waiting'; end if;
  if coalesce(p_ok, false) then
    update public.work_jobs set status = 'queued', state = 'start', step = 0, run_after = now(), reason = null, updated_at = now(),
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

create or replace function public.work_resume(p_job uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  update public.work_jobs set status = 'queued', state = 'start', step = 0, run_after = now(), reason = null, updated_at = now(),
    plan = plan || jsonb_build_object('started', false)
  where id = p_job and status = 'waiting_owner';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- undo (by hand): re-run the two functions from 20261127_05_screen_work.sql.
