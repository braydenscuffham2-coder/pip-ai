-- Portal phase 4: agent runtime hooks, supervisor, weekly digest, founder step controls,
-- consent tools, cancel-and-delete, retention cleanup.

alter table public.businesses add column if not exists kept_record jsonb;

alter table public.agent_pauses drop constraint if exists agent_pauses_reason_check;
alter table public.agent_pauses add constraint agent_pauses_reason_check check (reason = any (array[
  'owner','staff','expired_access','password_changed','mfa','out_of_scope','supervisor','billing',
  'disconnect','gate','founder','missing_connection','missing_agreement']::text[]));

create table if not exists public.portal_notices (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  to_email text not null check (to_email = lower(to_email) and char_length(to_email) between 5 and 120),
  subject text not null check (char_length(subject) between 1 and 160),
  title text not null check (char_length(title) between 1 and 200),
  lines jsonb not null default '[]'::jsonb check (octet_length(lines::text) <= 8000),
  no_link boolean not null default false,
  status text not null default 'pending' check (status in ('pending','sent','failed','held')),
  tries integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.portal_notices enable row level security;
revoke all on public.portal_notices from anon, authenticated;
grant select, insert, update, delete on public.portal_notices to service_role;
create index if not exists portal_notices_pending on public.portal_notices (created_at) where status = 'pending';

-- ---------- helpers ----------
create or replace function public.portal_spec_ctx(p_spec uuid, out business_id uuid, out skill_id text, out teammate text, out spec_status text, out business_status text)
language sql stable security definer set search_path to '' as $$
  select o.business_id, s.skill_id, coalesce(am.manifest->>'teammate', am.manifest->>'name', s.skill_id), s.status, b.status
  from public.skill_specs s
  left join public.build_orders o on o.id = s.order_id
  left join public.businesses b on b.id = o.business_id
  left join public.agent_manifests am on am.spec_id = s.id
  where s.id = p_spec
$$;

create or replace function public.portal_notify(p_business uuid, p_to text, p_subject text, p_title text, p_lines text[], p_no_link boolean default false)
returns integer language plpgsql security definer set search_path to '' as $$
declare n integer := 0; st text;
begin
  if p_to = 'founder' then
    insert into public.portal_notices (business_id, to_email, subject, title, lines, no_link)
    select p_business, lower(a.email), left(p_subject, 160), left(p_title, 200), to_jsonb(coalesce(p_lines, '{}'::text[])), coalesce(p_no_link, false)
    from public.platform_admins a;
    get diagnostics n = row_count;
  else
    st := case when public.portal_flag('portal_invites', false) then 'pending' else 'held' end;
    insert into public.portal_notices (business_id, to_email, subject, title, lines, no_link, status)
    select p_business, m.email, left(p_subject, 160), left(p_title, 200), to_jsonb(coalesce(p_lines, '{}'::text[])), coalesce(p_no_link, false), st
    from public.members m where m.business_id = p_business and m.role = 'owner' and m.status <> 'removed';
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

create or replace function public.portal_contact_norm(p_kind text, p_contact text)
returns text language sql immutable set search_path to '' as $$
  select case when p_kind = 'phone' then
    (select case when length(d) = 10 then '1' || d else d end from (select regexp_replace(coalesce(p_contact, ''), '\D', '', 'g') as d) x)
  else lower(btrim(coalesce(p_contact, ''))) end
$$;

create or replace function public.portal_contact_hash(p_business uuid, p_kind text, p_contact text)
returns text language sql immutable set search_path to '' as $$
  select encode(sha256(convert_to(p_business::text || ':' || p_kind || ':' || public.portal_contact_norm(p_kind, p_contact), 'UTF8')), 'hex')
$$;

-- ---------- what the agent runtime calls ----------
create or replace function public.portal_log(p_spec uuid, p_summary text, p_outcome text default 'ok', p_job text default null, p_cost_usd numeric default null, p_kind text default 'action')
returns bigint language plpgsql security definer set search_path to '' as $$
declare c record; v_id bigint;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null then return null; end if;
  insert into public.activity_log (business_id, spec_id, agent, job, kind, summary, outcome, cost_usd, actor)
  values (c.business_id, p_spec, c.teammate, left(p_job, 120), coalesce(p_kind, 'action'),
          coalesce(nullif(left(btrim(coalesce(p_summary, '')), 500), ''), 'Did a job'), coalesce(p_outcome, 'ok'), p_cost_usd, 'agent')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_usage(p_spec uuid, p_unit text, p_qty numeric default 1, p_cost_usd numeric default null, p_provider text default null)
returns bigint language plpgsql security definer set search_path to '' as $$
declare c record; v_id bigint;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null then return null; end if;
  insert into public.usage_events (business_id, spec_id, unit, qty, cost_usd, provider)
  values (c.business_id, p_spec, p_unit, coalesce(p_qty, 1), p_cost_usd, left(p_provider, 60))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_record_consent(p_spec uuid, p_kind text, p_contact text, p_channel text, p_purpose text default 'transactional', p_method text default 'inbound_message', p_proof jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path to '' as $$
declare c record; v_hash text;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null then return null; end if;
  v_hash := public.portal_contact_hash(c.business_id, p_kind, p_contact);
  insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
  values (c.business_id, v_hash, right(public.portal_contact_norm(p_kind, p_contact), 4), p_kind, p_channel, coalesce(p_purpose, 'transactional'),
          'granted', coalesce(p_method, 'inbound_message'), coalesce(p_proof, '{}'::jsonb), p_spec, 'agent');
  return v_hash;
end $$;

create or replace function public.portal_record_optout(p_spec uuid, p_kind text, p_contact text, p_heard_on text default 'sms')
returns text language plpgsql security definer set search_path to '' as $$
declare c record; v_hash text;
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null then return null; end if;
  v_hash := public.portal_contact_hash(c.business_id, p_kind, p_contact);
  insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
  values (c.business_id, v_hash, right(public.portal_contact_norm(p_kind, p_contact), 4), p_kind, 'any', 'any', 'revoked', 'keyword_stop',
          jsonb_build_object('heard_on', left(coalesce(p_heard_on, 'sms'), 20)), p_spec, 'agent');
  insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
  values (c.business_id, p_spec, 'opt_out', left(coalesce(p_heard_on, 'sms'), 20), v_hash, '{}'::jsonb);
  return v_hash;
end $$;

create or replace function public.portal_job_pause(p_spec uuid, p_job text, p_reason text, p_detail text default null)
returns bigint language plpgsql security definer set search_path to '' as $$
declare c record; v_id bigint; v_job text := nullif(left(btrim(coalesce(p_job, '')), 120), '');
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null or v_job is null then return null; end if;
  select p.id into v_id from public.agent_pauses p
  where p.spec_id = p_spec and p.job = v_job and p.reason = p_reason and p.resumed_at is null limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.agent_pauses (business_id, spec_id, job, reason, detail, prior_status, paused_by)
  values (c.business_id, p_spec, v_job, p_reason, left(p_detail, 500), c.spec_status, 'agent')
  returning id into v_id;
  insert into public.activity_log (business_id, spec_id, agent, job, kind, summary, outcome, actor)
  values (c.business_id, p_spec, c.teammate, v_job, 'pause', left(c.teammate || ' paused one job: ' || v_job, 500), 'paused', 'agent');
  perform public.portal_notify(c.business_id, 'owners', c.teammate || ' paused one job',
    c.teammate || ' paused one job',
    array['Job: ' || v_job, 'Why: ' || replace(p_reason, '_', ' '), 'Every other job keeps running.', 'Open your Pip Portal to fix it.']);
  return v_id;
end $$;

-- ---------- triggers on what the runtime already writes ----------
create or replace function public.portal_conv_guard() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  select * into c from public.portal_spec_ctx(new.spec_id);
  if c.business_id is null then return new; end if;
  if c.business_status in ('disconnected', 'cancelled') then
    raise exception 'paused: this business disconnected Pip' using errcode = 'P0001';
  end if;
  if c.spec_status = 'paused' or exists (
    select 1 from public.agent_pauses p where p.spec_id = new.spec_id and p.job is null and p.resumed_at is null) then
    raise exception 'paused: this teammate is paused' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.portal_conv_log() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  select * into c from public.portal_spec_ctx(new.spec_id);
  if c.business_id is null or c.spec_status <> 'live' then return new; end if;
  insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor, ref)
  values (c.business_id, new.spec_id, c.teammate, 'action',
          c.teammate || ' started a conversation (' || replace(coalesce(new.channel, 'chat'), '_', ' ') || ')', 'ok', 'agent',
          jsonb_build_object('conversation', new.id));
  insert into public.usage_events (business_id, spec_id, unit, qty) values (c.business_id, new.spec_id, 'conversation', 1);
  return new;
exception when others then return new;
end $$;

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

create or replace function public.portal_notif_log() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  if new.kind <> 'notify_owner' or new.spec_id is null then return new; end if;
  select * into c from public.portal_spec_ctx(new.spec_id);
  if c.business_id is null or c.spec_status <> 'live' then return new; end if;
  insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor)
  values (c.business_id, new.spec_id, c.teammate, 'alert', c.teammate || ' sent the business an alert', 'info', 'agent');
  return new;
