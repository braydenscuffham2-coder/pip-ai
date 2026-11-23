-- Pricing from the agents in each package (engineering-seat report, Job 4; approved Nov 22, 2026).
-- One function, public.quote(), turns a list of agents and connections into a monthly price, a setup fee and a hardware
-- fee, and stores every quote with its inputs. The Portal's price and the pricing email both come from it, so they
-- cannot disagree. Every dollar figure seeded here is a PLACEHOLDER (source = 'placeholder') to be fitted from real
-- usage after the first live month. Apply with the Supabase migration tool after the pull request is merged.

-- ---------- what each agent or building block costs to run ----------
create table if not exists public.price_book (
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  version int not null default 1 check (version >= 1),
  tier text not null check (tier in ('light', 'standard', 'heavy', 'onsite', 'operator')),
  label text not null,
  -- L: model cost = runs a month x (tokens in x price in + tokens out x price out), prices per million tokens
  runs_per_month numeric not null default 0 check (runs_per_month >= 0),
  tokens_in_per_run numeric not null default 0 check (tokens_in_per_run >= 0),
  tokens_out_per_run numeric not null default 0 check (tokens_out_per_run >= 0),
  model_price_in numeric not null default 0 check (model_price_in >= 0),
  model_price_out numeric not null default 0 check (model_price_out >= 0),
  -- V: voice = minutes x (telephony + speech-to-text + text-to-speech), per minute
  voice_minutes numeric not null default 0 check (voice_minutes >= 0),
  telephony_per_min numeric not null default 0 check (telephony_per_min >= 0),
  stt_per_min numeric not null default 0 check (stt_per_min >= 0),
  tts_per_min numeric not null default 0 check (tts_per_min >= 0),
  -- T: texting = messages x fee, plus the carrier registration's monthly fee shared by the package's texting agents
  messages numeric not null default 0 check (messages >= 0),
  per_message_fee numeric not null default 0 check (per_message_fee >= 0),
  carrier_reg_monthly numeric not null default 0 check (carrier_reg_monthly >= 0),
  -- S: data and API calls
  data_calls numeric not null default 0 check (data_calls >= 0),
  per_call_price numeric not null default 0 check (per_call_price >= 0),
  -- price: P_a = max(P_min, C_a x m_a). A null multiplier or floor takes the tier's default from price_settings.
  margin_multiplier numeric check (margin_multiplier is null or margin_multiplier > 0),
  price_floor numeric check (price_floor is null or price_floor >= 0),
  source text not null default 'placeholder' check (source in ('placeholder', 'fitted')),
  notes text,
  effective_from timestamptz not null default now(),
  primary key (key, version)
);

-- ---------- the rules around the book, one row per version ----------
create table if not exists public.price_settings (
  version int primary key check (version >= 1),
  tier_multiplier jsonb not null,           -- m by tier
  tier_floor jsonb not null,                -- P_min by tier, dollars a month
  discount_step numeric not null default 0.05 check (discount_step between 0 and 0.15),
  discount_cap numeric not null default 0.15 check (discount_cap between 0 and 0.15),
  base_fee numeric not null check (base_fee >= 0),          -- B: Portal, owner agent, monitoring, support
  base_cost numeric not null default 0 check (base_cost >= 0), -- what B itself costs Pip a month, for the margin check
  floor_multiple numeric not null default 1.3 check (floor_multiple >= 1),
  included_multiple numeric not null default 1.5 check (included_multiple >= 1),
  target_margin numeric not null default 0.70 check (target_margin between 0 and 0.95),
  fixed_monthly_total numeric not null default 0 check (fixed_monthly_total >= 0), -- F: platform costs shared by active agents
  active_agents_floor int not null default 10 check (active_agents_floor >= 1),
  setup_base numeric not null check (setup_base >= 0),      -- b: base setup effort per connection, dollars
  setup_multiplier jsonb not null,          -- u by connection kind
  registration jsonb not null default '{}'::jsonb,          -- R items, one-time dollars, by name
  hardware_margin numeric not null default 0.30 check (hardware_margin between 0.25 and 0.40),
  at_cost_first_n int not null default 3 check (at_cost_first_n >= 0),
  box_cost numeric check (box_cost is null or box_cost >= 0),
  box_shipping numeric check (box_shipping is null or box_shipping >= 0),
  overage_rates jsonb not null default '{}'::jsonb,         -- what usage above the included amount costs, by unit
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- every quote, with what went in ----------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  caller text not null check (caller in ('portal', 'email', 'marketplace', 'forge', 'test')),
  business_id uuid,
  order_id uuid,
  inputs jsonb not null,
  settings_version int not null,
  outputs jsonb not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz
);
create index if not exists quotes_business on public.quotes (business_id, created_at desc);

