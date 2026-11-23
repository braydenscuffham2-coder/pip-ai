-- Job 3: the operator lane. A teammate that runs a whole business process (social posting, review requests, quote
-- follow-up) instead of answering one message at a time. Everything here is dormant until forge_settings.operate_lane
-- is set to true: the flag ships FALSE, the go-live gate refuses an operator while it is off, and no operator send
-- or post passes its guard while it is off. No live row is changed, no live function is changed in what it does for any
-- spec that has no `operate` block.
--
-- What this adds: one primitive kind ('operate') and three primitives; one pause reason ('missing_approval'); three
-- tables (operator_process_rules, operator_cases, operator_approvals) with RLS on and service_role-only rights;
-- thirteen service_role-only functions; and two re-created live functions (portal_compile_manifest copies spec.operate
-- into the manifest; portal_golive_gate adds one block at the end for specs that have an operate block).
-- Nothing here sends anything. The live consent/hours/attempts gate (portal_outbound_check) is NOT touched.
--
-- Rollback (in this order; tested on a copy of the live shapes in tests/db/operate.test.mjs):
--   -- (1) put the two live functions back first, so nothing calls a function we are about to drop:
--   create or replace function public.portal_golive_gate() returns trigger
--     language plpgsql security definer set search_path to '' as $function$
--   declare b public.businesses; miss text;
--   begin
--     if new.status = 'live' and coalesce(old.status, '') <> 'live' then
--       if new.order_id is null or not public.portal_flag('portal_golive_gate', true) then return new; end if;
--       select bz.* into b from public.build_orders o join public.businesses bz on bz.id = o.business_id where o.id = new.order_id;
--       if not found then return new; end if;
--   
--       if b.status in ('disconnected', 'cancelled') then
--         raise exception 'portal: this business disconnected Pip, so nothing can go live' using errcode = 'P0001';
--       end if;
--       if b.price_accepted_at is null then
--         raise exception 'portal: the owner has not accepted the price yet' using errcode = 'P0001';
--       end if;
--       if b.state is null or b.timezone is null then
--         raise exception 'portal: the business state and time zone are not set, so local rules cannot be applied' using errcode = 'P0001';
--       end if;
--   
--       select string_agg(c.label, ', ' order by c.sort) into miss
--       from public.business_connections bc join public.connection_catalog c on c.slot = bc.slot
--       where bc.business_id = b.id and bc.blocks_golive and bc.status <> 'active' and new.skill_id = any(bc.agents);
--       if miss is not null then
--         raise exception 'portal: connect these before going live: %', miss using errcode = 'P0001';
--       end if;
--   
--       if b.health_lane then
--         select string_agg(x.party, ', ') into miss from public.portal_health_missing(b.id, new.id) x;
--         if miss is not null then
--           raise exception 'health: signed agreements are missing for: %', miss using errcode = 'P0001';
--         end if;
--       end if;
--   
--       if exists (select 1 from public.agent_manifests am where am.spec_id = new.id
--                  and am.manifest->'uses' ?| array['edge_box','nvr_pull','vision_count','vision_queue','vision_zones'])
--          and exists (select 1 from public.jurisdiction_rules j where j.state = b.state and j.biometric is not null)
--          and not exists (select 1 from public.business_agreements a where a.business_id = b.id and a.kind = 'camera_signoff' and a.status = 'signed') then
--         raise exception 'camera: % has a biometric privacy law; record a legal sign-off for this business before a camera agent goes live', b.state using errcode = 'P0001';
--       end if;
--     end if;
--     return new;
--   end $function$;
--   create or replace function public.portal_compile_manifest(p_spec uuid) returns jsonb
--     language plpgsql security definer set search_path to '' as $function$
--   declare
--     s public.skill_specs; o public.build_orders; a jsonb; v_uses text[]; conns jsonb; m jsonb;
--   begin
--     select * into s from public.skill_specs where id = p_spec;
--     if not found or s.order_id is null then return null; end if;
--     select * into o from public.build_orders where id = s.order_id;
--     if not found or o.business_id is null then return null; end if;
--   
--     select x into a from jsonb_array_elements(public.portal_arr(o."order"->'package'->'agents')) x
--     where x->>'agent_id' = s.skill_id limit 1;
--   
--     v_uses := array(select distinct u from (
--         select jsonb_array_elements_text(public.portal_arr(s.brain->'agent'->'uses')) as u
--         union all select jsonb_array_elements_text(public.portal_arr(a->'uses'))
--         union all select jsonb_array_elements_text(public.portal_arr(s.spec->'connections'))
--         union all select jsonb_array_elements_text(public.portal_arr(s.spec->'channels'))
--         union all select e->>'block' from jsonb_array_elements(public.portal_arr(s.quote->'integration')) e
--       ) q where u is not null order by u);
--   
--     select coalesce(jsonb_agg(jsonb_build_object(
--         'slot', c.slot, 'label', c.label, 'auth', c.kind,
--         'blocks', to_jsonb(array(select u from unnest(v_uses) u where u = any(c.blocks))),
--         'choices', c.choices, 'scopes', c.scopes, 'access', c.access,
--         'required', true, 'blocks_golive', c.blocks_golive, 'lead_time', c.lead_time, 'health', c.phi_exposure
--       ) order by c.sort, c.slot), '[]'::jsonb)
--     into conns
--     from public.connection_catalog c where c.blocks && v_uses;
--   
--     m := jsonb_build_object(
--       'version', 'manifest/1', 'skill_id', s.skill_id, 'spec_version', s.version,
--       'name', coalesce(nullif(a->>'name', ''), nullif(s.spec->>'name', ''), s.skill_id),
--       'teammate', case when jsonb_typeof(a->'teammate') = 'object' then a->'teammate'->>'name' else a->>'teammate' end,
--       'role', case when jsonb_typeof(a->'teammate') = 'object' then a->'teammate'->>'role' end,
--       'uses', to_jsonb(v_uses), 'connections', conns);
--   
--     insert into public.agent_manifests (spec_id, business_id, skill_id, manifest)
--     values (s.id, o.business_id, s.skill_id, m)
--     on conflict (spec_id) do update set business_id = excluded.business_id, skill_id = excluded.skill_id, manifest = excluded.manifest, compiled_at = now();
--   
--     if exists (select 1 from public.primitives p where p.id = any(v_uses) and p.needs_baa) then
--       update public.businesses set health_lane = true, updated_at = now() where id = o.business_id and not health_lane;
--     end if;
--   
--     perform public.portal_sync_connections(o.business_id);
--     return m;
--   end $function$;
--   drop function public.operator_touch_decision(text, integer, timestamptz, timestamptz, integer, integer, integer, timestamptz, integer, text, text, text);
--   drop function public.operator_close_reason(text, integer, timestamptz, integer, integer, timestamptz, text[], boolean, boolean, boolean);
--   drop function public.operator_case_open(uuid, text, text, text, text, text);
--   drop function public.operator_case_touch(uuid, integer, timestamptz, text, text, text);
--   drop function public.operator_case_close(uuid, text, boolean);
--   drop function public.operator_case_signal(uuid, text, boolean, boolean, boolean);
--   drop function public.operator_case_due(uuid, integer);
--   drop function public.operator_send_check(uuid, text, text, integer);
--   drop function public.operator_approval_request(uuid, text, text, jsonb);
--   drop function public.operator_approval_approve(bigint, text);
--   drop function public.operator_approval_revoke(bigint, text);
--   drop function public.operator_approved_current(uuid);
--   drop function public.operator_post_reserve(uuid, text);
--   delete from public.forge_settings where key = 'operate_lane';
--   update public.agent_pauses set reason = 'gate' where reason = 'missing_approval';
--   drop table public.operator_approvals;
--   drop table public.operator_cases;
--   drop table public.operator_process_rules;
--   delete from public.primitives where id in ('operate_content_social','operate_review_requests','operate_quote_followup');
--   alter table public.agent_pauses drop constraint agent_pauses_reason_check;
--   alter table public.agent_pauses add constraint agent_pauses_reason_check check (reason = any (array[
--     'owner','staff','expired_access','password_changed','mfa','out_of_scope','supervisor','billing','disconnect','gate','founder','missing_connection','missing_agreement']));
--   alter table public.primitives drop constraint primitives_kind_check;
--   alter table public.primitives add constraint primitives_kind_check check (kind = any (array[
--     'channel','trigger','connection','sense','reason','act','sink','compute','knowledge','guard']));

