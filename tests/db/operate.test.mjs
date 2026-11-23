// Job 3: the operator lane's database side. Runs the real migration on an in-memory Postgres, on top of copies of the
// live tables and the two live functions it re-creates. Needs @electric-sql/pglite (skipped when it is not installed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RULES, PROCESSES, compileOperator, OPERATE } from "../../supabase/functions/_shared/operate.ts";
import { CONTRACT } from "../../supabase/functions/_shared/teammate-spec.ts";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const migration = read("../../supabase/migrations/20261123_01_operate.sql");
const shapes = read("./fixtures/operate_live_shapes.sql");
const liveGate = read("./fixtures/portal_golive_gate.sql");
const liveCompile = read("./fixtures/portal_compile_manifest.sql");
const livePause = read("./fixtures/portal_job_pause.sql");
const parity = JSON.parse(read("../operate/parity.json"));

const BIZ = "11111111-1111-1111-1111-111111111111", ORDER = "33333333-3333-3333-3333-333333333333";
const S_REVIEW = "44444444-4444-4444-4444-444444444441", S_POSTS = "44444444-4444-4444-4444-444444444442", S_PLAIN = "44444444-4444-4444-4444-444444444443";
const specFor = (process, ctx = {}) => { const c = compileOperator(process, { business: "Fork Plumbing", teammate: "Pip", ...ctx }); return { contract: CONTRACT, jobs: c.jobs, operate: c.operate }; };

async function fresh({ apply = true } = {}) {
  const db = new PGlite();
  await db.exec(shapes);
  await db.exec(liveGate);
  await db.exec(liveCompile);
  await db.exec(livePause);
  await db.exec("create trigger skill_specs_portal_gate before update of status on skill_specs for each row execute function portal_golive_gate()");
  await db.exec(`
    insert into businesses values ('${BIZ}', 'TEST Fork', 'live', 'America/Boise', 'ID', now(), false, now());
    insert into build_orders values ('${ORDER}', '${BIZ}', '{}');`);
  const ins = (id, skill, spec) => db.query("insert into skill_specs (id, skill_id, status, spec, order_id) values ($1,$2,'sandbox',$3,$4)", [id, skill, JSON.stringify(spec), ORDER]);
  await ins(S_REVIEW, "review_agent", specFor("review_requests", { channels: ["email"] }));
  await ins(S_POSTS, "social_agent", specFor("content_social", { accounts: ["facebook", "instagram"], channels: ["facebook", "instagram"] }));
  await ins(S_PLAIN, "plain_agent", { contract: CONTRACT, jobs: [] });
  if (apply) await db.exec(migration);
  return db;
}
const one = async (db, q, p = []) => (await db.query(q, p)).rows[0];
const flag = (db, on) => db.exec(`update forge_settings set value = '${on}'::jsonb where key = 'operate_lane'`);
const goLive = (db, id) => db.query("update skill_specs set status = 'live' where id = $1", [id]);
const T = (s) => new Date(s).toISOString();

test("the migration applies, ships the lane OFF, and adds the three primitives", { skip: !PGlite }, async () => {
  const db = await fresh();
  assert.equal((await one(db, "select value from forge_settings where key = 'operate_lane'")).value, false);
  assert.equal((await one(db, "select count(*)::int n from primitives where kind = 'operate'")).n, 3);
  assert.equal((await one(db, "select portal_flag('operate_lane', true) f")).f, false);
});

test("the seeded ceilings equal the TypeScript RULES exactly", { skip: !PGlite }, async () => {
  const db = await fresh();
  const rows = (await db.query("select * from operator_process_rules order by process")).rows;
  assert.deepEqual(rows.map((r) => r.process), [...PROCESSES].sort());
  for (const r of rows) {
    const t = RULES[r.process];
    assert.equal(r.reaches, t.reaches); assert.equal(r.max_touches, t.max_touches); assert.equal(r.min_gap_hours, t.min_gap_hours);
    assert.equal(r.max_days, t.max_days); assert.equal(r.first_n, t.first_n); assert.deepEqual(r.purposes, t.purposes);
  }
  assert.equal(rows.find((r) => r.process === "content_social").weekly_cap, RULES.content_social.max_touches, "three posts a week");
});

