// Tests for the teammate contract. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/teammate-spec.test.ts
// No network, no database, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { allows, CEILING, checkSpec, jobForMessage, jobsOf, plainWords, runsPerDay } from "./teammate-spec.ts";

const DIR = new URL("../../../docs/contracts/examples/", import.meta.url);
const example = (name: string) => JSON.parse(readFileSync(new URL(name, DIR), "utf8"));
// deno-lint-ignore no-explicit-any
type J = any;
/** One valid job, changed by `edit`, wrapped as a spec. */
function spec(edit: (j: J) => void = () => {}, more: J[] = []) {
  const j: J = {
    id: "follow_up", name: "Follow-up", does: "Keeps the customer list up to date after a visit.",
    instructions: "Read the contact, then set the status field. Nothing else.",
    triggers: [{ type: "schedule", every: "day", at: "09:00" }],
    tools: [{ tool: "crm", records: "contact", can: ["read", "update"], fields: { update: ["status"] } }],
  };
  edit(j);
  return { contract: "teammate/1", jobs: [j, ...more] };
}
const bad = (s: J, re: RegExp) => { const c = checkSpec(s); assert.equal(c.ok, false, "expected the spec to be refused"); assert.ok(c.errors.some((e) => re.test(e)), `no error matched ${re}: ${c.errors.join(" | ")}`); assert.equal(c.jobs.length, 0, "a refused spec returns no jobs"); };

test("every example in docs/contracts/examples is valid", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 4);
  for (const f of files) { const c = checkSpec(example(f)); assert.deepEqual(c.errors, [], f); assert.ok(c.jobs.length > 0, f); }
});

test("defaults are filled in", () => {
  const [j] = checkSpec(spec()).jobs;
  assert.deepEqual(j.limits.per_run, { steps: 8, actions: 4 });
  assert.deepEqual(j.limits.per_day, { runs: 48, actions: 60 });
  assert.deepEqual(j.pause, { after_failures: 3, on_limit: "wait", when: [] });
  assert.equal(j.tools[0].required, true);
});

test("delete can never be declared, and neither can any made-up level", () => {
  for (const lvl of ["delete", "remove", "send", "pay", "admin", "*"]) bad(spec((j) => j.tools[0].can.push(lvl)), /never allowed/);
});

test("update needs an exact field list", () => {
  bad(spec((j) => delete j.tools[0].fields), /update needs fields\.update/);
  bad(spec((j) => (j.tools[0].fields.update = [])), /fields\.update/);
  bad(spec((j) => (j.tools[0].fields.update = ["*"])), /fields\.update/);
});

test("wildcards and unknown kinds of record are refused", () => {
  bad(spec((j) => (j.tools[0].records = "*")), /records must be one kind/);
  bad(spec((j) => (j.tools[0].records = "secret")), /records must be one kind/);
  bad(spec((j) => (j.tools[0].tool = "kit:*")), /tool must name/);
  bad(spec((j) => j.tools.push({ tool: "pip", records: "constructor", can: ["add"] })), /Pip's own actions are/);
  bad(spec((j) => j.tools.push({ tool: "pip", records: "lead", can: ["read"] })), /add only/);
  assert.ok(plainWords(checkSpec(spec((j) => (j.tools[0].tool = "constructor"))).jobs[0]).can.every((s) => !/function|native/.test(s)));
});

test("money records need a policy, and read-only records cannot be changed", () => {
  bad(spec((j) => j.tools.push({ tool: "accounting", records: "payment", can: ["add"] })), /money record/);
  bad(spec((j) => j.tools.push({ tool: "accounting", records: "invoice", can: ["read"] })), /money record/);
  bad(spec((j) => j.tools.push({ tool: "calendar", records: "busy_time", can: ["add"] })), /can only be read/);
  assert.ok(checkSpec(spec((j) => j.tools.push({ tool: "accounting", records: "invoice", can: ["read"], policy: "buying" }))).ok);
});

test("sending needs a purpose; calls are never a 'reply'", () => {
  bad(spec((j) => j.tools.push({ tool: "email", records: "message", can: ["add"] })), /needs "purpose"/);
  bad(spec((j) => j.tools.push({ tool: "voice", records: "call", can: ["add"], purpose: "reply" })), /never a reply/);
  const [j] = checkSpec(spec((j) => j.tools.push({ tool: "email", records: "message", can: ["add"], purpose: "marketing" }))).jobs;
  assert.deepEqual(j.limits.each, [{ tool: "email", records: "message", per_contact_per_day: 3 }], "a per-person daily limit is added even when the spec has none");
});

test("limits above the ceiling are refused, not trimmed", () => {
  bad(spec((j) => (j.limits = { per_run: { steps: CEILING.per_run.steps + 1 } })), /per_run\.steps/);
  bad(spec((j) => (j.limits = { per_run: { actions: 0 } })), /per_run\.actions/);
  bad(spec((j) => (j.limits = { per_day: { runs: 100000 } })), /per_day\.runs/);
  bad(spec((j) => (j.limits = { per_run: { steps: 2, actions: 3 } })), /cannot be more than steps/);
  bad(spec((j) => (j.limits = { each: [{ tool: "crm", records: "deal", per_day: 5 }] })), /must match a tool/);
  bad(spec((j) => (j.pause = { after_failures: 4 })), /after_failures/);
});

test("schedules: nothing faster than 15 minutes, and the day's runs must fit the limit", () => {
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "minutes", interval: 5 }])), /interval must be 15 to 720/);
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "minutes", interval: 15 }])), /starts up to 97 runs a day/);
  assert.ok(checkSpec(spec((j) => { j.triggers = [{ type: "schedule", every: "minutes", interval: 15 }]; j.limits = { per_day: { runs: 100 } }; })).ok);
  assert.equal(runsPerDay({ type: "schedule", every: "hours", interval: 4, between: ["08:00", "18:00"] }), 3);
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "day" }])), /at must be a time/);
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "week", at: "07:30", on: ["monday"] }])), /days of the week/);
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "month", at: "07:30", on: [31] }])), /days of the month/);
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "day", at: "25:00" }])), /at must be a time/);
  bad(spec((j) => (j.triggers = [{ type: "schedule", cron: "* * * * *" }])), /not part of the contract/);
});