-- 1. Vocabulary: a new primitive kind and a new pause reason.
alter table public.primitives drop constraint primitives_kind_check;
alter table public.primitives add constraint primitives_kind_check check (kind = any (array[
  'channel','trigger','connection','sense','reason','act','sink','compute','knowledge','guard','operate']));
alter table public.agent_pauses drop constraint agent_pauses_reason_check;
alter table public.agent_pauses add constraint agent_pauses_reason_check check (reason = any (array[
  'owner','staff','expired_access','password_changed','mfa','out_of_scope','supervisor','billing','disconnect','gate',
  'founder','missing_connection','missing_agreement','missing_approval']));

-- 2. The three operator processes as primitives (the Brain and Forge read them like any other).
insert into public.primitives (id, kind, label, how, limits, runtime, tier, effort, cost_band, risk, providers, inputs, outputs, test_strategy, outbound, requires) values
 ('operate_content_social', 'operate', 'Run the business''s social posting',
  'Plans a week of posts in the owner''s approved voice, sends them for the owner''s decision, and publishes the approved ones.',
  'Posts only to accounts the owner approved. The first posts, and any post with a price, offer, guarantee or customer in it, need the owner. Three posts a week at most. Never invents a review.',
  'shared', 'build', 3, 'low', array['public_post'], '[{"name": "meta", "role": "posting"}]'::jsonb,
  array['schedule','owner_decision'], array['post'], 'conversation_sim', false,
  array['social_posting','owner_approval','draft_for_approval']),
 ('operate_review_requests', 'operate', 'Ask finished-job customers for a review',
  'When a job is marked completed, asks that customer for a review, once, then once more if they have not answered.',
  'Two asks at most, three days apart, inside calling hours, only to customers with a consent record. Stops at a reply, a STOP, or fourteen days.',
  'shared', 'build', 3, 'low', array['ai_disclosure','consent'], '[]'::jsonb,
  array['record_changed'], array['message'], 'conversation_sim', true,
  array['consent_ledger','email','handoff']),
 ('operate_quote_followup', 'operate', 'Follow up on quotes that went quiet',
  'When a deal reaches quote sent, follows up with that customer until they answer or the window ends.',
  'Three follow-ups at most, three days apart, inside calling hours. Never mentions an amount. Stops at a reply, a STOP, or fourteen days.',
  'shared', 'build', 3, 'low', array['ai_disclosure','consent'], '[]'::jsonb,
  array['record_changed'], array['message'], 'conversation_sim', true,
  array['consent_ledger','email','handoff'])
