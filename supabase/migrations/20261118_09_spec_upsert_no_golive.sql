-- Go-live stays with Brayden, through the Forge. The website's older spec route (POST /api/specs -> pip_spec_upsert)
-- could set any status, including 'live', and could rewrite a teammate that was already live, with none of the
-- go-live checks. It needed two server secrets, so it was not open to outsiders, but it was a second door.
-- After this: the website path can never make a teammate live, and can never change one that is live.
create or replace function public.pip_spec_upsert(p_secret text, p_id uuid, p_business text, p_domain text, p_status text, p_spec jsonb, p_brain jsonb, p_quote jsonb, p_tests jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v uuid; cur text;
begin
  if not pip_ok(p_secret) then raise exception 'denied'; end if;
  if p_status = 'live' then raise exception 'go_live_is_not_done_here'; end if;
  if p_id is null then
    insert into skill_specs(business, domain, skill_id, version, status, spec, brain, quote, tests)
    values (left(p_business,120), left(p_domain,120), coalesce(p_spec->>'skill_id','skill'), coalesce((p_spec->>'version')::int,1), p_status, p_spec, p_brain, p_quote, p_tests)
    returning id into v;
  else
    select status into cur from skill_specs where id = p_id for update;
    if cur = 'live' then raise exception 'live_teammates_change_through_the_forge'; end if;
    update skill_specs set status = p_status, spec = p_spec, brain = p_brain, quote = p_quote, tests = p_tests,
      version = coalesce((p_spec->>'version')::int, version), updated_at = now() where id = p_id returning id into v;
  end if;
  return v;
end $function$;

-- A trigger function is not something to call by hand. Close it to the public roles.
revoke execute on function public.api_needs_after_insert() from anon, authenticated, public;