test("parity: the SQL touch rule gives the same answer as the TypeScript on every recorded row", { skip: !PGlite }, async () => {
  const db = await fresh();
  let n = 0;
  for (const t of parity.touch) {
    const r = await one(db, "select operator_touch_decision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) w",
      [t.c.status, t.c.touches, t.c.opened_at, t.c.last_touch_at, t.rules.max_touches, t.rules.min_gap_hours, t.rules.max_days, t.now, t.touchNo, t.from, t.to, t.tz]);
    assert.equal(r.w, t.why, `row ${n}: ${JSON.stringify(t)}`); n++;
  }
  assert.ok(n > 500);
});

test("parity: the SQL close rule gives the same answer as the TypeScript on every recorded row", { skip: !PGlite }, async () => {
  const db = await fresh();
  let n = 0;
  for (const t of parity.close) {
    const r = await one(db, "select operator_close_reason($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) w",
      [t.c.status, t.c.touches, t.c.opened_at, t.rules.max_touches, t.rules.max_days, t.now, t.closesWhen, !!t.signals.replied, !!t.signals.opted_out, !!t.signals.completed]);
    assert.equal(r.w, t.reason, `row ${n}: ${JSON.stringify(t)}`); n++;
  }
  assert.ok(n > 300);
});

test("a case is opened once, the touch is reserved before sending, and the cadence is held by the database", { skip: !PGlite }, async () => {
  const db = await fresh();
  const open = async () => (await one(db, "select operator_case_open($1,'review_requests','job-1','pat@example.test','email','completed') id", [S_REVIEW])).id;
  const id = await open();
  assert.equal(await open(), id, "same job key, same case");
  const raw = JSON.stringify(await db.query("select * from operator_cases"));
  assert.ok(!raw.includes("pat@example.test"), "the raw address is never stored");
  const t = (n, at, from = "00:00", to = "24:00") => one(db, "select operator_case_touch($1,$2,$3,$4,$5,'America/Boise') r", [id, n, at, from, to]).then((x) => x.r);
  assert.deepEqual(await t(1, T("2026-11-10T18:00:00Z")), { ok: true, touch: 1, of: 2 });
  assert.equal((await t(1, T("2026-11-10T18:00:00Z"))).why, "wrong_touch", "two workers cannot both take touch 1");
  assert.equal((await t(2, T("2026-11-11T18:00:00Z"))).why, "too_soon", "one day later is inside the 72-hour gap");
  assert.equal((await t(2, T("2026-11-13T18:00:00Z"), "08:00", "09:00")).why, "outside_hours", "11:00 Boise is outside 08:00 to 09:00");
  assert.deepEqual(await t(2, T("2026-11-13T18:00:00Z")), { ok: true, touch: 2, of: 2 });
  const k = await one(db, "select status, closed_reason, touches from operator_cases where id = $1", [id]);
  assert.deepEqual(k, { status: "done", closed_reason: "max_touches", touches: 2 });
  assert.equal((await t(3, T("2026-11-20T18:00:00Z"))).why, "closed", "there is no third ask");
});

test("a case expires after its window, and the due list closes it instead of returning it", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = (await one(db, "select operator_case_open($1,'review_requests','old','a@example.test','email') id", [S_REVIEW])).id;
  await db.query("update operator_cases set opened_at = now() - interval '15 days' where id = $1", [id]);
  await flag(db, true);
  await db.query("alter table skill_specs disable trigger skill_specs_portal_gate");
  await db.query("update skill_specs set status = 'live' where id = $1", [S_REVIEW]);
  assert.equal((await db.query("select * from operator_case_due($1)", [S_REVIEW])).rows.length, 0);
  assert.deepEqual(await one(db, "select status, closed_reason from operator_cases where id = $1", [id]), { status: "done", closed_reason: "max_days" });
});