exception when others then return new;
end $$;

drop trigger if exists conversations_portal_guard on public.conversations;
create trigger conversations_portal_guard before insert on public.conversations for each row execute function public.portal_conv_guard();
drop trigger if exists conversations_portal_log on public.conversations;
create trigger conversations_portal_log after insert on public.conversations for each row execute function public.portal_conv_log();
drop trigger if exists messages_portal_supervise on public.messages;
create trigger messages_portal_supervise after insert on public.messages for each row execute function public.portal_msg_supervise();
drop trigger if exists notifications_portal_log on public.notifications;
create trigger notifications_portal_log after insert on public.notifications for each row execute function public.portal_notif_log();

-- ---------- supervisor ----------
create or replace function public.portal_supervise() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r record; miss text; n_paused int := 0; n_resumed int := 0; n_issues int := 0;
begin
  -- 1. live teammates that lost something they need
  for r in
    select s.id as spec_id, s.skill_id, o.business_id, coalesce(am.manifest->>'teammate', s.skill_id) as teammate, b.health_lane
    from public.skill_specs s
    join public.build_orders o on o.id = s.order_id
    join public.businesses b on b.id = o.business_id
    left join public.agent_manifests am on am.spec_id = s.id
    where s.status = 'live' and b.status not in ('disconnected', 'cancelled')
  loop
    select string_agg(c.label, ', ' order by c.sort) into miss
    from public.business_connections bc join public.connection_catalog c on c.slot = bc.slot
    where bc.business_id = r.business_id and bc.blocks_golive and bc.status <> 'active' and r.skill_id = any(bc.agents);
    if miss is not null then
      insert into public.agent_pauses (business_id, spec_id, reason, detail, prior_status, paused_by)
      values (r.business_id, r.spec_id, 'missing_connection', left('Needs: ' || miss, 500), 'live', 'supervisor');
      update public.skill_specs set status = 'paused', updated_at = now() where id = r.spec_id;
      insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor)
      values (r.business_id, r.spec_id, r.teammate, 'supervisor', left('Supervisor paused ' || r.teammate || '. Needs: ' || miss, 500), 'paused', 'supervisor');
      perform public.portal_notify(r.business_id, 'owners', r.teammate || ' is paused', r.teammate || ' is paused',
        array['Needs: ' || miss, 'Your other teammates keep running.', 'Open your Pip Portal to reconnect.']);
      perform public.portal_notify(r.business_id, 'founder', 'Supervisor paused ' || r.teammate, 'Supervisor paused ' || r.teammate, array['Needs: ' || miss]);
      n_paused := n_paused + 1;
      continue;
    end if;
    if r.health_lane then
      select string_agg(h.party, ', ') into miss from public.portal_health_missing(r.business_id, r.spec_id) h;
      if miss is not null then
        insert into public.agent_pauses (business_id, spec_id, reason, detail, prior_status, paused_by)
        values (r.business_id, r.spec_id, 'missing_agreement', left('Signed health agreements missing for: ' || miss, 500), 'live', 'supervisor');
        update public.skill_specs set status = 'paused', updated_at = now() where id = r.spec_id;
        insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor)
        values (r.business_id, r.spec_id, r.teammate, 'supervisor', left('Supervisor paused ' || r.teammate || '. A health agreement is missing.', 500), 'paused', 'supervisor');
        perform public.portal_notify(r.business_id, 'founder', 'Health agreement missing: ' || r.teammate, 'Supervisor paused ' || r.teammate, array['Missing: ' || miss]);
        n_paused := n_paused + 1;
      end if;
    end if;
  end loop;

  -- 2. bring back teammates the supervisor paused, once the cause is fixed
  for r in
    select p.id as pause_id, p.spec_id, p.business_id, p.reason, s.skill_id, coalesce(am.manifest->>'teammate', s.skill_id) as teammate
    from public.agent_pauses p
    join public.skill_specs s on s.id = p.spec_id
    join public.businesses b on b.id = p.business_id
    left join public.agent_manifests am on am.spec_id = s.id
    where p.resumed_at is null and p.paused_by = 'supervisor' and p.job is null
      and p.reason in ('missing_connection', 'missing_agreement') and s.status = 'paused'
      and b.status not in ('disconnected', 'cancelled')
  loop
    if exists (select 1 from public.business_connections bc
               where bc.business_id = r.business_id and bc.blocks_golive and bc.status <> 'active' and r.skill_id = any(bc.agents)) then
      continue;
    end if;
    if exists (select 1 from public.agent_pauses p2 where p2.spec_id = r.spec_id and p2.job is null and p2.resumed_at is null and p2.id <> r.pause_id) then
      continue;
    end if;
    begin
      update public.agent_pauses set resumed_at = now(), resumed_by = 'supervisor' where id = r.pause_id;
      update public.skill_specs set status = 'live', updated_at = now() where id = r.spec_id;
      insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor)
      values (r.business_id, r.spec_id, r.teammate, 'resume', r.teammate || ' is running again', 'ok', 'supervisor');
      n_resumed := n_resumed + 1;
    exception when others then null;
    end;
  end loop;

  -- 3. counting box gone quiet
  for r in
    select distinct o.business_id, x.id as box_id, x.last_seen_at
    from public.boxes x join public.build_orders o on o.id = x.order_id
    join public.businesses b on b.id = o.business_id
    where x.status in ('online', 'calibrated', 'live') and x.last_seen_at is not null and x.last_seen_at < now() - interval '30 minutes'
      and o.business_id is not null and b.status not in ('disconnected', 'cancelled')
  loop
    if not exists (select 1 from public.portal_issues i where i.business_id = r.business_id and i.opened_by = 'supervisor'
                   and i.status <> 'resolved' and i.body like 'The counting box%') then
      insert into public.portal_issues (business_id, opened_by, body, status)
      values (r.business_id, 'supervisor', 'The counting box has been offline since ' || to_char(r.last_seen_at at time zone 'UTC', 'Mon DD HH24:MI') || ' UTC. Check its power and internet.', 'open');
      perform public.portal_notify(r.business_id, 'owners', 'Your counting box is offline', 'Your counting box is offline',
        array['Check that it has power and internet.', 'Counts resume on their own when it reconnects.']);
      perform public.portal_notify(r.business_id, 'founder', 'A counting box is offline', 'A counting box is offline', array['Box: ' || r.box_id::text]);
      n_issues := n_issues + 1;
    end if;
  end loop;

  -- 4. emails that failed to send
  if exists (select 1 from public.portal_outbox ob where ob.status = 'failed' and ob.created_at > now() - interval '24 hours')
     and not exists (select 1 from public.portal_notices pn where pn.subject = 'Portal emails are failing' and pn.created_at > now() - interval '24 hours') then
    perform public.portal_notify(null, 'founder', 'Portal emails are failing', 'Portal emails are failing',
      array[(select count(*)::text from public.portal_outbox ob where ob.status = 'failed' and ob.created_at > now() - interval '24 hours') || ' emails failed in the last day.',
            'The usual cause is a sending domain that is not verified yet.']);
    n_issues := n_issues + 1;
  end if;

  return jsonb_build_object('paused', n_paused, 'resumed', n_resumed, 'flagged', n_issues, 'at', now());
