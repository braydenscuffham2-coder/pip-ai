-- One list of what Pip can do, and a scorecard for the whole pipeline (Nov 27, 2026).
--
-- The Brain imagines teammates out of capabilities ("uses": calendar, booking_app, pos, team_chat ...). The Forge
-- builds them. The runtime runs them. Until now nothing held the three to one list: of the 20 teammates the Brain had
-- imagined, 15 needed at least one capability with nothing behind it, and nobody was told.
--
-- public.capabilities is that list. Each row says honestly where a capability stands:
--   proven    seen working end to end on a live test (with the date)
--   built     the code exists and has tests, not re-proven on a live run
--   blocked   built, and waiting on something outside the code (named in the note)
--   not_built nothing does this yet
-- A capability with a switched-on action in tool_catalog is never worse than "built", whatever its row says, so
-- adding a tool moves the scorecard without anyone editing this table.
--
-- pipeline_scorecard() measures the system, not one teammate: how many imagined teammates could run, what the rest
-- are missing (most-needed first), how many were written with real jobs, how many are live.
create table if not exists public.capabilities (
  key text primary key,
  status text not null check (status in ('proven', 'built', 'blocked', 'not_built')),
  how text not null default '',
  note text not null default '',
  proven_on date,
  updated_at timestamptz not null default now()
);
alter table public.capabilities enable row level security;
revoke all on public.capabilities from anon, authenticated;

insert into public.capabilities (key, status, how, note, proven_on) values
  ('inbound_message', 'proven', 'pip-turn', 'Answers a message on a channel it is given.', '2026-11-27'),
  ('voice', 'proven', 'pip-voice + pip-turn', 'Answers a phone call on a Pip number.', '2026-11-27'),
  ('ai_disclosure', 'proven', 'pip-turn, pip-voice', 'Says it is an AI where required and whenever asked.', '2026-11-27'),
  ('calendar', 'proven', 'tool_catalog: Google Calendar', 'Reads busy times and adds an appointment. Outlook is switched on and has never been run.', '2026-11-27'),
  ('email', 'proven', 'tool_catalog: Gmail', 'Sends one email to an address the customer gave.', '2026-11-27'),
  ('notify_owner', 'proven', 'pip-turn built-in', 'Leaves the owner a message; shown in the Portal.', '2026-11-27'),
  ('owner_alerts', 'proven', 'pip-turn built-in', 'Same as notify_owner.', '2026-11-27'),
  ('capture_lead', 'proven', 'pip-turn built-in', 'Saves a customer''s details for the owner.', '2026-11-27'),
  ('request_booking', 'proven', 'pip-turn built-in', 'Asks the owner to confirm a time.', '2026-11-27'),
  ('knowledge', 'proven', 'businesses.basics + brain facts', 'Answers from what the owner typed. No document search.', '2026-11-27'),
  ('brain', 'proven', 'businesses.basics + brain facts', 'Same as knowledge.', '2026-11-27'),
  ('web_chat', 'built', 'pip-turn + site-kit', '', null),
  ('consent_ledger', 'built', 'pip-turn, consent tables', '', null),
  ('pii_scrub', 'built', 'pip-turn redact', '', null),
  ('data_sink', 'built', 'tool_catalog: Google Sheets', '', null),
  ('sheets', 'built', 'tool_catalog: Google Sheets', '', null),
  ('draft_for_approval', 'built', 'pip-turn built-in', 'The draft is shown to the owner. Approving it from the Portal is not built.', null),
  ('owner_approval', 'built', 'pip-turn built-in', 'Shown to the owner. Acting on the approval is by hand.', null),
  ('handoff', 'built', 'pip-turn built-in', '', null),
  ('schedule', 'built', 'pip-jobs', '', null),
  ('forms', 'built', 'pip-piece', 'People can use a Pip-built form. A teammate cannot read or write one yet.', null),
  ('weekly_report', 'built', 'pip-notes', '', null),
  ('send_text', 'blocked', 'pip-turn built-in', 'The number is not registered with the carriers for texting.', null),
  ('sms', 'blocked', 'pip-turn', 'The number is not registered with the carriers for texting.', null),
  ('team_chat', 'not_built', '', 'No action for Slack, Teams or similar.', null),
  ('documents', 'not_built', '', '', null),
  ('document_ocr', 'not_built', '', '', null),
  ('embed_search', 'not_built', '', 'No search over a business''s documents.', null),
  ('transcripts', 'not_built', '', '', null),
  ('record_change', 'not_built', '', 'Nothing starts a job when a record changes in the business''s software.', null),
  ('booking_app', 'not_built', '', '', null),
  ('google_profile', 'not_built', '', '', null),
  ('crm', 'not_built', '', '', null),
  ('pos', 'not_built', '', '', null),
  ('ecommerce', 'not_built', '', '', null),
  ('esign', 'not_built', '', '', null),
  ('health_records', 'not_built', '', '', null),
  ('live_board', 'not_built', '', '', null),
  ('realtime_voice', 'not_built', '', '', null),
  ('weather', 'not_built', '', '', null),
  ('outside_signal', 'not_built', '', '', null),
  ('demand_forecast', 'not_built', '', '', null),
  ('anomaly_alert', 'not_built', '', '', null),
  ('edge_box', 'not_built', '', 'Camera hardware lane.', null),
  ('nvr_pull', 'not_built', '', 'Camera hardware lane.', null),
  ('vision_zones', 'not_built', '', 'Camera hardware lane.', null),
  ('vision_queue', 'not_built', '', 'Camera hardware lane.', null),
  ('dwell_model', 'not_built', '', 'Camera hardware lane.', null)
