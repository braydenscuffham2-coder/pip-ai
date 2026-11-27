-- Site skills: the steps Pip learned for a task in a tool, kept per business (Part C, Nov 27, 2026).
--
-- The first time a teammate does a task in a tool, a model finds the way one step at a time. When the run ends well,
-- its steps are kept here, with the job's own values replaced by names, so the next run replays them with no model
-- and one look at the result. Once a week each skill is checked without saving anything. If a tool's screens change,
-- the run finds its way again once and the new steps replace the old; if it cannot, that job waits for the owner.
-- Needs 20261127_02 and 20261127_05. Apply with the Supabase migration tool after the pull request is merged.

create table if not exists public.site_skills (
  business_id uuid not null references public.businesses(id) on delete cascade,
  tool_key text not null check (tool_key ~ '^[a-z0-9_-]{2,60}$'),
  task_key text not null check (char_length(task_key) between 2 and 80),
  identity_id uuid references public.tool_identities(id) on delete set null,
  version int not null default 1,
  status text not null default 'ready' check (status in ('ready', 'needs_repair', 'retired')),
  level text not null check (level in ('read', 'add', 'update')),
  screens jsonb not null check (jsonb_typeof(screens) = 'array'),
  start_url text not null check (start_url ~ '^https://' and char_length(start_url) <= 300),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and octet_length(steps::text) <= 32000),
  sample_inputs jsonb not null default '{}'::jsonb check (octet_length(sample_inputs::text) <= 4000), -- the values of the run it was learned from, for the weekly check
  recorded_job uuid,
  uses int not null default 0,
  repairs int not null default 0,
  recorded_at timestamptz not null default now(),
  verified_at timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (business_id, tool_key, task_key)
);
alter table public.site_skills enable row level security;
revoke all on public.site_skills from anon, authenticated;
grant select, insert, update, delete on public.site_skills to service_role;

-- Keep what a run learned. A first recording is version 1; a repair replaces the steps and counts as a repair.
create or replace function public.site_skill_save(p_business uuid, p_tool text, p_task text, p_identity uuid, p_level text, p_screens jsonb,
  p_start_url text, p_steps jsonb, p_inputs jsonb, p_job uuid, p_repair boolean default false)
returns integer language plpgsql security definer set search_path to '' as $$
declare v integer;
begin
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then return null; end if;
  insert into public.site_skills (business_id, tool_key, task_key, identity_id, level, screens, start_url, steps, sample_inputs, recorded_job, verified_at)
  values (p_business, p_tool, p_task, p_identity, p_level, p_screens, p_start_url, p_steps, coalesce(p_inputs, '{}'::jsonb), p_job, now())
  on conflict (business_id, tool_key, task_key) do update set
    version = public.site_skills.version + 1, status = 'ready', identity_id = excluded.identity_id, level = excluded.level, screens = excluded.screens,
    start_url = excluded.start_url, steps = excluded.steps, sample_inputs = excluded.sample_inputs, recorded_job = excluded.recorded_job,
    repairs = public.site_skills.repairs + case when coalesce(p_repair, false) then 1 else 0 end,
    recorded_at = now(), verified_at = now(), updated_at = now()
  returning version into v;
  return v;
end $$;

-- A replay went through (p_ok) or the steps no longer matched the screens.
create or replace function public.site_skill_mark(p_business uuid, p_tool text, p_task text, p_ok boolean, p_used boolean default false)
returns void language sql security definer set search_path to '' as $$
  update public.site_skills set
    status = case when p_ok then 'ready' else 'needs_repair' end,
    verified_at = case when p_ok then now() else verified_at end,
    uses = uses + case when p_ok and coalesce(p_used, false) then 1 else 0 end,
    last_used_at = case when p_ok and coalesce(p_used, false) then now() else last_used_at end,
    updated_at = now()
  where business_id = p_business and tool_key = p_tool and task_key = p_task and status <> 'retired';
$$;

-- The weekly check: one check-only job per skill that has not been checked for seven days. It types nothing and saves
-- nothing. A business that may not have background work is skipped, not failed.
create or replace function public.site_skills_enqueue_checks()
returns integer language plpgsql security definer set search_path to '' as $$
declare s public.site_skills; n integer := 0;
begin
  for s in select * from public.site_skills where status = 'ready' and identity_id is not null and coalesce(verified_at, recorded_at) < now() - interval '7 days' limit 50 loop
    begin
      perform public.work_enqueue(s.business_id, 'skill_verify', left('Check that Pip still knows its way: ' || s.task_key, 160),
        jsonb_build_object('goal', 'Check that the learned steps still match the screens. Change nothing.', 'level', s.level, 'screens', s.screens, 'start_url', s.start_url,
          'task_key', s.task_key, 'inputs', s.sample_inputs, 'replay', jsonb_build_object('steps', s.steps, 'i', 0, 'dry', true, 'version', s.version)),
        s.identity_id, null, 'skill-check:' || s.tool_key || ':' || s.task_key || ':' || to_char(now(), 'IYYY-IW'), 0.10, 40, null, 'weekly-check');
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;

revoke all on function public.site_skill_save(uuid, text, text, uuid, text, jsonb, text, jsonb, jsonb, uuid, boolean) from public, anon, authenticated;
revoke all on function public.site_skill_mark(uuid, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.site_skills_enqueue_checks() from public, anon, authenticated;
grant execute on function public.site_skill_save(uuid, text, text, uuid, text, jsonb, text, jsonb, jsonb, uuid, boolean) to service_role;
grant execute on function public.site_skill_mark(uuid, text, text, boolean, boolean) to service_role;
grant execute on function public.site_skills_enqueue_checks() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pip-skill-checks', '7 10 * * *', $c$select public.site_skills_enqueue_checks()$c$);
  end if;
end $$;

-- undo (by hand): select cron.unschedule('pip-skill-checks');
-- drop function if exists public.site_skills_enqueue_checks(); drop function if exists public.site_skill_mark(uuid, text, text, boolean, boolean);
-- drop function if exists public.site_skill_save(uuid, text, text, uuid, text, jsonb, text, jsonb, jsonb, uuid, boolean); drop table if exists public.site_skills;
