-- One outbound gate (Nov 27, 2026).
--
-- Every message Pip sends to a person, and every post a teammate makes to an owner's system, now asks one function
-- first: outbound_gate. It adds nothing new to the rules. Email still goes to portal_email_gate and texting to
-- portal_outbound_check (opt-out, consent on file, quiet hours, daily cap). What it adds:
--   * one switch, forge_settings.outbound_paused, that stops every channel at once;
--   * texting first (a text that is not a reply), which did not exist. It is refused unless
--     forge_settings.sms_first_on is true (it starts false), and then only with consent on file, inside the
--     allowed hours, and under the daily cap, exactly as portal_outbound_check already decides for a non-reply.
-- Safe to run twice. Nothing is dropped.

insert into public.forge_settings (key, value) values ('outbound_paused', 'false'::jsonb), ('sms_first_on', 'false'::jsonb) on conflict (key) do nothing;

create or replace function public.outbound_gate(p_business uuid, p_spec uuid, p_channel text, p_to text, p_first boolean default false, p_given_in_chat boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_num text; v_status text;
begin
  if coalesce((select value from public.forge_settings where key = 'outbound_paused'), 'false'::jsonb) = 'true'::jsonb then
    return jsonb_build_object('allowed', false, 'reason', 'paused');
  end if;
  if p_channel = 'email' then
    return public.portal_email_gate(p_business, p_spec, p_to, coalesce(p_given_in_chat, false));
  elsif p_channel = 'sms' then
    v_num := regexp_replace(coalesce(p_to, ''), '[^0-9+]', '', 'g');
    if v_num !~ '^\+?[0-9]{10,15}$' then return jsonb_build_object('allowed', false, 'reason', 'bad_request'); end if;
    if coalesce(p_first, false) and coalesce((select value from public.forge_settings where key = 'sms_first_on'), 'false'::jsonb) <> 'true'::jsonb then
      return jsonb_build_object('allowed', false, 'reason', 'texting_first_off');
    end if;
    return public.portal_outbound_check(p_business, public.portal_contact_hash(p_business, 'phone', v_num), 'sms', 'transactional', not coalesce(p_first, false), p_spec);
  elsif p_channel = 'post' then
    select status into v_status from public.businesses where id = p_business;
    if v_status is null then return jsonb_build_object('allowed', false, 'reason', 'unknown_business'); end if;
    if v_status in ('disconnected', 'cancelled') then return jsonb_build_object('allowed', false, 'reason', 'business_disconnected'); end if;
    return jsonb_build_object('allowed', true);
  end if;
  return jsonb_build_object('allowed', false, 'reason', 'bad_request');
end $$;
revoke all on function public.outbound_gate(uuid, uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.outbound_gate(uuid, uuid, text, text, boolean, boolean) to service_role;

-- undo (by hand): drop function public.outbound_gate(uuid, uuid, text, text, boolean, boolean);
--   delete from public.forge_settings where key in ('outbound_paused', 'sms_first_on');
