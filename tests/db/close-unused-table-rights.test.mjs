// Tables with row security and no policy lose the rights the public keys never needed. Tables with a policy keep theirs.
// Runs the real migration on an in-memory Postgres. Skips itself when PGlite is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261119_09_close_unused_table_rights.sql", import.meta.url)), "utf8");

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table closed_one (id int primary key, v text);
    create table has_policy (id int primary key, v text);
    create table no_rls (id int primary key, v text);
    alter table closed_one enable row level security;
    alter table has_policy enable row level security;
    create policy p on has_policy for select to authenticated using (true);
    grant all on closed_one, has_policy, no_rls to anon, authenticated, service_role;
    create function forge_golive_guard() returns trigger language plpgsql as $$ begin return new; end $$;
    insert into closed_one values (1, 'x');
  `);
  return db;
}
const can = async (db, role, tbl, priv) => (await db.query("select has_table_privilege($1, $2, $3) as ok", [role, tbl, priv])).rows[0].ok;

test("a table with row security and no policy loses every right for the public keys", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
  for (const role of ["anon", "authenticated"]) for (const priv of ["select", "insert", "update", "delete"]) assert.equal(await can(db, role, "closed_one", priv), false, `${role} ${priv}`);
});

test("the service role, which the edge functions use, keeps everything", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
  for (const priv of ["select", "insert", "update", "delete"]) assert.equal(await can(db, "service_role", "closed_one", priv), true, priv);
  assert.equal((await db.query("select count(*)::int n from closed_one")).rows[0].n, 1, "no row is touched");
});

test("a table that has a policy is left exactly as it was", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
  assert.equal(await can(db, "authenticated", "has_policy", "select"), true);
  assert.equal(await can(db, "anon", "has_policy", "select"), true);
});

test("a table without row security is not touched here (there is none on live; this migration is not the fix for one)", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
  assert.equal(await can(db, "anon", "no_rls", "select"), true);
});

test("the go-live trigger function can no longer be called by hand, and running the migration twice is fine", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
  await db.exec(sql);
  const r = await db.query("select has_function_privilege('anon', 'forge_golive_guard()', 'execute') as a, has_function_privilege('authenticated', 'forge_golive_guard()', 'execute') as u");
  assert.deepEqual(r.rows[0], { a: false, u: false });
});
