-- A sign-in made through the Forge belongs to its business (Nov 27, 2026).
--
-- Found while checking Outlook: the founder's sign-in link (pip-forge-mcp client_connect) saved its connection with
-- the order but no business. The Portal and the teammate both look connections up by business, so that sign-in was
-- invisible to both: the owner signed in, Composio said "success", and nothing in Pip could use it.
--
-- The business is now filled in by the database from the order, whoever writes the row, and rows already saved
-- without one are filled in. A row with no order keeps a null business, as before.
create or replace function public.client_connections_set_business() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.business_id is null and new.order_id is not null then
    select o.business_id into new.business_id from public.build_orders o where o.id = new.order_id;
  end if;
  return new;
exception when others then return new;
end $$;
revoke all on function public.client_connections_set_business() from public, anon, authenticated;

drop trigger if exists client_connections_set_business on public.client_connections;
create trigger client_connections_set_business before insert or update on public.client_connections
  for each row execute function public.client_connections_set_business();

update public.client_connections c set business_id = o.business_id
  from public.build_orders o
 where o.id = c.order_id and c.business_id is null and o.business_id is not null;

-- undo (by hand): drop trigger client_connections_set_business on public.client_connections; drop function public.client_connections_set_business();
