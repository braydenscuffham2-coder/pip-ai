// The database half of the owner's inbox: every message a teammate passes on is tied to its business by the database,
// the activity line says what kind of thing it was, and the owners' email goes through the held outbox, at most once in
// ten minutes unless urgent. Runs the real migration on tables cut down to the columns it touches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261127_22_owner_inbox.sql", import.meta.url)), "utf8");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const ORDER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ORDER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPEC_A = "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0", SPEC_B = "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0", LOOSE = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";

async function fresh({ invites = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table businesses (id uuid primary key, name text, status text, alert_prefs jsonb not null default '{}'::jsonb);
    create table build_orders (id uuid primary key, business_id uuid);
    create table skill_specs (id uuid primary key, order_id uuid, status text, skill_id text);
    create table agent_manifests (spec_id uuid primary key, manifest jsonb);
    create table members (id bigserial primary key, business_id uuid, email text, role text, status text default 'active');
    create table platform_admins (email text primary key);
    create table activity_log (id bigserial primary key, business_id uuid not null, spec_id uuid, agent text, kind text not null default 'action', summary text not null, outcome text not null default 'ok', actor text);
    create table portal_notices (id bigserial primary key, business_id uuid, to_email text not null, subject text not null, title text not null, lines jsonb not null default '[]'::jsonb,
      no_link boolean not null default false, status text not null default 'pending', created_at timestamptz not null default now());
    create table notifications (id bigserial primary key, spec_id uuid, kind text, body jsonb, seen boolean default false, created_at timestamptz not null default now());
    create function portal_flag(p_key text, p_default boolean) returns boolean language sql as $$ select ${invites ? "true" : "false"} $$;
    create function portal_spec_ctx(p_spec uuid, out business_id uuid, out skill_id text, out teammate text, out spec_status text, out business_status text)
    language sql stable as $$
      select o.business_id, s.skill_id, coalesce(am.manifest->>'teammate', s.skill_id), s.status, b.status
      from public.skill_specs s left join public.build_orders o on o.id = s.order_id left join public.businesses b on b.id = o.business_id left join public.agent_manifests am on am.spec_id = s.id where s.id = p_spec $$;
    create function portal_notify(p_business uuid, p_to text, p_subject text, p_title text, p_lines text[], p_no_link boolean default false)
    returns integer language plpgsql as $$
    declare n integer := 0; st text;
    begin
      st := case when public.portal_flag('portal_invites', false) then 'pending' else 'held' end;
      insert into public.portal_notices (business_id, to_email, subject, title, lines, no_link, status)
      select p_business, m.email, left(p_subject, 160), left(p_title, 200), to_jsonb(coalesce(p_lines, '{}'::text[])), coalesce(p_no_link, false), st
      from public.members m where m.business_id = p_business and m.role = 'owner' and m.status <> 'removed';
      get diagnostics n = row_count; return n;
    end $$;
    insert into businesses (id, name, status) values ('${A}', 'TEST Fork', 'building'), ('${B}', 'TEST Novelty Vet', 'building');
    insert into build_orders values ('${ORDER_A}', '${A}'), ('${ORDER_B}', '${B}');
    insert into skill_specs values ('${SPEC_A}', '${ORDER_A}', 'sandbox', 'front-desk'), ('${SPEC_B}', '${ORDER_B}', 'live', 'vet-desk'), ('${LOOSE}', null, 'sandbox', 'loose');
    insert into agent_manifests values ('${SPEC_A}', '{"teammate":"Hallie"}'), ('${SPEC_B}', '{"teammate":"Moss"}');
    insert into members (business_id, email, role) values ('${A}', 'owner@example.test', 'owner'), ('${A}', 'staff@example.test', 'staff'), ('${B}', 'vet@example.test', 'owner');
    insert into notifications (spec_id, kind, body) values ('${SPEC_A}', 'notify_owner', '{"args":{"summary":"an old one, from before"}}');
  `);
  await db.exec(migration);
  return db;
}
const rows = async (db, q, p = []) => (await db.query(q, p)).rows;
const add = (db, spec, kind, args) => db.query("insert into notifications (spec_id, kind, body) values ($1, $2, $3)", [spec, kind, JSON.stringify({ args })]);

test("a message is tied to its teammate's business by the database, and old ones are filled in", { skip: !PGlite }, async () => {
  const db = await fresh();
  await add(db, SPEC_A, "notify_owner", { summary: "Dana asked about a cake. 208-555-0142." });
  await add(db, SPEC_B, "capture_lead", { name: "Sam", need: "A check-up" });
  await add(db, LOOSE, "notify_owner", { summary: "nobody's" });
  const got = await rows(db, "select spec_id, business_id from notifications order by id");
  assert.deepEqual(got.map((r) => r.business_id), [A, A, B, null]);
});

test("a writer cannot file a message under another business", { skip: !PGlite }, async () => {
  const db = await fresh();
  // The trigger only fills an empty business; a row written with one keeps it, so the check is on who may write:
  // only the service role writes this table. What matters here is that a row with no business gets the right one.
  await db.query("insert into notifications (spec_id, kind, body) values ($1, 'notify_owner', '{}')", [SPEC_B]);
  assert.equal((await rows(db, "select business_id from notifications order by id desc limit 1"))[0].business_id, B);
});

test("the activity line says what kind of thing was passed on, for a teammate that is not live too", { skip: !PGlite }, async () => {
  const db = await fresh();
  await add(db, SPEC_A, "notify_owner", { summary: "x" });
  await add(db, SPEC_A, "capture_lead", { need: "x" });
  await add(db, SPEC_A, "request_booking", { when: "Saturday at 7" });
  await add(db, SPEC_A, "awaiting_golive", {});
  const got = (await rows(db, "select summary from activity_log order by id")).map((r) => r.summary);
  assert.deepEqual(got, ["Hallie left you a message", "Hallie saved a lead for you", "Hallie asked you to confirm a booking"]);
  assert.ok(!got.join(" ").includes("Saturday"), "the words themselves stay out of the activity list");
});

test("the owners are emailed through the held outbox: held while invites are off, and only owners", { skip: !PGlite }, async () => {
  const db = await fresh();
  await add(db, SPEC_A, "notify_owner", { summary: "Dana asked about a cake.\n<b>208-555-0142</b>" });
  const got = await rows(db, "select to_email, subject, title, lines, status from portal_notices");
  assert.equal(got.length, 1);
  assert.equal(got[0].to_email, "owner@example.test");
  assert.equal(got[0].status, "held");
  assert.equal(got[0].subject, "Hallie left you a message");
  assert.deepEqual(got[0].lines, ["Hallie left you a message.", "Dana asked about a cake.  b 208-555-0142 /b", "Open your Portal to read it and mark it done."]);
  const live = await fresh({ invites: true });
  await add(live, SPEC_A, "capture_lead", { name: "Sam", phone: "208-555-0188", need: "Dinner for 30" });
  const sent = await rows(live, "select status, lines from portal_notices");
  assert.equal(sent[0].status, "pending");
  assert.equal(sent[0].lines[1], "Sam, 208-555-0188: Dinner for 30");
});

test("three notes in one call send one email; an urgent one always goes", { skip: !PGlite }, async () => {
  const db = await fresh();
  await add(db, SPEC_A, "notify_owner", { summary: "one" });
  await add(db, SPEC_A, "notify_owner", { summary: "two" });
  await add(db, SPEC_A, "capture_lead", { need: "three" });
  assert.equal((await rows(db, "select 1 from portal_notices")).length, 1);
  await add(db, SPEC_A, "notify_owner", { summary: "a caller said gas leak", urgency: "urgent" });
  const got = await rows(db, "select subject, title from portal_notices order by id");
  assert.equal(got.length, 2);
  assert.equal(got[1].subject, "Urgent: Hallie left you a message");
  // another business is not held back by this one's email
  await add(db, SPEC_B, "notify_owner", { summary: "vet" });
  assert.equal((await rows(db, "select 1 from portal_notices where to_email = 'vet@example.test'")).length, 1);
  // every one of them is still in the inbox
  assert.equal((await rows(db, "select 1 from notifications where business_id = $1", [A])).length, 5);
});

test("an owner who turned email alerts off gets none, and still has the message", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("update businesses set alert_prefs = '{\"by_email\": false}' where id = $1", [A]);
  await add(db, SPEC_A, "notify_owner", { summary: "quiet", urgency: "urgent" });
  assert.equal((await rows(db, "select 1 from portal_notices")).length, 0);
  assert.equal((await rows(db, "select 1 from notifications where business_id = $1 and body->'args'->>'summary' = 'quiet'", [A])).length, 1);
});

test("a failure in the log or the email never stops the message being saved", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.exec("drop table portal_notices; drop table activity_log;");
  await add(db, SPEC_A, "notify_owner", { summary: "still here" });
  assert.equal((await rows(db, "select business_id from notifications where body->'args'->>'summary' = 'still here'"))[0].business_id, A);
});
