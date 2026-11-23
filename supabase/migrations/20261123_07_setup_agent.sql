-- The Setup Agent (engineering-seat report, Job 3; approved Nov 22, 2026). A computer-use agent connects one tool for
-- an owner in a sandboxed cloud browser. The owner signs in, a vault service with no model types the password, and the
-- model only ever sees masked screenshots. Apply with the Supabase migration tool after the pull request is merged.

-- One row per business and tool being set up: where it is, what it cost, how it ended. Never a typed value.
create table if not exists public.setup_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid references public.business_connections(id) on delete set null,
  tool text not null check (char_length(tool) between 2 and 80),
  tool_key text not null check (tool_key ~ '^[a-z0-9_-]{2,60}$'),
  login_url text check (login_url is null or (char_length(login_url) <= 300 and login_url ~ '^https://')),
  mode text not null default 'browser' check (mode in ('browser', 'composio', 'manual')),
  state text not null default 'queued' check (state in ('queued', 'consent', 'composio', 'opening', 'find_login', 'owner_control',
    'verify', 'configuring', 'testing', 'saving', 'done', 'failed', 'paused', 'manual', 'blocked', 'stopped')),
  reason text check (reason is null or char_length(reason) <= 300),
  step int not null default 0 check (step between 0 and 500),
  plan jsonb not null default '{}'::jsonb check (octet_length(plan::text) <= 16000),
  browser_session_id text check (browser_session_id is null or char_length(browser_session_id) <= 80),
  browser_context_id text check (browser_context_id is null or char_length(browser_context_id) <= 80),
  vault_item_id uuid references public.vault_items(id) on delete set null,
  consent_at timestamptz,
  composio_done boolean not null default false,
  cost_usd numeric not null default 0 check (cost_usd >= 0),
  cost_cap_usd numeric not null default 2 check (cost_cap_usd > 0 and cost_cap_usd <= 20),
  owner_taps int not null default 0,
  result text check (result is null or result in ('passed', 'failed')),
  log jsonb not null default '[]'::jsonb check (octet_length(log::text) <= 32000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists setup_sessions_business on public.setup_sessions (business_id, created_at desc);
create unique index if not exists setup_sessions_one_open on public.setup_sessions (business_id, tool_key)
  where state not in ('done', 'failed', 'manual', 'blocked', 'stopped');

-- The key box's one-time ticket: lets the owner's page hand one username and password to vault-writer for one setup.
-- Only its hash is kept. It lasts 10 minutes and works once.
create table if not exists public.setup_tickets (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  setup_id uuid not null references public.setup_sessions(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Whether a tool's terms allow automated sign-in. Unknown until someone reads them; forbidden means no browser at all.
create table if not exists public.tool_terms (
  tool_key text primary key check (tool_key ~ '^[a-z0-9_-]{2,60}$'),
  label text not null,
  automation text not null default 'unknown' check (automation in ('allowed', 'forbidden', 'unknown')),
  terms_url text check (terms_url is null or terms_url ~ '^https://'),
  checked_at timestamptz,
  note text
);

alter table public.setup_sessions enable row level security;
alter table public.setup_tickets enable row level security;
alter table public.tool_terms enable row level security;
revoke all on public.setup_sessions, public.setup_tickets, public.tool_terms from anon, authenticated;
grant select, insert, update, delete on public.setup_sessions, public.setup_tickets, public.tool_terms to service_role;

-- The owner's yes to "Pip may sign in to <tool> in a secure browser while I watch" goes in the consent ledger.
alter table public.consent_ledger drop constraint if exists consent_ledger_purpose_check;
alter table public.consent_ledger add constraint consent_ledger_purpose_check check (purpose = any (array['transactional', 'marketing', 'any', 'setup_signin']));

-- Spend: its own meter, inside the $300 monthly ceiling when that is in place. $2 a setup is enforced per session.
insert into public.pip_limits (kind, label, per_day, per_month, per_visitor_hour, per_visitor_day, fn_cap, also_stop_if, pausable, note)
values ('setup_usd', 'Setup Agent dollars (model calls while connecting a tool)', 10, 60, null, null, null, null, true,
        'Each setup also stops at its own cost_cap_usd ($2 by default).')
on conflict (kind) do nothing;
insert into public.forge_settings (key, value) values ('setup_paused', 'false'::jsonb) on conflict (key) do nothing;

-- What we know about common tools' terms. Unknown is the honest default; these are starting points to check.
insert into public.tool_terms (tool_key, label, automation, note) values
  ('googlesheets', 'Google Sheets', 'allowed', 'Through Composio OAuth only. Google blocks sign-in from automated cloud browsers.'),
  ('googlecalendar', 'Google Calendar', 'allowed', 'Through Composio OAuth only.'),
  ('gmail', 'Gmail', 'allowed', 'Through Composio OAuth only.'),
  ('calendly', 'Calendly', 'allowed', 'Through Composio OAuth.'),
  ('hubspot', 'HubSpot', 'allowed', 'Through Composio OAuth.'),
  ('facebook', 'Facebook', 'forbidden', 'Marked forbidden until someone reads the current terms: Meta''s terms restrict automated access. Use Meta''s own app review instead.'),
  ('linkedin', 'LinkedIn', 'forbidden', 'Marked forbidden until someone reads the current terms: LinkedIn''s user agreement restricts bots and automated access.')
on conflict (tool_key) do nothing;

-- ---------- the leak check, for test runs on TEST businesses only ----------
-- vault-writer keeps SHA-256 hashes of every 8-character slice of a test login here (never the login), setup-run refuses
-- to send a prompt that matches one, and saves the masked screenshots the model saw (setup_shots) so the scanner can
-- read them. scripts/setup-leak-check.mjs reports the result and deletes both.
create table if not exists public.setup_canaries (
  setup_id uuid primary key references public.setup_sessions(id) on delete cascade,
  hashes text[] not null,
  created_at timestamptz not null default now()
);
alter table public.setup_canaries enable row level security;
revoke all on public.setup_canaries from anon, authenticated;
grant select, insert, update, delete on public.setup_canaries to service_role;
create table if not exists public.setup_shots (
  setup_id uuid not null references public.setup_sessions(id) on delete cascade,
  step int not null,
  state text not null,
  jpeg_b64 text not null check (octet_length(jpeg_b64) <= 1500000),
  created_at timestamptz not null default now(),
  primary key (setup_id, step, state)
);
alter table public.setup_shots enable row level security;
revoke all on public.setup_shots from anon, authenticated;
grant select, insert, update, delete on public.setup_shots to service_role;
insert into public.forge_settings (key, value) values ('setup_agent_on', 'false'::jsonb), ('setup_leak_check', 'false'::jsonb) on conflict (key) do nothing;