end $$;

create or replace function public.portal_weekly_digest() returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; n int := 0; v_ok int; v_fail int; v_conv int; v_paused int; v_issues int;
begin
  for r in
    select b.id, b.name from public.businesses b
    where b.status not in ('disconnected', 'cancelled')
      and exists (select 1 from public.skill_specs s join public.build_orders o on o.id = s.order_id
                  where o.business_id = b.id and s.status in ('live', 'paused'))
  loop
    select count(*) filter (where al.kind = 'action' and al.outcome = 'ok'), count(*) filter (where al.outcome = 'failed')
      into v_ok, v_fail from public.activity_log al where al.business_id = r.id and al.at > now() - interval '7 days';
    select coalesce(sum(u.qty), 0)::int into v_conv from public.usage_events u
      where u.business_id = r.id and u.unit = 'conversation' and u.at > now() - interval '7 days';
    select count(*) into v_paused from public.agent_pauses p where p.business_id = r.id and p.resumed_at is null;
    select count(*) into v_issues from public.portal_issues i where i.business_id = r.id and i.status <> 'resolved';
    perform public.portal_notify(r.id, 'owners', 'Your Pip week: ' || r.name, 'Your Pip week', array[
      v_conv || ' conversations handled', v_ok || ' jobs done', v_fail || ' jobs that did not finish',
      case when v_paused > 0 then v_paused || ' paused right now. Open the Portal to fix.' else 'Nothing is paused.' end,
      case when v_issues > 0 then v_issues || ' open reports.' else 'No open reports.' end]);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Portal actions (called by the pip-portal-ops function after it checks the sign-in) ----------
