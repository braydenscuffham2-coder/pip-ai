-- Pieces: small pieces of software Pip builds and hosts for a business that has none for a job (Part E, Nov 27, 2026).
--
-- A piece is a written description (contract "piece/1": its fields, its stages, an optional public form, an optional
-- public page, an optional daily or weekly report) run by ONE audited runtime (supabase/functions/pip-piece and
-- _shared/piece.ts). The Forge writes the description; it never writes code that runs on Pip's servers, and no table is
-- ever created from a model's output. Each piece's records are walled off by piece and business in piece_records, with
-- row-level security and no rights for anyone but Pip's own functions.
--
-- A piece can add and update records. Nothing here deletes one: a record that is no longer wanted moves to a stage.
-- A piece is reachable only when it is live (the go-live tap) or its business is on the TEST list.
-- Needs businesses and forge_settings. Apply with the Supabase migration tool after the pull request is merged.

create table if not exists public.pieces (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (char_length(label) between 2 and 80),
  does text not null check (char_length(does) between 10 and 300),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and octet_length(spec::text) <= 12000),
  status text not null default 'sandbox' check (status in ('sandbox', 'staged', 'live', 'paused', 'retired')),
  tests jsonb,                                  -- the sandbox run: what was tried and what happened
  library_id uuid,                              -- the library part it was made from, if any
  idea text check (idea is null or char_length(idea) <= 600),
  created_by text,
  created_at timestamptz not null default now(),
  staged_at timestamptz, live_at timestamptz, live_by text,
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);
create index if not exists pieces_business_idx on public.pieces (business_id);
alter table public.pieces enable row level security;
revoke all on public.pieces from anon, authenticated;
grant select, insert, update on public.pieces to service_role;

create table if not exists public.piece_records (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  ref text not null,                            -- a short code a person can read out ("K7M2QX")
  stage text not null check (char_length(stage) between 1 and 40),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 9000),
  source text not null default 'owner' check (source in ('form', 'owner', 'teammate', 'test')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (piece_id, ref)
);
create index if not exists piece_records_piece_idx on public.piece_records (piece_id, updated_at desc);
alter table public.piece_records enable row level security;
revoke all on public.piece_records from anon, authenticated;
grant select, insert, update on public.piece_records to service_role; -- no delete, on purpose

-- What changed, kept for the daily "what is new" report and for the owner's own record. Never the full row twice.
create table if not exists public.piece_changes (
  id bigserial primary key,
  piece_id uuid not null references public.pieces(id) on delete cascade,
  record_id uuid not null references public.piece_records(id) on delete cascade,
  kind text not null check (kind in ('added', 'changed', 'moved')),
  detail jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 2000),
  by text,
  at timestamptz not null default now()
);
create index if not exists piece_changes_piece_idx on public.piece_changes (piece_id, at desc);
alter table public.piece_changes enable row level security;
revoke all on public.piece_changes from anon, authenticated;
grant select, insert on public.piece_changes to service_role;
grant usage, select on sequence public.piece_changes_id_seq to service_role;

-- The parts library: every piece Pip has built, kept as a reusable shape with no business's records in it.
create table if not exists public.parts_library (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('piece')),
  name text not null check (char_length(name) between 2 and 80),
  does text not null check (char_length(does) between 10 and 300),
  words text[] not null default '{}',            -- the plain words it is found by
  shape jsonb not null check (jsonb_typeof(shape) = 'object' and octet_length(shape::text) <= 12000),
  source_piece uuid,
  industry text,
  uses int not null default 0,
  status text not null default 'ready' check (status in ('ready', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parts_library enable row level security;
revoke all on public.parts_library from anon, authenticated;
grant select, insert, update on public.parts_library to service_role;

insert into public.forge_settings (key, value) values ('pieces_paused', 'false'::jsonb) on conflict (key) do nothing;

-- May the outside world reach this piece? Live, or its business is on the TEST list; and nothing is paused.
create or replace function public.piece_open(p_piece uuid) returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', p.id, 'business_id', p.business_id, 'business', b.name, 'name', p.name, 'label', p.label, 'spec', p.spec, 'status', p.status,
    'test', coalesce((select value from public.forge_settings where key = 'act_sandbox_businesses'), '[]'::jsonb) ? p.business_id::text)
  from public.pieces p join public.businesses b on b.id = p.business_id
  where p.id = p_piece and b.status not in ('disconnected', 'cancelled', 'deleted')
    and coalesce((select value from public.forge_settings where key = 'pieces_paused'), 'false'::jsonb) <> 'true'::jsonb
    and (p.status = 'live' or (p.status in ('sandbox', 'staged') and coalesce((select value from public.forge_settings where key = 'act_sandbox_businesses'), '[]'::jsonb) ? p.business_id::text));
$$;

-- Add one record, counted against the piece's own limits in the same step. The caller has already checked the
-- values against the piece's description; this is the last line: limits, a readable code, and the change log.
create or replace function public.piece_add(p_piece uuid, p_stage text, p_data jsonb, p_source text, p_by text, p_per_day int, p_max int)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p public.pieces; v_ref text; v_id uuid; d int; n int; i int := 0;
begin
  select * into p from public.pieces where id = p_piece for update;
  if p.id is null or p.status in ('paused', 'retired') then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 9000 then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select count(*) filter (where created_at > now() - interval '1 day'), count(*) into d, n from public.piece_records where piece_id = p.id;
  if d >= least(greatest(coalesce(p_per_day, 200), 1), 2000) then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  if n >= least(greatest(coalesce(p_max, 2000), 1), 20000) then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  loop
    -- Six characters with no 0, O, 1, I or L, so it can be read out over the phone.
    v_ref := translate(upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6)), '01', 'XZ');
    begin
      insert into public.piece_records (piece_id, business_id, ref, stage, data, source, updated_by) values (p.id, p.business_id, v_ref, left(p_stage, 40), p_data, p_source, left(p_by, 120)) returning id into v_id;
      exit;
    exception when unique_violation then i := i + 1; if i > 5 then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
    end;
  end loop;
  insert into public.piece_changes (piece_id, record_id, kind, detail, by) values (p.id, v_id, 'added', jsonb_build_object('stage', left(p_stage, 40)), left(p_by, 120));
  return jsonb_build_object('ok', true, 'id', v_id, 'ref', v_ref, 'business', p.business_id, 'name', p.name);
