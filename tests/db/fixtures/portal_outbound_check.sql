-- A copy of the live portal_outbound_check (migrations portal_01 to portal_04 are not in this repo), so database tests
-- can run the new outbound-record functions against the real gate. Taken from the live project on 2026-11-22.
CREATE OR REPLACE FUNCTION public.portal_outbound_check(p_business uuid, p_contact_hash text, p_channel text, p_purpose text DEFAULT 'transactional'::text, p_is_reply boolean DEFAULT false, p_spec uuid DEFAULT NULL::uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.businesses; d public.jurisdiction_rules; st public.jurisdiction_rules;
  v_last text; v_ok boolean := true; v_why text; v_local timestamp; v_key text;
  v_from time; v_to time; v_max int; v_n int;
begin
  select * into b from public.businesses where id = p_business;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'unknown_business'); end if;
  if p_channel not in ('sms', 'voice', 'email') or p_purpose not in ('transactional', 'marketing')
     or p_contact_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed', false, 'reason', 'bad_request');
  end if;
  if b.status in ('disconnected', 'cancelled') then v_ok := false; v_why := 'business_disconnected'; end if;

  if v_ok then
    select cl.status into v_last from public.consent_ledger cl
    where cl.business_id = p_business and cl.contact_hash = p_contact_hash and cl.channel in (p_channel, 'any')
    order by cl.at desc, cl.id desc limit 1;
    if v_last = 'revoked' then v_ok := false; v_why := 'opted_out'; end if;
  end if;

  if v_ok and not p_is_reply then
    if not exists (
      select 1 from public.consent_ledger cl
      where cl.business_id = p_business and cl.contact_hash = p_contact_hash and cl.channel in (p_channel, 'any')
        and cl.status = 'granted'
        and (p_purpose = 'transactional' or (cl.purpose in ('marketing', 'any') and cl.method <> 'imported_by_business'))
    ) then
      v_ok := false; v_why := case when p_purpose = 'marketing' then 'no_marketing_consent' else 'no_consent_on_file' end;
    end if;
  end if;

  if v_ok and not p_is_reply and p_channel in ('sms', 'voice') then
    if b.timezone is null then
      v_ok := false; v_why := 'time_zone_not_set';
    else
      select * into d from public.jurisdiction_rules where state = 'US';
      select * into st from public.jurisdiction_rules where state = b.state;
      v_local := p_at at time zone b.timezone;
      v_key := case when extract(dow from v_local) = 0 then 'sun' else 'mon_sat' end;
      v_from := greatest(coalesce((d.outbound_hours->v_key->>0)::time, time '09:00'), coalesce((st.outbound_hours->v_key->>0)::time, time '00:00'));
      v_to := least(coalesce((d.outbound_hours->v_key->>1)::time, time '20:00'), coalesce((st.outbound_hours->v_key->>1)::time, time '23:59'));
      if v_local::time < v_from or v_local::time >= v_to then v_ok := false; v_why := 'outside_hours'; end if;
    end if;
  end if;

  if v_ok and not p_is_reply and (p_purpose = 'marketing' or p_channel = 'voice') then
    v_max := least(coalesce(d.max_attempts_24h, 3), coalesce(st.max_attempts_24h, 3));
    select count(*) into v_n from public.compliance_events ce
    where ce.business_id = p_business and ce.contact_hash = p_contact_hash and ce.kind = 'outbound_allowed'
      and ce.channel = p_channel and ce.at > p_at - interval '24 hours';
    if v_n >= v_max then v_ok := false; v_why := 'too_many_attempts'; end if;
  end if;

  insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
  values (p_business, p_spec, case when v_ok then 'outbound_allowed' else 'outbound_blocked' end, p_channel, p_contact_hash,
          jsonb_build_object('purpose', p_purpose, 'reply', p_is_reply, 'reason', v_why));
  return jsonb_build_object('allowed', v_ok, 'reason', v_why);
end $function$;
