// A connection saved with an order and no business gets its business from the order, by the database. Runs the real
// migration on tables cut down to the columns it touches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261127_24_connection_business.sql", import.meta.url)), "utf8");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const ORDER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ORDER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", LOOSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table build_orders (id uuid primary key, business_id uuid);
    create table client_connections (id bigserial primary key, order_id uuid, business_id uuid, toolkit text, status text default 'link_made', connected_account_id text);
    insert into build_orders values ('${ORDER_A}', '${A}'), ('${ORDER_B}', '${B}'), ('${LOOSE}', null);
    insert into client_connections (order_id, business_id, toolkit) values ('${ORDER_A}', null, 'outlook'), ('${ORDER_B}', '${B}', 'gmail'), ('${LOOSE}', null, 'slack'), (null, null, 'notion');
  `);
  await db.exec(migration);
  return db;
}
const rows = async (db, q, p = []) => (await db.query(q, p)).rows;

test("rows already saved without a business are filled in from their order", { skip: !PGlite }, async () => {
  const db = await fresh();
  const got = await rows(db, "select toolkit, business_id from client_connections order by id");
  assert.deepEqual(got, [{ toolkit: "outlook", business_id: A }, { toolkit: "gmail", business_id: B }, { toolkit: "slack", business_id: null }, { toolkit: "notion", business_id: null }]);
});

test("a new row with an order and no business gets the order's business", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("insert into client_connections (order_id, toolkit) values ($1, 'hubspot')", [ORDER_A]);
  assert.equal((await rows(db, "select business_id from client_connections where toolkit = 'hubspot'"))[0].business_id, A);
});

test("a business that was written is never replaced, and a status change keeps it", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("insert into client_connections (order_id, business_id, toolkit) values ($1, $2, 'odd')", [ORDER_A, B]);
  assert.equal((await rows(db, "select business_id from client_connections where toolkit = 'odd'"))[0].business_id, B);
  await db.query("update client_connections set status = 'active' where toolkit = 'outlook'");
  assert.equal((await rows(db, "select business_id from client_connections where toolkit = 'outlook'"))[0].business_id, A);
});
