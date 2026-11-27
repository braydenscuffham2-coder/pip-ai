-- A switch for Browserbase's paid "keep alive" (Nov 27, 2026). It starts false, which is today's behaviour.
-- With it true, setup-run and pip-work ask for a browser that survives a connection closing, which the Setup Agent
-- and a sign-in from the vault both need. Turn it on only after the Browserbase plan allows it.
insert into public.forge_settings (key, value) values ('browser_keep_alive', 'false'::jsonb) on conflict (key) do nothing;
-- undo (by hand): delete from public.forge_settings where key = 'browser_keep_alive';