create or replace function public.portal_api_founder_step(p_business uuid, p_actor text, p_role text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_slot text := p_args->>'slot'; v_status text := p_args->>'status'; v_kind text; v_label text;
  v_num text := nullif(regexp_replace(coalesce(p_args->>'pip_number', ''), '[^0-9+]', '', 'g'), '');
  v_note text := left(nullif(btrim(coalesce(p_args->>'note', '')), ''), 200); v_left int;
begin
  if p_role <> 'founder' then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  if v_status is null or v_status not in ('active', 'needed', 'submitted') then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'bad_status');
  end if;
  select c.kind, c.label into v_kind, v_label from public.connection_catalog c where c.slot = v_slot;
  if v_kind is null or v_kind in ('owner_oauth', 'vault_login') then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'not_a_pip_step', 'message', 'That step is checked automatically.');
  end if;
  if v_num is not null and v_num !~ '^\+?[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'bad_number', 'message', 'That phone number does not look right.');
  end if;
  update public.business_connections bc
     set status = v_status, checked_at = now(), updated_at = now(),
         detail = coalesce(bc.detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('marked_by', 'Pip', 'marked_at', now(), 'note', v_note, 'pip_number', v_num))
   where bc.business_id = p_business and bc.slot = v_slot;
  if not found then return jsonb_build_object('ok', false, 'status', 404, 'error', 'no_such_step'); end if;

  if v_slot = 'phone' then
    insert into public.phone_lines as pl (business_id, pip_number, status, verified_at, updated_at)
    values (p_business, v_num, case when v_status = 'active' then 'verified' when v_num is not null then 'number_assigned' else 'requested' end,
            case when v_status = 'active' then now() end, now())
    on conflict (business_id) do update set
      pip_number = coalesce(excluded.pip_number, pl.pip_number),
      status = case when v_status = 'active' then 'verified'
                    when coalesce(excluded.pip_number, pl.pip_number) is not null and pl.status = 'requested' then 'number_assigned'
                    else pl.status end,
      verified_at = case when v_status = 'active' then now() else pl.verified_at end,
      updated_at = now();
  elsif v_slot = 'texting' and v_status = 'active' then
    update public.texting_registrations set status = 'approved', updated_at = now() where business_id = p_business;
  end if;

  insert into public.activity_log (business_id, kind, summary, outcome, actor)
  values (p_business, 'connection', 'Pip marked "' || v_label || '" as ' ||
          case v_status when 'active' then 'ready' when 'submitted' then 'in progress' else 'not ready' end, 'info', 'pip');
  select count(*) into v_left from public.business_connections bc where bc.business_id = p_business and bc.blocks_golive and bc.status <> 'active';
  if v_left = 0 then
    update public.businesses set status = 'ready', updated_at = now() where id = p_business and status = 'setup';
  end if;
  return jsonb_build_object('ok', true, 'slot', v_slot, 'status', v_status, 'left', v_left);
