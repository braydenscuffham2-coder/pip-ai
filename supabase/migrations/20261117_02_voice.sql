-- Lane 02 voice: phone calls.
-- Adds: one table of calls (voice_calls), three columns on phone_lines, and the database rules pip-voice runs on.
-- Touches no portal_* function. Every function here is callable by the service role only.
-- A caller's number is never stored in the clear: the same one-way code and last four digits that texts use.

-- ---------- the line ----------
alter table public.phone_lines
  add column if not exists spec_id uuid references public.skill_specs(id) on delete set null,
  add column if not exists handoff_number text,
  add column if not exists handoff_hours jsonb;
comment on column public.phone_lines.spec_id is 'The teammate that answers this line. Needed for a TEST business; a live teammate on the phone or texting step is found without it.';
comment on column public.phone_lines.handoff_number is 'Where a call is transferred when a caller needs a person. Empty means never transfer.';
comment on column public.phone_lines.handoff_hours is 'When transfers are allowed, in the business''s time zone: {"mon":["09:00","17:00"],"tue":[...]}. A missing day means no transfers that day.';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'phone_lines_handoff_number_chk') then
    alter table public.phone_lines add constraint phone_lines_handoff_number_chk
      check (handoff_number is null or handoff_number ~ '^\+[1-9][0-9]{7,14}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'phone_lines_handoff_hours_chk') then
    alter table public.phone_lines add constraint phone_lines_handoff_hours_chk
      check (handoff_hours is null or (jsonb_typeof(handoff_hours) = 'object' and octet_length(handoff_hours::text) <= 600));
  end if;
end $$;

-- ---------- one row per call ----------
create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  spec_id uuid references public.skill_specs(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  call_sid text not null unique check (call_sid ~ '^CA[0-9a-f]{32}$'),
  pass_hash text not null check (pass_hash ~ '^[0-9a-f]{64}$'),
  contact_hash text check (contact_hash is null or contact_hash ~ '^[0-9a-f]{64}$'),
  contact_hint text check (contact_hint is null or char_length(contact_hint) <= 4),
  state text not null default 'ringing' check (state in ('ringing', 'talking', 'ended', 'failed')),
  next_step text check (next_step is null or next_step in ('hangup', 'transfer')),
  outcome text check (outcome is null or char_length(outcome) <= 60),
  turns integer not null default 0,
  turn_open timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_secs integer,
  minutes integer,
  billed_at timestamptz,
  detail jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 4000)
);
create index if not exists voice_calls_business_idx on public.voice_calls (business_id, started_at desc);
create index if not exists voice_calls_pass_idx on public.voice_calls (pass_hash);
create index if not exists voice_calls_unbilled_idx on public.voice_calls (started_at) where billed_at is null;
alter table public.voice_calls enable row level security;
revoke all on public.voice_calls from public, anon, authenticated;
grant select, insert, update, delete on public.voice_calls to service_role;