alter table public.price_book enable row level security;
alter table public.price_settings enable row level security;
alter table public.quotes enable row level security;
revoke all on public.price_book, public.price_settings, public.quotes from anon, authenticated;
grant select, insert, update, delete on public.price_book, public.price_settings, public.quotes to service_role;

-- ---------- placeholders: every number below is a starting guess, to be fitted ----------
insert into public.price_settings (version, tier_multiplier, tier_floor, base_fee, base_cost, fixed_monthly_total, setup_base, setup_multiplier, registration, overage_rates, notes)
values (1,
  '{"light": 4.0, "standard": 3.5, "heavy": 3.0, "onsite": 2.5, "operator": 3.0}',
  '{"light": 29, "standard": 49, "heavy": 99, "onsite": 79, "operator": 79}',
  49, 8, 40, 40,
  '{"oauth": 1.0, "api": 1.0, "password": 1.5, "mfa": 2.0, "forbidden": 2.5}',
  '{"10dlc": 60, "toll_free": 30}',
  '{"conversation": 0.15, "sms": 0.04, "voice_minute": 0.25}',
  'PLACEHOLDERS. Fit from usage_events and billing_overage after the first live month. Overage rates are the Nov 17 decision.')
on conflict (version) do nothing;

insert into public.price_book (key, tier, label, runs_per_month, tokens_in_per_run, tokens_out_per_run, model_price_in, model_price_out,
  voice_minutes, telephony_per_min, stt_per_min, tts_per_min, messages, per_message_fee, carrier_reg_monthly, data_calls, per_call_price, notes) values
  ('web_chat',        'light',    'Website chat',                       300, 3000, 300, 1, 5,   0, 0, 0, 0,          0, 0, 0,     0, 0,     'Placeholder. Haiku-class prices per million tokens.'),
  ('owner_alerts',    'light',    'Owner alerts and weekly report',     60,  2000, 300, 1, 5,   0, 0, 0, 0,          0, 0, 0,     0, 0,     'Placeholder.'),
  ('calendar_booking','standard', 'Calendar booking',                   200, 5000, 400, 1, 5,   0, 0, 0, 0,          0, 0, 0,     200, 0,   'Placeholder. Calendar reads through Composio (free plan).'),
  ('text_followup',   'standard', 'Text follow-up',                     200, 3000, 300, 1, 5,   0, 0, 0, 0,          400, 0.0083, 10, 0, 0,   'Placeholder. Twilio per-message fee and campaign fee from the API Shelf.'),
  ('email_followup',  'standard', 'Email follow-up',                    200, 3000, 400, 1, 5,   0, 0, 0, 0,          0, 0, 0,     200, 0,   'Placeholder. Sent from the owner''s own mailbox.'),
  ('phone_agent',     'heavy',    'Phone agent',                        150, 8000, 800, 1, 5,   450, 0.0085, 0.0048, 0.08, 0, 0, 0, 0, 0, 'Placeholder. Telephony, Deepgram and ElevenLabs per minute.'),
  ('review_replies',  'heavy',    'Review replies with data lookups',   60,  6000, 500, 2, 10,  0, 0, 0, 0,          0, 0, 0,     120, 0.004, 'Placeholder. DataForSEO-class lookups.'),
  ('camera_count',    'onsite',   'Camera counting box',                720, 0, 0, 0, 0,        0, 0, 0, 0,          0, 0, 0,     0, 0,     'Placeholder. Runs on the box; software fee only.'),
  ('content_posting', 'operator', 'Content creation and posting',       30,  12000, 2500, 2, 10, 0, 0, 0, 0,         0, 0, 0,     30, 0.01, 'Placeholder.')
on conflict (key, version) do nothing;

