create or replace function public.portal_job_pause(p_spec uuid, p_job text, p_reason text, p_detail text DEFAULT NULL::text)
 returns bigint language plpgsql security definer set search_path to '' as $function$
declare c record; v_id bigint; v_job text := nullif(left(btrim(coalesce(p_job, '')), 120), '');
begin
  select * into c from public.portal_spec_ctx(p_spec);
  if c.business_id is null or v_job is null then return null; end if;
  select p.id into v_id from public.agent_pauses p
  where p.spec_id = p_spec and p.job = v_job and p.reason = p_reason and p.resumed_at is null limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.agent_pauses (business_id, spec_id, job, reason, detail, prior_status, paused_by)
  values (c.business_id, p_spec, v_job, p_reason, left(p_detail, 500), c.spec_status, 'agent')
  returning id into v_id;
  insert into public.activity_log (business_id, spec_id, agent, job, kind, summary, outcome, actor)
  values (c.business_id, p_spec, c.teammate, v_job, 'pause', left(c.teammate || ' paused one job: ' || v_job, 500), 'paused', 'agent');
  perform public.portal_notify(c.business_id, 'owners', c.teammate || ' paused one job',
    c.teammate || ' paused one job',
    array['Job: ' || v_job, 'Why: ' || replace(p_reason, '_', ' '), 'Every other job keeps running.', 'Open your Pip Portal to fix it.']);
  return v_id;
end $function$;
