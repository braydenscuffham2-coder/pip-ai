-- NOT YET APPLIED (the Supabase approval prompt timed out). Apply as migration "portal_08_billing_fixes".
-- Dry-run tested inside a rolled-back transaction: all four fixes behave as described.
-- Portal phase 8: four fixes found by testing phase 7 (billing and texting).
--   1. While a business is paused for non-payment, no other route can switch a teammate back on.
--   2. When payment arrives but a teammate cannot restart (a connection broke meanwhile), the pause is handed to the
--      supervisor with the true reason, so it restarts on its own once fixed instead of sitting under "payment overdue".
--   3. Setting one usage rate no longer wipes the others (a wiped rate bills that kind of use at $0).
--   4. A daily watch tells the founder about use that is not being billed: a unit with no rate, a live team with no
--      billing started, or a live team whose subscription ended.

-- 1 ---------------------------------------------------------------------------------------------------------------
create or replace function public.portal_billing_gate() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') and new.order_id is not null then
    if exists (select 1 from public.build_orders o join public.businesses b on b.id = o.business_id
               where o.id = new.order_id and b.billing_status = 'paused') then
      raise exception 'billing: a payment is overdue, so this teammate stays paused until it is paid' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists skill_specs_portal_billing_gate on public.skill_specs;
create trigger skill_specs_portal_billing_gate before insert or update of status on public.skill_specs
for each row execute function public.portal_billing_gate();

-- 2 ---------------------------------------------------------------------------------------------------------------
create or replace function public.portal_billing_pause(p_business uuid, p_on boolean) returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; n int := 0; v_err text;
begin
  if p_on then
    for r in select s.id from public.skill_specs s join public.build_orders o on o.id = s.order_id where o.business_id = p_business and s.status = 'live' loop
      insert into public.agent_pauses (business_id, spec_id, reason, detail, prior_status, paused_by)
      values (p_business, r.id, 'billing', 'A payment is overdue', 'live', 'billing');
      update public.skill_specs set status = 'paused', updated_at = now() where id = r.id;
      n := n + 1;
    end loop;
  else
    for r in select p.id, p.spec_id from public.agent_pauses p where p.business_id = p_business and p.reason = 'billing' and p.paused_by = 'billing' and p.resumed_at is null loop
      -- someone else also paused this teammate: close the billing pause and leave theirs in charge
      if exists (select 1 from public.agent_pauses p2 where p2.spec_id = r.spec_id and p2.job is null and p2.resumed_at is null and p2.id <> r.id) then
        update public.agent_pauses set resumed_at = now(), resumed_by = 'billing' where id = r.id;
        continue;
      end if;
      begin
        update public.agent_pauses set resumed_at = now(), resumed_by = 'billing' where id = r.id;
        update public.skill_specs set status = 'live', updated_at = now() where id = r.spec_id and status = 'paused';
        n := n + 1;
      exception when others then
        v_err := regexp_replace(sqlerrm, '^[a-z]+: ', '');
        update public.agent_pauses set reason = 'missing_connection', paused_by = 'supervisor',
               detail = left('Payment received. Before this teammate restarts: ' || v_err, 500)
         where id = r.id;
      end;
    end loop;
  end if;
  return n;
end $$;