test("due returns open cases only for a live spec, and not while the stage job is paused", { skip: !PGlite }, async () => {
  const db = await fresh();
  await db.query("alter table skill_specs disable trigger skill_specs_portal_gate");
  await one(db, "select operator_case_open($1,'review_requests','j1','a@example.test','email') id", [S_REVIEW]);
  assert.equal((await db.query("select * from operator_case_due($1)", [S_REVIEW])).rows.length, 0, "not live yet");
  await db.query("update skill_specs set status = 'live' where id = $1", [S_REVIEW]);
  assert.equal((await db.query("select * from operator_case_due($1)", [S_REVIEW])).rows.length, 1);
  await db.query("insert into agent_pauses (business_id, spec_id, job, reason) values ($1,$2,'ask_review','owner')", [BIZ, S_REVIEW]);
  assert.equal((await db.query("select * from operator_case_due($1)", [S_REVIEW])).rows.length, 0, "the review job is paused");
});

test("what a message may use is stored with the case only while it is open, only from a short list, and never an amount", { skip: !PGlite }, async () => {
  const db = await fresh();
  await flag(db, true);
  const ctx = { first_name: "Pat", email: "pat@example.test", service: "Water heater", when: "2026-11-10", amount: "4200", total: 4200, card_number: "4242", notes: "x".repeat(500) };
  const id = (await one(db, "select operator_case_open($1,'review_requests','q1','pat@example.test','email','quote_sent',$2::jsonb) id", [S_REVIEW, JSON.stringify(ctx)])).id;
  const stored = (await one(db, "select context from operator_cases where id = $1", [id])).context;
  assert.deepEqual(Object.keys(stored).sort(), ["email", "first_name", "service", "when"], "only the short list");
  assert.ok(!JSON.stringify(stored).includes("4200") && !JSON.stringify(stored).includes("4242"));
  const due = (await db.query("select * from operator_case_due($1)", [S_REVIEW])).rows;
  assert.equal(due.length, 0, "not live: nothing due, so nothing leaves the table");
  await db.exec(`update skill_specs set status = 'live' where id = '${S_REVIEW}'`);
  assert.equal((await db.query("select * from operator_case_due($1)", [S_REVIEW])).rows[0].context.first_name, "Pat");
  // Not an object, or too much: the database refuses or empties it.
  for (const bad of ['"a string"', "[1,2]", "null", "5"]) {
    const k = (await one(db, "select operator_case_open($1,'review_requests',$2,null,'email',null,$3::jsonb) id", [S_REVIEW, `bad-${bad.length}-${bad}`, bad])).id;
    assert.deepEqual((await one(db, "select context from operator_cases where id = $1", [k])).context, {});
  }
  // The moment the case closes, the context is gone.
  await one(db, "select operator_case_close($1,'replied',false)", [id]);
  assert.deepEqual((await one(db, "select context from operator_cases where id = $1", [id])).context, {});
  const id2 = (await one(db, "select operator_case_open($1,'review_requests','q2','pat@example.test','email',null,$2::jsonb) id", [S_REVIEW, JSON.stringify({ first_name: "Sam" })])).id;
  await one(db, "select operator_case_signal($1,'q2',false,true,false)", [S_REVIEW]);
  assert.deepEqual((await one(db, "select context from operator_cases where id = $1", [id2])).context, {}, "a STOP empties it too");
});