test("a job started by a record must be allowed to read that record", () => {
  bad(spec((j) => (j.triggers = [{ type: "event", from: "crm", event: "record_added", records: "deal" }])), /needs read on crm\/deal/);
  assert.ok(checkSpec(spec((j) => (j.triggers = [{ type: "event", from: "crm", event: "record_changed", records: "contact", if: { field: "status", is: "won" } }]))).ok);
  bad(spec((j) => (j.triggers = [{ type: "event", from: "crm", event: "missed_call", records: "contact" }])), /only send record_added or record_changed/);
  bad(spec((j) => (j.triggers = [{ type: "event", from: "box", event: "count_changed", if: { field: "count", over: 40, under: 2 } }])), /exactly one of/);
});

test("one job answers each channel", () => {
  const second = { id: "other", name: "Other", does: "Also answers customers on chat.", instructions: "Answer the customer briefly and politely.", triggers: [{ type: "message", channels: ["web_chat"] }] };
  bad(spec((j) => (j.triggers = [{ type: "message", channels: ["web_chat", "sms"] }]), [second]), /answer web_chat/);
  const { jobs } = checkSpec(example("front-desk.json"));
  assert.equal(jobForMessage(jobs, "sms")?.id, "front_desk");
  assert.equal(jobForMessage(jobs, "email"), null);
  bad(spec((j) => { j.triggers = [{ type: "message", channels: ["web_chat"] }]; j.task = { max_runs: 5, max_days: 2 }; }), /finishes in one run/);
});

test("unknown keys, duplicate ids and wrong shapes are refused", () => {
  bad(spec((j) => (j.approve_everything = true)), /not part of the contract/);
  bad(spec((j) => (j.tools[0].delete = true)), /not part of the contract/);
  bad(spec(() => {}, [spec().jobs[0]]), /Two jobs are called/);
  bad({ contract: "teammate/2", jobs: spec().jobs }, /contract must be/);
  bad({ contract: "teammate/1", jobs: [] }, /1 to 12 jobs/);
  bad(spec((j) => (j.id = "Bad Id")), /id must be/);
  bad(spec((j) => (j.instructions = "")), /instructions/);
  bad(null, /must be an object/);
  bad(spec((j) => (j.tools = "all")), /tools must be a list/);
});

