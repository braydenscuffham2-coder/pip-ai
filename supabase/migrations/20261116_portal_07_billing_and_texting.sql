-- NOT YET APPLIED (waiting for Brayden's approval in Supabase). Apply as migration "portal_07_billing_and_texting".
-- Portal phase 7: monthly billing from go-live day, usage beyond the plan billed in arrears (never a cut-off for usage),
-- and the database side of inbound texting. Stripe and Twilio calls happen in the pip-run function; the rules live here.

insert into public.forge_settings (key, value) values
  ('billing_defaults', '{"included_pct":40,"threshold_usd":100,"grace_days":7,"rates":{"conversation":0.15,"sms":0.04,"voice_minute":0.25}}'::jsonb)
on conflict (key) do nothing;

alter table public.businesses add column if not exists stripe_subscription_id text check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]{6,60}$');
alter table public.businesses add column if not exists billing_status text not null default 'none' check (billing_status in ('none','due','active','past_due','paused','ended'));
alter table public.businesses add column if not exists billing_started_at timestamptz;
alter table public.businesses add column if not exists past_due_since timestamptz;

create table if not exists public.billing_overage (
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_start date not null,
  usage_value_usd numeric not null default 0,
  included_usd numeric not null default 0,
  itemized_usd numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, period_start)
);
alter table public.billing_overage enable row level security;
revoke all on public.billing_overage from anon, authenticated;
grant select, insert, update, delete on public.billing_overage to service_role;

-- Every saved price carries its usage terms in numbers: what is included and the rate for each kind of use.
create or replace function public.portal_quote_defaults() returns trigger
language plpgsql security definer set search_path to '' as $$
declare d jsonb; m numeric; v_rates jsonb; v_inc numeric;
begin
  if new.quote is null or jsonb_typeof(new.quote) <> 'object' then return new; end if;
  select value into d from public.forge_settings where key = 'billing_defaults';
  d := coalesce(d, '{}'::jsonb);
  m := coalesce(nullif(new.quote->>'monthly_usd', '')::numeric, 0);
  if tg_op = 'UPDATE' then
    if old.quote is not null and jsonb_typeof(old.quote) = 'object' then
      v_rates := old.quote->'rates';
      v_inc := nullif(old.quote->>'included_usd', '')::numeric;
    end if;
  end if;
  if not (new.quote ? 'rates') then
    new.quote := new.quote || jsonb_build_object('rates', coalesce(v_rates, d->'rates', '{}'::jsonb));
  end if;
  if not (new.quote ? 'included_usd') then
    new.quote := new.quote || jsonb_build_object('included_usd', coalesce(v_inc, round(m * coalesce((d->>'included_pct')::numeric, 0) / 100, 2)));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists businesses_quote_defaults on public.businesses;
create trigger businesses_quote_defaults before insert or update of quote on public.businesses
for each row execute function public.portal_quote_defaults();

-- Go-live day starts the clock.
create or replace function public.portal_on_golive() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'live' and coalesce(old.status, '') <> 'live' and new.order_id is not null then
    update public.businesses b
       set status = case when b.status in ('building', 'priced', 'setup', 'ready') then 'live' else b.status end,
           billing_status = case when b.billing_status = 'none' then 'due' else b.billing_status end,
           billing_started_at = coalesce(b.billing_started_at, now()), updated_at = now()
      from public.build_orders o where o.id = new.order_id and b.id = o.business_id;
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists skill_specs_portal_golive on public.skill_specs;
create trigger skill_specs_portal_golive after update of status on public.skill_specs
for each row execute function public.portal_on_golive();

create or replace function public.portal_period_start(p_started timestamptz, p_at timestamptz default now())
returns timestamptz language sql stable set search_path to '' as $$
  select p_started + make_interval(months => greatest(0, (extract(year from age(p_at, p_started)) * 12 + extract(month from age(p_at, p_started)))::int))
$$;

