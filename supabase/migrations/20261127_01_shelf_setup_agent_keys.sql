-- The Setup Agent's two outside services join the Shelf and the funds tracker, so their keys are checked live
-- (the key itself never leaves the edge function). Safe to run twice.
insert into public.api_shelf (provider, label, kind, status, rank, secret_name, unlocks, signup_url, pricing_url, price_note, notes, updated_at) values
  ('browserbase', 'Browserbase', 'buy', 'not_owned', 6, 'BROWSERBASE_API_KEY', 'The Setup Agent''s secure browser, and teammates that work inside an owner''s own software',
   'https://www.browserbase.com/sign-up', 'https://www.browserbase.com/pricing', null, 'Also set BROWSERBASE_PROJECT_ID', now()),
  ('onepassword', '1Password', 'buy', 'not_owned', 6, 'OP_SERVICE_ACCOUNT_TOKEN', 'The vault for client logins, one vault per client',
   'https://start.1password.com/signin', 'https://1password.com/pricing', null, 'A service account that can create vaults', now())
on conflict (provider) do update set secret_name = excluded.secret_name, unlocks = excluded.unlocks, notes = excluded.notes, updated_at = now();

insert into public.api_funds (provider, label, pays_for, secret_name, reader, topup_url, topup_label, sort, active, updated_at) values
  ('browserbase', 'Browserbase', 'Setup Agent browser', 'BROWSERBASE_API_KEY', 'browserbase', 'https://www.browserbase.com/settings', 'Plan and usage', 60, true, now()),
  ('onepassword', '1Password', 'Client login vaults', 'OP_SERVICE_ACCOUNT_TOKEN', 'onepassword', 'https://start.1password.com/developer-tools', 'Service accounts', 61, true, now())
on conflict (provider) do update set reader = excluded.reader, secret_name = excluded.secret_name, updated_at = now();
-- Undo: delete from public.api_funds where provider in ('browserbase','onepassword');
--       delete from public.api_shelf where provider in ('browserbase','onepassword');