test("allows: the permission check", () => {
  const [job] = checkSpec(example("lead-chaser.json")).jobs;
  assert.deepEqual(allows(job, { tool: "crm", records: "lead", level: "read" }), { ok: true });
  assert.deepEqual(allows(job, { tool: "crm", records: "lead", level: "update", fields: ["status"] }), { ok: true });
  const no = (ask: J, why: string, passed?: string[]) => { const v = allows(job, ask, passed); assert.equal(v.ok, false, JSON.stringify(ask)); assert.equal((v as J).why, why); };
  no({ tool: "crm", records: "lead", level: "delete" }, "never");
  no({ tool: "crm", records: "lead", level: "DELETE" }, "never");
  no({ tool: "crm", records: "lead", level: "update", fields: ["status", "email"] }, "field");
  no({ tool: "crm", records: "lead", level: "update" }, "field");
  no({ tool: "crm", records: "lead", level: "update", fields: [] }, "field");
  no({ tool: "crm", records: "lead", level: "read", fields: ["phone"] }, "field");
  no({ tool: "crm", records: "lead", level: "add" }, "not_granted");
  no({ tool: "crm", records: "contact", level: "read" }, "not_granted");
  no({ tool: "kit:hubspot", records: "lead", level: "read" }, "not_granted");
  no({ tool: "crm", records: "note", level: "read" }, "not_granted");
  assert.deepEqual(allows(job, { tool: "crm", records: "note", level: "add" }), { ok: true });
});

test("allows: money is refused unless the policy check passed for this action", () => {
  const [job] = checkSpec(example("stock-reorder.json")).jobs;
  const ask = { tool: "kit:restaurant_depot", records: "order", level: "add" };
  assert.equal((allows(job, ask) as J).why, "money");
  assert.equal((allows(job, ask, ["something_else"]) as J).why, "money");
  assert.deepEqual(allows(job, ask, ["buying"]), { ok: true });
  assert.equal((allows(job, { ...ask, level: "delete" }, ["buying"]) as J).why, "never");
  assert.equal((allows(job, { tool: "kit:restaurant_depot", records: "payment", level: "add" }, ["buying"]) as J).why, "not_granted");
});

// The two shapes stored today, cut down to the parts the runtime reads. Shapes copied from the live database on 2026-11-17.
const BOARD = { board: { seats: { gate: { system_prompt: "You are Hallie." } } } };
const BOARD_MANIFEST = { uses: ["ai_disclosure", "calendar", "capture_lead", "consent_ledger", "data_sink", "draft_for_approval", "email", "embed_search", "forms", "inbound_message", "knowledge", "notify_owner", "request_booking", "web_chat"] };
const CLASSIC = { name: "Monday Catch-Up", goal: "Brief the team", agent: { persona: "You are Paige.", tools: ["pii_scrub", "weekly_report", "owner_alerts"] }, triggers: ["schedule"], channels: ["web_chat"] };

test("teammates built before the contract keep exactly what pip-turn gives them today", () => {
  const b = jobsOf(BOARD, BOARD_MANIFEST);
  assert.equal(b.legacy, true); assert.deepEqual(b.errors, []); assert.equal(b.jobs.length, 1);
  const job = b.jobs[0];
  assert.equal(job.id, "conversation");
  for (const ch of ["web_chat", "sms", "voice", "email"]) assert.equal(jobForMessage(b.jobs, ch)?.id, "conversation");
  const yes = (tool: string, records: string, level: string) => assert.deepEqual(allows(job, { tool, records, level }), { ok: true }, `${tool}/${records}/${level}`);
  const no = (tool: string, records: string, level: string) => assert.equal(allows(job, { tool, records, level }).ok, false, `${tool}/${records}/${level}`);
  yes("pip", "lead", "add"); yes("pip", "booking_request", "add"); yes("pip", "owner_alert", "add"); yes("pip", "draft", "add");
  no("pip", "handoff", "add"); // Hallie was not designed with handoff
  yes("calendar", "busy_time", "read"); yes("calendar", "appointment", "add"); no("calendar", "appointment", "read"); no("calendar", "appointment", "update");
  yes("email", "message", "add"); yes("sheets", "row", "add"); no("sheets", "row", "read");
  yes("kit:airtable", "row", "add"); no("kit:airtable", "row", "read"); no("kit:airtable", "row", "update"); no("kit:airtable", "row", "delete");
  no("kit:stripe", "payment", "add"); no("kit:quickbooks", "invoice", "add"); // money stays shut even through the wildcard
  assert.deepEqual(job.limits, { per_run: { steps: 6, actions: 6 }, per_day: null, each: [] });

  const c = jobsOf(CLASSIC);
  assert.equal(c.legacy, true); assert.equal(c.jobs.length, 1);
  assert.equal(allows(c.jobs[0], { tool: "calendar", records: "busy_time", level: "read" }).ok, false);
  assert.match(c.notes[0], /schedule/);
  assert.deepEqual(jobsOf({}).jobs, []);
  assert.deepEqual(jobsOf({ board: { seats: {} } }).jobs, []);
});

