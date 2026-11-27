-- What a phone call must open with, by state (Nov 27, 2026).
--
-- Until now every call opened with "an AI assistant" and "I keep written notes", in every state. The founder's rule
-- is now: say the shortest thing the law requires, and nothing where nothing is required. The decision is made in
-- _shared/call-notices.ts from the rows below; this file holds the rows and makes the database log what was really
-- said instead of assuming both notices.
--
-- NOT LEGAL ADVICE AND NOT REVIEWED BY A LAWYER. The rows come from secondary sources read on November 27, 2026 and,
-- for Idaho, the statute text. Where a law's reach to a business's own phone line could not be confirmed, the row
-- says the notice is required. `reviewed_by_lawyer` stays false on every row.
--
-- What does not vary and is not in this table: a teammate never says it is a person and says it is an AI whenever
-- asked. That is enforced in code on every reply (honest() in _shared/call-notices.ts).

alter table public.jurisdiction_rules
  add column if not exists call_ai_notice text,
  add column if not exists call_ai_from date,
  add column if not exists call_notes_notice boolean,
  add column if not exists call_basis text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_rules_call_ai_notice_chk') then
    alter table public.jurisdiction_rules add constraint jurisdiction_rules_call_ai_notice_chk
      check (call_ai_notice is null or call_ai_notice in ('always', 'health', 'on_request'));
  end if;
end $$;

insert into public.jurisdiction_rules as j (state, name, call_ai_notice, call_ai_from, call_notes_notice, call_basis)
values
  ('US', 'Default when a state is not on file', 'always', null, true, 'Used only when the business''s state is not on file: say both, to be safe.'),
  ('ME', 'Maine', 'always', date '2025-09-24', false, '10 M.R.S. 1500-DD (LD 1727): a chatbot in trade, voice included, must be disclosed when a consumer could think it is a person. Read in secondary sources Nov 27, 2026.'),
  ('HI', 'Hawaii', 'always', date '2026-07-14', false, '2026 chatbot law, duty when a reasonable person could be misled. Whether it reaches a business''s own phone line was not confirmed, so the careful answer is used.'),
  ('UT', 'Utah', 'health', null, false, 'Utah Code 13-75 (SB 149 as amended by SB 226, 2025): must say AI when clearly asked (Pip does that everywhere); regulated occupations in high-risk interactions disclose at the start.'),
  ('TX', 'Texas', 'health', null, false, 'TRAIGA (HB 149) and SB 1188: AI used in relation to health care services must be disclosed. Whether front-desk scheduling counts is untested, so health businesses say it.'),
  ('CO', 'Colorado', 'always', date '2027-01-01', false, 'HB 26-1263 (conversational AI), reported by one secondary source as notice at first interaction from Jan 1, 2027; reach not confirmed, so the careful answer is used. The 2024 AI Act was replaced by SB 26-189, which is about automated decisions, not phone lines.'),
  ('OR', 'Oregon', 'always', date '2027-01-01', false, '2026 chatbot law (SB 1546): disclose when a person could think it is human, from Jan 1, 2027. Described as a companion law; reach not confirmed, so the careful answer is used. Phone recording is one-party.'),
  ('GA', 'Georgia', 'always', date '2027-07-01', false, 'SB 540 (2026), from July 1, 2027. Its exclusion applies only to a bot that does not keep a relationship across interactions; a teammate that remembers callers may not qualify, so the careful answer is used.'),
  ('NE', 'Nebraska', 'always', date '2027-07-01', false, 'LB 525 (2026), sections 12 to 18, operative July 1, 2027. Not reviewed, so the careful answer is used.'),
  ('ID', 'Idaho', 'on_request', null, false, 'Conversational AI Safety Act (S 1297, Idaho Code 48-21xx), in force July 1, 2027. It excludes a chatbot used only for customer service or a business''s operational purposes (read at legislature.idaho.gov Nov 27, 2026). Recording is one-party.'),
  ('CA', 'California', 'on_request', null, true, 'AB 1609 (customer service chatbots, from Jan 1, 2027) covers only businesses with over $500M revenue. SB 243 excludes customer service bots. The bot law (SB 1001) is about online bots. Recording is all-party (Penal Code 632, 632.7), and a speech vendor may count as a third party (Penal Code 631).'),
  ('WA', 'Washington', 'on_request', null, true, 'ESHB 2225 (2026) is a companion chatbot law, from Jan 1, 2027. Recording is all-party (RCW 9.73.030).'),
  ('CT', 'Connecticut', 'on_request', null, true, 'Public Act 26-15 covers chatbots marketed as companions. Recording a phone call needs all-party consent or notice (C.G.S. 52-570d).'),
  ('NY', 'New York', 'on_request', null, false, 'GBL articles 47 and 48 are AI companion laws and exclude customer service. Recording is one-party.'),
  ('RI', 'Rhode Island', 'on_request', null, false, '2026 S 2195 Sub A is an AI companion law, from Jan 1, 2027. Not reviewed beyond that.'),
  ('IA', 'Iowa', 'on_request', null, false, 'SF 2417 (2026), applies July 1, 2027, excludes tools primarily marketed for commercial use by businesses.'),
  ('DE', 'Delaware', 'on_request', null, true, 'Recording statutes conflict (11 Del. C. 1335, 2402); treated as all-party.'),
  ('FL', 'Florida', 'on_request', null, true, 'Recording is all-party (Fla. Stat. 934.03).'),
  ('IL', 'Illinois', 'on_request', null, true, 'Recording is all-party (720 ILCS 5/14-2).'),
  ('MD', 'Maryland', 'on_request', null, true, 'Recording is all-party (Cts. & Jud. Proc. 10-402).'),
  ('MA', 'Massachusetts', 'on_request', null, true, 'Recording is all-party (G.L. c. 272, s. 99).'),
  ('MI', 'Michigan', 'on_request', null, true, 'Recording law is contested (MCL 750.539c); treated as all-party.'),
  ('MT', 'Montana', 'on_request', null, true, 'Recording is all-party (MCA 45-8-213).'),
  ('NV', 'Nevada', 'on_request', null, true, 'Phone recording is all-party (NRS 200.620).'),
  ('NH', 'New Hampshire', 'on_request', null, true, 'Recording is all-party (RSA 570-A:2).'),
  ('PA', 'Pennsylvania', 'on_request', null, true, 'Recording is all-party (18 Pa.C.S. 5704).')