on conflict (key) do nothing;

-- Where one capability stands. A name nobody has listed is not_built: an unknown word is never assumed to work.
create or replace function public.capability_status(p_key text) returns text
language sql stable security definer set search_path to '' as $$
  select case
    when c.status in ('proven', 'blocked') then c.status
    when exists (select 1 from public.tool_catalog t where t.enabled and t.block = p_key) then 'built'
    else coalesce(c.status, 'not_built') end
  from (select 1) one left join public.capabilities c on c.key = p_key
$$;

create or replace function public.pipeline_scorecard() returns jsonb
language sql stable security definer set search_path to '' as $$
  with agents as (
    select o.id as order_id, a->>'agent_id' as agent_id,
           array(select jsonb_array_elements_text(case when jsonb_typeof(a->'uses') = 'array' then a->'uses' else '[]'::jsonb end)) as uses
      from public.build_orders o,
           jsonb_array_elements(case when jsonb_typeof(o."order"->'package'->'agents') = 'array' then o."order"->'package'->'agents' else '[]'::jsonb end) a
     where o.source is distinct from 'test-fixture'
  ), graded as (
    select g.*, array(select u from unnest(g.uses) u where public.capability_status(u) = 'not_built') as missing,
                array(select u from unnest(g.uses) u where public.capability_status(u) = 'blocked') as waiting,
                array(select u from unnest(g.uses) u where public.capability_status(u) = 'built') as unproven
      from agents g
  )
  select jsonb_build_object(
    'imagined', (select count(*) from graded),
    'could_run_all_proven', (select count(*) from graded where uses <> '{}' and missing = '{}' and waiting = '{}' and unproven = '{}'),
    -- A teammate that lists nothing it needs is not counted as able to run: nothing is known about it.
    'nothing_listed', (select count(*) from graded where uses = '{}'),
    'could_run_some_unproven', (select count(*) from graded where missing = '{}' and waiting = '{}' and unproven <> '{}'),
    'waiting_on_something_outside', (select count(*) from graded where missing = '{}' and waiting <> '{}'),
    'cannot_run', (select count(*) from graded where missing <> '{}'),
    'most_needed', coalesce((select jsonb_agg(jsonb_build_object('capability', u, 'teammates', n) order by n desc, u)
                    from (select u, count(*) n from graded, unnest(missing) u group by u) m), '[]'::jsonb),
    'specs', (select count(*) from public.skill_specs),
    'specs_with_jobs', (select count(*) from public.skill_specs where jsonb_typeof(spec->'jobs') = 'array' and jsonb_array_length(spec->'jobs') > 0),
    'specs_live', (select count(*) from public.skill_specs where status = 'live'),
    'capabilities', (select jsonb_object_agg(s, n) from (select public.capability_status(key) s, count(*) n from public.capabilities group by 1) c))
$$;
revoke all on function public.capability_status(text) from public, anon, authenticated;
revoke all on function public.pipeline_scorecard() from public, anon, authenticated;
grant execute on function public.capability_status(text), public.pipeline_scorecard() to service_role;

-- undo (by hand): drop function public.pipeline_scorecard(); drop function public.capability_status(text); drop table public.capabilities;
