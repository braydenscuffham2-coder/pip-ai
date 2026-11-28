-- The Brain can read what the Forge can deliver (Nov 27, 2026).
--
-- capability_list() gives each known building block's standing, by id: proven, built, blocked or not_built. It is
-- what the website's model proxy (app/api/sample) adds to the Brain's prompt, so the Brain imagines knowing which of
-- its ideas can be delivered this week. Ids and standings only: no notes, nothing about any business. Anyone may
-- read it; it says what Pip can do, which the site says in words anyway.
create or replace function public.capability_list() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(k, public.capability_status(k)), '{}'::jsonb)
    from (select key as k from public.capabilities
          union select distinct block from public.tool_catalog where enabled and block is not null) x
$$;
revoke all on function public.capability_list() from public;
grant execute on function public.capability_list() to anon, authenticated, service_role;

-- undo (by hand): drop function public.capability_list();
