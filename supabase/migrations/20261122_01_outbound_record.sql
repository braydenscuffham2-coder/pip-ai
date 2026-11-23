-- Job 1: every outbound message leaves a record that cites the consent_ledger row it relied on.
--
-- Before this, `portal_outbound_check` wrote "outbound_allowed" (a yes/no with no ledger id) and `portal_sms_out` only
-- counted billing. Nothing said, for a message that WAS sent, which consent entry covered it or whether it carried the
-- AI line and the opt-out line. This adds that record, and an email path that honours STOP.
--
-- Backward compatible:
--   * `portal_outbound_check` is NOT touched. The live gate keeps deciding yes or no exactly as before.
--   * `portal_sms_out` keeps working for its 3-argument callers (the new arguments all have defaults).
--   * Only one CHECK constraint is widened (one more allowed event kind).
-- Raw phone numbers and email addresses are never stored here, only the same salted hash the ledger already uses.
--
-- Rollback (in this order):
--   drop function public.portal_email_in(uuid, uuid, text, text);
--   drop function public.portal_email_gate(uuid, uuid, text, boolean);
--   drop function public.portal_outbound_sent(uuid, uuid, text, text, text, boolean, boolean);
--   drop function public.portal_sms_out(uuid, uuid, integer, text, boolean, boolean);
--   create function public.portal_sms_out(p_business uuid, p_spec uuid, p_segments integer) returns void
--     language plpgsql security definer set search_path to '' as $$ begin
--     insert into public.usage_events (business_id, spec_id, unit, qty, provider)
--     values (p_business, p_spec, 'sms', greatest(1, coalesce(p_segments, 1)), 'twilio'); end $$;
--   alter table public.compliance_events drop constraint compliance_events_kind_check;
--   alter table public.compliance_events add constraint compliance_events_kind_check check (kind = any (array[
--     'ai_disclosure','recording_notice','opt_out','outbound_allowed','outbound_blocked','golive_blocked','terms_accepted','price_accepted']));
--   (then re-run the last two grants lines of 20261116_portal_07 for portal_sms_out.)

-- 1. One more kind of compliance event: a message that was actually sent.
alter table public.compliance_events drop constraint compliance_events_kind_check;
alter table public.compliance_events add constraint compliance_events_kind_check check (kind = any (array[
  'ai_disclosure', 'recording_notice', 'opt_out', 'outbound_allowed', 'outbound_blocked', 'golive_blocked',
  'terms_accepted', 'price_accepted', 'outbound_sent']));

