// An operator's stage job through POST /job in the real pip-turn, with the database, the model and Composio faked.
// No network, no keys, no real message: the only "customer" is a test address and Composio is a stand-in.
//   node --experimental-strip-types --test supabase/functions/pip-turn/operate-job.test.mjs
// The cadence, purposes and consent rules themselves are tested against a real Postgres in tests/db/operate.test.mjs;
// here the database functions are stubs, and what is tested is the ORDER and the fail-closed behaviour of the send.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, baseTables, use, says, acts, IDS } from "../../../tests/pip-turn/harness.mjs";
import { compileOperator } from "../_shared/operate.ts";
import { CONTRACT } from "../_shared/teammate-spec.ts";

const RUN = "55555555-5555-4555-8555-555555555555";
const CASE = "c:ask_review:7", TO = "customer@example.test";
const ok = (data = {}) => ({ status: 200, json: { successful: true, data } });

function tables({ job = "ask_review", input = { operator: { case_key: CASE, touch: 1 } }, process = "review_requests" } = {}) {
  const t = baseTables();
  const c = compileOperator(process, { business: "TEST Fork", teammate: "Hallie", channels: ["email"] });
  t.skill_specs[0].spec = { ...t.skill_specs[0].spec, contract: CONTRACT, jobs: c.jobs, operate: c.operate };
  const gm = t.tool_catalog.find((r) => r.slug === "GMAIL_SEND_EMAIL"); gm.record = "message"; gm.level = "add";
  t.operator_cases = [{ id: "case-1", spec_id: IDS.spec, case_key: CASE }];
  t.job_runs = [{ id: RUN, spec_id: IDS.spec, business_id: IDS.business, job_id: job, trigger: "case", status: "queued", attempts: 0, input, state: null }];
  t.job_actions = [];
  return t;
}
async function bootJob(opts, stubs = {}) {
  let made, world;
  const rpc = {
    job_claim: ({ p_run }) => { const r = world.tables.job_runs.find((x) => x.id === p_run && x.status === "queued"); if (!r) return null; r.status = "running"; r.attempts++; return structuredClone(r); },
    job_finish: ({ p_run, p_outcome, p_summary, p_error }) => { const r = world.tables.job_runs.find((x) => x.id === p_run && x.status === "running"); if (!r) return null; r.status = { done: "done", continue: "queued", retry: "queued", dead_end: "dead_end", blocked: "failed" }[p_outcome]; r.summary = p_summary; r.error = p_error; return r.status; },
    job_action_begin: ({ p_run, p_seq, p_tool }) => { const a = world.tables.job_actions.find((x) => x.run_id === p_run && x.seq === p_seq); if (a) return { status: a.status === "started" ? "unknown" : a.status, result: a.result, tool: a.tool }; world.tables.job_actions.push({ run_id: p_run, seq: p_seq, tool: p_tool, status: "started" }); return { status: "fresh" }; },
    job_action_end: ({ p_run, p_seq, p_status, p_result }) => { const a = world.tables.job_actions.find((x) => x.run_id === p_run && x.seq === p_seq); if (a?.status === "started") { a.status = p_status; a.result = p_result; } return null; },
    operator_case_touch: () => ({ ok: true, touch: 1, of: 2 }),
    operator_send_check: () => ({ ok: true, purpose: "transactional" }),
    ...stubs,
  };
  const wrap = (db) => ({
    from: (table) => { const q = db.from(table); q.neq = (c, v) => { q.filters.push((r) => r[c] !== v); return q; }; q.in = (c, vs) => { q.filters.push((r) => vs.includes(r[c])); return q; }; return q; },
    rpc: async (name, args) => { const r = await db.rpc(name, args); return Object.hasOwn(rpc, name) ? { data: rpc[name](args), error: null } : r; },
  });
  Object.defineProperty(globalThis, "__pipTurnMock", { configurable: true, set: (v) => { made = v; }, get: () => ({ createClient: (...a) => wrap(made.createClient(...a)) }) });
  let t;
  try { t = await boot(opts); } finally { delete globalThis.__pipTurnMock; }
  world = t.world;
  return { ...t, job: () => t.call("/job", { run: RUN }), run: () => world.tables.job_runs[0], offered: () => (world.model.calls[0]?.tools ?? []).map((x) => x.name) };
}
const SEND = () => use("GMAIL_SEND_EMAIL", { recipient_email: TO, subject: "Thanks", body: "Thanks for choosing TEST Fork. Would you leave us a review?" });
const run = async (opts = {}, stubs = {}, model) => {
  const t = await bootJob({ tables: tables(opts), composio: () => ok({ id: "m1" }), rpc: stubs.gate ? { portal_email_gate: stubs.gate } : undefined, model: model ?? [acts(SEND()), says("Sent.")] }, stubs.db);
  const r = await t.job(); t.restore();
  return { t, r };
};
const gmail = (t) => t.executed().filter((c) => /GMAIL_SEND_EMAIL/.test(c.path));