on conflict (state) do update set call_ai_notice = excluded.call_ai_notice, call_ai_from = excluded.call_ai_from,
  call_notes_notice = excluded.call_notes_notice, call_basis = excluded.call_basis, updated_at = now();

-- A phone line's own settings: follow the law (the default) or always say it is an AI; and, optionally, its own voice.
alter table public.phone_lines
  add column if not exists ai_notice text not null default 'law',
  add column if not exists voice_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'phone_lines_ai_notice_chk') then
    alter table public.phone_lines add constraint phone_lines_ai_notice_chk check (ai_notice in ('law', 'always'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'phone_lines_voice_id_chk') then
    alter table public.phone_lines add constraint phone_lines_voice_id_chk check (voice_id is null or voice_id ~ '^[A-Za-z0-9]{15,40}$');
  end if;
end $$;

-- ---------- the line: also whether it is a health business, and the line's own settings ----------
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
    'spec', v_spec, 'teammate', v_mate, 'spec_status', v_status, 'test', v_test,
    'health', coalesce(b.health_lane, false), 'ai_notice', pl.ai_notice, 'voice', pl.voice_id);
end $$;

-- ---------- starting a call: log what was really said ----------
drop function if exists public.voice_call_start(text, text, text, text, text, text);
create or replace function public.voice_call_start(p_to text, p_from text, p_call_sid text, p_pass_hash text, p_greeting text, p_wording text default 'v1',
  p_ai_notice boolean default true, p_notes_notice boolean default true, p_why jsonb default null)
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
  values (v_biz, v_spec, v_conv, p_call_sid, p_pass_hash, v_hash, v_hint,
          jsonb_build_object('wording', left(p_wording, 20), 'ai_notice', coalesce(p_ai_notice, true), 'notes_notice', coalesce(p_notes_notice, true))
          || case when p_why is not null and jsonb_typeof(p_why) = 'object' and octet_length(p_why::text) <= 400 then jsonb_build_object('why', p_why) else '{}'::jsonb end)
  returning * into c;
  insert into public.messages (conversation_id, role, content) values (v_conv, 'assistant', left(p_greeting, 600));
  -- Only what was really said is logged. For a live teammate the supervisor trigger on messages logs the AI notice
  -- itself; for a test one, log it here.
  if coalesce(p_ai_notice, true) and x->>'spec_status' is distinct from 'live' then
    insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
    values (v_biz, v_spec, 'ai_disclosure', 'voice', v_hash, jsonb_build_object('conversation', v_conv, 'call', c.id, 'wording', left(p_wording, 20)));
  end if;
  if coalesce(p_notes_notice, true) then
    insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
    values (v_biz, v_spec, 'recording_notice', 'voice', v_hash,
            jsonb_build_object('call', c.id, 'audio_recorded', false, 'said', case when p_wording like 'v1%' then 'written notes are kept' else 'this call is transcribed' end, 'wording', left(p_wording, 20)));
  end if;
  return jsonb_build_object('ok', true, 'call', c.id, 'conversation', v_conv, 'spec', v_spec, 'name', x->>'name', 'teammate', x->>'teammate');
