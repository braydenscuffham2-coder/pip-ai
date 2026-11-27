// Pip's doors in the database: making one, one knock, limits, repeats, the pause switch. Run as the real migration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null, pgcrypto = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); ({ pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto")); } catch { /* not installed */ }
const ready = !!(PGlite && pgcrypto);
const read = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8");
const FORM = JSON.stringify({ title: "Ask for a refill", fields: [{ id: "name", label: "Your name", type: "text", required: true }] });

async function fresh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create table businesses (id uuid primary key default gen_random_uuid(), name text, status text not null default 'building');
    create table forge_settings (key text primary key, value jsonb);
  `);
  await db.exec(read("20261127_09_edges.sql"));
  const one = async (q, p = []) => (await db.query(q, p)).rows[0];
  const biz = (await one("insert into businesses (name) values ('TEST Fork (Pip end-to-end check)') returning id")).id;
  const make = async (kind, name, extra = {}) => (await one("select edge_make($1, $2, $3, $4, $5::jsonb, $6, 'test') r", [biz, kind, name, extra.label ?? "A door", extra.form ?? null, extra.url ?? null])).r;
  const take = async (id, kind, secret, key, data = { a: "b" }, address = null) => (await one("select edge_take($1, $2, $3, $4, $5, $6::jsonb) r", [id, address, kind, secret, key, JSON.stringify(data)])).r;
  return { db, one, biz, make, take };
}

test("a webhook door: the secret is returned once and only its hash is kept; a wrong secret looks like no door", { skip: !ready }, async () => {
  const { one, make, take } = await fresh();
  const m = await make("webhook", "crm_in");
  assert.equal(m.ok, true); assert.match(m.secret, /^[0-9a-f]{48}$/);
  const row = await one("select secret_hash, sign_key, address, url from edges where id = $1", [m.id]);
  assert.notEqual(row.secret_hash, m.secret); assert.equal(row.secret_hash.length, 64);
  assert.ok(!JSON.stringify(row).includes(m.secret), "the secret itself is nowhere in the row");
  assert.deepEqual(await take(m.id, "webhook", "wrong-secret-wrong-secret", "k1"), { ok: false, error: "not_found" });
  assert.deepEqual(await take(m.id, "webhook", null, "k1"), { ok: false, error: "not_found" });
  const ok = await take(m.id, "webhook", m.secret, "k1");
  assert.equal(ok.ok, true); assert.equal(ok.name, "crm_in"); assert.equal(ok.kind, "webhook");
  assert.deepEqual(await take(m.id, "webhook", m.secret, "k1"), { ok: true, duplicate: true }, "the same key counts once");
  assert.equal((await one("select count(*)::int n from edge_events")).n, 1);
  const again = (await one("select edge_rotate($1) r", [m.id])).r;
  assert.equal((await take(m.id, "webhook", m.secret, "k2")).ok, false, "the old secret stops at once");
  assert.equal((await take(m.id, "webhook", again.secret, "k2")).ok, true);
});

test("an email door gets its own address; a form door keeps its form; an out door keeps an https address and a signing key", { skip: !ready }, async () => {
  const { one, make, take } = await fresh();
  const e = await make("email", "inbox");
  assert.match(e.address, /^in-test-fork-pip-end-to-end-[0-9a-f]{8}@hirepip\.com$/);
  const viaMail = await take(null, "email", null, "m:abc123", { from: "dana@example.test" }, e.address);
  assert.equal(viaMail.ok, true); assert.equal(viaMail.kind, "email");
  assert.equal((await take(null, "email", null, "m:x", {}, "in-nobody-00000000@hirepip.com")).ok, false);
  const f = await make("form", "refill", { form: FORM });
  assert.equal((await one("select edge_form($1) r", [f.id])).r.form.title, "Ask for a refill");
  assert.equal((await one("select edge_form($1) r", [e.id])).r, null, "only a form has a public face");
  assert.equal((await take(f.id, "webhook", "x".repeat(48), "k")).ok, false, "a form cannot be knocked on as a webhook");
  const o = await make("out", "crm_out", { url: "https://hooks.example-crm.com/in" });
  assert.equal(o.ok, true); assert.match(o.secret, /^[0-9a-f]{48}$/);
  assert.equal((await make("out", "bad", { url: "http://insecure.example.com" })).ok, false);
  assert.equal((await make("webhook", "crm_in2", { label: "x" })).ok, false, "a one-letter label is refused");
  assert.equal((await make("form", "refill", { form: FORM })).error, "name_taken");
  const sent = (await one("select edge_out_take($1, 'crm_out', 'r:1', '{\"a\":\"b\"}'::jsonb) r", [(await one("select business_id from edges limit 1")).business_id])).r;
  assert.equal(sent.url, "https://hooks.example-crm.com/in"); assert.equal(sent.sign_key, o.secret);
  assert.equal((await one("select edge_out_take($1, 'crm_out', 'r:1', '{\"a\":\"b\"}'::jsonb) r", [(await one("select business_id from edges limit 1")).business_id])).r.duplicate, true);
  assert.equal((await one("select edge_out_take($1, 'nope', 'r:2', '{}'::jsonb) r", [(await one("select business_id from edges limit 1")).business_id])).r.error, "not_found");
});

test("a zapier door takes posts like a webhook and holds a feed that only its secret can read", { skip: !ready }, async () => {
  const { one, biz, make, take } = await fresh();
  const z = await make("zapier", "zapier", { label: "Zapier" });
  assert.equal(z.ok, true); assert.match(z.secret, /^[0-9a-f]{48}$/);
  const inn = await take(z.id, "webhook", z.secret, "k1", { subject: "New booking" });
  assert.equal(inn.ok, true); assert.equal(inn.kind, "webhook", "to the jobs it is a webhook that arrived");
  assert.deepEqual((await one("select edge_who($1, $2) r", [z.id, z.secret])).r, { ok: true, business: "TEST Fork (Pip end-to-end check)", door: "Zapier", kind: "zapier" });
  assert.equal((await one("select edge_who($1, 'wrong') r", [z.id])).r, null);
  for (const k of ["r:1", "r:2"]) assert.deepEqual((await one("select edge_out_take($1, 'zapier', $2, $3::jsonb) r", [biz, k, JSON.stringify({ lead: k })])).r.feed, true);
  const feed = (await one("select edge_feed($1, $2, 50) r", [z.id, z.secret])).r;
  assert.equal(feed.ok, true); assert.equal(feed.items.length, 2, "only what teammates left, not what came in");
  assert.ok(feed.items.every((i) => i.id && i.sent_at && i.data.lead));
  assert.deepEqual((await one("select edge_feed($1, 'wrong-secret', 50) r", [z.id])).r, { ok: false, error: "not_found" });
  const hook = await make("webhook", "plain");
  assert.equal((await one("select edge_feed($1, $2, 50) r", [hook.id, hook.secret])).r.error, "not_found", "a plain webhook has no feed");
});

test("limits, the pause switch, a closed door and a disconnected business all refuse", { skip: !ready }, async () => {
  const { db, one, biz, make, take } = await fresh();
  const m = await make("webhook", "busy");
  await db.query("update edges set per_hour = 3 where id = $1", [m.id]);
  for (const k of ["a", "b", "c"]) assert.equal((await take(m.id, "webhook", m.secret, k)).ok, true);
  assert.deepEqual(await take(m.id, "webhook", m.secret, "d"), { ok: false, error: "slow_down" });
  await db.query("update edges set per_hour = 60 where id = $1", [m.id]);
  await db.query("update forge_settings set value = 'true'::jsonb where key = 'edges_paused'");
  assert.deepEqual(await take(m.id, "webhook", m.secret, "e"), { ok: false, error: "paused" });
  await db.query("update forge_settings set value = 'false'::jsonb where key = 'edges_paused'");
  await db.query("update edges set enabled = false where id = $1", [m.id]);
  assert.equal((await take(m.id, "webhook", m.secret, "f")).error, "not_found");
  await db.query("update edges set enabled = true where id = $1", [m.id]);
  await db.query("update businesses set status = 'disconnected' where id = $1", [biz]);
  assert.equal((await take(m.id, "webhook", m.secret, "g")).error, "not_found");
  await db.query("update businesses set status = 'building' where id = $1", [biz]);
  assert.equal((await take(m.id, "webhook", m.secret, "h", "not an object")).error, "bad_request");
  const ev = await take(m.id, "webhook", m.secret, "i");
  await db.query("select edge_done($1, 2, 'started', null)", [ev.event]);
  assert.deepEqual(await one("select started, status from edge_events where id = $1", [ev.event]), { started: 2, status: "started" });
});

test("nobody but the service role can read a door or call its functions", { skip: !ready }, async () => {
  const { one } = await fresh();
  const rights = await one("select has_table_privilege('anon', 'public.edges', 'select') a, has_table_privilege('authenticated', 'public.edge_events', 'select') b, has_function_privilege('anon', 'public.edge_take(uuid, text, text, text, text, jsonb)', 'execute') c, has_function_privilege('authenticated', 'public.edge_make(uuid, text, text, text, jsonb, text, text)', 'execute') d, has_function_privilege('service_role', 'public.edge_take(uuid, text, text, text, text, jsonb)', 'execute') e");
  assert.deepEqual(rights, { a: false, b: false, c: false, d: false, e: true });
  assert.equal((await one("select relrowsecurity r from pg_class where relname = 'edges'")).r, true);
  assert.equal((await one("select relrowsecurity r from pg_class where relname = 'edge_events'")).r, true);
});