on conflict (id) do nothing;

-- 3. The ceilings, one row per process. The TypeScript RULES and these rows are tested to be equal.
create table public.operator_process_rules (
  process text primary key check (process in ('content_social','review_requests','quote_followup')),
  reaches text not null check (reaches in ('public','customer')),
  max_touches integer not null check (max_touches between 1 and 4),
  min_gap_hours integer not null check (min_gap_hours >= 24),
  max_days integer not null check (max_days between 1 and 30),
  first_n integer check (first_n is null or first_n between 1 and 50),
  weekly_cap integer check (weekly_cap is null or weekly_cap between 1 and 7),
  purposes jsonb not null default '{}'::jsonb
);
insert into public.operator_process_rules (process, reaches, max_touches, min_gap_hours, max_days, first_n, weekly_cap, purposes) values
 ('content_social',  'public',   3, 24, 7,  5,    3,    '{}'::jsonb),
 ('review_requests', 'customer', 2, 72, 14, null, null, '{"email":"transactional","sms":"marketing"}'::jsonb),
 ('quote_followup',  'customer', 3, 72, 14, null, null, '{"email":"transactional","sms":"transactional"}'::jsonb);

-- 4. Cases: one row per customer (or per post) the operator is working. The cadence lives here, not in a prompt.
create table public.operator_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  spec_id uuid not null,
  process text not null references public.operator_process_rules(process),
  case_key text not null check (length(case_key) between 1 and 200),
  contact_hash text,
  stage text,
  touches integer not null default 0 check (touches >= 0),
  next_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','done','stopped')),
  closed_reason text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  last_touch_at timestamptz,
  rules jsonb not null,
  unique (spec_id, case_key)
);
create index operator_cases_due on public.operator_cases (spec_id, next_at) where status = 'open';
create index operator_cases_contact on public.operator_cases (business_id, contact_hash) where status = 'open';

-- 5. Approvals the owner gives once: the brand voice, and each account an operator may post to.
create table public.operator_approvals (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  spec_id uuid not null,
  kind text not null check (kind in ('brand_voice','account')),
  subject text not null default '',
  voice jsonb,
  version integer not null default 1,
  status text not null default 'requested' check (status in ('requested','approved','revoked')),
  requested_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  revoked_at timestamptz
);
create index operator_approvals_spec on public.operator_approvals (spec_id, kind, subject);

