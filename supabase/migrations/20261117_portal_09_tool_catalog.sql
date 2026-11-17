-- Portal phase 9: the tool catalog. It is the full list of things a teammate may do inside an owner's connected tools.
-- The turn runner (pip-turn) offers a teammate only the rows whose block the teammate was designed with and whose
-- connection is active. Each row also says which fields the model may fill (hide), which values Pip always sets itself
-- (fixed), and how the answer is cut down before the model sees it (shape). Nothing outside this table can be called.

create table if not exists public.tool_catalog (
  slug text primary key check (slug ~ '^[A-Z0-9_]{3,80}$'),
  block text not null check (block ~ '^[a-z0-9_]{2,40}$'),
  toolkit text not null check (toolkit ~ '^[a-z0-9_]{2,60}$'),
  access text not null check (access in ('read', 'write')),
  label text not null check (char_length(label) between 3 and 80),
  role text check (role is null or role in ('create', 'append')),
  guard text check (guard is null or guard in ('pip_sheet', 'email')),
  shape text check (shape is null or shape in ('busy_only')),
  hide text[] not null default '{}',
  fixed jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  schema jsonb,
  schema_at timestamptz
);
alter table public.tool_catalog enable row level security;
revoke all on public.tool_catalog from anon, authenticated;
grant select, insert, update, delete on public.tool_catalog to service_role;

insert into public.tool_catalog (slug, block, toolkit, access, label, role, guard, shape, hide, fixed) values
  ('GOOGLECALENDAR_EVENTS_LIST', 'calendar', 'googlecalendar', 'read', 'checked the calendar', null, null, 'busy_only',
   array['query','fields','iCalUID','orderBy','pageToken','syncToken','eventTypes','updatedMin','showDeleted','maxAttendees','alwaysIncludeEmail','showHiddenInvitations','sharedExtendedProperty','privateExtendedProperty'],
   '{"calendarId":"primary","singleEvents":true,"maxResults":80}'::jsonb),
  ('GOOGLECALENDAR_CREATE_EVENT', 'calendar', 'googlecalendar', 'write', 'added a calendar hold', null, null, null,
   array['attendees','eventType','recurrence','visibility','send_updates','transparency','guestsCanModify','exclude_organizer','birthdayProperties','extended_properties','focusTimeProperties','guestsCanInviteOthers','outOfOfficeProperties','guestsCanSeeOtherGuests','workingLocationProperties'],
   '{"calendar_id":"primary","create_meeting_room":false}'::jsonb),
  ('GMAIL_SEND_EMAIL', 'email', 'gmail', 'write', 'sent an email', null, 'email', null,
   array['cc','bcc','extra_recipients','from_email','attachment','include_signature'],
   '{"user_id":"me","is_html":false}'::jsonb),
  ('GOOGLESHEETS_CREATE_GOOGLE_SHEET1', 'data_sink', 'googlesheets', 'write', 'made the Pip sheet', 'create', 'pip_sheet', null, '{}', '{}'::jsonb),
  ('GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND', 'data_sink', 'googlesheets', 'write', 'added a row to the sheet', 'append', 'pip_sheet', null, '{}', '{}'::jsonb)
on conflict (slug) do nothing;