-- 3 ---------------------------------------------------------------------------------------------------------------
create or replace function public.portal_api_founder_billing(p_business uuid, p_role text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare q jsonb; k text; v text; r jsonb := '{}'::jsonb; inc numeric;
begin
  if p_role <> 'founder' then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  select quote into q from public.businesses where id = p_business;
  if q is null then return jsonb_build_object('ok', false, 'status', 409, 'error', 'no_price_yet'); end if;
  if jsonb_typeof(p_args->'rates') = 'object' then
    for k, v in select * from jsonb_each_text(p_args->'rates') loop
      if k !~ '^[a-z0-9_]{2,40}$' or v !~ '^[0-9]{1,4}(\.[0-9]{1,4})?$' then return jsonb_build_object('ok', false, 'status', 400, 'error', 'bad_request'); end if;
      r := r || jsonb_build_object(k, v::numeric);
    end loop;
    -- rates named here change; every other rate stays as it was (send 0 to make a kind of use free)
    q := q || jsonb_build_object('rates', (case when jsonb_typeof(q->'rates') = 'object' then q->'rates' else '{}'::jsonb end) || r);
  end if;
  if p_args ? 'included_usd' then
    if coalesce(p_args->>'included_usd', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then return jsonb_build_object('ok', false, 'status', 400, 'error', 'bad_request'); end if;
    inc := (p_args->>'included_usd')::numeric;
    q := q || jsonb_build_object('included_usd', inc);
  end if;
  update public.businesses set quote = q, updated_at = now() where id = p_business;
  return jsonb_build_object('ok', true, 'included_usd', q->'included_usd', 'rates', q->'rates');
end $$;

-- 4 ---------------------------------------------------------------------------------------------------------------
create or replace function public.portal_billing_watch() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r record; v_units text; v_subject text; v_live boolean; n int := 0;
begin
  for r in select b.id, b.name, b.quote, b.billing_status, b.billing_started_at, b.card_on_file_at
             from public.businesses b
            where b.billing_status in ('due', 'active', 'past_due', 'paused', 'ended') and b.status <> 'cancelled' loop
    v_live := exists (select 1 from public.skill_specs s join public.build_orders o on o.id = s.order_id
                       where o.business_id = r.id and s.status = 'live');

    select string_agg(distinct ue.unit, ', ') into v_units from public.usage_events ue
     where ue.business_id = r.id and ue.at > now() - interval '7 days'
       and not ((case when jsonb_typeof(r.quote->'rates') = 'object' then r.quote->'rates' else '{}'::jsonb end) ? ue.unit);
    v_subject := left('Usage with no rate: ' || r.name, 180);
    if v_units is not null and not exists (select 1 from public.portal_notices pn where pn.business_id = r.id
         and pn.subject = v_subject and pn.created_at > now() - interval '7 days') then
      perform public.portal_notify(r.id, 'founder', v_subject, 'Usage with no rate',
        array['Business: ' || r.name, 'Not being billed: ' || v_units, 'Set a rate for it in this business''s usage terms.']);
      n := n + 1;
    end if;

    v_subject := left('Live but not billing yet: ' || r.name, 180);
    if r.billing_status = 'due' and v_live and r.billing_started_at < now() - interval '1 day'
       and not exists (select 1 from public.portal_notices pn where pn.business_id = r.id
         and pn.subject = v_subject and pn.created_at > now() - interval '7 days') then
      perform public.portal_notify(r.id, 'founder', v_subject, 'Live but not billing yet',
        array['Business: ' || r.name,
              case when r.card_on_file_at is null then 'There is no card on file.'
                   when coalesce(nullif(r.quote->>'monthly_usd', '')::numeric, 0) <= 0 then 'There is no monthly price.'
                   else 'Billing has not started. Check the Stripe key and the billing run.' end,
              'Teammates have been running since ' || to_char(r.billing_started_at at time zone 'UTC', 'Mon DD') || '.']);
      n := n + 1;
    end if;

    v_subject := left('Billing ended, team still running: ' || r.name, 180);
    if r.billing_status = 'ended' and v_live
       and not exists (select 1 from public.portal_notices pn where pn.business_id = r.id
         and pn.subject = v_subject and pn.created_at > now() - interval '7 days') then
      perform public.portal_notify(r.id, 'founder', v_subject, 'Billing ended, team still running',
        array['Business: ' || r.name, 'The subscription was cancelled but teammates are still live.']);
      n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('flagged', n, 'at', now());
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'portal\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

select cron.schedule('pip-billing-watch', '41 16 * * *', $c$select public.portal_billing_watch()$c$);
