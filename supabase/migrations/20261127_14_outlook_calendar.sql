-- Outlook calendar in the tool catalog (Nov 27, 2026), switched off.
--
-- Two rows, the same two jobs Google Calendar already has: read busy times, add a hold. They are added with
-- enabled = false because nobody has yet signed a real Outlook account in and watched both work. To switch on after
-- that test:  update public.tool_catalog set enabled = true where toolkit = 'outlook';
-- The inviting inputs (attendees, online meeting) are removed in code for every calendar tool (_shared/calendar.ts),
-- so the hide lists here stay empty until the real input names have been read from Composio.
insert into public.tool_catalog (slug, block, toolkit, access, label, role, guard, shape, hide, fixed, enabled, record, level) values
  ('OUTLOOK_GET_CALENDAR_VIEW', 'calendar', 'outlook', 'read', 'checked the calendar', null, null, 'busy_only', '{}', '{}'::jsonb, false, 'busy_time', 'read'),
  ('OUTLOOK_CALENDAR_CREATE_EVENT', 'calendar', 'outlook', 'write', 'added a calendar hold', null, null, null, '{}', '{}'::jsonb, false, 'appointment', 'add')
on conflict (slug) do nothing;

-- undo (by hand): delete from public.tool_catalog where toolkit = 'outlook';