test("a reply or a STOP closes the case; a reply is ignored if the spec does not list it", { skip: !PGlite }, async () => {
  const db = await fresh();
  const o = async (k) => (await one(db, "select operator_case_open($1,'review_requests',$2,'a@example.test','email') id", [S_REVIEW, k])).id;
  await o("r1"); await o("r2"); await o("r3");
  assert.equal((await one(db, "select operator_case_signal($1,'r1',true,false,false) w", [S_REVIEW])).w, "replied");
  assert.equal((await one(db, "select operator_case_signal($1,'r2',false,true,false) w", [S_REVIEW])).w, "opted_out");
  assert.equal((await one(db, "select status from operator_cases where case_key = 'r2'")).status, "stopped");
  assert.equal((await one(db, "select operator_case_signal($1,'r3',false,false,false) w", [S_REVIEW])).w, null);
  assert.equal((await one(db, "select operator_case_signal($1,'nope',true,false,false) w", [S_REVIEW])).w, null);
});

test("the send guard names the purpose per channel and refuses an unreserved touch, an unlisted channel, or a closed lane", { skip: !PGlite }, async () => {
  const db = await fresh();
  const id = (await one(db, "select operator_case_open($1,'review_requests','j1','a@example.test','email') id", [S_REVIEW])).id;
  const chk = (ch, n, to = "a@example.test") => one(db, "select operator_send_check($1,'j1',$2,$3,$4) r", [S_REVIEW, ch, n, to]).then((x) => x.r);
  assert.equal((await chk("email", 1)).why, "touch_not_reserved");
  await one(db, "select operator_case_touch($1,1,now(),'00:00','24:00','UTC')", [id]);
  assert.equal((await chk("email", 1)).why, "lane_off", "the lane is off");
  await flag(db, true);
  const ok = await chk("email", 1);
  assert.equal(ok.ok, true); assert.equal(ok.purpose, "transactional");
  assert.equal((await chk("email", 1, "someone.else@example.test")).why, "recipient_mismatch", "only the customer this case is about");
  assert.equal((await chk("email", 1, null)).why, "recipient_unknown");
  assert.equal((await chk("email", 1, "  ")).why, "recipient_unknown");
  assert.equal((await chk("sms", 1, "a@example.test")).why, "recipient_mismatch", "a phone is hashed as a phone, not an email");
  const pid = (await one(db, "select operator_case_open($1,'review_requests','p1','+12085550100','phone') id", [S_REVIEW])).id;
  await one(db, "select operator_case_touch($1,1,now(),'00:00','24:00','UTC')", [pid]);
  const sms = (await one(db, "select operator_send_check($1,'p1','sms',1,'+12085550100') r", [S_REVIEW])).r;
  assert.equal(sms.ok, true); assert.equal(sms.purpose, "marketing", "a review text is marketing");
  assert.equal((await chk("voice", 1)).why, "channel_not_allowed");
  assert.equal((await chk("email", 2)).why, "touch_not_reserved");
});

test("go-live: an operator is refused while the lane is off; a plain spec is not affected", { skip: !PGlite }, async () => {
  const db = await fresh();
  await assert.rejects(() => goLive(db, S_REVIEW), /operator lane is not switched on/);
  await goLive(db, S_PLAIN);
  assert.equal((await one(db, "select status from skill_specs where id = $1", [S_PLAIN])).status, "live");
  await flag(db, true);
  await goLive(db, S_REVIEW);
  assert.equal((await one(db, "select status from skill_specs where id = $1", [S_REVIEW])).status, "live", "a customer operator needs no brand-voice approval");
});

test("go-live: a posting operator needs the approved brand voice and every account", { skip: !PGlite }, async () => {
  const db = await fresh();
  await flag(db, true);
  await assert.rejects(() => goLive(db, S_POSTS), /has not approved the brand voice and the accounts/);
  const ask = async (kind, subject = "", voice = null) => (await one(db, "select operator_approval_request($1,$2,$3,$4) id", [S_POSTS, kind, subject, voice && JSON.stringify(voice)])).id;
  const yes = async (id) => assert.equal((await one(db, "select operator_approval_approve($1,'owner') ok", [id])).ok, true);
  await yes(await ask("brand_voice", "", { tone: "plain, warm" }));
  await assert.rejects(() => goLive(db, S_POSTS), /has not approved/, "voice alone is not enough");
  await yes(await ask("account", "facebook"));
  await assert.rejects(() => goLive(db, S_POSTS), /has not approved/, "one of two accounts is not enough");
  await yes(await ask("account", "instagram"));
  await goLive(db, S_POSTS);
  assert.equal((await one(db, "select status from skill_specs where id = $1", [S_POSTS])).status, "live");
});