end $$;
revoke all on function public.voice_call_start(text, text, text, text, text, text, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.voice_call_start(text, text, text, text, text, text, boolean, boolean, jsonb) to service_role;

-- ---------- the supervisor: a call that did not have to say AI is not a missing notice ----------
create or replace function public.portal_msg_supervise() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c record; v_spec uuid; v_channel text;
begin
  if new.role <> 'assistant' then return new; end if;
  if exists (select 1 from public.messages m where m.conversation_id = new.conversation_id and m.role = 'assistant' and m.id < new.id) then
    return new;
  end if;
  select cv.spec_id, cv.channel into v_spec, v_channel from public.conversations cv where cv.id = new.conversation_id;
  select * into c from public.portal_spec_ctx(v_spec);
  if c.business_id is null or c.spec_status <> 'live' then return new; end if;
  if new.content ~* '(\m(ai|artificial intelligence|automated assistant|virtual assistant|bot)\M|\ma\.i\.)' then
    insert into public.compliance_events (business_id, spec_id, kind, channel, detail)
    values (c.business_id, v_spec, 'ai_disclosure', left(coalesce(v_channel, 'chat'), 20), jsonb_build_object('conversation', new.conversation_id));
  elsif v_channel = 'voice' and exists (select 1 from public.voice_calls vc where vc.conversation_id = new.conversation_id and vc.detail->>'ai_notice' = 'false') then
    -- A phone call opens with an AI notice only where the law asks for one (voice_call_start records the decision).
    null;
  else
    insert into public.portal_issues (business_id, spec_id, opened_by, body, status)
    values (c.business_id, v_spec, 'supervisor',
            c.teammate || ' opened a ' || replace(coalesce(v_channel, 'chat'), '_', ' ') || ' conversation without saying it is AI in the first message.', 'open');
    insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor)
    values (c.business_id, v_spec, c.teammate, 'supervisor', 'Supervisor flagged a missing AI notice at the start of a conversation', 'info', 'supervisor');
    perform public.portal_notify(c.business_id, 'founder', 'Missing AI notice: ' || c.teammate, 'A conversation started without the AI notice',
      array['Teammate: ' || c.teammate, 'The first message did not say it is AI.', 'Fix the opening line in the Forge and go live again.']);
  end if;
  return new;
exception when others then return new;
end $$;

-- undo (by hand): set every row's call_ai_notice to 'always' and call_notes_notice to true, and every phone line's
--   ai_notice to 'always'; every call then opens with both notices again. The functions can be put back from
--   20261117_02_voice.sql and 20261116_portal_04_runtime_supervisor_cancel.sql.