end $$;

create or replace function public.portal_api_consent_add(p_business uuid, p_actor text, p_role text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_kind text := p_args->>'kind'; v_channel text := p_args->>'channel';
  v_list jsonb := case when jsonb_typeof(p_args->'contacts') = 'array' then p_args->'contacts' else jsonb_build_array(p_args->>'contact') end;
  c text; v_norm text; v_hash text; v_last text; n_add int := 0; n_out int := 0; n_bad int := 0; n_dup int := 0;
begin
  if p_role not in ('owner', 'staff', 'founder') then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  if coalesce(p_args->>'attest', '') <> 'true' then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'attest_required', 'message', 'Tick the box to confirm these people asked to hear from you.');
  end if;
  if v_kind is null or v_channel is null or v_kind not in ('phone', 'email') or v_channel not in ('sms', 'voice', 'email')
     or (v_kind = 'email') <> (v_channel = 'email') then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'bad_request');
  end if;
  if jsonb_array_length(v_list) > 500 then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'too_many', 'message', 'Add up to 500 at a time.');
  end if;
  for c in select jsonb_array_elements_text(v_list) loop
    v_norm := public.portal_contact_norm(v_kind, c);
    if (v_kind = 'phone' and length(v_norm) not between 11 and 15)
       or (v_kind = 'email' and (v_norm !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v_norm) > 120)) then
      n_bad := n_bad + 1; continue;
    end if;
    v_hash := public.portal_contact_hash(p_business, v_kind, c);
    v_last := null;
    select cl.status into v_last from public.consent_ledger cl
     where cl.business_id = p_business and cl.contact_hash = v_hash and cl.channel in (v_channel, 'any')
     order by cl.at desc, cl.id desc limit 1;
    if v_last = 'revoked' then n_out := n_out + 1; continue; end if;
    if exists (select 1 from public.consent_ledger cl where cl.business_id = p_business and cl.contact_hash = v_hash
               and cl.channel in (v_channel, 'any') and cl.status = 'granted') then
      n_dup := n_dup + 1; continue;
    end if;
    insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, recorded_by)
    values (p_business, v_hash, right(v_norm, 4), v_kind, v_channel, 'transactional', 'granted', 'imported_by_business',
            jsonb_build_object('attested_by', p_actor, 'attested_at', now(),
              'statement', 'The business confirms this contact asked to be contacted about their own service.'), p_actor);
    n_add := n_add + 1;
  end loop;
  insert into public.activity_log (business_id, kind, summary, outcome, actor)
  values (p_business, 'owner', 'Added ' || n_add || ' consent records (service messages only)', 'info', p_actor);
  return jsonb_build_object('ok', true, 'added', n_add, 'opted_out_skipped', n_out, 'already_on_file', n_dup, 'not_valid', n_bad);