create or replace function public.portal_usage_summary(p_business uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path to '' as $$
  with b as (select quote from public.businesses where id = p_business),
  u as (select ue.unit, sum(ue.qty) as qty from public.usage_events ue
        where ue.business_id = p_business and ue.at >= p_from and ue.at < p_to group by ue.unit),
  v as (select u.unit, u.qty, coalesce(nullif((select b.quote->'rates'->>u.unit from b), '')::numeric, 0) as rate from u)
  select jsonb_build_object('from', p_from, 'to', p_to,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('unit', v.unit, 'qty', v.qty, 'rate_usd', v.rate, 'value_usd', round(v.qty * v.rate, 2)) order by v.unit) from v), '[]'::jsonb),
    'value_usd', coalesce((select round(sum(v.qty * v.rate), 2) from v), 0),
    'included_usd', coalesce(nullif((select b.quote->>'included_usd' from b), '')::numeric, 0))
$$;

-- What the billing run should do right now. It only reads; the pip-run function acts and reports back.
create or replace function public.portal_billing_tick() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r public.businesses; res jsonb := '[]'::jsonb; d jsonb; thr numeric; ps timestamptz; p timestamptz; p_end timestamptz;
  s jsonb; ovg numeric; v_item numeric; v_upd timestamptz; delta numeric; m numeric;
begin
  select value into d from public.forge_settings where key = 'billing_defaults';
  thr := coalesce((d->>'threshold_usd')::numeric, 100);
  for r in select * from public.businesses b where b.billing_status in ('due', 'active', 'past_due', 'paused') and b.status <> 'cancelled' loop
    if r.billing_status = 'due' then
      m := coalesce(nullif(r.quote->>'monthly_usd', '')::numeric, 0);
      if r.stripe_customer_id is not null and r.card_on_file_at is not null and m > 0 then
        res := res || jsonb_build_object('do', 'start', 'business', r.id, 'customer', r.stripe_customer_id, 'name', r.name,
          'monthly_cents', round(m * 100)::int, 'setup_cents', round(coalesce(nullif(r.quote->>'setup_usd', '')::numeric, 0) * 100)::int);
      end if;
      continue;
    end if;
    if r.stripe_subscription_id is null or r.billing_started_at is null then continue; end if;
    res := res || jsonb_build_object('do', 'check', 'business', r.id, 'subscription', r.stripe_subscription_id);
    ps := public.portal_period_start(r.billing_started_at);
    foreach p in array array[ps - interval '1 month', ps] loop
      if p < r.billing_started_at - interval '2 days' then continue; end if;
      p_end := case when p < ps then ps else now() end;
      s := public.portal_usage_summary(r.id, greatest(p, r.billing_started_at), p_end);
      ovg := greatest(0, (s->>'value_usd')::numeric - (s->>'included_usd')::numeric);
      v_item := 0; v_upd := null;
      select bo.itemized_usd, bo.updated_at into v_item, v_upd from public.billing_overage bo where bo.business_id = r.id and bo.period_start = p::date;
      delta := round(ovg - coalesce(v_item, 0), 2);
      if delta >= 1 and (p < ps or v_upd is null or v_upd < now() - interval '20 hours' or delta >= thr) then
        res := res || jsonb_build_object('do', 'overage', 'business', r.id, 'customer', r.stripe_customer_id, 'period_start', p::date,
          'amount_cents', round(delta * 100)::int, 'already_cents', round(coalesce(v_item, 0) * 100)::int,
          'value_usd', s->'value_usd', 'included_usd', s->'included_usd', 'invoice_now', delta >= thr);
      end if;
    end loop;
  end loop;
  return res;
end $$;

create or replace function public.portal_billing_pause(p_business uuid, p_on boolean) returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; n int := 0;
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
      begin
        update public.agent_pauses set resumed_at = now(), resumed_by = 'billing' where id = r.id;
        update public.skill_specs set status = 'live', updated_at = now() where id = r.spec_id and status = 'paused';
        n := n + 1;
      exception when others then null;
      end;
    end loop;
  end if;
  return n;
end $$;

