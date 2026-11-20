// The Privacy Policy says conversations are deleted 13 months after the last message. This runs the real migration
// on an in-memory Postgres and checks exactly that. Skips itself when PGlite is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sql = read("../../supabase/migrations/20261120_10_conversation_retention.sql");

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table conversations (id uuid primary key default gen_random_uuid(), spec_id uuid, channel text, visitor text, created_at timestamptz default now());
    create table messages (id bigserial primary key, conversation_id uuid references conversations(id) on delete cascade, role text, content text, created_at timestamptz default now());
    create table voice_calls (id bigserial primary key, conversation_id uuid references conversations(id) on delete set null);
    create table notifications (id bigserial primary key, spec_id uuid, kind text, body jsonb, created_at timestamptz default now());
    create table leads (id uuid primary key default gen_random_uuid(), business text, created_at timestamptz default now());
  `);
  await db.exec(sql);
  return db;
}
const conv = async (db, startedAgo, lastMessageAgo) => {
  const id = (await db.query(`insert into conversations (channel, created_at) values ('web_chat', now() - $1::interval) returning id`, [startedAgo])).rows[0].id;
  if (lastMessageAgo) await db.query(`insert into messages (conversation_id, role, content, created_at) values ($1, 'user', 'hi', now() - $2::interval)`, [id, lastMessageAgo]);
  return id;
};
const left = async (db, table) => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;

test("a conversation is deleted 13 months after its last message, with its messages", { skip: !PGlite }, async () => {
  const db = await fresh();
  const old = await conv(db, "14 months", "14 months");
  const recent = await conv(db, "12 months", "12 months");
  const r = (await db.query("select pip_purge_conversations() as r")).rows[0].r;
  assert.equal(r.conversations_removed, 1);
  assert.deepEqual((await db.query("select id from conversations")).rows.map((x) => x.id), [recent]);
  assert.equal((await db.query("select count(*)::int n from messages where conversation_id = $1", [old])).rows[0].n, 0);
  assert.equal(await left(db, "messages"), 1);
});

test("a long-running conversation with a recent message is kept whole", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = await conv(db, "20 months", "20 months");
  await db.query(`insert into messages (conversation_id, role, content, created_at) values ($1, 'user', 'back again', now() - interval '2 days')`, [id]);
  await db.query("select pip_purge_conversations()");
  assert.equal(await left(db, "conversations"), 1);
  assert.equal(await left(db, "messages"), 2, "older messages in a live conversation stay with it");
});

test("an old conversation with no messages at all is deleted, and a call record loses only its link", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = await conv(db, "15 months", null);
  await db.query("insert into voice_calls (conversation_id) values ($1)", [id]);
  await db.query("select pip_purge_conversations()");
  assert.equal(await left(db, "conversations"), 0);
  assert.deepEqual((await db.query("select conversation_id from voice_calls")).rows, [{ conversation_id: null }]);
});

test("leads and booking requests a teammate took go after 13 months; Pip's own order list is not touched", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(`
    insert into notifications (kind, body, created_at) values ('capture_lead', '{}', now() - interval '14 months'), ('request_booking', '{}', now() - interval '1 month');
    insert into leads (business, created_at) values ('Old order', now() - interval '3 years');
  `);
  const r = (await db.query("select pip_purge_conversations() as r")).rows[0].r;
  assert.equal(r.notes_removed, 1);
  assert.deepEqual((await db.query("select kind from notifications")).rows, [{ kind: "request_booking" }]);
  assert.equal(await left(db, "leads"), 1);
});

test("nothing recent is ever deleted, the public keys cannot run it, and it is safe to install twice", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec(sql);
  for (const ago of ["1 day", "6 months", "12 months 20 days"]) await conv(db, ago, ago);
  const r = (await db.query("select pip_purge_conversations() as r")).rows[0].r;
  assert.equal(r.conversations_removed, 0);
  assert.equal(await left(db, "conversations"), 3);
  const p = (await db.query("select has_function_privilege('anon', 'pip_purge_conversations()', 'execute') a, has_function_privilege('authenticated', 'pip_purge_conversations()', 'execute') u, has_function_privilege('service_role', 'pip_purge_conversations()', 'execute') s")).rows[0];
  assert.deepEqual(p, { a: false, u: false, s: true });
});

test("the Privacy Policy and the code name the same period", () => {
  const policy = read("../../legal/privacy-policy.md");
  assert.match(sql, /interval '13 months'/);
  assert.match(policy, /13 months after the last message/);
});