-- ---------- which business and teammate a number belongs to ----------
create or replace function public.voice_line_ctx(p_to text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_num text := regexp_replace(coalesce(p_to, ''), '\D', '', 'g');
  pl public.phone_lines; b public.businesses; v_spec uuid; v_mate text; v_status text; v_test boolean;
begin
  if length(v_num) = 10 then v_num := '1' || v_num; end if;
  if length(v_num) < 10 then return jsonb_build_object('ok', false, 'reason', 'no_line'); end if;
  select l.* into pl from public.phone_lines l
   where regexp_replace(coalesce(l.pip_number, ''), '\D', '', 'g') in (v_num, right(v_num, 10)) and l.status <> 'released' limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_line'); end if;
  select * into b from public.businesses where id = pl.business_id;
  if b.status in ('disconnected', 'cancelled') then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  -- A teammate that is not live may answer only for a business on the test list whose name starts with TEST.
  v_test := b.name ilike 'TEST%' and coalesce((select fs.value ? b.id::text from public.forge_settings fs where fs.key = 'act_sandbox_businesses'), false);
  if pl.spec_id is not null then
    select s.id, coalesce(am.manifest->>'teammate', am.manifest->>'name', s.skill_id), s.status into v_spec, v_mate, v_status
    from public.skill_specs s join public.build_orders o on o.id = s.order_id
    left join public.agent_manifests am on am.spec_id = s.id
    where s.id = pl.spec_id and o.business_id = b.id
      and (s.status = 'live' or (v_test and s.status in ('sandbox', 'approved')));
  end if;
  if v_spec is null then
    select s.id, coalesce(am.manifest->>'teammate', am.manifest->>'name', s.skill_id), s.status into v_spec, v_mate, v_status
    from public.skill_specs s join public.build_orders o on o.id = s.order_id
    join public.business_connections bc on bc.business_id = o.business_id and bc.slot = 'phone' and s.skill_id = any(bc.agents)
    left join public.agent_manifests am on am.spec_id = s.id
    where o.business_id = b.id and s.status = 'live' order by s.created_at limit 1;
  end if;
  return jsonb_build_object('ok', true, 'business', b.id, 'name', b.name, 'state', b.state, 'timezone', b.timezone,
    'spec', v_spec, 'teammate', v_mate, 'spec_status', v_status, 'test', v_test);
end $$;

-- ---------- an owner alert, in the same shape pip-turn writes ----------
create or replace function public.voice_alert(p_call uuid, p_summary text, p_urgency text default 'normal') returns void
language plpgsql security definer set search_path to '' as $$
declare c public.voice_calls; v_name text;
begin
  select * into c from public.voice_calls where id = p_call;
  if not found or c.spec_id is null then return; end if;
  select name into v_name from public.businesses where id = c.business_id;
  insert into public.notifications (spec_id, kind, body)
  values (c.spec_id, 'notify_owner', jsonb_build_object(
    'args', jsonb_build_object('summary', left(coalesce(p_summary, ''), 300), 'urgency', case when p_urgency = 'urgent' then 'urgent' else 'normal' end),
    'approval', 'none', 'conversation', c.conversation_id, 'business', v_name, 'channel', 'voice'));
end $$;

-- ---------- a call begins ----------
-- Opens the conversation, saves the spoken greeting as its first message, and logs the AI and note-taking notices.
-- Called again for the same call (Twilio retries), it gives back the same conversation and takes the newer pass.
create or replace function public.voice_call_start(p_to text, p_from text, p_call_sid text, p_pass_hash text, p_greeting text, p_wording text default 'v1')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare x jsonb := public.voice_line_ctx(p_to); c public.voice_calls; v_biz uuid; v_spec uuid; v_conv uuid;
  v_digits text := regexp_replace(coalesce(p_from, ''), '\D', '', 'g'); v_hash text; v_hint text;
begin
  if not coalesce((x->>'ok')::boolean, false) then return jsonb_build_object('ok', false, 'reason', x->>'reason'); end if;
  if x->>'spec' is null then return jsonb_build_object('ok', false, 'reason', 'no_teammate', 'name', x->>'name'); end if;
  if coalesce(p_call_sid, '') !~ '^CA[0-9a-f]{32}$' or coalesce(p_pass_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(btrim(p_greeting), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  v_biz := (x->>'business')::uuid; v_spec := (x->>'spec')::uuid;
  select * into c from public.voice_calls where call_sid = p_call_sid for update;
  if found then
    if c.state <> 'ringing' or c.business_id <> v_biz then return jsonb_build_object('ok', false, 'reason', 'already_started'); end if;
    update public.voice_calls set pass_hash = p_pass_hash where id = c.id;
    return jsonb_build_object('ok', true, 'call', c.id, 'conversation', c.conversation_id, 'spec', c.spec_id, 'name', x->>'name', 'teammate', x->>'teammate', 'again', true);
  end if;
  if length(v_digits) >= 7 then
    v_hash := public.portal_contact_hash(v_biz, 'phone', p_from);
    v_hint := right(public.portal_contact_norm('phone', p_from), 4);
  end if;
  begin
    insert into public.conversations (spec_id, channel, visitor)
    values (v_spec, 'voice', case when v_hash is null then 'tel:unknown' else 'tel:' || left(v_hash, 16) end) returning id into v_conv;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'paused', 'name', x->>'name');
  end;
  insert into public.voice_calls (business_id, spec_id, conversation_id, call_sid, pass_hash, contact_hash, contact_hint, detail)
  values (v_biz, v_spec, v_conv, p_call_sid, p_pass_hash, v_hash, v_hint, jsonb_build_object('wording', left(p_wording, 20)))
  returning * into c;
  insert into public.messages (conversation_id, role, content) values (v_conv, 'assistant', left(p_greeting, 600));
  -- For a live teammate the supervisor trigger on messages logs the AI notice itself; for a test one, log it here.
  if x->>'spec_status' is distinct from 'live' then
    insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
    values (v_biz, v_spec, 'ai_disclosure', 'voice', v_hash, jsonb_build_object('conversation', v_conv, 'call', c.id, 'wording', left(p_wording, 20)));
  end if;
  insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
  values (v_biz, v_spec, 'recording_notice', 'voice', v_hash,
          jsonb_build_object('call', c.id, 'audio_recorded', false, 'said', 'written notes are kept', 'wording', left(p_wording, 20)));
  return jsonb_build_object('ok', true, 'call', c.id, 'conversation', v_conv, 'spec', v_spec, 'name', x->>'name', 'teammate', x->>'teammate');
end $$;

-- ---------- one turn of a call ----------
-- The pass is the only thing that opens a turn. It works while the call is open and for three hours at most.
-- Only one turn runs at a time for a call, so a caller who interrupts cannot make the teammate act twice.
create or replace function public.voice_turn_open(p_pass_hash text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.voice_calls;
begin
  if coalesce(p_pass_hash, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'reason', 'no_pass'); end if;
  select * into c from public.voice_calls
   where pass_hash = p_pass_hash and state in ('ringing', 'talking') and started_at > now() - interval '3 hours'
   order by started_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_pass'); end if;
  if c.spec_id is null or c.conversation_id is null then return jsonb_build_object('ok', false, 'reason', 'no_teammate'); end if;
  if c.next_step is not null then return jsonb_build_object('ok', false, 'reason', 'ending', 'call', c.id); end if;
  if c.turn_open is not null and c.turn_open > now() - interval '30 seconds' then
    return jsonb_build_object('ok', true, 'busy', true, 'call', c.id);
  end if;
  if c.turns >= 120 then return jsonb_build_object('ok', false, 'reason', 'too_long', 'call', c.id); end if;
  update public.voice_calls set state = 'talking', turns = turns + 1, turn_open = now() where id = c.id;
  return jsonb_build_object('ok', true, 'busy', false, 'call', c.id, 'spec', c.spec_id, 'conversation', c.conversation_id, 'turn', c.turns + 1);
end $$;

create or replace function public.voice_turn_close(p_call uuid, p_next text default null, p_outcome text default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  update public.voice_calls set turn_open = null,
    next_step = coalesce(case when p_next in ('hangup', 'transfer') then p_next end, next_step),
    outcome = coalesce(left(p_outcome, 60), outcome)
  where id = p_call;
end $$;

-- A turn pip-voice answered itself without the teammate (the 911 line). Saved so the conversation is complete.
create or replace function public.voice_say(p_call uuid, p_heard text, p_said text) returns void
language plpgsql security definer set search_path to '' as $$
declare c public.voice_calls;
begin
  select * into c from public.voice_calls where id = p_call;
  if not found or c.conversation_id is null then return; end if;
  insert into public.messages (conversation_id, role, content) values
    (c.conversation_id, 'user', left(coalesce(p_heard, ''), 1000)), (c.conversation_id, 'assistant', left(coalesce(p_said, ''), 1400));
end $$;

-- ---------- may this call be transferred to a person right now? ----------
create or replace function public.voice_handoff(p_call uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare c public.voice_calls; pl public.phone_lines; b public.businesses; v_local timestamp; v_day text; v_from time; v_to time;
begin
  select * into c from public.voice_calls where id = p_call;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'no_call'); end if;
  select * into pl from public.phone_lines where business_id = c.business_id;
  select * into b from public.businesses where id = c.business_id;
  if pl.handoff_number is null then return jsonb_build_object('allowed', false, 'reason', 'no_number'); end if;
  if pl.handoff_hours is null or b.timezone is null then return jsonb_build_object('allowed', false, 'reason', 'no_hours'); end if;
  v_local := now() at time zone b.timezone;
  v_day := lower(to_char(v_local, 'dy'));
  begin
    v_from := (pl.handoff_hours->v_day->>0)::time; v_to := (pl.handoff_hours->v_day->>1)::time;
  exception when others then return jsonb_build_object('allowed', false, 'reason', 'bad_hours');
  end;
  if v_from is null or v_to is null or v_local::time < v_from or v_local::time >= v_to then
    return jsonb_build_object('allowed', false, 'reason', 'outside_hours');
  end if;
  return jsonb_build_object('allowed', true, 'number', pl.handoff_number, 'pip_number', pl.pip_number);
end $$;

-- ---------- the speaking side of the call has closed: what does Twilio do next? ----------
create or replace function public.voice_call_after(p_call_sid text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.voice_calls; h jsonb; v_name text;
begin
  select * into c from public.voice_calls where call_sid = p_call_sid for update;
  if not found then return jsonb_build_object('do', 'unknown'); end if;
  select name into v_name from public.businesses where id = c.business_id;
  if c.next_step = 'transfer' then
    h := public.voice_handoff(c.id);
    if coalesce((h->>'allowed')::boolean, false) then
      update public.voice_calls set outcome = 'transferred', turn_open = null where id = c.id;
      return jsonb_build_object('do', 'transfer', 'number', h->>'number', 'pip_number', h->>'pip_number', 'call', c.id, 'name', v_name);
    end if;
    return jsonb_build_object('do', 'hangup', 'call', c.id, 'name', v_name);
  end if;
  if c.next_step = 'hangup' then return jsonb_build_object('do', 'hangup', 'call', c.id, 'name', v_name); end if;
  -- Nobody chose to end it: the speech service dropped the call.
  update public.voice_calls set outcome = coalesce(outcome, 'cut_off'), turn_open = null where id = c.id;
  return jsonb_build_object('do', 'cut_off', 'call', c.id, 'name', v_name, 'hint', c.contact_hint, 'turns', c.turns);
end $$;

-- ---------- a call could not be connected at all ----------
create or replace function public.voice_call_fail(p_call_sid text, p_reason text) returns void
language plpgsql security definer set search_path to '' as $$
declare c public.voice_calls;
begin
  select * into c from public.voice_calls where call_sid = p_call_sid for update;
  if not found or c.state in ('ended', 'failed') then return; end if;
  update public.voice_calls set state = 'failed', outcome = left(coalesce(p_reason, 'failed'), 60), turn_open = null where id = c.id;
  perform public.voice_alert(c.id, 'A phone call could not be answered because the phone system had a problem.'
    || case when c.contact_hint is not null then ' Caller''s number ends in ' || c.contact_hint || '.' else '' end, 'urgent');
end $$;

-- ---------- a call ended: bill it once, per started minute ----------
create or replace function public.voice_call_end(p_call_sid text, p_duration integer, p_status text default 'completed') returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.voice_calls; v_secs integer := greatest(coalesce(p_duration, 0), 0); v_min integer;
begin
  select * into c from public.voice_calls where call_sid = p_call_sid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_call'); end if;
  if c.billed_at is not null then return jsonb_build_object('ok', true, 'already', true, 'minutes', c.minutes); end if;
  v_min := ceil(v_secs / 60.0)::integer;
  update public.voice_calls set state = case when state = 'failed' then 'failed' else 'ended' end, ended_at = now(), duration_secs = v_secs,
    minutes = v_min, billed_at = now(), turn_open = null, outcome = coalesce(outcome, left(coalesce(p_status, 'completed'), 60))
  where id = c.id;
  if v_min > 0 then
    insert into public.usage_events (business_id, spec_id, unit, qty, provider, meta)
    values (c.business_id, c.spec_id, 'voice_minute', v_min, 'twilio', jsonb_build_object('call', c.id, 'seconds', v_secs, 'conversation', c.conversation_id));
  end if;
  return jsonb_build_object('ok', true, 'minutes', v_min);
end $$;

-- Calls Twilio never reported as ended. pip-voice asks Twilio for each one's length and bills it.
create or replace function public.voice_calls_unbilled() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(x.call_sid), '[]'::jsonb) from (
    select call_sid from public.voice_calls
    where billed_at is null and started_at < now() - interval '20 minutes' and started_at > now() - interval '3 days'
    order by started_at limit 20) x
$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('voice_line_ctx', 'voice_alert', 'voice_call_start', 'voice_turn_open', 'voice_turn_close',
             'voice_say', 'voice_handoff', 'voice_call_after', 'voice_call_fail', 'voice_call_end', 'voice_calls_unbilled') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Every 15 minutes, only when a call is waiting to be billed, ask pip-voice to settle it.
select cron.unschedule('pip-voice-sweep') where exists (select 1 from cron.job where jobname = 'pip-voice-sweep');
select cron.schedule('pip-voice-sweep', '*/15 * * * *', $cron$
  select net.http_post(url := 'https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-voice/hooks/sweep', body := '{}'::jsonb,
    headers := '{"content-type":"application/json"}'::jsonb)
  where exists (select 1 from public.voice_calls where billed_at is null and started_at < now() - interval '20 minutes' and started_at > now() - interval '3 days')
$cron$);
