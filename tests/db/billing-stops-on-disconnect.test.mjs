// A business that leaves must stop being billed. Runs the real migration on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read("../../supabase/migrations/20261120_08_billing_stops_on_disconnect.sql");

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text, stripe_subscription_id text,
      billing_status text not null default 'none' check (billing_status in ('none','due','active','past_due','paused','ended')), updated_at timestamptz default now());
    create table activity_log (id bigserial primary key, business_id uuid, kind text, summary text, outcome text, actor text);
  `);
  await db.exec(sql);
  return db;
}
const add = async (db, name, status, billing, sub = null) => (await db.query("insert into businesses (name, status, billing_status, stripe_subscription_id) values ($1,$2,$3,$4) returning id", [name, status, billing, sub])).rows[0].id;
const state = async (db, id) => (await db.query("select billing_status from businesses where id=$1", [id])).rows[0].billing_status;

test("a business that disconnected or deleted its account is listed so its subscription can be ended", { skip: !PGlite }, async () => {
  const db = await fresh();
  const gone = await add(db, "Left", "disconnected", "active", "sub_1"), deleted = await add(db, "Deleted", "cancelled", "past_due", "sub_2");
  await add(db, "Still here", "live", "active", "sub_3");
  const stops = (await db.query("select portal_billing_stops() as r")).rows[0].r;
  assert.deepEqual(stops.map((s) => s.subscription).sort(), ["sub_1", "sub_2"]);
  assert.ok(stops.every((s) => s.do === "stop"));
  assert.equal(await state(db, gone), "active", "not closed until Stripe has agreed");
  assert.equal(await state(db, deleted), "past_due");
});

test("a business that left before it was ever charged is closed at once and can never be started", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = await add(db, "Left early", "disconnected", "due", null);
  const stops = (await db.query("select portal_billing_stops() as r")).rows[0].r;
  assert.deepEqual(stops, []);
  assert.equal(await state(db, id), "ended");
});

test("after Stripe agrees, billing is over for that business and it is not listed again", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = await add(db, "Left", "disconnected", "active", "sub_1");
  assert.deepEqual((await db.query("select portal_billing_stopped($1) as r", [id])).rows[0].r, { ok: true });
  assert.equal(await state(db, id), "ended");
  assert.deepEqual((await db.query("select portal_billing_stops() as r")).rows[0].r, []);
  assert.equal((await db.query("select count(*)::int n from activity_log where business_id=$1", [id])).rows[0].n, 1);
  assert.deepEqual((await db.query("select portal_billing_stopped($1) as r", [id])).rows[0].r, { ok: false }, "a second call changes nothing");
});

test("a business that is still a client can never be marked as stopped", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = await add(db, "Still here", "live", "active", "sub_3");
  assert.deepEqual((await db.query("select portal_billing_stopped($1) as r", [id])).rows[0].r, { ok: false });
  assert.equal(await state(db, id), "active");
  const p = (await db.query("select has_function_privilege('anon','portal_billing_stops()','execute') a, has_function_privilege('authenticated','portal_billing_stopped(uuid)','execute') u")).rows[0];
  assert.deepEqual(p, { a: false, u: false });
});

test("pip-run ends subscriptions before it asks what to charge, and only at the end of the paid period", () => {
  const src = read("../../supabase/functions/pip-run/index.ts");
  const stops = src.indexOf('rpc("portal_billing_stops")'), tick = src.indexOf('rpc("portal_billing_tick")');
  assert.ok(stops > 0 && stops < tick, "stops come first");
  assert.match(src, /cancel_at_period_end: "true"/);
  assert.ok(!/stripe\("DELETE", `\/subscriptions/.test(src), "never cancels immediately, which would cut short a month already paid");
  assert.match(src, /if \(cur\) \{ await db\.rpc\("portal_billing_stopped"/, "marked stopped only after Stripe answered");
  assert.match(read("../../legal/terms-of-service.md"), /billing stops at the end of the paid month/);
});
