create or replace function public.portal_golive_gate() returns trigger
  language plpgsql security definer set search_path to '' as $function$
declare b public.businesses; miss text;
begin
  if new.status = 'live' and coalesce(old.status, '') <> 'live' then
    if new.order_id is null or not public.portal_flag('portal_golive_gate', true) then return new; end if;
    select bz.* into b from public.build_orders o join public.businesses bz on bz.id = o.business_id where o.id = new.order_id;
    if not found then return new; end if;

    if b.status in ('disconnected', 'cancelled') then
      raise exception 'portal: this business disconnected Pip, so nothing can go live' using errcode = 'P0001';
    end if;
    if b.price_accepted_at is null then
      raise exception 'portal: the owner has not accepted the price yet' using errcode = 'P0001';
    end if;
    if b.state is null or b.timezone is null then
      raise exception 'portal: the business state and time zone are not set, so local rules cannot be applied' using errcode = 'P0001';
    end if;

    select string_agg(c.label, ', ' order by c.sort) into miss
    from public.business_connections bc join public.connection_catalog c on c.slot = bc.slot
    where bc.business_id = b.id and bc.blocks_golive and bc.status <> 'active' and new.skill_id = any(bc.agents);
    if miss is not null then
      raise exception 'portal: connect these before going live: %', miss using errcode = 'P0001';
    end if;

    if b.health_lane then
      select string_agg(x.party, ', ') into miss from public.portal_health_missing(b.id, new.id) x;
      if miss is not null then
        raise exception 'health: signed agreements are missing for: %', miss using errcode = 'P0001';
      end if;
    end if;

    if exists (select 1 from public.agent_manifests am where am.spec_id = new.id
               and am.manifest->'uses' ?| array['edge_box','nvr_pull','vision_count','vision_queue','vision_zones'])
       and exists (select 1 from public.jurisdiction_rules j where j.state = b.state and j.biometric is not null)
       and not exists (select 1 from public.business_agreements a where a.business_id = b.id and a.kind = 'camera_signoff' and a.status = 'signed') then
      raise exception 'camera: % has a biometric privacy law; record a legal sign-off for this business before a camera agent goes live', b.state using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$;
