-- Two things the Setup Agent writes that the database was refusing (found Nov 26, 2026, before its first live run).
--
-- 1. When a browser session closes mid-setup, setup-run queues the owner a "sign in again" email with the template
--    'setup_resignin'. pip-portal knows how to write that email, but portal_outbox only allowed six older templates,
--    so the row was refused and the owner would never have been told.
-- 2. setup-run wrote its finishing line to the owner's activity with a kind and an outcome activity_log does not
--    allow. That is fixed in setup-run (kind 'connection', outcome 'ok' or 'failed'); nothing changes here for it.
--
-- 'tool_needs_you' is added at the same time for the background runtime: one email when a tool needs the owner
-- (a new-device check, a captcha, a changed password).
alter table public.portal_outbox drop constraint if exists portal_outbox_template_check;
alter table public.portal_outbox add constraint portal_outbox_template_check
  check (template = any (array['welcome', 'signin', 'invite', 'paused', 'price_ready', 'disconnected', 'setup_resignin', 'tool_needs_you']));

-- undo (by hand): put the six-template check back.
-- alter table public.portal_outbox drop constraint if exists portal_outbox_template_check;
-- alter table public.portal_outbox add constraint portal_outbox_template_check
--   check (template = any (array['welcome', 'signin', 'invite', 'paused', 'price_ready', 'disconnected']));
