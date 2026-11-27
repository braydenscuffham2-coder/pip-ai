-- The Setup Agent on one connection (Nov 27, 2026).
--
-- On Browserbase's Free plan the secure browser ends when any connection leaves it, so one request (the runner in
-- setup-run) now holds the only connection for a setup's whole time in the browser. These two columns say which
-- runner has a setup and when it last said it was alive, so two runners never work one setup and a dead one is
-- replaced. They hold nothing about the owner or the tool.
alter table public.setup_sessions
  add column if not exists runner_id uuid,
  add column if not exists runner_beat timestamptz;

-- undo (by hand): alter table public.setup_sessions drop column runner_id, drop column runner_beat;