end $$;

-- Change one record: new values for some fields, a new stage, or both. Never deletes.
create or replace function public.piece_update(p_piece uuid, p_record uuid, p_stage text, p_data jsonb, p_by text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r public.piece_records; v_keys jsonb;
begin
  select * into r from public.piece_records where id = p_record and piece_id = p_piece for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_data is not null and (jsonb_typeof(p_data) <> 'object' or octet_length((r.data || p_data)::text) > 9000) then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  update public.piece_records set data = data || coalesce(p_data, '{}'::jsonb), stage = coalesce(left(p_stage, 40), stage), updated_at = now(), updated_by = left(p_by, 120) where id = r.id;
  if p_stage is not null and p_stage <> r.stage then
    insert into public.piece_changes (piece_id, record_id, kind, detail, by) values (p_piece, r.id, 'moved', jsonb_build_object('from', r.stage, 'to', left(p_stage, 40)), left(p_by, 120));
  end if;
  if p_data is not null and p_data <> '{}'::jsonb then
    select coalesce(jsonb_agg(k), '[]'::jsonb) into v_keys from jsonb_object_keys(p_data) k;
    insert into public.piece_changes (piece_id, record_id, kind, detail, by) values (p_piece, r.id, 'changed', jsonb_build_object('fields', v_keys), left(p_by, 120));
  end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'ref', r.ref);
end $$;

-- The report a piece asked for: one plain line in the business's activity, about what was added, changed or moved
-- since the last one. Run by the database every hour; a piece's own "every" and "at" decide when its line is due.
create or replace function public.pieces_report() returns integer language plpgsql security definer set search_path to '' as $$
declare p record; v_since timestamptz; v_added int; v_changed int; v_moved int; v_tz text; v_now timestamp; v_at time; v_due boolean; v_n int := 0; v_line text;
begin
  if coalesce((select value from public.forge_settings where key = 'pieces_paused'), 'false'::jsonb) = 'true'::jsonb then return 0; end if;
  for p in select pc.id, pc.business_id, pc.label, pc.spec, pc.status, coalesce(b.timezone, 'America/Boise') tz from public.pieces pc join public.businesses b on b.id = pc.business_id
           where pc.spec ? 'report' and (pc.status = 'live' or (pc.status in ('sandbox', 'staged') and coalesce((select value from public.forge_settings where key = 'act_sandbox_businesses'), '[]'::jsonb) ? pc.business_id::text)) loop
    v_tz := p.tz; v_now := now() at time zone v_tz;
    begin v_at := (p.spec->'report'->>'at')::time; exception when others then v_at := '08:00'::time; end;
    v_due := extract(hour from v_now) = extract(hour from v_at) and (p.spec->'report'->>'every' = 'day' or extract(isodow from v_now) = 1);
    if not v_due then continue; end if;
    if exists (select 1 from public.activity_log a where a.business_id = p.business_id and a.kind = 'system' and a.ref->>'piece' = p.id::text and a.at > now() - interval '20 hours') then continue; end if;
    v_since := now() - case when p.spec->'report'->>'every' = 'day' then interval '1 day' else interval '7 days' end;
    select count(*) filter (where kind = 'added'), count(*) filter (where kind = 'changed'), count(*) filter (where kind = 'moved') into v_added, v_changed, v_moved from public.piece_changes where piece_id = p.id and at > v_since;
    v_line := p.label || ', ' || case when p.spec->'report'->>'every' = 'day' then 'since yesterday' else 'this past week' end || ': '
      || case when v_added + v_changed + v_moved = 0 then 'nothing changed.' else v_added || ' added, ' || v_changed || ' changed, ' || v_moved || ' moved to a new stage.' end;
    insert into public.activity_log (business_id, kind, summary, outcome, actor, ref) values (p.business_id, 'system', v_line, 'info', 'pip', jsonb_build_object('piece', p.id, 'added', v_added, 'changed', v_changed, 'moved', v_moved));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.piece_open(uuid) from public, anon, authenticated;
revoke all on function public.piece_add(uuid, text, jsonb, text, text, int, int) from public, anon, authenticated;
revoke all on function public.piece_update(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.pieces_report() from public, anon, authenticated;
grant execute on function public.piece_open(uuid) to service_role;
grant execute on function public.piece_add(uuid, text, jsonb, text, text, int, int) to service_role;
grant execute on function public.piece_update(uuid, uuid, text, jsonb, text) to service_role;
grant execute on function public.pieces_report() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pip-pieces-report', '9 * * * *', $c$select public.pieces_report()$c$);
  end if;
end $$;

-- undo (by hand): select cron.unschedule('pip-pieces-report');
-- drop function if exists public.pieces_report(); drop function if exists public.piece_update(uuid, uuid, text, jsonb, text);
-- drop function if exists public.piece_add(uuid, text, jsonb, text, text, int, int); drop function if exists public.piece_open(uuid);
-- drop table if exists public.parts_library; drop table if exists public.piece_changes; drop table if exists public.piece_records; drop table if exists public.pieces;
-- delete from public.forge_settings where key = 'pieces_paused';