alter table public.operator_process_rules enable row level security;
alter table public.operator_cases enable row level security;
alter table public.operator_approvals enable row level security;
revoke all on public.operator_process_rules, public.operator_cases, public.operator_approvals from public, anon, authenticated;
grant select, insert, update, delete on public.operator_process_rules, public.operator_cases, public.operator_approvals to service_role;

-- 6. The pure rules, same order as touchDecision / closeReason in _shared/operate.ts (a shared table tests both).
create or replace function public.operator_touch_decision(
  p_status text, p_touches integer, p_opened_at timestamptz, p_last_touch_at timestamptz,
  p_max_touches integer, p_min_gap_hours integer, p_max_days integer,
  p_now timestamptz, p_touch integer, p_from text, p_to text, p_tz text
) returns text language plpgsql immutable set search_path to '' as $$
declare clock text;
begin
  if p_status <> 'open' then return 'closed'; end if;
  if p_touch <> p_touches + 1 then return 'wrong_touch'; end if;
  if p_touches >= p_max_touches then return 'max_touches'; end if;
  if extract(epoch from (p_now - p_opened_at)) * 1000 > p_max_days::numeric * 86400000 then return 'expired'; end if;
  if p_last_touch_at is not null and extract(epoch from (p_now - p_last_touch_at)) * 1000 < p_min_gap_hours::numeric * 3600000 then return 'too_soon'; end if;
  clock := to_char(p_now at time zone coalesce(nullif(p_tz, ''), 'UTC'), 'HH24:MI');
  if clock collate "C" < p_from collate "C" or clock collate "C" >= p_to collate "C" then return 'outside_hours'; end if;
  return null;
end $$;

create or replace function public.operator_close_reason(
  p_status text, p_touches integer, p_opened_at timestamptz, p_max_touches integer, p_max_days integer,
  p_now timestamptz, p_closes_when text[], p_replied boolean, p_opted_out boolean, p_completed boolean
) returns text language plpgsql immutable set search_path to '' as $$
begin
  if p_status <> 'open' then return null; end if;
  if coalesce(p_opted_out, false) then return 'opted_out'; end if;
  if coalesce(p_replied, false) and 'replied' = any (coalesce(p_closes_when, '{}')) then return 'replied'; end if;
  if coalesce(p_completed, false) and 'completed' = any (coalesce(p_closes_when, '{}')) then return 'completed'; end if;
  if p_touches >= p_max_touches then return 'max_touches'; end if;
  if extract(epoch from (p_now - p_opened_at)) * 1000 > p_max_days::numeric * 86400000 then return 'max_days'; end if;
  return null;
end $$;