-- 2. The record itself. Cites the newest ledger row for this contact on this channel (or "any"), whatever its status,
--    so an auditor can see both what was relied on and whether it was a grant. Never writes a raw contact.
create or replace function public.portal_outbound_sent(
  p_business uuid, p_spec uuid, p_contact text, p_kind text, p_channel text,
  p_ai_disclosed boolean, p_opt_out_offered boolean
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_hash text; v_ledger bigint; v_status text; v_method text;
begin
  if p_kind not in ('phone', 'email') or p_channel not in ('sms', 'voice', 'email') or coalesce(p_contact, '') = '' then
    return jsonb_build_object('recorded', false, 'reason', 'bad_request');
  end if;
  v_hash := public.portal_contact_hash(p_business, p_kind, p_contact);
  select cl.id, cl.status, cl.method into v_ledger, v_status, v_method
    from public.consent_ledger cl
   where cl.business_id = p_business and cl.contact_hash = v_hash and cl.channel in (p_channel, 'any')
   order by cl.at desc, cl.id desc limit 1;
  insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
  values (p_business, p_spec, 'outbound_sent', p_channel, v_hash,
          jsonb_build_object('ledger_id', v_ledger, 'ledger_status', v_status, 'ledger_method', v_method,
                             'ai_disclosed', coalesce(p_ai_disclosed, false), 'opt_out_offered', coalesce(p_opt_out_offered, false)));
  return jsonb_build_object('recorded', true, 'ledger_id', v_ledger);
end $$;

-- 3. Texts. Same billing row as before; when the caller passes the recipient it also writes the sent record.
drop function if exists public.portal_sms_out(uuid, uuid, integer);
create or replace function public.portal_sms_out(
  p_business uuid, p_spec uuid, p_segments integer,
  p_to text default null, p_ai_disclosed boolean default false, p_opt_out_offered boolean default false
) returns void
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.usage_events (business_id, spec_id, unit, qty, provider) values (p_business, p_spec, 'sms', greatest(1, coalesce(p_segments, 1)), 'twilio');
  if coalesce(p_to, '') <> '' then
    perform public.portal_outbound_sent(p_business, p_spec, p_to, 'phone', 'sms', p_ai_disclosed, p_opt_out_offered);
  end if;
end $$;

-- 4. Email, before a send. The mailbox is the owner's own and a teammate only replies to someone who wrote to it or gave
--    an address in a chat, so this is a reply: it is refused when the person has opted out, and when they gave the address
--    in a chat it records that as the consent (method web_form) the first time.
create or replace function public.portal_email_gate(p_business uuid, p_spec uuid, p_to text, p_given_in_chat boolean default false) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_hash text; v_last text; chk jsonb;
begin
  if coalesce(p_to, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('allowed', false, 'reason', 'bad_request'); end if;
  v_hash := public.portal_contact_hash(p_business, 'email', p_to);
  select cl.status into v_last from public.consent_ledger cl
   where cl.business_id = p_business and cl.contact_hash = v_hash and cl.channel in ('email', 'any')
   order by cl.at desc, cl.id desc limit 1;
  if v_last is null and p_given_in_chat then
    insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
    values (p_business, v_hash, right(lower(btrim(p_to)), 12), 'email', 'email', 'transactional', 'granted', 'web_form',
            jsonb_build_object('note', 'Typed their email address into the chat'), p_spec, 'agent');
  end if;
  chk := public.portal_outbound_check(p_business, v_hash, 'email', 'transactional', true, p_spec);
  return chk;
end $$;

-- 5. Email, when a customer writes in. STOP (or a plain "stop emailing me") revokes email for that address, for good,
--    until they ask again. A first message from a new address records that they wrote first.
create or replace function public.portal_email_in(p_business uuid, p_spec uuid, p_from text, p_kind text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_hash text; v_last text;
begin
  if coalesce(p_from, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_kind not in ('stop', 'message') then
    return jsonb_build_object('allowed', false, 'reason', 'bad_request');
  end if;
  v_hash := public.portal_contact_hash(p_business, 'email', p_from);
  if p_kind = 'stop' then
    insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
    values (p_business, v_hash, right(lower(btrim(p_from)), 12), 'email', 'any', 'any', 'revoked', 'keyword_stop', '{"heard_on":"email"}'::jsonb, p_spec, 'agent');
    insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
    values (p_business, p_spec, 'opt_out', 'email', v_hash, '{}'::jsonb);
    return jsonb_build_object('allowed', false, 'reason', 'opted_out');
  end if;
  select cl.status into v_last from public.consent_ledger cl
   where cl.business_id = p_business and cl.contact_hash = v_hash and cl.channel in ('email', 'any')
   order by cl.at desc, cl.id desc limit 1;
  if v_last = 'revoked' then return jsonb_build_object('allowed', false, 'reason', 'opted_out'); end if;
  if v_last is null then
    insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
    values (p_business, v_hash, right(lower(btrim(p_from)), 12), 'email', 'email', 'transactional', 'granted', 'inbound_message',
            jsonb_build_object('note', 'Emailed the business first'), p_spec, 'agent');
  end if;
  return jsonb_build_object('allowed', true);
end $$;

-- 6. Same rights as every other portal function: only the service role may run them.
do $$ declare f text; begin
  foreach f in array array[
    'public.portal_outbound_sent(uuid, uuid, text, text, text, boolean, boolean)',
    'public.portal_sms_out(uuid, uuid, integer, text, boolean, boolean)',
    'public.portal_email_gate(uuid, uuid, text, boolean)',
    'public.portal_email_in(uuid, uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
