-- Messages from the team reach the owner (Nov 27, 2026).
--
-- When a teammate took a message, saved a lead, asked the owner to confirm a booking or wrote a draft for approval,
-- it told the customer so, and the words went into public.notifications. Nothing showed them to the owner: the
-- Portal's activity list said only "Hallie sent the business an alert". A message nobody reads was not passed on.
--
-- This gives every such row its business, so the Portal can list it for that business's owner, and records when an
-- owner marked it as seen. Nothing is deleted by marking: the row stays until the retention sweep (13 months).
alter table public.notifications add column if not exists business_id uuid references public.businesses(id) on delete cascade;
alter table public.notifications add column if not exists owner_seen_at timestamptz;
alter table public.notifications add column if not exists owner_seen_by text;
create index if not exists notifications_business_at on public.notifications (business_id, created_at desc) where business_id is not null;

-- The business is found from the teammate, by the database, whoever wrote the row (pip-turn, pip-run, the phone's own
-- alerts). A row with no teammate, or a teammate with no business, keeps a null business and is shown to no owner.
create or replace function public.notifications_set_business() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.business_id is null and new.spec_id is not null then
    select o.business_id into new.business_id
      from public.skill_specs s join public.build_orders o on o.id = s.order_id
     where s.id = new.spec_id;
  end if;
  return new;
exception when others then return new;
end $$;
revoke all on function public.notifications_set_business() from public, anon, authenticated;

drop trigger if exists notifications_set_business on public.notifications;
create trigger notifications_set_business before insert on public.notifications
  for each row execute function public.notifications_set_business();

update public.notifications n set business_id = o.business_id
  from public.skill_specs s join public.build_orders o on o.id = s.order_id
 where s.id = n.spec_id and n.business_id is null;

-- The activity line said only that an alert was sent, and only for a live teammate. It now says what kind of thing
-- was passed on (the words themselves are in the inbox, for owners only), for any teammate that has a business.
--
-- The owners are also emailed, through the same outbox every other Portal email uses (portal_notify), so the same
-- switch holds these back while Pip is in development (portal_invites off = held, not sent). An owner who turned
-- email alerts off gets none. At most one such email per business in ten minutes, unless the teammate marked it
-- urgent: a teammate that leaves three notes in one call does not send three emails. The Portal always has them all.
create or replace function public.portal_notif_log() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c record; what text; line text; a jsonb; urgent boolean; prefs jsonb; recent int;
begin
  if new.spec_id is null or new.kind not in ('notify_owner', 'capture_lead', 'request_booking', 'draft_for_approval', 'handoff') then return new; end if;
  select * into c from public.portal_spec_ctx(new.spec_id);
  if c.business_id is null then return new; end if;
  what := case new.kind
    when 'capture_lead' then ' saved a lead for you'
    when 'request_booking' then ' asked you to confirm a booking'
    when 'draft_for_approval' then ' wrote a draft for you to approve'
    when 'handoff' then ' handed a conversation to you'
    else ' left you a message' end;
  insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor)
  values (c.business_id, new.spec_id, c.teammate, 'alert', c.teammate || what, 'info', 'agent');

  a := coalesce(new.body->'args', '{}'::jsonb);
  urgent := lower(coalesce(a->>'urgency', '')) = 'urgent';
  select b.alert_prefs into prefs from public.businesses b where b.id = c.business_id;
  if coalesce(prefs->>'by_email', 'true') = 'false' then return new; end if;
  if not urgent then
    select count(*) into recent from public.portal_notices n
     where n.business_id = c.business_id and n.title like '%from your team' and n.created_at > now() - interval '10 minutes';
    if recent > 0 then return new; end if;
  end if;
  line := left(btrim(regexp_replace(case new.kind
    when 'capture_lead' then concat_ws(', ', nullif(a->>'name', ''), nullif(a->>'phone', ''), nullif(a->>'email', '')) || ': ' || coalesce(a->>'need', '')
    when 'request_booking' then concat_ws('. ', nullif(a->>'when', ''), nullif(a->>'need', ''), nullif(a->>'contact', ''))
    when 'draft_for_approval' then coalesce(a->>'what', '')
    when 'handoff' then coalesce(a->>'reason', '')
    else coalesce(a->>'summary', '') end, '[[:cntrl:]<>]', ' ', 'g')), 300);
  perform public.portal_notify(c.business_id, 'owners',
    case when urgent then 'Urgent: ' else '' end || c.teammate || what,
    case when urgent then 'Urgent message from your team' else 'A message from your team' end,
    array_remove(array[c.teammate || what || '.', nullif(line, ''), 'Open your Portal to read it and mark it done.'], null));
  return new;
exception when others then return new;
end $$;

drop trigger if exists notifications_portal_log on public.notifications;
create trigger notifications_portal_log after insert on public.notifications
  for each row execute function public.portal_notif_log();

-- undo (by hand): drop trigger notifications_set_business on public.notifications; drop function public.notifications_set_business();
--   alter table public.notifications drop column business_id, drop column owner_seen_at, drop column owner_seen_by;
--   and restore portal_notif_log from 20261116_portal_04_runtime_supervisor_cancel.sql.