test("revoking an approval pauses every stage job with reason missing_approval, and posting stops", { skip: !PGlite }, async () => {
  const db = await fresh();
  await flag(db, true);
  const ids = [];
  for (const [k, s] of [["brand_voice", ""], ["account", "facebook"], ["account", "instagram"]]) {
    const id = (await one(db, "select operator_approval_request($1,$2,$3,null) id", [S_POSTS, k, s])).id;
    await one(db, "select operator_approval_approve($1,'owner')", [id]); ids.push(id);
  }
  assert.equal((await one(db, "select operator_approved_current($1) ok", [S_POSTS])).ok, true);
  assert.equal((await one(db, "select operator_post_reserve($1,'p1') r", [S_POSTS])).r.ok, true);
  assert.equal((await one(db, "select operator_approval_revoke($1) ok", [ids[2]])).ok, true);
  assert.equal((await one(db, "select operator_approved_current($1) ok", [S_POSTS])).ok, false);
  const paused = (await db.query("select job from agent_pauses where spec_id = $1 and reason = 'missing_approval' and resumed_at is null order by job", [S_POSTS])).rows.map((r) => r.job);
  assert.deepEqual(paused, ["plan_week", "publish_post"]);
  assert.equal((await one(db, "select operator_post_reserve($1,'p2') r", [S_POSTS])).r.why, "missing_approval", "fails closed even if a job slipped through");
  assert.equal((await one(db, "select operator_approval_revoke($1) ok", [ids[2]])).ok, false, "already revoked");
});

test("a new approval of the same subject replaces the old one", { skip: !PGlite }, async () => {
  const db = await fresh();
  const a = (await one(db, "select operator_approval_request($1,'brand_voice','',$2) id", [S_POSTS, '{"v":1}'])).id;
  await one(db, "select operator_approval_approve($1,'owner')", [a]);
  const b = (await one(db, "select operator_approval_request($1,'brand_voice','',$2) id", [S_POSTS, '{"v":2}'])).id;
  assert.equal((await one(db, "select version from operator_approvals where id = $1", [b])).version, 2);
  await one(db, "select operator_approval_approve($1,'owner')", [b]);
  assert.deepEqual((await db.query("select id, status from operator_approvals order by id")).rows.map((r) => r.status), ["revoked", "approved"]);
  assert.equal((await one(db, "select operator_approval_approve($1,'owner') ok", [b])).ok, false, "an approval is given once");
});

test("posting: lane off refuses, three a week at most, and it reports how many have gone out", { skip: !PGlite }, async () => {
  const db = await fresh();
  for (const [k, s] of [["brand_voice", ""], ["account", "facebook"], ["account", "instagram"]]) {
    const id = (await one(db, "select operator_approval_request($1,$2,$3,null) id", [S_POSTS, k, s])).id;
    await one(db, "select operator_approval_approve($1,'owner')", [id]);
  }
  const post = (k) => one(db, "select operator_post_reserve($1,$2) r", [S_POSTS, k]).then((x) => x.r);
  assert.equal((await post("a")).why, "lane_off");
  await flag(db, true);
  const r1 = await post("a"); assert.deepEqual([r1.ok, r1.published_before, r1.this_week, r1.first_n], [true, 0, 1, 5]);
  assert.equal((await post("b")).published_before, 1);
  assert.equal((await post("c")).ok, true);
  const r4 = await post("d"); assert.equal(r4.ok, false); assert.equal(r4.why, "weekly_cap");
  assert.equal((await post("a")).ok, false, "the same post cannot go out twice");
  await db.query("update operator_cases set last_touch_at = now() - interval '8 days'");
  assert.equal((await post("e")).ok, true, "a new week opens the cap again");
});