-- 7. Cases. Every function here is service_role only; none of them sends anything.
create or replace function public.operator_case_open(
  p_spec uuid, p_process text, p_case_key text, p_contact text default null, p_contact_kind text default 'email', p_stage text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare c record; r public.operator_process_rules; v_id uuid; v_hash text;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  select * into r from public.operator_process_rules where process = p_process;
  if c.business_id is null or r.process is null or nullif(btrim(coalesce(p_case_key, '')), '') is null then return null; end if;
  v_hash := case when nullif(btrim(coalesce(p_contact, '')), '') is null then null
                 else public.portal_contact_hash(c.business_id, p_contact_kind, p_contact) end;
  insert into public.operator_cases (business_id, spec_id, process, case_key, contact_hash, stage, rules)
  values (c.business_id, p_spec, p_process, left(p_case_key, 200), v_hash, p_stage,
          jsonb_build_object('max_touches', r.max_touches, 'min_gap_hours', r.min_gap_hours, 'max_days', r.max_days,
                             'first_n', r.first_n, 'weekly_cap', r.weekly_cap, 'purposes', r.purposes))
  on conflict (spec_id, case_key) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.operator_cases where spec_id = p_spec and case_key = left(p_case_key, 200); end if;
  return v_id;
end $$;

-- Reserve touch number p_touch BEFORE anything is sent. Concurrent callers queue on the row lock, so two workers can
-- never both take touch 2. A refusal says which rule stopped it.
create or replace function public.operator_case_touch(
  p_case uuid, p_touch integer, p_now timestamptz default now(),
  p_from text default '08:00', p_to text default '21:00', p_tz text default 'UTC'
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare k public.operator_cases; why text; mx integer; gap integer;
begin
  select * into k from public.operator_cases where id = p_case for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'no_case'); end if;
  mx := (k.rules->>'max_touches')::integer; gap := (k.rules->>'min_gap_hours')::integer;
  why := public.operator_touch_decision(k.status, k.touches, k.opened_at, k.last_touch_at, mx, gap,
           (k.rules->>'max_days')::integer, p_now, p_touch, p_from, p_to, p_tz);
  if why is not null then
    if why = 'expired' then
      update public.operator_cases set status = 'done', closed_reason = 'max_days', closed_at = p_now where id = k.id and status = 'open';
    end if;
    return jsonb_build_object('ok', false, 'why', why);
  end if;
  update public.operator_cases
     set touches = touches + 1, last_touch_at = p_now, next_at = p_now + make_interval(hours => gap),
         status = case when touches + 1 >= mx then 'done' else 'open' end,
         closed_reason = case when touches + 1 >= mx then 'max_touches' else null end,
         closed_at = case when touches + 1 >= mx then p_now else null end
   where id = k.id;
  return jsonb_build_object('ok', true, 'touch', p_touch, 'of', mx);
end $$;

create or replace function public.operator_case_close(p_case uuid, p_reason text, p_stopped boolean default false)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  update public.operator_cases
     set status = case when p_stopped then 'stopped' else 'done' end, closed_reason = left(p_reason, 80), closed_at = now()
   where id = p_case and status = 'open';
  return found;
end $$;

-- A signal arrived (reply, STOP, job completed). Closes the case if the spec's closing list says so.
create or replace function public.operator_case_signal(
  p_spec uuid, p_case_key text, p_replied boolean default false, p_opted_out boolean default false, p_completed boolean default false
) returns text language plpgsql security definer set search_path to '' as $$
declare k public.operator_cases; closes text[]; why text;
begin
  select * into k from public.operator_cases where spec_id = p_spec and case_key = left(p_case_key, 200) for update;
  if not found or k.status <> 'open' then return null; end if;
  select coalesce(array(select jsonb_array_elements_text(coalesce(s.spec->'operate'->'case'->'closes_when', '[]'::jsonb))), '{}')
    into closes from public.skill_specs s where s.id = p_spec;
  why := public.operator_close_reason(k.status, k.touches, k.opened_at, (k.rules->>'max_touches')::integer,
           (k.rules->>'max_days')::integer, now(), closes, p_replied, p_opted_out, p_completed);
  if why is not null then
    update public.operator_cases set status = case when why = 'opted_out' then 'stopped' else 'done' end,
           closed_reason = why, closed_at = now() where id = k.id;
  end if;
  return why;
end $$;

-- Open cases that are due now. A paused job, or a spec that is not live, gets nothing. Expired cases close here.
create or replace function public.operator_case_due(p_spec uuid, p_limit integer default 20)
returns table (case_id uuid, case_key text, stage text, touches integer)
language plpgsql security definer set search_path to '' as $$
begin
  update public.operator_cases k set status = 'done', closed_reason = 'max_days', closed_at = now()
   where k.spec_id = p_spec and k.status = 'open'
     and extract(epoch from (now() - k.opened_at)) * 1000 > (k.rules->>'max_days')::numeric * 86400000;
  if not exists (select 1 from public.skill_specs s where s.id = p_spec and s.status = 'live') then return; end if;
  if exists (select 1 from public.agent_pauses p where p.spec_id = p_spec and p.resumed_at is null
             and (p.job is null or p.job in (select x->>'job' from public.skill_specs s, jsonb_array_elements(coalesce(s.spec->'operate'->'stages', '[]'::jsonb)) x where s.id = p_spec)
                  or p.job in (select 'job:' || (x->>'job') from public.skill_specs s, jsonb_array_elements(coalesce(s.spec->'operate'->'stages', '[]'::jsonb)) x where s.id = p_spec))) then return; end if;
  return query
    select k.id, k.case_key, k.stage, k.touches from public.operator_cases k
     where k.spec_id = p_spec and k.status = 'open' and k.next_at <= now() and k.touches < (k.rules->>'max_touches')::integer
     order by k.next_at limit greatest(1, least(coalesce(p_limit, 20), 100));
end $$;

-- 8. The per-send guard the runtime calls with the case it is about to touch. It says which purpose applies on
-- this channel; the live consent gate still decides yes or no on the contact.
create or replace function public.operator_send_check(p_spec uuid, p_case_key text, p_channel text, p_touch integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare k public.operator_cases; purpose text;
begin
  select * into k from public.operator_cases where spec_id = p_spec and case_key = left(coalesce(p_case_key, ''), 200);
  if not found then return jsonb_build_object('ok', false, 'why', 'no_case'); end if;
  if k.status <> 'open' and not (k.status = 'done' and k.closed_reason = 'max_touches' and k.touches = p_touch) then
    return jsonb_build_object('ok', false, 'why', 'closed');
  end if;
  if k.touches <> p_touch then return jsonb_build_object('ok', false, 'why', 'touch_not_reserved'); end if;
  purpose := k.rules->'purposes'->>p_channel;
  if purpose is null then return jsonb_build_object('ok', false, 'why', 'channel_not_allowed'); end if;
  if not public.portal_flag('operate_lane', false) then return jsonb_build_object('ok', false, 'why', 'lane_off'); end if;
  return jsonb_build_object('ok', true, 'purpose', purpose, 'contact_hash', k.contact_hash);
end $$;

-- 9. Approvals. The current approval is the newest approved row for (spec, kind, subject) that was not revoked.
create or replace function public.operator_approval_request(p_spec uuid, p_kind text, p_subject text default '', p_voice jsonb default null)
returns bigint language plpgsql security definer set search_path to '' as $$
declare c record; v_id bigint; v_ver integer;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null or p_kind not in ('brand_voice','account') then return null; end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.operator_approvals where spec_id = p_spec and kind = p_kind and subject = coalesce(p_subject, '');
  insert into public.operator_approvals (business_id, spec_id, kind, subject, voice, version)
  values (c.business_id, p_spec, p_kind, left(coalesce(p_subject, ''), 200), p_voice, v_ver) returning id into v_id;
  return v_id;
end $$;

create or replace function public.operator_approval_approve(p_id bigint, p_by text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare a public.operator_approvals;
begin
  select * into a from public.operator_approvals where id = p_id for update;
  if not found or a.status <> 'requested' then return false; end if;
  update public.operator_approvals set status = 'revoked', revoked_at = now()
   where spec_id = a.spec_id and kind = a.kind and subject = a.subject and status = 'approved';
  update public.operator_approvals set status = 'approved', approved_by = left(p_by, 120), approved_at = now() where id = p_id;
  return true;
end $$;

-- Revoking pauses every stage job of the operator (reason missing_approval) so nothing publishes meanwhile.
create or replace function public.operator_approval_revoke(p_id bigint, p_by text default 'owner')
returns boolean language plpgsql security definer set search_path to '' as $$
declare a public.operator_approvals; j text;
begin
  select * into a from public.operator_approvals where id = p_id for update;
  if not found or a.status = 'revoked' then return false; end if;
  update public.operator_approvals set status = 'revoked', revoked_at = now() where id = p_id;
  for j in select distinct x->>'job' from public.skill_specs s, jsonb_array_elements(coalesce(s.spec->'operate'->'stages', '[]'::jsonb)) x
            where s.id = a.spec_id and x->>'job' is not null loop
    perform public.portal_job_pause(a.spec_id, j, 'missing_approval', 'The owner took back an approval (' || a.kind || ').');
  end loop;
  return true;
end $$;

-- True when every approval the spec's operate block asks for is currently approved.
create or replace function public.operator_approved_current(p_spec uuid)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare o jsonb; acct text;
begin
  select s.spec->'operate' into o from public.skill_specs s where s.id = p_spec;
  if o is null then return true; end if;
  if coalesce((o->'approvals'->>'brand_voice')::boolean, false) and not exists (
       select 1 from public.operator_approvals a where a.spec_id = p_spec and a.kind = 'brand_voice' and a.status = 'approved') then
    return false;
  end if;
  for acct in select jsonb_array_elements_text(coalesce(o->'approvals'->'accounts', '[]'::jsonb)) loop
    if not exists (select 1 from public.operator_approvals a where a.spec_id = p_spec and a.kind = 'account' and a.subject = acct and a.status = 'approved') then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- 10. Posts. Fails closed: no approved voice and accounts, or the lane off, or the week's cap used, means no post.
-- The text rules (price, offer, guarantee, invented evidence) are checked in TypeScript before this is called.
create or replace function public.operator_post_reserve(p_spec uuid, p_case_key text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_cap integer; v_first integer; v_week integer; v_pub integer; v_id uuid; t jsonb;
begin
  if not public.portal_flag('operate_lane', false) then return jsonb_build_object('ok', false, 'why', 'lane_off'); end if;
  if not public.operator_approved_current(p_spec) then return jsonb_build_object('ok', false, 'why', 'missing_approval'); end if;
  select weekly_cap, first_n into v_cap, v_first from public.operator_process_rules where process = 'content_social';
  perform pg_advisory_xact_lock(hashtext('operator_post:' || p_spec::text));
  select count(*) filter (where last_touch_at > now() - interval '7 days'), count(*) filter (where touches > 0)
    into v_week, v_pub from public.operator_cases where spec_id = p_spec and process = 'content_social';
  if v_week >= v_cap then return jsonb_build_object('ok', false, 'why', 'weekly_cap', 'this_week', v_week); end if;
  v_id := public.operator_case_open(p_spec, 'content_social', p_case_key, null, 'email', 'publish');
  if v_id is null then return jsonb_build_object('ok', false, 'why', 'no_case'); end if;
  t := public.operator_case_touch(v_id, 1, now(), '00:00', '24:00', 'UTC');
  if not coalesce((t->>'ok')::boolean, false) then return jsonb_build_object('ok', false, 'why', t->>'why'); end if;
  return jsonb_build_object('ok', true, 'published_before', v_pub, 'this_week', v_week + 1, 'first_n', v_first);
end $$;

revoke all on function
  public.operator_touch_decision(text, integer, timestamptz, timestamptz, integer, integer, integer, timestamptz, integer, text, text, text),
  public.operator_close_reason(text, integer, timestamptz, integer, integer, timestamptz, text[], boolean, boolean, boolean),
  public.operator_case_open(uuid, text, text, text, text, text),
  public.operator_case_touch(uuid, integer, timestamptz, text, text, text),
  public.operator_case_close(uuid, text, boolean),
  public.operator_case_signal(uuid, text, boolean, boolean, boolean),
  public.operator_case_due(uuid, integer),
  public.operator_send_check(uuid, text, text, integer),
  public.operator_approval_request(uuid, text, text, jsonb),
  public.operator_approval_approve(bigint, text),
  public.operator_approval_revoke(bigint, text),
  public.operator_approved_current(uuid),
  public.operator_post_reserve(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.operator_touch_decision(text, integer, timestamptz, timestamptz, integer, integer, integer, timestamptz, integer, text, text, text),
  public.operator_close_reason(text, integer, timestamptz, integer, integer, timestamptz, text[], boolean, boolean, boolean),
  public.operator_case_open(uuid, text, text, text, text, text),
  public.operator_case_touch(uuid, integer, timestamptz, text, text, text),
  public.operator_case_close(uuid, text, boolean),
  public.operator_case_signal(uuid, text, boolean, boolean, boolean),
  public.operator_case_due(uuid, integer),
  public.operator_send_check(uuid, text, text, integer),
  public.operator_approval_request(uuid, text, text, jsonb),
  public.operator_approval_approve(bigint, text),
  public.operator_approval_revoke(bigint, text),
  public.operator_approved_current(uuid),
  public.operator_post_reserve(uuid, text)
to service_role;

-- 11. The manifest carries the operate block (and only for specs that have one; every other manifest is unchanged).
create or replace function public.portal_compile_manifest(p_spec uuid) returns jsonb
  language plpgsql security definer set search_path to '' as $function$
declare
  s public.skill_specs; o public.build_orders; a jsonb; v_uses text[]; conns jsonb; m jsonb;
begin
  select * into s from public.skill_specs where id = p_spec;
  if not found or s.order_id is null then return null; end if;
  select * into o from public.build_orders where id = s.order_id;
  if not found or o.business_id is null then return null; end if;

  select x into a from jsonb_array_elements(public.portal_arr(o."order"->'package'->'agents')) x
  where x->>'agent_id' = s.skill_id limit 1;

  v_uses := array(select distinct u from (
      select jsonb_array_elements_text(public.portal_arr(s.brain->'agent'->'uses')) as u
      union all select jsonb_array_elements_text(public.portal_arr(a->'uses'))
      union all select jsonb_array_elements_text(public.portal_arr(s.spec->'connections'))
      union all select jsonb_array_elements_text(public.portal_arr(s.spec->'channels'))
      union all select e->>'block' from jsonb_array_elements(public.portal_arr(s.quote->'integration')) e
    ) q where u is not null order by u);

  select coalesce(jsonb_agg(jsonb_build_object(
      'slot', c.slot, 'label', c.label, 'auth', c.kind,
      'blocks', to_jsonb(array(select u from unnest(v_uses) u where u = any(c.blocks))),
      'choices', c.choices, 'scopes', c.scopes, 'access', c.access,
      'required', true, 'blocks_golive', c.blocks_golive, 'lead_time', c.lead_time, 'health', c.phi_exposure
    ) order by c.sort, c.slot), '[]'::jsonb)
  into conns
  from public.connection_catalog c where c.blocks && v_uses;

  m := jsonb_build_object(
    'version', 'manifest/1', 'skill_id', s.skill_id, 'spec_version', s.version,
    'name', coalesce(nullif(a->>'name', ''), nullif(s.spec->>'name', ''), s.skill_id),
    'teammate', case when jsonb_typeof(a->'teammate') = 'object' then a->'teammate'->>'name' else a->>'teammate' end,
    'role', case when jsonb_typeof(a->'teammate') = 'object' then a->'teammate'->>'role' end,
    'uses', to_jsonb(v_uses), 'connections', conns);
  if jsonb_typeof(s.spec->'operate') = 'object' then
    m := m || jsonb_build_object('lane', 'operate', 'operate', s.spec->'operate');
  end if;

  insert into public.agent_manifests (spec_id, business_id, skill_id, manifest)
  values (s.id, o.business_id, s.skill_id, m)
  on conflict (spec_id) do update set business_id = excluded.business_id, skill_id = excluded.skill_id, manifest = excluded.manifest, compiled_at = now();

  if exists (select 1 from public.primitives p where p.id = any(v_uses) and p.needs_baa) then
    update public.businesses set health_lane = true, updated_at = now() where id = o.business_id and not health_lane;
  end if;

  perform public.portal_sync_connections(o.business_id);
  return m;
end $function$;

-- 12. Go-live: an operator needs the lane switched on, and (if it posts publicly) the owner's approved voice and accounts.
-- Everything above the new block is the live function, unchanged. The gate only looks at specs that have an operate block.
create or replace function public.portal_golive_gate() returns trigger
  language plpgsql security definer set search_path to '' as $function$
declare b public.businesses; miss text;
begin
  if new.status = 'live' and coalesce(old.status, '') <> 'live' then
    if new.order_id is null or not public.portal_flag('portal_golive_gate', true) then return new; end if;
    select bz.* into b from public.build_orders o join public.businesses bz on bz.id = o.business_id where o.id = new.order_id;
    if not found then return new; end if;

    if b.status in ('disconnected', 'cancelled') then
      raise exception 'portal: this business disconnected Pip, so nothing can go live' using errcode = 'P0001';
    end if;
    if b.price_accepted_at is null then
      raise exception 'portal: the owner has not accepted the price yet' using errcode = 'P0001';
    end if;
    if b.state is null or b.timezone is null then
      raise exception 'portal: the business state and time zone are not set, so local rules cannot be applied' using errcode = 'P0001';
    end if;

    select string_agg(c.label, ', ' order by c.sort) into miss
    from public.business_connections bc join public.connection_catalog c on c.slot = bc.slot
    where bc.business_id = b.id and bc.blocks_golive and bc.status <> 'active' and new.skill_id = any(bc.agents);
    if miss is not null then
      raise exception 'portal: connect these before going live: %', miss using errcode = 'P0001';
    end if;

    if b.health_lane then
      select string_agg(x.party, ', ') into miss from public.portal_health_missing(b.id, new.id) x;
      if miss is not null then
        raise exception 'health: signed agreements are missing for: %', miss using errcode = 'P0001';
      end if;
    end if;

    if exists (select 1 from public.agent_manifests am where am.spec_id = new.id
               and am.manifest->'uses' ?| array['edge_box','nvr_pull','vision_count','vision_queue','vision_zones'])
       and exists (select 1 from public.jurisdiction_rules j where j.state = b.state and j.biometric is not null)
       and not exists (select 1 from public.business_agreements a where a.business_id = b.id and a.kind = 'camera_signoff' and a.status = 'signed') then
      raise exception 'camera: % has a biometric privacy law; record a legal sign-off for this business before a camera agent goes live', b.state using errcode = 'P0001';
    end if;

    if jsonb_typeof(new.spec->'operate') = 'object' then
      if not public.portal_flag('operate_lane', false) then
        raise exception 'operator: the operator lane is not switched on yet, so an operator cannot go live' using errcode = 'P0001';
      end if;
      if coalesce((new.spec->'operate'->'public'->>'posts')::boolean, false) and not public.operator_approved_current(new.id) then
        raise exception 'operator: the owner has not approved the brand voice and the accounts this operator posts to' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $function$;

-- 13. The lane is off until Brayden turns it on.
insert into public.forge_settings (key, value) values ('operate_lane', 'false'::jsonb) on conflict (key) do nothing;
