-- A business's Pip phone number can be bought by Pip itself (Nov 27, 2026).
--
-- Until now a number was bought by hand in Twilio's console and typed into the Portal's founder card. pip-line now
-- buys it with Pip's own Twilio account. This file is the part the database decides:
--   line_claim    one buy at a time, never a second number for a business that has one, never more numbers than
--                 forge_settings 'line_buy'.max_lines, and nothing at all unless 'line_buy'.on is true
--   line_assign   writes the bought number on the business's line
--   line_unclaim  lets a buy that Twilio plainly refused be tried again at once
-- A number costs money every month, so the switch starts with room for exactly one number.

alter table public.phone_lines
  add column if not exists provider_sid text,
  add column if not exists buying_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'phone_lines_provider_sid_chk') then
    alter table public.phone_lines add constraint phone_lines_provider_sid_chk check (provider_sid is null or provider_sid ~ '^PN[0-9a-f]{32}$');
  end if;
end $$;
-- Two businesses can never share a number that is in use.
create unique index if not exists phone_lines_pip_number_in_use on public.phone_lines (pip_number) where pip_number is not null and status <> 'released';

insert into public.forge_settings (key, value, updated_at)
values ('line_buy', '{"on": true, "max_monthly_usd": 1.2, "max_lines": 1, "note": "Nov 27, 2026: Brayden approved one number at about $1.15 a month, for TEST Fork."}'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.line_claim(p_business uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare pl public.phone_lines; b public.businesses; v_cfg jsonb; v_max int; v_have int; v_price numeric;
begin
  select value into v_cfg from public.forge_settings where key = 'line_buy';
  if v_cfg is null or jsonb_typeof(v_cfg) is distinct from 'object' or (v_cfg->'on') is distinct from 'true'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'off');
  end if;
  if jsonb_typeof(v_cfg->'max_monthly_usd') is distinct from 'number' or jsonb_typeof(v_cfg->'max_lines') is distinct from 'number' then
    return jsonb_build_object('ok', false, 'reason', 'no_ceiling');
  end if;
  v_price := (v_cfg->>'max_monthly_usd')::numeric;
  v_max := least(greatest(floor((v_cfg->>'max_lines')::numeric)::int, 0), 500);
  select * into b from public.businesses where id = p_business;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_business'); end if;
  if b.status in ('disconnected', 'cancelled') then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;

  perform pg_advisory_xact_lock(hashtext('pip_line_buy'));          -- one claim at a time, for every business
  insert into public.phone_lines (business_id, status, updated_at) values (p_business, 'requested', now())
  on conflict (business_id) do nothing;
  select * into pl from public.phone_lines where business_id = p_business for update;
  if pl.pip_number is not null and pl.status <> 'released' then
    return jsonb_build_object('ok', false, 'reason', 'has_number', 'number', pl.pip_number, 'status', pl.status);
  end if;
  if pl.buying_at is not null and pl.buying_at > now() - interval '3 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'in_progress');
  end if;
  select count(*) into v_have from public.phone_lines l
   where l.business_id <> p_business
     and ((l.pip_number is not null and l.status <> 'released') or (l.buying_at is not null and l.buying_at > now() - interval '3 minutes'));
  if v_have >= v_max then return jsonb_build_object('ok', false, 'reason', 'cap', 'have', v_have, 'max', v_max); end if;

  update public.phone_lines set buying_at = now(), updated_at = now() where business_id = p_business;
  return jsonb_build_object('ok', true, 'max_monthly_usd', v_price, 'name', b.name);
end $$;

create or replace function public.line_assign(p_business uuid, p_number text, p_sid text, p_spec uuid default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare pl public.phone_lines; v_spec uuid;
begin
  if coalesce(p_number, '') !~ '^\+1[2-9][0-9]{9}$' or coalesce(p_sid, '') !~ '^PN[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  select * into pl from public.phone_lines where business_id = p_business for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_claim'); end if;
  if pl.pip_number is not null and pl.status <> 'released' and pl.pip_number <> p_number then
    return jsonb_build_object('ok', false, 'reason', 'has_number', 'number', pl.pip_number);
  end if;
  -- The teammate named to answer must belong to this business. Whether it may answer is decided on every call
  -- (voice_line_ctx): a teammate that is not live answers only for a TEST business.
  if p_spec is not null then
    select s.id into v_spec from public.skill_specs s join public.build_orders o on o.id = s.order_id
     where s.id = p_spec and o.business_id = p_business;
  end if;
  update public.phone_lines
     set pip_number = p_number, provider_sid = p_sid,
         status = case when status in ('requested', 'released') then 'number_assigned' else status end,
         spec_id = coalesce(v_spec, spec_id), buying_at = null, updated_at = now()
   where business_id = p_business;
  insert into public.activity_log (business_id, kind, summary, outcome, actor)
  values (p_business, 'connection', 'Pip set up a phone number for this business: ' || p_number || '.', 'info', 'Pip');
  return jsonb_build_object('ok', true, 'number', p_number, 'spec', coalesce(v_spec, pl.spec_id));
end $$;

create or replace function public.line_unclaim(p_business uuid) returns void
language sql security definer set search_path to '' as $$
  update public.phone_lines set buying_at = null, updated_at = now() where business_id = p_business and buying_at is not null;
$$;

revoke all on function public.line_claim(uuid) from public, anon, authenticated;
revoke all on function public.line_assign(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.line_unclaim(uuid) from public, anon, authenticated;
grant execute on function public.line_claim(uuid) to service_role;
grant execute on function public.line_assign(uuid, text, text, uuid) to service_role;
grant execute on function public.line_unclaim(uuid) to service_role;

-- undo (by hand): update forge_settings set value = jsonb_set(value, '{on}', 'false') where key = 'line_buy';
--   drop function public.line_claim(uuid); drop function public.line_assign(uuid, text, text, uuid); drop function public.line_unclaim(uuid);
--   drop index public.phone_lines_pip_number_in_use;
--   alter table public.phone_lines drop column provider_sid, drop column buying_at;
--   A number that was bought stays on Twilio's bill until it is released in Twilio's console.