create or replace function public.portal_billing_report(p_business uuid, p_event text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b public.businesses; d jsonb; grace int; v text := coalesce(p_data->>'status', ''); amt numeric;
begin
  select * into b from public.businesses where id = p_business for update;
  if not found then return jsonb_build_object('ok', false); end if;
  select value into d from public.forge_settings where key = 'billing_defaults';
  grace := coalesce((d->>'grace_days')::int, 7);

  if p_event = 'started' then
    update public.businesses set stripe_subscription_id = p_data->>'subscription',
      billing_status = case when v in ('active', 'trialing') then 'active' else 'past_due' end,
      past_due_since = case when v in ('active', 'trialing') then null else now() end, updated_at = now()
    where id = b.id;
    insert into public.activity_log (business_id, kind, summary, outcome, actor)
    values (b.id, 'system', 'Billing started: $' || coalesce(b.quote->>'monthly_usd', '0') || ' a month', 'info', 'pip');
  elsif p_event = 'itemized' then
    amt := coalesce((p_data->>'amount_usd')::numeric, 0);
    insert into public.billing_overage (business_id, period_start, usage_value_usd, included_usd, itemized_usd)
    values (b.id, (p_data->>'period_start')::date, coalesce((p_data->>'value_usd')::numeric, 0), coalesce((p_data->>'included_usd')::numeric, 0), amt)
    on conflict (business_id, period_start) do update set usage_value_usd = excluded.usage_value_usd, included_usd = excluded.included_usd,
      itemized_usd = public.billing_overage.itemized_usd + excluded.itemized_usd, updated_at = now();
    insert into public.activity_log (business_id, kind, summary, outcome, actor)
    values (b.id, 'system', 'Usage beyond your plan: $' || to_char(amt, 'FM999990.00') || ' added to your next invoice', 'info', 'pip');
  elsif p_event = 'status' then
    if v in ('active', 'trialing') then
      if b.billing_status in ('past_due', 'paused') then
        update public.businesses set billing_status = 'active', past_due_since = null, updated_at = now() where id = b.id;
        perform public.portal_billing_pause(b.id, false);
        perform public.portal_notify(b.id, 'owners', 'Payment received', 'Payment received', array['Thank you. Your team is running.']);
      end if;
    elsif v in ('past_due', 'unpaid', 'incomplete') then
      if b.billing_status = 'active' then
        update public.businesses set billing_status = 'past_due', past_due_since = now(), updated_at = now() where id = b.id;
        perform public.portal_notify(b.id, 'owners', 'Your payment did not go through', 'Your payment did not go through',
          array['Your card was declined.', case when grace >= 0 then 'Update the card in your Pip Portal within ' || grace || ' days to keep your team running.' else 'Please update the card in your Pip Portal.' end]);
        perform public.portal_notify(b.id, 'founder', 'Payment failed: ' || b.name, 'A payment failed', array['Business: ' || b.name]);
      elsif b.billing_status = 'past_due' and grace >= 0 and b.past_due_since < now() - make_interval(days => grace) then
        update public.businesses set billing_status = 'paused', updated_at = now() where id = b.id;
        perform public.portal_billing_pause(b.id, true);
        perform public.portal_notify(b.id, 'owners', 'Your team is paused', 'Your team is paused',
          array['A payment is still overdue.', 'Update the card in your Pip Portal and your team starts again on its own.']);
        perform public.portal_notify(b.id, 'founder', 'Paused for non-payment: ' || b.name, 'Paused for non-payment', array['Business: ' || b.name]);
      end if;
    elsif v in ('canceled', 'incomplete_expired') then
      update public.businesses set billing_status = 'ended', updated_at = now() where id = b.id;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Chats count as conversations; texts and calls are counted in their own units by the line handlers.
create or replace function public.portal_conv_log() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  select * into c from public.portal_spec_ctx(new.spec_id);
  if c.business_id is null or c.spec_status <> 'live' then return new; end if;
  insert into public.activity_log (business_id, spec_id, agent, kind, summary, outcome, actor, ref)
  values (c.business_id, new.spec_id, c.teammate, 'action',
          c.teammate || ' started a conversation (' || case coalesce(new.channel, 'chat') when 'sms' then 'text message' when 'voice' then 'phone call' else replace(coalesce(new.channel, 'chat'), '_', ' ') end || ')', 'ok', 'agent',
          jsonb_build_object('conversation', new.id));
  if coalesce(new.channel, '') not in ('sms', 'voice') then
    insert into public.usage_events (business_id, spec_id, unit, qty) values (c.business_id, new.spec_id, 'conversation', 1);
  end if;
  return new;
exception when others then return new;
end $$;

-- ---------- texting ----------
create or replace function public.portal_line_ctx(p_to text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_num text := regexp_replace(coalesce(p_to, ''), '\D', '', 'g'); b public.businesses; v_spec uuid; v_mate text;
begin
  if length(v_num) = 10 then v_num := '1' || v_num; end if;
  select bz.* into b from public.phone_lines pl join public.businesses bz on bz.id = pl.business_id
   where regexp_replace(coalesce(pl.pip_number, ''), '\D', '', 'g') in (v_num, right(v_num, 10)) and pl.status <> 'released' limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  select s.id, coalesce(am.manifest->>'teammate', s.skill_id) into v_spec, v_mate
  from public.skill_specs s join public.build_orders o on o.id = s.order_id
  join public.business_connections bc on bc.business_id = o.business_id and bc.slot = 'texting' and s.skill_id = any(bc.agents)
  left join public.agent_manifests am on am.spec_id = s.id
  where o.business_id = b.id and s.status = 'live' order by s.created_at limit 1;
  return jsonb_build_object('ok', true, 'business', b.id, 'name', b.name, 'status', b.status, 'spec', v_spec, 'teammate', v_mate);
end $$;

create or replace function public.portal_sms_in(p_business uuid, p_spec uuid, p_from text, p_kind text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_hash text := public.portal_contact_hash(p_business, 'phone', p_from); v_hint text := right(public.portal_contact_norm('phone', p_from), 4);
  v_last text; chk jsonb; v_conv uuid; v_first boolean;
begin
  if p_kind = 'stop' then
    insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
    values (p_business, v_hash, v_hint, 'phone', 'any', 'any', 'revoked', 'keyword_stop', '{"heard_on":"sms"}'::jsonb, p_spec, 'agent');
    insert into public.compliance_events (business_id, spec_id, kind, channel, contact_hash, detail)
    values (p_business, p_spec, 'opt_out', 'sms', v_hash, '{}'::jsonb);
    return jsonb_build_object('allowed', false, 'reason', 'opted_out');
  end if;
  select cl.status into v_last from public.consent_ledger cl
   where cl.business_id = p_business and cl.contact_hash = v_hash and cl.channel in ('sms', 'any') order by cl.at desc, cl.id desc limit 1;
  if p_kind = 'start' or (p_kind = 'message' and v_last is null) then
    insert into public.consent_ledger (business_id, contact_hash, contact_hint, contact_kind, channel, purpose, status, method, proof, spec_id, recorded_by)
    values (p_business, v_hash, v_hint, 'phone', 'sms', 'transactional', 'granted', 'inbound_message',
            jsonb_build_object('note', case when p_kind = 'start' then 'Texted START' else 'Texted the business first' end), p_spec, 'agent');
    if p_kind = 'start' then return jsonb_build_object('allowed', false, 'reason', 'rejoined'); end if;
  end if;
  if p_spec is null then return jsonb_build_object('allowed', false, 'reason', 'no_teammate'); end if;
  chk := public.portal_outbound_check(p_business, v_hash, 'sms', 'transactional', true, p_spec);
  if not coalesce((chk->>'allowed')::boolean, false) then return jsonb_build_object('allowed', false, 'reason', chk->>'reason'); end if;
  select cv.id into v_conv from public.conversations cv
   where cv.spec_id = p_spec and cv.channel = 'sms' and cv.visitor = 'sms:' || left(v_hash, 16) and cv.created_at > now() - interval '24 hours'
   order by cv.created_at desc limit 1;
  if v_conv is null then
    begin
      insert into public.conversations (spec_id, channel, visitor) values (p_spec, 'sms', 'sms:' || left(v_hash, 16)) returning id into v_conv;
    exception when others then return jsonb_build_object('allowed', false, 'reason', 'paused');
    end;
  end if;
  v_first := not exists (select 1 from public.messages m where m.conversation_id = v_conv and m.role = 'assistant');
  return jsonb_build_object('allowed', true, 'conversation', v_conv, 'first', v_first);
end $$;

create or replace function public.portal_sms_out(p_business uuid, p_spec uuid, p_segments integer) returns void
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.usage_events (business_id, spec_id, unit, qty, provider) values (p_business, p_spec, 'sms', greatest(1, coalesce(p_segments, 1)), 'twilio');
end $$;

-- ---------- Portal actions: usage for owners, usage terms for the founder ----------
create or replace function public.portal_api_usage(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare b public.businesses; ps timestamptz; s jsonb;
begin
  select * into b from public.businesses where id = p_business;
  if b.billing_started_at is null then
    return jsonb_build_object('ok', true, 'billing_status', b.billing_status, 'monthly_usd', b.quote->'monthly_usd',
      'included_usd', b.quote->'included_usd', 'rates', b.quote->'rates', 'started', null);
  end if;
  ps := public.portal_period_start(b.billing_started_at);
  s := public.portal_usage_summary(b.id, ps, now());
  return jsonb_build_object('ok', true, 'billing_status', b.billing_status, 'monthly_usd', b.quote->'monthly_usd',
    'included_usd', s->'included_usd', 'rates', b.quote->'rates', 'started', b.billing_started_at, 'period_start', ps,
    'period_end', ps + interval '1 month', 'lines', s->'lines', 'value_usd', s->'value_usd',
    'beyond_plan_usd', greatest(0, (s->>'value_usd')::numeric - (s->>'included_usd')::numeric), 'past_due_since', b.past_due_since);
end $$;

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
    q := q || jsonb_build_object('rates', r);
  end if;
  if p_args ? 'included_usd' then
    if coalesce(p_args->>'included_usd', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then return jsonb_build_object('ok', false, 'status', 400, 'error', 'bad_request'); end if;
    inc := (p_args->>'included_usd')::numeric;
    q := q || jsonb_build_object('included_usd', inc);
  end if;
  update public.businesses set quote = q, updated_at = now() where id = p_business;
  return jsonb_build_object('ok', true, 'included_usd', q->'included_usd', 'rates', q->'rates');
end $$;

create or replace function public.portal_api(p_name text, p_business uuid, p_email text, p_fresh boolean, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_role text; a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'status', 401, 'error', 'sign_in'); end if;
  if exists (select 1 from public.platform_admins pa where lower(pa.email) = v_email) then
    v_role := 'founder';
  elsif p_business is not null then
    select m.role into v_role from public.members m where m.business_id = p_business and m.email = v_email and m.status <> 'removed';
  end if;
  if v_role is null then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
  if p_name = 'supervise_now' then
    if v_role <> 'founder' then return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'result', public.portal_supervise());
  end if;
  if p_business is null or not exists (select 1 from public.businesses bz where bz.id = p_business) then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found');
  end if;
  case p_name
    when 'founder_step' then return public.portal_api_founder_step(p_business, v_email, v_role, a);
    when 'consent_add' then return public.portal_api_consent_add(p_business, v_email, v_role, a);
    when 'consent_export' then return public.portal_api_consent_export(p_business, v_email, v_role, a);
    when 'cancel' then return public.portal_api_cancel(p_business, v_email, v_role, coalesce(p_fresh, false), a);
    when 'usage' then return public.portal_api_usage(p_business);
    when 'founder_billing' then return public.portal_api_founder_billing(p_business, v_role, a);
    when 'billing_status' then
      return (select jsonb_build_object('ok', true, 'card_on_file_at', bz.card_on_file_at, 'card_hint', bz.card_hint,
                'price_accepted', bz.price_accepted_at is not null, 'billing_status', bz.billing_status) from public.businesses bz where bz.id = p_business);
    else return jsonb_build_object('ok', false, 'status', 404, 'error', 'unknown_action');
  end case;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'portal\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

select cron.schedule('pip-run-billing', '*/10 * * * *', $c$select net.http_post(url := 'https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-run/hooks/billing', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb) where exists (select 1 from public.businesses where billing_status in ('due','active','past_due','paused'))$c$);
