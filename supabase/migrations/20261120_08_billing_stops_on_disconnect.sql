-- Billing must stop when a business leaves.
--
-- Found November 20, 2026: "Disconnect everything" and "Delete everything" stopped the teammates and revoked the tool
-- sign-ins, but nothing told Stripe. The monthly subscription would have kept charging a business that had left. A
-- business that disconnected BEFORE its first charge could even have had billing started afterwards, because the
-- billing run only skipped businesses marked cancelled. No business has been billed yet, so nobody was charged wrongly.
--
-- The rule (Terms of Service, section 8): teammates stop at once; billing stops at the end of the month already paid.
--
--   portal_billing_stops()        the list of subscriptions to end. A business that left and was never charged is
--                                 closed here straight away; there is nothing to tell Stripe.
--   portal_billing_stopped(id)    pip-run calls this after Stripe has agreed to end the subscription at the period end.
--                                 Billing for that business is then over and the billing run never picks it up again.
--
-- pip-run asks for the stops BEFORE it asks what to charge, so a business that left is never started or re-checked.
-- Not handled here: a business that comes back after disconnecting. Its billing stays ended until someone restarts it.
create or replace function public.portal_billing_stops()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare res jsonb := '[]'::jsonb; r record;
begin
  -- Left before any subscription existed: close it now, so billing can never start for a business that is gone.
  update public.businesses set billing_status = 'ended', updated_at = now()
   where status in ('disconnected', 'cancelled') and stripe_subscription_id is null
     and billing_status in ('due', 'active', 'past_due', 'paused');
  for r in select b.id, b.stripe_subscription_id from public.businesses b
            where b.status in ('disconnected', 'cancelled') and b.stripe_subscription_id is not null
              and b.billing_status in ('due', 'active', 'past_due', 'paused') loop
    res := res || jsonb_build_object('do', 'stop', 'business', r.id, 'subscription', r.stripe_subscription_id);
  end loop;
  return res;
end $$;

create or replace function public.portal_billing_stopped(p_business uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.businesses set billing_status = 'ended', updated_at = now()
   where id = p_business and status in ('disconnected', 'cancelled') and billing_status <> 'ended';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.activity_log (business_id, kind, summary, outcome, actor)
    values (p_business, 'system', 'Billing will stop at the end of the month already paid.', 'info', 'pip');
  end if;
  return jsonb_build_object('ok', n > 0);
end $$;

revoke all on function public.portal_billing_stops() from public, anon, authenticated;
revoke all on function public.portal_billing_stopped(uuid) from public, anon, authenticated;
grant execute on function public.portal_billing_stops() to service_role;
grant execute on function public.portal_billing_stopped(uuid) to service_role;