end $$;

create or replace function public.portal_api_consent_export(p_business uuid, p_actor text, p_role text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if p_role not in ('owner', 'founder') then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'ending', x.contact_hint, 'kind', x.contact_kind, 'channel', x.channel,
             'purpose', x.purpose, 'status', x.status, 'method', x.method, 'code', x.contact_hash) order by x.at desc), '[]'::jsonb)
    from (select cl.* from public.consent_ledger cl where cl.business_id = p_business order by cl.at desc limit 5000) x));
end $$;

create or replace function public.portal_api_cancel(p_business uuid, p_actor text, p_role text, p_fresh boolean, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b public.businesses; v_orders uuid[]; v_specs uuid[]; v_leads uuid[]; v_emails text[]; v_owners text[];
  v_counts jsonb; v_st text; v_auth text := 'removed'; e text;
begin
  if p_role not in ('owner', 'founder') then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  if not coalesce(p_fresh, false) then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'fresh_sign_in', 'message', 'Sign in again to do this.');
  end if;
  select * into b from public.businesses where id = p_business for update;
  if not found then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  if b.status = 'cancelled' then return jsonb_build_object('ok', true, 'already', true); end if;
  if b.status <> 'disconnected' then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'disconnect_first', 'message', 'Disconnect Pip first. Then you can delete everything.');
  end if;
  if lower(btrim(coalesce(p_args->>'name', ''))) <> lower(btrim(b.name)) then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'name_mismatch', 'message', 'Type the business name exactly to confirm.');
  end if;
  if exists (select 1 from public.vault_items v where v.business_id = b.id and v.status <> 'deleted') then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'vault_not_empty', 'message', 'Saved logins must be removed first. Pip has been told.');
  end if;

  select coalesce(array_agg(o.id), '{}'::uuid[]), coalesce(array_agg(o.lead_id) filter (where o.lead_id is not null), '{}'::uuid[])
    into v_orders, v_leads from public.build_orders o where o.business_id = b.id;
  if b.lead_id is not null then v_leads := v_leads || b.lead_id; end if;
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_specs from public.skill_specs s where s.order_id = any(v_orders);
  select coalesce(array_agg(m.email), '{}'::text[]), coalesce(array_agg(m.email) filter (where m.role = 'owner' and m.status <> 'removed'), '{}'::text[])
    into v_emails, v_owners from public.members m where m.business_id = b.id;
  v_counts := jsonb_build_object('orders', cardinality(v_orders), 'teammates', cardinality(v_specs), 'people', cardinality(v_emails),
    'activity_lines', (select count(*) from public.activity_log al where al.business_id = b.id),
    'conversations', (select count(*) from public.conversations cv where cv.spec_id = any(v_specs)));

  perform set_config('pip.purge', 'on', true);
  delete from public.messages where conversation_id in (select cv.id from public.conversations cv where cv.spec_id = any(v_specs));
  delete from public.conversations where spec_id = any(v_specs);
  delete from public.notifications where spec_id = any(v_specs);
  delete from public.build_jobs where order_id = any(v_orders) or spec_id = any(v_specs);
  delete from public.api_needs where order_id = any(v_orders);
  delete from public.box_events where box_id in (select x.id from public.boxes x where x.order_id = any(v_orders));
  delete from public.boxes where order_id = any(v_orders);
  delete from public.client_connections where business_id = b.id or order_id = any(v_orders);
  delete from public.agent_pauses where business_id = b.id;
  delete from public.agent_manifests where business_id = b.id or spec_id = any(v_specs);
  delete from public.skill_specs where id = any(v_specs);
  delete from public.build_orders where id = any(v_orders);
  delete from public.leads l where l.id = any(v_leads) and not exists (select 1 from public.build_orders o where o.lead_id = l.id);
  delete from public.activity_log where business_id = b.id;
  delete from public.usage_events where business_id = b.id;
  delete from public.portal_issues where business_id = b.id;
  delete from public.business_connections where business_id = b.id;
  delete from public.vault_items where business_id = b.id;
  delete from public.phone_lines where business_id = b.id;
  delete from public.texting_registrations where business_id = b.id;
  delete from public.portal_outbox where business_id = b.id;
  delete from public.portal_notices where business_id = b.id;
  delete from public.members where business_id = b.id;
  if b.domain is not null then
    delete from public.scans where domain = b.domain;
    delete from public.site_builds where domain = b.domain;
    delete from public.rivals where domain = b.domain;
  end if;
  begin
    delete from auth.users u where lower(u.email) = any(v_emails)
      and not exists (select 1 from public.members m where m.email = lower(u.email))
      and not exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(u.email));
  exception when others then v_auth := 'left_in_place';
  end;

  update public.businesses set status = 'cancelled', cancelled_at = now(), updated_at = now(),
    owner_email = null, domain = null, address = null, quote = null, alert_prefs = '{}'::jsonb, lead_id = null,
    composio_user_id = null, price_accepted_by = null,
    kept_record = jsonb_build_object('name', b.name, 'state', b.state, 'cancelled_at', now(), 'cancelled_by_role', p_role,
      'deleted', v_counts, 'sign_ins', v_auth,
      'kept', jsonb_build_array('opt-out and consent records (contacts stored as one-way codes)', 'compliance log', 'signed agreements'))
  where id = b.id;

  v_st := case when public.portal_flag('portal_invites', false) then 'pending' else 'held' end;
  foreach e in array v_owners loop
    insert into public.portal_notices (business_id, to_email, subject, title, lines, no_link, status)
    values (b.id, e, 'Your Pip data has been deleted', 'Your Pip data has been deleted', to_jsonb(array[
      'Deleted: your teammates, their instructions, conversations, activity history, connections, sign-ins and your order.',
      'Kept: opt-out and consent records, the compliance log and signed agreements. Contacts in those records are stored as one-way codes.',
      'This cannot be undone. Thank you for trying Pip.']), true, v_st);
  end loop;
  perform public.portal_notify(b.id, 'founder', 'A business cancelled and was deleted', 'A business cancelled and was deleted',
    array['Business: ' || b.name, 'Deleted: ' || v_counts::text]);
  return jsonb_build_object('ok', true, 'deleted', v_counts);
