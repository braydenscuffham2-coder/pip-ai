-- The Pip page on the website (public/app.html) makes its model calls through /api/sample on Pip's Anthropic key.
-- In the Claude app the same calls run on the viewer's own plan, so they had no limit. These two rows put them
-- under the spend guard like everything else a visitor can spend, and the meter below counts their dollars.
--
--   see today and this month:   select * from pip_guard_status() where kind like 'app_llm%';
--   change a limit:             update pip_limits set per_day = 20 where kind = 'app_llm_usd';

insert into public.pip_limits (kind, label, per_day, per_month, per_visitor_hour, per_visitor_day, fn_cap, also_stop_if, pausable, note) values
  ('app_llm',     'Model calls from the Pip page on the website (/api/sample)', 4000, null, 200, 500, null, 'app_llm_usd', true, 'One scan makes a few dozen calls. Over the limit the page is told rate_limited.'),
  ('app_llm_usd', 'Pip page model dollars on the Anthropic key', 10, 60, null, null, null, null, true, 'Metered from llm events with purpose app:*. New calls stop once it is reached.')
on conflict (kind) do nothing;

create or replace function public.pip_events_meter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'brain_usage' then
    perform public.pip_add('brain_usd', (new.detail->>'usd')::numeric);
  elsif new.kind = 'llm' then
    perform public.pip_add(case
      when coalesce(new.detail->>'purpose', '') like 'skill:%' then 'skill_usd'
      when coalesce(new.detail->>'purpose', '') like 'app:%' then 'app_llm_usd'
      else 'web_llm_usd' end, (new.detail->>'usd')::numeric);
  end if;
  return null;
exception when others then return null;
end $$;
revoke execute on function public.pip_events_meter() from public, anon, authenticated;