test("a spec that names the contract but is invalid has no jobs: it does not fall back to the old behaviour", () => {
  const r = jobsOf({ ...BOARD, contract: "teammate/1", jobs: [{ id: "x" }] }, BOARD_MANIFEST);
  assert.equal(r.legacy, false); assert.equal(r.jobs.length, 0); assert.ok(r.errors.length > 0);
  const half = jobsOf({ ...BOARD, jobs: spec().jobs }, BOARD_MANIFEST);
  assert.equal(half.jobs.length, 0); assert.match(half.errors.join(" "), /contract must be/);
});

test("the wildcard works only inside the implied job", () => {
  const forged = spec((j) => { j.tools = [{ tool: "kit:hubspot", records: "contact", can: ["add"] }]; });
  const [job] = checkSpec(forged).jobs;
  assert.equal(allows(job, { tool: "kit:salesforce", records: "contact", level: "add" }).ok, false);
  assert.equal(allows({ ...job, tools: [{ tool: "kit:*", records: "*", can: ["add"], required: false }] }, { tool: "kit:salesforce", records: "contact", level: "add" }).ok, false);
  bad({ contract: "teammate/1", jobs: [{ ...spec().jobs[0], legacy: true }] }, /not part of the contract/);
});

test("plain words say what the job can and cannot do", () => {
  const { jobs } = checkSpec(example("lead-chaser.json"));
  const w = plainWords(jobs[0], { crm: "HubSpot" });
  assert.deepEqual(w.starts, ["When a new lead is added in HubSpot and its source is website."]);
  assert.ok(w.can.includes("Change only these details of leads in HubSpot: status."));
  assert.ok(w.can.includes("See these details of leads in HubSpot: name, email, source, status and created at."));
  assert.ok(w.cannot.includes("Delete anything, anywhere."));
  assert.ok(w.cannot.includes("Change anything else about leads in HubSpot."));
  assert.ok(w.cannot.includes("Look at notes already in HubSpot."));
  assert.ok(w.cannot.includes("Move money, place orders, or change prices."));
  assert.ok(w.limits.includes("Messages in your email: at most 1 each run, 40 a day and 1 a day to any one person."));
  assert.ok(w.pauses.some((p) => /after 3 failed tries in a row/.test(p)));
  const fd = plainWords(checkSpec(example("front-desk.json")).jobs[0]);
  assert.deepEqual(fd.starts, ["When a customer reaches out by website chat, text and the phone."]);
  assert.ok(fd.limits.some((l) => /still answers customers/.test(l)));
  assert.ok(!fd.pauses.some((p) => /failed/.test(p)), "a job that answers customers is never paused by failed runs");
  const fu = plainWords(checkSpec(example("front-desk.json")).jobs[1]);
  assert.deepEqual(fu.starts, ["When you approve or decline a booking request."]);
  assert.ok(fu.can.includes("Send texts, only about something that customer already has with you."));
  const sched = plainWords(checkSpec(example("stock-reorder.json")).jobs[0]);
  assert.deepEqual(sched.starts, ["Every 4 hours, between 8:00 am and 6:00 pm."]);
  assert.ok(sched.can.includes("Add new orders in restaurant_depot, only inside the buying rules you set."));
  assert.ok(!sched.cannot.includes("Move money, place orders, or change prices."));
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) for (const j of checkSpec(example(f)).jobs) for (const part of Object.values(plainWords(j))) for (const s of part) assert.ok(s && !/undefined|\[object/.test(s), `${f}: "${s}"`);
});

test("hostile input cannot crash the checker or slip through", () => {
  const nasty: J[] = [undefined, 0, "", [], [[]], { jobs: "x" }, { contract: "teammate/1", jobs: [null, 1, "a", []] }, { contract: "teammate/1", jobs: [{ id: {}, tools: [null, { can: "read" }], triggers: [{}, null, { type: "schedule", on: {} }, { type: "event", if: [] }], limits: [], pause: 3, task: "long" }] },
    { contract: "teammate/1", jobs: [{ ...spec().jobs[0], tools: [{ tool: "__proto__", records: "constructor", can: ["read"] }] }] },
    { contract: "teammate/1", jobs: [{ ...spec().jobs[0], limits: { per_run: { steps: 1e9, actions: -1 }, per_day: { runs: 1.5 }, each: [null, {}] } }] }];
  for (const n of nasty) { const c = checkSpec(n); assert.equal(c.ok, false); assert.equal(c.jobs.length, 0); }
  const [job] = checkSpec(spec()).jobs;
  for (const ask of [{ tool: "constructor", records: "toString", level: "read" }, { tool: "crm", records: "contact", level: "__proto__" }, { tool: "crm", records: "contact", level: "update", fields: ["__proto__"] }]) assert.equal(allows(job, ask).ok, false);
});
