-- Outlook's two calendar tools get the same limits Google's have (Nov 27, 2026).
--
-- The rows were added with nothing hidden and nothing fixed, so a teammate on an Outlook calendar would have been
-- shown every input the tool has: whose calendar, which calendar, attendees, online meetings, recurrence. The code
-- already drops inviting inputs from any calendar add (withoutInvites in _shared/calendar.ts); this hides them from
-- the model as well, keeps a teammate on the owner's own default calendar, and caps how much one read returns.
-- Field names are from the tools' own descriptions (pip-turn /diag, Nov 27). Not yet run against a real Outlook
-- calendar: no test business has its calendar step on Outlook.
update public.tool_catalog set
  hide = array['skip', 'select', 'orderby', 'user_id', 'page_token', 'calendar_id', 'include_sensitivity_label'],
  fixed = '{"top": 80}'::jsonb
where slug = 'OUTLOOK_GET_CALENDAR_VIEW';

update public.tool_catalog set
  hide = array['attendees_info', 'recurrence', 'online_meeting_provider', 'user_id', 'calendar_id', 'categories', 'importance', 'is_html', 'show_as'],
  fixed = '{"is_online_meeting": false}'::jsonb
where slug = 'OUTLOOK_CALENDAR_CREATE_EVENT';

-- The stored description of each tool is refreshed by pip-turn the next time it is used (schema is empty now).

-- undo (by hand): update public.tool_catalog set hide = '{}', fixed = '{}'::jsonb where slug in ('OUTLOOK_GET_CALENDAR_VIEW', 'OUTLOOK_CALENDAR_CREATE_EVENT');
