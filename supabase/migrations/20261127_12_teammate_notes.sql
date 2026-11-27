-- Weekly notes: each teammate that may act for real writes one note a week about its own work (Part F, Nov 27, 2026).
--
-- A note says what the teammate did, what went wrong, and at most one change it proposes. The facts come from the
-- database (its runs, its failures, its pauses, its cost); a model only puts them into plain words, and a proposal is
-- kept only when it points at runs that are really in those facts. The owner reads the note in the Portal and can say
-- "good idea" or "no thanks". Neither answer changes the teammate: a proposal never applies itself. Brayden reads the
-- same note with its evidence.
-- Needs skill_specs, build_orders, businesses, job_runs, agent_pauses. Apply after the pull request is merged.

create table if not exists public.teammate_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  spec_id uuid not null references public.skill_specs(id) on delete cascade,
  week_start date not null,                       -- the Monday the week began, in UTC
  teammate text not null check (char_length(teammate) between 1 and 80),
  did text not null check (char_length(did) between 1 and 600),
  wrong text check (wrong is null or char_length(wrong) <= 600),
  proposal jsonb check (proposal is null or (jsonb_typeof(proposal) = 'object' and octet_length(proposal::text) <= 3000)), -- { change, why, evidence: [run ids] }
  facts jsonb not null check (jsonb_typeof(facts) = 'object' and octet_length(facts::text) <= 12000),
  written_by text not null default 'facts' check (written_by in ('facts', 'model')),
  cost_usd numeric not null default 0,
  decision text check (decision in ('good_idea', 'no_thanks')),
  decided_by text, decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (spec_id, week_start)
);
create index if not exists teammate_notes_business_idx on public.teammate_notes (business_id, week_start desc);
alter table public.teammate_notes enable row level security;
revoke all on public.teammate_notes from anon, authenticated;
grant select, insert, update on public.teammate_notes to service_role;

-- The facts of one teammate's week, counted here so no model is asked to remember them.
create or replace function public.teammate_week(p_spec uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql security definer set search_path to '' as $$
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'runs', (select count(*) from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to),
    'done', (select count(*) from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to and r.status = 'done'),
    'failed', (select count(*) from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to and r.status = 'failed'),
    'asked_for_a_person', (select count(*) from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to and r.status = 'dead_end'),
    'cost_usd', (select coalesce(round(sum(r.cost_usd)::numeric, 4), 0) from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to),
    'by_job', (select coalesce(jsonb_agg(jsonb_build_object('job', j.job_id, 'runs', j.n, 'done', j.d, 'failed', j.f, 'asked', j.a) order by j.n desc), '[]'::jsonb)
               from (select r.job_id, count(*) n, count(*) filter (where r.status = 'done') d, count(*) filter (where r.status = 'failed') f, count(*) filter (where r.status = 'dead_end') a
                     from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to group by r.job_id order by count(*) desc limit 12) j),
    'trouble', (select coalesce(jsonb_agg(jsonb_build_object('run', t.id, 'job', t.job_id, 'status', t.status, 'at', t.created_at, 'what', left(coalesce(t.error, t.summary, ''), 240)) order by t.created_at desc), '[]'::jsonb)
                from (select r.id, r.job_id, r.status, r.created_at, r.error, r.summary from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to and r.status in ('failed', 'dead_end') order by r.created_at desc limit 8) t),
    'good', (select coalesce(jsonb_agg(jsonb_build_object('run', g.id, 'job', g.job_id, 'what', left(coalesce(g.summary, ''), 200)) order by g.created_at desc), '[]'::jsonb)
             from (select r.id, r.job_id, r.created_at, r.summary from public.job_runs r where r.spec_id = p_spec and r.created_at >= p_from and r.created_at < p_to and r.status = 'done' order by r.created_at desc limit 5) g),
    'pauses', (select coalesce(jsonb_agg(jsonb_build_object('job', p.job, 'reason', p.reason, 'at', p.paused_at, 'resumed', p.resumed_at is not null) order by p.paused_at desc), '[]'::jsonb)
               from (select a.job, a.reason, a.paused_at, a.resumed_at from public.agent_pauses a where a.spec_id = p_spec and a.paused_at >= p_from and a.paused_at < p_to order by a.paused_at desc limit 6) p)
  );
$$;

-- The teammates a note is due for this week: live, or on a TEST business, with declared jobs, and no note yet.
create or replace function public.teammate_notes_due(p_week date, p_limit int default 25) returns jsonb
language sql security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('spec', s.id, 'business', o.business_id, 'business_name', b.name,
      'teammate', coalesce(s.spec->'board'->'teammate'->>'name', s.brain->'agent'->'teammate'->>'name', s.skill_id, 'Your teammate'), 'test', s.status <> 'live')), '[]'::jsonb)
  from (select s.* from public.skill_specs s join public.build_orders o on o.id = s.order_id
        where o.business_id is not null and jsonb_typeof(s.spec->'jobs') = 'array'
          and (s.status = 'live' or (s.status in ('sandbox', 'approved') and coalesce((select value from public.forge_settings where key = 'act_sandbox_businesses'), '[]'::jsonb) ? o.business_id::text))
          and not exists (select 1 from public.teammate_notes n where n.spec_id = s.id and n.week_start = p_week)
        order by s.updated_at desc limit least(greatest(coalesce(p_limit, 25), 1), 100)) s
  join public.build_orders o on o.id = s.order_id join public.businesses b on b.id = o.business_id
  where b.status not in ('disconnected', 'cancelled', 'deleted');
$$;

revoke all on function public.teammate_week(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.teammate_notes_due(date, int) from public, anon, authenticated;
grant execute on function public.teammate_week(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.teammate_notes_due(date, int) to service_role;

insert into public.forge_settings (key, value) values ('notes_on', 'true'::jsonb) on conflict (key) do nothing;

-- Every Monday at 14:07 UTC the database knocks on pip-notes. The knock carries nothing; the function works out what is due.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('pip-weekly-notes', '7 14 * * 1', $c$select net.http_post(url := rtrim(f.value #>> '{}', '/') || '/pip-notes/tick', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 60000) from public.forge_settings f where f.key = 'functions_url'$c$);
  end if;
end $$;

-- undo (by hand): select cron.unschedule('pip-weekly-notes');
-- drop function if exists public.teammate_notes_due(date, int); drop function if exists public.teammate_week(uuid, timestamptz, timestamptz);
-- drop table if exists public.teammate_notes; delete from public.forge_settings where key = 'notes_on';
