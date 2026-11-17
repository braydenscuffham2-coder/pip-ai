-- Portal phase 10: a watchdog. Every 15 minutes the database knocks on each part of Pip and checks the answers to the
-- previous knock. If a part did not answer the way a healthy one does, the founder gets one email (at most every 6 hours).
-- A healthy answer: pip-turn refuses a caller with no pass (403), pip-run has no such page (404), pip-portal's public
-- settings load (200), and the website's chat route rejects an empty request (400).
create or replace function public.portal_watchdog() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare prev jsonb; k text; want int; r record; bad text[] := '{}'; ids jsonb; base text := 'https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/';
  site text; expect jsonb := '{"pip-turn":403,"pip-run":404,"pip-portal":200,"website":400}'::jsonb;
begin
  select value into prev from public.forge_settings where key = 'watchdog_pings';
  if prev is not null and (prev->>'at')::timestamptz > now() - interval '40 minutes' then
    for k, want in select key, value::int from jsonb_each_text(expect) loop
      if prev->'ids' ? k then
        select status_code, timed_out into r from net._http_response where id = (prev->'ids'->>k)::bigint;
        if not found or coalesce(r.timed_out, false) or r.status_code is distinct from want then
          bad := bad || (k || ' (' || coalesce(r.status_code::text, 'no answer') || ')');
        end if;
      end if;
    end loop;
  end if;
  if array_length(bad, 1) > 0 and not exists (select 1 from public.portal_notices pn where pn.subject = 'Part of Pip is not answering' and pn.created_at > now() - interval '6 hours') then
    perform public.portal_notify(null, 'founder', 'Part of Pip is not answering', 'Part of Pip is not answering',
      array['Not answering as expected: ' || array_to_string(bad, ', '), 'Checked every 15 minutes. You will hear again in 6 hours if it is still down.']);
  end if;
  select regexp_replace(coalesce(value #>> '{}', ''), '^(https?://[^/]+).*$', '\1') into site from public.forge_settings where key = 'portal_url';
  ids := jsonb_build_object(
    'pip-turn', net.http_post(url := base || 'pip-turn/turn', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 20000),
    'pip-run', net.http_post(url := base || 'pip-run/ping', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 20000),
    'pip-portal', net.http_get(url := base || 'pip-portal/config', timeout_milliseconds := 20000));
  if site ~ '^https://' then
    ids := ids || jsonb_build_object('website', net.http_post(url := site || '/api/runtime/chat', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 20000));
  end if;
  insert into public.forge_settings (key, value) values ('watchdog_pings', jsonb_build_object('at', now(), 'ids', ids, 'last_bad', to_jsonb(bad)))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('bad', to_jsonb(bad), 'sent', ids);
end $$;
revoke all on function public.portal_watchdog() from public, anon, authenticated;
grant execute on function public.portal_watchdog() to service_role;
select cron.schedule('pip-watchdog', '*/15 * * * *', $c$select public.portal_watchdog()$c$);