-- ---------- quote() ----------
-- p_agents:      [{"key": "phone_agent", "overrides": {"runs_per_month": 200, "voice_minutes": 600}}, ...]
-- p_connections: [{"tool": "Google Calendar", "kind": "oauth" | "api" | "password" | "mfa" | "forbidden", "base": 40?}, ...]
-- p_opts:        {"caller": "portal", "business_id": ..., "order_id": ..., "active_agents": 12, "camera_box": true,
--                 "customer_rank": 2, "registrations": ["10dlc"], "promo_pct": 3, "settings_version": 1}
create or replace function public.quote(p_agents jsonb, p_connections jsonb default '[]'::jsonb, p_opts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.price_settings; b public.price_book; a jsonb; c jsonb; o jsonb; v_key text;
  lines jsonb := '[]'::jsonb; conns jsonb := '[]'::jsonb; flags jsonb := '[]'::jsonb;
  n int; texting int := 0; active int; d numeric; f numeric;
  l_ numeric; v_ numeric; t_ numeric; s_ numeric; c_a numeric; m numeric; p_min numeric; p_a numeric;
  sum_c numeric := 0; sum_p numeric := 0; pkg numeric; floor_usd numeric; monthly numeric; setup numeric := 0; reg numeric := 0;
  u numeric; base numeric; hw numeric := null; onsite boolean := false; rank int; promo numeric; margin numeric;
  caller text; inputs jsonb; out jsonb; qid uuid; h text;
begin
  if p_agents is null or jsonb_typeof(p_agents) <> 'array' or jsonb_array_length(p_agents) = 0 then raise exception 'quote: at least one agent' using errcode = '22023'; end if;
  if jsonb_array_length(p_agents) > 30 then raise exception 'quote: at most 30 agents' using errcode = '22023'; end if;
  p_connections := coalesce(p_connections, '[]'::jsonb); p_opts := coalesce(p_opts, '{}'::jsonb);
  if jsonb_typeof(p_connections) <> 'array' or jsonb_typeof(p_opts) <> 'object' then raise exception 'quote: bad input' using errcode = '22023'; end if;
  caller := coalesce(p_opts->>'caller', 'test');
  if caller not in ('portal', 'email', 'marketplace', 'forge', 'test') then raise exception 'quote: unknown caller %', caller using errcode = '22023'; end if;

  if p_opts ? 'settings_version' then select * into s from public.price_settings where version = (p_opts->>'settings_version')::int;
  else select * into s from public.price_settings order by version desc limit 1; end if;
  if s.version is null then raise exception 'quote: no price_settings' using errcode = '22023'; end if;

  n := jsonb_array_length(p_agents);
  active := greatest(coalesce((p_opts->>'active_agents')::int, 0), s.active_agents_floor);
  f := round(s.fixed_monthly_total / active, 4);
  d := least(s.discount_cap, s.discount_step * (n - 1));

  -- texting agents share one carrier registration fee
  for a in select * from jsonb_array_elements(p_agents) loop
    select * into b from public.price_book where key = a->>'key' order by version desc limit 1;
    if b.key is not null and coalesce((a->'overrides'->>'messages')::numeric, b.messages) > 0 then texting := texting + 1; end if;
  end loop;

  for a in select * from jsonb_array_elements(p_agents) loop
    v_key := a->>'key';
    select * into b from public.price_book where key = v_key order by version desc limit 1;
    if b.key is null then raise exception 'quote: unknown agent %', v_key using errcode = '22023'; end if;
    o := coalesce(a->'overrides', '{}'::jsonb);
    l_ := coalesce((o->>'runs_per_month')::numeric, b.runs_per_month)
          * (coalesce((o->>'tokens_in_per_run')::numeric, b.tokens_in_per_run) * b.model_price_in
             + coalesce((o->>'tokens_out_per_run')::numeric, b.tokens_out_per_run) * b.model_price_out) / 1000000;
    v_ := coalesce((o->>'voice_minutes')::numeric, b.voice_minutes) * (b.telephony_per_min + b.stt_per_min + b.tts_per_min);
    t_ := coalesce((o->>'messages')::numeric, b.messages) * b.per_message_fee
          + case when coalesce((o->>'messages')::numeric, b.messages) > 0 and texting > 0 then b.carrier_reg_monthly / texting else 0 end;
    s_ := coalesce((o->>'data_calls')::numeric, b.data_calls) * b.per_call_price;
    c_a := round(l_ + v_ + t_ + s_ + f, 4);
    m := coalesce(b.margin_multiplier, (s.tier_multiplier->>b.tier)::numeric);
    p_min := coalesce(b.price_floor, (s.tier_floor->>b.tier)::numeric, 0);
    p_a := round(greatest(p_min, c_a * m), 2);
    if b.tier = 'onsite' then onsite := true; end if;
    if b.source = 'placeholder' and not flags ? 'placeholder_costs' then flags := flags || '"placeholder_costs"'::jsonb; end if;
    sum_c := sum_c + c_a; sum_p := sum_p + p_a;
    lines := lines || jsonb_build_object('key', b.key, 'version', b.version, 'label', b.label, 'tier', b.tier,
      'cost', jsonb_build_object('L', round(l_, 4), 'V', round(v_, 4), 'T', round(t_, 4), 'S', round(s_, 4), 'F', f, 'total', c_a),
      'multiplier', m, 'floor', p_min, 'price', p_a, 'after_discount', round(p_a * (1 - d), 2), 'floor_applied', c_a * m < p_min);
  end loop;

  pkg := round(sum_p * (1 - d) + s.base_fee, 2);
  floor_usd := round(s.floor_multiple * sum_c, 2);
  if pkg < floor_usd then pkg := floor_usd; flags := flags || '"raised_to_cost_floor"'::jsonb; end if;
  monthly := ceil(pkg);
  margin := case when monthly > 0 then round(1 - (sum_c + s.base_cost) / monthly, 4) else 0 end;
  if margin < s.target_margin then flags := flags || '"below_target_margin"'::jsonb; end if;

  for c in select * from jsonb_array_elements(p_connections) loop
    if coalesce(c->>'kind', '') not in (select jsonb_object_keys(s.setup_multiplier)) then raise exception 'quote: connection kind must be one of %', (select string_agg(k, ', ') from jsonb_object_keys(s.setup_multiplier) k) using errcode = '22023'; end if;
    u := (s.setup_multiplier->>(c->>'kind'))::numeric;
    base := coalesce((c->>'base')::numeric, s.setup_base);
    setup := setup + base * u;
    conns := conns || jsonb_build_object('tool', left(coalesce(c->>'tool', ''), 80), 'kind', c->>'kind', 'base', base, 'multiplier', u, 'fee', round(base * u, 2));
  end loop;
  for c in select * from jsonb_array_elements(coalesce(p_opts->'registrations', '[]'::jsonb)) loop
    if not s.registration ? (c #>> '{}') then raise exception 'quote: unknown registration %', c #>> '{}' using errcode = '22023'; end if;
    reg := reg + (s.registration->>(c #>> '{}'))::numeric;
  end loop;
  setup := ceil(setup + reg);

  if onsite or coalesce((p_opts->>'camera_box')::boolean, false) then
    rank := (p_opts->>'customer_rank')::int;
    if s.box_cost is null then flags := flags || '"box_cost_missing"'::jsonb;
    else hw := ceil((s.box_cost + coalesce(s.box_shipping, 0)) * case when rank is not null and rank <= s.at_cost_first_n then 1 else 1 + s.hardware_margin end); end if;
  end if;

  promo := least(greatest(coalesce((p_opts->>'promo_pct')::numeric, 0), 0), 5);

  out := jsonb_build_object(
    'monthly_usd', monthly, 'setup_usd', setup, 'hardware_usd', hw,
    'first_month_usd', case when promo > 0 then round(monthly * (1 - promo / 100), 2) else monthly end,
    'included_usd', round(s.included_multiple * sum_c, 2),
    'rates', s.overage_rates,
    'expected_cost_usd', round(sum_c, 2), 'gross_margin', margin, 'target_margin', s.target_margin,
    'discount', d, 'base_fee', s.base_fee, 'cost_floor_usd', floor_usd,
    'agents', lines, 'connections', conns, 'registration_usd', reg, 'promo_pct', promo,
    'flags', flags, 'settings_version', s.version);
  inputs := jsonb_build_object('agents', p_agents, 'connections', p_connections, 'opts', p_opts - 'caller' - 'business_id' - 'order_id');
  h := encode(sha256(convert_to(inputs::text || '|' || s.version::text, 'UTF8')), 'hex');
  insert into public.quotes (caller, business_id, order_id, inputs, settings_version, outputs, sha256)
  values (caller, nullif(p_opts->>'business_id', '')::uuid, nullif(p_opts->>'order_id', '')::uuid, inputs, s.version, out, h)
  returning id into qid;
  return out || jsonb_build_object('quote_id', qid, 'sha256', h);
end $$;
revoke all on function public.quote(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.quote(jsonb, jsonb, jsonb) to service_role;