test("a case's run sends one email to the case's customer, with the AI line and the opt-out line, and records it", async () => {
  const { t, r } = await run();
  assert.equal(r.json.outcome, "done");
  const sent = gmail(t);
  assert.equal(sent.length, 1);
  const args = sent[0].body.arguments;
  assert.equal(args.recipient_email, TO);
  assert.match(args.body, /an AI assistant for/);
  assert.match(args.body, /Reply STOP to opt out/);
  assert.equal(t.rpcs("operator_case_touch").length, 1, "the touch was reserved");
  assert.deepEqual(t.rpcs("operator_case_touch")[0].args, { p_case: "case-1", p_touch: 1, p_from: "08:00", p_to: "20:00", p_tz: t.rpcs("operator_case_touch")[0].args.p_tz });
  assert.equal(t.rpcs("operator_send_check")[0].args.p_recipient, TO, "the database is told who it is going to");
  assert.equal(t.rpcs("portal_outbound_sent").length, 1);
  assert.equal(t.rpcs("portal_outbound_sent")[0].args.p_contact, TO);
  assert.equal(t.rpcs("portal_outbound_sent")[0].args.p_ai_disclosed, true);
});
test("the touch is reserved BEFORE the email goes out", async () => {
  const { t } = await run();
  const order = t.world.writes.filter((w) => (w.op === "rpc" && ["operator_case_touch", "operator_send_check", "portal_email_gate", "portal_outbound_sent"].includes(w.name))).map((w) => w.name);
  assert.deepEqual(order, ["operator_case_touch", "operator_send_check", "portal_email_gate", "portal_outbound_sent"]);
  assert.equal(gmail(t).length, 1);
});
for (const [name, stubs, why] of [
  ["the cadence says it is too soon", { db: { operator_case_touch: () => ({ ok: false, why: "too_soon" }) } }, /too soon/],
  ["it is outside calling hours", { db: { operator_case_touch: () => ({ ok: false, why: "outside_hours" }) } }, /outside calling hours/],
  ["the case is already at its limit", { db: { operator_case_touch: () => ({ ok: false, why: "max_touches" }) } }, /limit/],
  ["the address is not the customer this case is about", { db: { operator_send_check: () => ({ ok: false, why: "recipient_mismatch" }) } }, /not the customer/],
  ["the lane is switched off", { db: { operator_send_check: () => ({ ok: false, why: "lane_off" }) } }, /switched off/],
  ["the customer opted out of email", { gate: () => ({ allowed: false, reason: "opted_out" }) }, /asked not to be emailed/],
  ["permission cannot be confirmed", { gate: () => ({ allowed: false }) }, /could not be confirmed/],
  ["the database cannot be reached", { db: { operator_case_touch: () => { throw new Error("db down"); } } }, /could not be confirmed/],
]) test(`nothing is sent when ${name}`, async () => {
  const { t } = await run({}, stubs);
  assert.equal(gmail(t).length, 0, "no email reached Composio");
  assert.equal(t.rpcs("portal_outbound_sent").length, 0);
  assert.match(t.toolResults().map((x) => x.content).join(" "), why);
});
test("a run started without a case (a manual run) is not offered the send at all", async () => {
  const { t } = await run({ input: {} }, {}, [says("Nothing to do.")]);
  assert.equal(t.offered().includes("GMAIL_SEND_EMAIL"), false);
  assert.equal(gmail(t).length, 0);
});
test("a run whose input names a bad case shape is not offered the send either", async () => {
  for (const input of [{ operator: { case_key: "", touch: 1 } }, { operator: { case_key: CASE, touch: 9 } }, { operator: "x" }]) {
    const { t } = await run({ input }, {}, [says("No.")]);
    assert.equal(t.offered().includes("GMAIL_SEND_EMAIL"), false, JSON.stringify(input));
  }
});
test("a case's run is offered the send, and only the send it is meant to have", async () => {
  const { t } = await run();
  assert.ok(t.offered().includes("GMAIL_SEND_EMAIL"));
});
test("the posting operator's jobs are never case-driven, so they are never offered a customer email", async () => {
  const { t } = await run({ process: "content_social", job: "plan_week" }, {}, [says("Planned.")]);
  assert.equal(t.offered().includes("GMAIL_SEND_EMAIL"), false);
});
test("the same case cannot be sent twice on a retry: an action that already finished is not run again", async () => {
  const t = await bootJob({ tables: tables(), composio: () => ok({ id: "m1" }), model: [acts(SEND()), says("Sent.")] });
  await t.job(); t.restore();
  assert.equal(gmail(t).length, 1);
  assert.equal(t.world.tables.job_actions.filter((a) => a.status === "done").length, 1);
});
