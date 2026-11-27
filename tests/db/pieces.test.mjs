// Pieces in the database: who may reach one, adding with limits and a readable code, updating with a change log,
// no delete, and the daily report line. Run as the real migration on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null, pgcrypto = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); ({ pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto")); } catch { /* not installed */ }
const ready = !!(PGlite && pgcrypto);
const read = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8");
const SPEC = { contract: "piece/1", kind: "tracker", name: "tap_list", label: "Tap list", does: "Keeps what is pouring up to date.", fields: [{ id: "beer", label: "Beer", type: "text", required: true }], stages: ["coming soon", "pouring", "kicked"], report: { every: "day", at: "09:00" }, limits: { per_day: 100, max_records: 2000 } };

async function fresh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text not null default 'building', timezone text);
    create table forge_settings (key text primary key, value jsonb);
    create table activity_log (id bigserial primary key, business_id uuid, spec_id uuid, agent text, job text, at timestamptz default now(), kind text, summary text, outcome text, cost_usd numeric, actor text, ref jsonb);
  `);
  await db.exec(read("20261127_10_pieces.sql"));
  const one = async (q, p = []) => (await db.query(q, p)).rows[0];
  const biz = (await one("insert into businesses (name, timezone) values ('TEST Fork', 'UTC') returning id")).id;
  const real = (await one("insert into businesses (name, timezone) values ('A real business', 'UTC') returning id")).id;
  await db.query("insert into forge_settings (key, value) values ('act_sandbox_businesses', $1::jsonb)", [JSON.stringify([biz])]);
  const piece = async (b, status = "staged", name = "tap_list") => (await one("insert into pieces (business_id, name, label, does, spec, status) values ($1, $2, 'Tap list', 'Keeps what is pouring up to date.', $3::jsonb, $4) returning id", [b, name, JSON.stringify(SPEC), status])).id;
  const add = async (p, stage = "coming soon", data = { beer: "Porch Light Pils" }, perDay = 100, max = 2000) => (await one("select piece_add($1, $2, $3::jsonb, 'owner', 'owner@example.test', $4, $5) r", [p, stage, JSON.stringify(data), perDay, max])).r;
  return { db, one, biz, real, piece, add };
}

test("a staged piece is reachable on a TEST business only; a live one anywhere; a paused or retired one nowhere", { skip: !ready }, async () => {
  const { db, one, biz, real, piece } = await fresh();
  const t = await piece(biz), r = await piece(real);
  const open = async (id) => (await one("select piece_open($1) r", [id])).r;
  assert.equal((await open(t)).label, "Tap list"); assert.equal((await open(t)).test, true);
  assert.equal(await open(r), null, "staged on a real business: nobody outside can reach it before the go-live tap");
  await db.query("update pieces set status = 'live' where id = $1", [r]);
  assert.equal((await open(r)).status, "live");
  for (const s of ["paused", "retired"]) { await db.query("update pieces set status = $2 where id = $1", [t, s]); assert.equal(await open(t), null, s); }
  await db.query("update pieces set status = 'staged' where id = $1", [t]);
  await db.query("update forge_settings set value = 'true'::jsonb where key = 'pieces_paused'");
  assert.equal(await open(t), null, "the pause switch closes every piece"); assert.equal(await open(r), null);
  await db.query("update forge_settings set value = 'false'::jsonb where key = 'pieces_paused'");
  await db.query("update businesses set status = 'disconnected' where id = $1", [real]);
  assert.equal(await open(r), null, "a disconnected business's pieces close");
});

test("adding gives a code a person can read out, counts against the limits, and is written to the change log", { skip: !ready }, async () => {
  const { one, biz, piece, add } = await fresh();
  const p = await piece(biz);
  const a = await add(p);
  assert.equal(a.ok, true); assert.match(a.ref, /^[2-9A-FXZ]{6}$/, "six characters, no 0 or 1");
  assert.deepEqual(await one("select kind, detail from piece_changes where record_id = $1", [a.id]), { kind: "added", detail: { stage: "coming soon" } });
  await add(p); assert.equal((await add(p, "coming soon", { beer: "x" }, 2, 2000)).error, "slow_down");
  assert.equal((await add(p, "coming soon", { beer: "x" }, 100, 2)).error, "full");
  assert.equal((await add(p, "coming soon", "not an object")).error, "bad_request");
  assert.equal((await add("00000000-0000-4000-8000-000000000000")).error, "not_found");
});

test("updating merges fields, moves stages, logs both, and cannot touch another piece's record", { skip: !ready }, async () => {
  const { db, one, biz, piece, add } = await fresh();
  const p = await piece(biz), other = await piece(biz, "staged", "other_list");
  const a = await add(p);
  const up = async (pc, rec, stage, data) => (await one("select piece_update($1, $2, $3, $4::jsonb, 'owner@example.test') r", [pc, rec, stage, data ? JSON.stringify(data) : null])).r;
  assert.equal((await up(p, a.id, "pouring", { notes: "Crisp." })).ok, true);
  assert.deepEqual(await one("select stage, data from piece_records where id = $1", [a.id]), { stage: "pouring", data: { beer: "Porch Light Pils", notes: "Crisp." } });
  const log = (await db.query("select kind, detail from piece_changes where record_id = $1 order by id", [a.id])).rows;
  assert.deepEqual(log.map((l) => l.kind), ["added", "moved", "changed"]);
  assert.deepEqual(log[1].detail, { from: "coming soon", to: "pouring" }); assert.deepEqual(log[2].detail, { fields: ["notes"] });
  assert.equal((await up(other, a.id, "kicked", null)).error, "not_found", "a record is only reachable through its own piece");
});

test("nothing can delete a record: no function does it and the service role has no right to", { skip: !ready }, async () => {
  const { one } = await fresh();
  const r = await one("select has_table_privilege('service_role', 'public.piece_records', 'delete') d, has_table_privilege('anon', 'public.piece_records', 'select') a, has_table_privilege('authenticated', 'public.pieces', 'select') b, has_function_privilege('anon', 'public.piece_add(uuid, text, jsonb, text, text, int, int)', 'execute') c");
  assert.deepEqual(r, { d: false, a: false, b: false, c: false });
  const fns = (await one("select string_agg(prosrc, ' ') src from pg_proc where proname like 'piece%'")).src;
  assert.ok(!/delete\s+from\s+public\.piece_records/i.test(fns));
  for (const t of ["pieces", "piece_records", "piece_changes", "parts_library"]) assert.equal((await one("select relrowsecurity r from pg_class where relname = $1", [t])).r, true, t);
});

test("the report writes one plain line when it is due, once, and only for a piece that may run", { skip: !ready }, async () => {
  const { db, one, biz, real, piece, add } = await fresh();
  const hour = (await one("select to_char(now() at time zone 'UTC', 'HH24') h")).h;
  const spec = { ...SPEC, report: { every: "day", at: `${hour}:00` } };
  const p = await piece(biz), q = await piece(real);
  await db.query("update pieces set spec = $2::jsonb where id in ($1, $3)", [p, JSON.stringify(spec), q]);
  const a = await add(p); await add(p);
  await db.query("select piece_update($1, $2, 'pouring', null, 'o')", [p, a.id]);
  assert.equal((await one("select pieces_report() n")).n, 1, "the staged piece on a real business gets no line");
  const line = await one("select summary, kind, ref from activity_log");
  assert.equal(line.summary, "Tap list, since yesterday: 2 added, 0 changed, 1 moved to a new stage.");
  assert.equal(line.kind, "system"); assert.equal(line.ref.piece, p);
  assert.equal((await one("select pieces_report() n")).n, 0, "not twice in one day");
  await db.query("update pieces set spec = jsonb_set(spec, '{report,at}', '\"03:00\"') where id = $1 and $2 <> '03'", [p, hour]);
});
