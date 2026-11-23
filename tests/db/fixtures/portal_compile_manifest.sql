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

  insert into public.agent_manifests (spec_id, business_id, skill_id, manifest)
  values (s.id, o.business_id, s.skill_id, m)
  on conflict (spec_id) do update set business_id = excluded.business_id, skill_id = excluded.skill_id, manifest = excluded.manifest, compiled_at = now();

  if exists (select 1 from public.primitives p where p.id = any(v_uses) and p.needs_baa) then
    update public.businesses set health_lane = true, updated_at = now() where id = o.business_id and not health_lane;
  end if;

  perform public.portal_sync_connections(o.business_id);
  return m;
end $function$;
