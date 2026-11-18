// Go-live stays with Brayden. The website's spec route must never make a teammate live or change a live one.
// Runs the real migration on an in-memory Postgres. Skips itself when PGlite is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261118_09_spec_upsert_no_golive.sql", import.meta.url)), "utf8");

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table skill_specs (id uuid primary key default gen_random_uuid(), business text, domain text, skill_id text, version int,
      status text, spec jsonb, brain jsonb, quote jsonb, tests jsonb, updated_at timestamptz default now());
    create function pip_ok(s text) returns boolean language sql as $$ select s = 'right' $$;
    create function api_needs_after_insert() returns trigger language plpgsql as $$ begin return null; end $$;
  `);
  await db.exec(sql);
  return db;
}
const up = (db, id, status, secret = "right") => db.query("select pip_spec_upsert($1,$2,'Biz','biz.example',$3,'{}'::jsonb,'{}'::jsonb,null,null) as id", [secret, id, status]);

test("the website path cannot create a live teammate", { skip: !PGlite }, async () => {
  const db = await fresh();
  await assert.rejects(up(db, null, "live"), /go_live_is_not_done_here/);
  assert.equal((await db.query("select count(*)::int n from skill_specs")).rows[0].n, 0);
});

test("the website path cannot switch an existing teammate to live", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = (await up(db, null, "sandbox")).rows[0].id;
  await assert.rejects(up(db, id, "live"), /go_live_is_not_done_here/);
  assert.equal((await db.query("select status from skill_specs where id=$1", [id])).rows[0].status, "sandbox");
});

test("a teammate that is live cannot be rewritten or paused through the website path", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = (await up(db, null, "sandbox")).rows[0].id;
  await db.query("update skill_specs set status='live', spec='{\"kept\":true}'::jsonb where id=$1", [id]); // what the Forge's go-live does
  await assert.rejects(up(db, id, "sandbox"), /live_teammates_change_through_the_forge/);
  const row = (await db.query("select status, spec from skill_specs where id=$1", [id])).rows[0];
  assert.equal(row.status, "live");
  assert.deepEqual(row.spec, { kept: true });
});

test("ordinary saves still work, and a wrong secret is refused", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = (await up(db, null, "approved")).rows[0].id;
  assert.equal((await up(db, id, "sandbox")).rows[0].id, id);
  await assert.rejects(up(db, id, "sandbox", "wrong"), /denied/);
});
