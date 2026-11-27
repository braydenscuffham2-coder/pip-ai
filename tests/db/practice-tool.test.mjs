// The practice tool's database door (practice_call), run as the real migration on an in-memory Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null, pgcrypto = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); ({ pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto")); } catch { /* not installed */ }
const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261127_04_practice_tool.sql", import.meta.url)), "utf8");
const ready = !!(PGlite && pgcrypto);

async function fresh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create function pip_ok(t text) returns boolean language sql as $$ select t = 'server-secret' $$;`);
  await db.exec(sql);
  const open = (await db.query("insert into practice_sandboxes (label) values ('Open copy') returning id")).rows[0].id;
  await db.query("select practice_seed($1)", [open]);
  const locked = (await db.query("insert into practice_sandboxes (label, login_required, setup_code_hash) values ('Locked copy', true, encode(extensions.digest('one-time-code', 'sha256'), 'hex')) returning id")).rows[0].id;
  const call = async (op, args, secret = "server-secret") => (await db.query("select practice_call($1, $2, $3::jsonb) as r", [secret, op, JSON.stringify(args)])).rows[0].r;
  return { db, open, locked, call };
}

test("the door needs the site's server secret", { skip: !ready }, async () => {
  const { open, call } = await fresh();
  await assert.rejects(call("list", { sandbox: open, kind: "patient" }, "wrong"), /denied/);
});

test("an open copy can be read, added to and updated, and every change is written down", { skip: !ready }, async () => {
  const { db, open, call } = await fresh();
  const patients = (await call("list", { sandbox: open, kind: "patient" })).rows;
  assert.equal(patients.length, 3);
  const added = await call("add", { sandbox: open, kind: "refill", data: { patient: "Biscuit", medication: "Carprofen 75mg", quantity: "30", status: "requested" } });
  assert.equal(added.ok, true);
  assert.equal((await call("update", { sandbox: open, id: patients[0].id, data: { reminders: "paused" } })).ok, true);
  assert.equal((await call("get", { sandbox: open, id: patients[0].id })).data.reminders, "paused");
  assert.equal((await call("get", { sandbox: open, id: patients[0].id })).data.name, "Biscuit", "an update changes only the fields it names");
  const events = (await db.query("select what, kind from practice_events where sandbox_id = $1 order by id", [open])).rows;
  assert.deepEqual(events, [{ what: "add", kind: "refill" }, { what: "update", kind: "patient" }]);
});

test("a delete really deletes and is written down, so a test can prove nobody pressed it", { skip: !ready }, async () => {
  const { db, open, call } = await fresh();
  const id = (await call("list", { sandbox: open, kind: "patient" })).rows[0].id;
  assert.equal((await call("delete", { sandbox: open, id })).ok, true);
  assert.equal((await call("list", { sandbox: open, kind: "patient" })).rows.length, 2);
  assert.equal((await db.query("select count(*)::int as n from practice_events where what = 'delete'")).rows[0].n, 1);
});

test("a locked copy shows nothing without a session, and its sign-in is set once through the setup code", { skip: !ready }, async () => {
  const { db, locked, call } = await fresh();
  assert.equal((await call("list", { sandbox: locked, kind: "patient" })).error, "signed_out");
  assert.equal((await call("setup", { sandbox: locked, code: "wrong", username: "pip@example.test", password: "a-made-up-password" })).error, "bad_code");
  assert.equal((await call("setup", { sandbox: locked, code: "one-time-code", username: "Pip@Example.test", password: "a-made-up-password" })).ok, true);
  assert.equal((await call("setup", { sandbox: locked, code: "one-time-code", username: "x@example.test", password: "another-password" })).error, "bad_code", "the code works once");
  const stored = (await db.query("select pass_hash from practice_sandboxes where id = $1", [locked])).rows[0].pass_hash;
  assert.ok(stored.startsWith("$2") && !stored.includes("a-made-up-password"), "only a one-way hash is stored");
  assert.equal((await call("signin", { sandbox: locked, username: "pip@example.test", password: "not-it" })).error, "bad_login");
  const s = await call("signin", { sandbox: locked, username: "pip@example.test", password: "a-made-up-password" });
  assert.equal(s.ok, true); assert.equal(s.need_code, false);
  assert.equal((await call("list", { sandbox: locked, kind: "patient", token: s.token })).rows.length, 3);
  await call("signout", { sandbox: locked, token: s.token });
  assert.equal((await call("list", { sandbox: locked, kind: "patient", token: s.token })).error, "signed_out");
});

test("with two-step sign-in on, a session is no use until the code has been given", { skip: !ready }, async () => {
  const { locked, call } = await fresh();
  await call("setup", { sandbox: locked, code: "one-time-code", username: "pip@example.test", password: "a-made-up-password" });
  let s = await call("signin", { sandbox: locked, username: "pip@example.test", password: "a-made-up-password" });
  assert.equal((await call("totp_set", { sandbox: locked, token: s.token, secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" })).ok, true);
  s = await call("signin", { sandbox: locked, username: "pip@example.test", password: "a-made-up-password" });
  assert.equal(s.need_code, true);
  assert.equal((await call("list", { sandbox: locked, kind: "patient", token: s.token })).error, "need_code");
  assert.equal((await call("code_secret", { sandbox: locked, token: s.token })).secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  await call("code_ok", { sandbox: locked, token: s.token });
  assert.equal((await call("list", { sandbox: locked, kind: "patient", token: s.token })).ok, true);
});

test("the practice tables have row-level security and are closed to visitors", { skip: !ready }, async () => {
  const { db } = await fresh();
  const t = (await db.query("select relrowsecurity from pg_class where relname like 'practice_%' and relkind = 'r'")).rows;
  assert.equal(t.length, 4); assert.ok(t.every((r) => r.relrowsecurity));
});
