-- Belt and braces on who can touch tables.
--
-- Every table in `public` has row security on. Most have no policy at all, so a signed-out visitor (`anon`) or a
-- signed-in owner (`authenticated`) already gets nothing from them: everything goes through the edge functions, which
-- use the service role. But those two roles still hold table rights left over from Supabase's defaults, which means
-- row security is the only thing standing between the public keys and those tables. If row security were ever switched
-- off on one of them by mistake, it would be readable and writable with the public key that ships in the page source.
--
-- This removes the unused rights from every table that has row security on and no policy, so two things would have to
-- go wrong instead of one. Nothing that works today changes: with no policy those roles could not read or write a row
-- anyway. Tables that DO have a policy (leads, scan_events) are left exactly as they are.
--
-- If a policy is ever added to one of these tables for owners or visitors, grant the matching right in that migration.
-- Safe to run again.
do $$
declare t record;
begin
  for t in
    select c.oid::regclass as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format('revoke all on table %s from anon, authenticated', t.tbl);
  end loop;
end $$;

-- A trigger function never needs to be callable by hand.
do $$
begin
  if to_regprocedure('public.forge_golive_guard()') is not null then
    revoke execute on function public.forge_golive_guard() from anon, authenticated, public;
  end if;
end $$;