end $$;

create or replace function public.portal_api(p_name text, p_business uuid, p_email text, p_fresh boolean, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_role text; a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'status', 401, 'error', 'sign_in'); end if;
  if exists (select 1 from public.platform_admins pa where lower(pa.email) = v_email) then
    v_role := 'founder';
  elsif p_business is not null then
    select m.role into v_role from public.members m where m.business_id = p_business and m.email = v_email and m.status <> 'removed';
  end if;
  if v_role is null then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  if p_name = 'supervise_now' then
    if v_role <> 'founder' then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'result', public.portal_supervise());
  end if;
  if p_business is null or not exists (select 1 from public.businesses bz where bz.id = p_business) then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found');
  end if;
  case p_name
    when 'founder_step' then return public.portal_api_founder_step(p_business, v_email, v_role, a);
    when 'consent_add' then return public.portal_api_consent_add(p_business, v_email, v_role, a);
    when 'consent_export' then return public.portal_api_consent_export(p_business, v_email, v_role, a);
    when 'cancel' then return public.portal_api_cancel(p_business, v_email, v_role, coalesce(p_fresh, false), a);
    else return jsonb_build_object('ok', false, 'status', 404, 'error', 'unknown_action');
  end case;
end $$;

-- ---------- retention ----------
create or replace function public.portal_purge_old() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare n_strip int; n_gone int; n_mail int;
begin
  perform set_config('pip.purge', 'on', true);
  update public.businesses set name = 'Deleted business', kept_record = kept_record - 'name', updated_at = now()
   where status = 'cancelled' and cancelled_at < now() - interval '1 year' and name <> 'Deleted business';
  get diagnostics n_strip = row_count;
  delete from public.businesses where status = 'cancelled' and cancelled_at < now() - interval '4 years';
  get diagnostics n_gone = row_count;
  delete from public.portal_notices where status in ('sent', 'failed', 'held') and created_at < now() - interval '90 days';
  get diagnostics n_mail = row_count;
  delete from public.portal_signins where at < now() - interval '30 days';
  return jsonb_build_object('names_removed', n_strip, 'records_removed', n_gone, 'old_emails_removed', n_mail);
end $$;

-- ---------- lock down ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'portal\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ---------- schedules ----------
select cron.schedule('pip-portal-supervise', '*/15 * * * *', $c$select public.portal_supervise()$c$);
select cron.schedule('pip-portal-weekly', '7 15 * * 1', $c$select public.portal_weekly_digest()$c$);
select cron.schedule('pip-portal-purge', '23 9 1 * *', $c$select public.portal_purge_old()$c$);
select cron.schedule('pip-portal-notices', '*/2 * * * *', $c$select net.http_post(url := 'https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-portal-ops/hooks/notices', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb) where exists (select 1 from public.portal_notices where status = 'pending')$c$);