test("the manifest carries the operate block for an operator and is unchanged for any other spec", { skip: !PGlite }, async () => {
  const db = await fresh();
  const m = (await one(db, "select portal_compile_manifest($1) m", [S_REVIEW])).m;
  assert.equal(m.lane, "operate"); assert.equal(m.operate.version, OPERATE); assert.equal(m.operate.process, "review_requests");
  const p = (await one(db, "select portal_compile_manifest($1) m", [S_PLAIN])).m;
  assert.ok(!("lane" in p) && !("operate" in p), "a plain teammate's manifest has no operator fields");
  const before = await fresh({ apply: false });
  const old = (await one(before, "select portal_compile_manifest($1) m", [S_PLAIN])).m;
  assert.deepEqual(p, old, "byte-for-byte the manifest the live function writes today");
});

test("every new function and table is closed to anon and signed-in users, open to service_role only", { skip: !PGlite }, async () => {
  const db = await fresh();
  const fns = (await db.query("select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'operator\\_%'")).rows;
  assert.equal(fns.length, 14);
  for (const { sig } of fns) {
    for (const role of ["anon", "authenticated"]) assert.equal((await one(db, "select has_function_privilege($1,$2::regprocedure,'execute') ok", [role, sig])).ok, false, `${role} ${sig}`);
    assert.equal((await one(db, "select has_function_privilege('service_role',$1::regprocedure,'execute') ok", [sig])).ok, true, sig);
  }
  for (const t of ["operator_process_rules", "operator_cases", "operator_approvals"]) {
    assert.equal((await one(db, "select relrowsecurity r from pg_class where relname = $1", [t])).r, true, t);
    for (const role of ["anon", "authenticated"]) assert.equal((await one(db, "select has_table_privilege($1,$2,'select') ok", [role, t])).ok, false, `${role} ${t}`);
  }
});

test("the rollback in the migration's header puts every live shape back", { skip: !PGlite }, async () => {
  const db = await fresh();
  await flag(db, true);
  await one(db, "select operator_case_open($1,'review_requests','j','a@example.test','email')", [S_REVIEW]);
  const id = (await one(db, "select operator_approval_request($1,'brand_voice','',null) id", [S_POSTS])).id;
  await one(db, "select operator_approval_approve($1,'owner')", [id]);
  await one(db, "select operator_approval_revoke($1)", [id]); // leaves 'missing_approval' pauses behind, which the rollback must handle
  const header = migration.split("\n").filter((l) => l.startsWith("--   ")).map((l) => l.slice(5)).join("\n");
  const steps = header.split(/\n(?=drop |create |alter )/).filter((x) => /^(drop|create|alter)/.test(x)).map((x) => x.trim());
  assert.ok(steps.length >= 20, `found ${steps.length} rollback steps`);
  for (const s of steps) await db.exec(s);
  assert.equal((await one(db, "select count(*)::int n from pg_proc where proname like 'operator\\_%'")).n, 0);
  assert.equal((await one(db, "select count(*)::int n from pg_class where relname like 'operator\\_%'")).n, 0);
  assert.equal((await one(db, "select count(*)::int n from primitives where kind = 'operate'")).n, 0);
  assert.equal((await one(db, "select count(*)::int n from forge_settings where key = 'operate_lane'")).n, 0);
  await assert.rejects(() => db.query("insert into primitives (id,kind,label,how,limits,runtime,tier,effort,cost_band,test_strategy) values ('x','operate','x','x','x','shared','build',3,'low','unit')"));
  await assert.rejects(() => db.query("insert into agent_pauses (business_id, reason) values ($1,'missing_approval')", [BIZ]));
  // the live functions are back to the live text, so an operator spec goes live as it did before this migration
  await goLive(db, S_POSTS);
  const m = (await one(db, "select portal_compile_manifest($1) m", [S_REVIEW])).m;
  assert.ok(!("operate" in m));
});
