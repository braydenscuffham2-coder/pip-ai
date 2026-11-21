// Tests for the teammate contract. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/teammate-spec.test.ts
// No network, no database, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { allows, CEILING, checkSpec, jobForMessage, jobsOf, MONEY_RECORDS, NO_DIRECT_BOOKING, notYet, plainWords, runsPerDay } from "./teammate-spec.ts";
import * as contract from "./teammate-spec.ts";

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
  assert.deepEqual(allows(job, { tool: "crm", records: "lead", level: "read", fields: ["name", "status"] }), { ok: true });
  assert.deepEqual(allows(job, { tool: "crm", records: "lead", level: "update", fields: ["status"] }), { ok: true });
  const no = (ask: J, why: string, passed?: string[]) => { const v = allows(job, ask, passed); assert.equal(v.ok, false, JSON.stringify(ask)); assert.equal((v as J).why, why); };
  no({ tool: "crm", records: "lead", level: "delete" }, "never");
  no({ tool: "crm", records: "lead", level: "DELETE" }, "never");
  no({ tool: "crm", records: "lead", level: "update", fields: ["status", "email"] }, "field");
  no({ tool: "crm", records: "lead", level: "update" }, "field");
  no({ tool: "crm", records: "lead", level: "update", fields: [] }, "field");
  no({ tool: "crm", records: "lead", level: "read", fields: ["phone"] }, "field");
  no({ tool: "crm", records: "lead", level: "read" }, "field"); // this job lists what it may see, so a read must say what it reads
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

test("teammates built before the contract keep what pip-turn gave them, and nothing in a tool the owner connected on their own", () => {
  const b = jobsOf(BOARD, BOARD_MANIFEST);
  assert.equal(b.legacy, true); assert.deepEqual(b.errors, []); assert.equal(b.jobs.length, 1);
  const job = b.jobs[0];
  assert.equal(job.id, "conversation");
  for (const ch of ["web_chat", "sms", "voice", "email"]) assert.equal(jobForMessage(b.jobs, ch)?.id, "conversation");
  const yes = (tool: string, records: string, level: string) => assert.deepEqual(allows(job, { tool, records, level }), { ok: true }, `${tool}/${records}/${level}`);
  const no = (tool: string, records: string, level: string) => assert.equal(allows(job, { tool, records, level }).ok, false, `${tool}/${records}/${level}`);
  yes("pip", "lead", "add"); yes("pip", "booking_request", "add"); yes("pip", "owner_alert", "add"); yes("pip", "draft", "add");
  no("pip", "handoff", "add"); // Hallie was not designed with handoff
  // Hallie asks the owner to confirm a booking (request_booking), so she sees busy times and may not add to the calendar herself.
  yes("calendar", "busy_time", "read"); no("calendar", "appointment", "add"); no("calendar", "appointment", "read"); no("calendar", "appointment", "update");
  yes("email", "message", "add"); yes("sheets", "row", "add"); no("sheets", "row", "read");
  no("kit:airtable", "row", "add"); no("kit:airtable", "row", "read"); no("kit:airtable", "row", "update"); no("kit:airtable", "row", "delete"); // extra tools are off by default
  no("kit:stripe", "payment", "add"); no("kit:quickbooks", "invoice", "add");
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

test("there is no wildcard: a permission on one named tool never stretches to another, in any job", () => {
  const forged = spec((j) => { j.tools = [{ tool: "kit:hubspot", records: "contact", can: ["add"] }]; });
  const [job] = checkSpec(forged).jobs;
  assert.deepEqual(allows(job, { tool: "kit:hubspot", records: "contact", level: "add" }), { ok: true });
  assert.equal(allows(job, { tool: "kit:salesforce", records: "contact", level: "add" }).ok, false);
  assert.equal(allows({ ...job, tools: [{ tool: "kit:*", records: "*", can: ["add"], required: false }] }, { tool: "kit:salesforce", records: "contact", level: "add" }).ok, false);
  // Not for the implied job either, even if one were handed "kit:*" by a bug.
  const implied = jobsOf(BOARD, BOARD_MANIFEST).jobs[0];
  assert.equal(allows({ ...implied, tools: [...implied.tools, { tool: "kit:*", records: "contact", can: ["add"], required: false }] }, { tool: "kit:salesforce", records: "contact", level: "add" }).ok, false);
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

// ---------- one test per finding in the review of pull request #29 ----------

test("hold 1: a job that lists fields for a level refuses an ask that names none (read and add, like update)", () => {
  const [job] = checkSpec(spec((j) => (j.tools = [
    { tool: "crm", records: "lead", can: ["read", "add"], fields: { read: ["name", "status"], add: ["name"] } },
    { tool: "crm", records: "note", can: ["read", "add"] },
  ]))).jobs;
  const why = (ask: J) => { const v = allows(job, ask); return v.ok ? "ok" : v.why; };
  for (const level of ["read", "add"]) {
    const ask = { tool: "crm", records: "lead", level };
    assert.equal(why(ask), "field", `${level} with no fields`);
    assert.equal(why({ ...ask, fields: [] }), "field", `${level} with an empty list`);
    assert.equal(why({ ...ask, fields: ["name"] }), "ok", `${level} of a listed field`);
    assert.equal(why({ ...ask, fields: ["name", "email"] }), "field", `${level} of a field outside the list`);
  }
  // A job that lists no fields for a level is not narrowed there, whether or not the ask names fields.
  assert.equal(why({ tool: "crm", records: "note", level: "add" }), "ok");
  assert.equal(why({ tool: "crm", records: "note", level: "read", fields: ["anything"] }), "ok");
});

test("hold 2: a money tool needs the policy for any record at any level, in checkSpec and in allows", () => {
  // The two specs from the review. Both were valid with no policy.
  bad(spec((j) => (j.tools = [{ tool: "kit:stripe", records: "contact", can: ["add", "update"], fields: { update: ["email"] } }])), /money tool/);
  bad(spec((j) => (j.tools = [{ tool: "kit:quickbooks", records: "item", can: ["read", "update"], fields: { update: ["unit_price"] } }])), /money tool/);
  for (const tool of ["kit:stripe", "kit:square", "kit:paypal", "kit:quickbooks", "kit:xero", "kit:shopify", "kit:gusto", "kit:adp", "kit:my_bank", "billing", "payroll", "payments"])
    for (const can of [["read"], ["add"]]) bad(spec((j) => (j.tools = [{ tool, records: "contact", can }])), /money tool/);
  // Naming the policy is not enough: buying does not open a contact, so there is still nothing that can.
  bad(spec((j) => (j.tools = [{ tool: "kit:stripe", records: "contact", can: ["add"], policy: "buying" }])), /money tool/);
  // An order in a money tool can be declared with the policy, and is refused until the policy has passed.
  const [job] = checkSpec(spec((j) => (j.tools = [{ tool: "kit:shopify", records: "order", can: ["add"], policy: "buying" }]))).jobs;
  const order = { tool: "kit:shopify", records: "order", level: "add" };
  assert.equal((allows(job, order) as J).why, "money");
  assert.deepEqual(allows(job, order, ["buying"]), { ok: true });
  // allows() holds the same line for a job that never went through the checker.
  const forged: J = { ...job, tools: [
    { tool: "kit:stripe", records: "contact", can: ["add", "update"], fields: { update: ["email"] }, required: true },
    { tool: "kit:quickbooks", records: "item", can: ["update"], fields: { update: ["unit_price"] }, required: true, policy: "buying" },
  ] };
  for (const passed of [[], ["buying"]]) {
    assert.equal((allows(forged, { tool: "kit:stripe", records: "contact", level: "add" }, passed) as J).why, "money");
    assert.equal((allows(forged, { tool: "kit:stripe", records: "contact", level: "update", fields: ["email"] }, passed) as J).why, "money");
    assert.equal((allows(forged, { tool: "kit:quickbooks", records: "item", level: "update", fields: ["unit_price"] }, passed) as J).why, "money");
  }
  // A tool that is not a money tool is untouched by this rule.
  assert.ok(checkSpec(spec((j) => (j.tools = [{ tool: "kit:hubspot", records: "contact", can: ["add"] }]))).ok);
  bad(spec((j) => (j.tools = [{ tool: "kit:hubspot", records: "contact", can: ["add"], policy: "buying" }])), /policy is only for/);
});

test("hold 2: the contract's money-tool list is the one pip-turn uses", () => {
  const src = readFileSync(new URL("../pip-turn/index.ts", import.meta.url), "utf8");
  const m = src.match(/^const MONEY = \/(.+)\/;$/m);
  assert.ok(m, "pip-turn's MONEY pattern was not found; if it moved, update this test");
  assert.equal((contract as J).MONEY_TOOLS?.source, m[1]);
});

test("hold 3: the implied job for older teammates gets nothing in a tool the owner connected on their own", () => {
  const job = jobsOf(BOARD, BOARD_MANIFEST).jobs[0];
  const ok = (tool: string, records: string, level = "add") => allows(job, { tool, records, level }).ok;
  // "Add one record" used to be given in any connected tool. In a tool billed per use that can cost money or reach
  // people (a text, a phone number), so extra tools are off until a job lists one by name.
  const addOne = ["lead", "contact", "deal", "task", "ticket", "note", "job", "row"];
  for (const kit of ["kit:hubspot", "kit:airtable", "kit:twilio", "kit:slack", "kit:dropbox", "kit:stripe", "kit:square", "kit:paypal", "kit:quickbooks", "kit:xero", "kit:shopify", "kit:gusto", "kit:*"])
    for (const level of ["read", "add", "update", "delete"]) for (const r of [...addOne, "message", "call", "file", "appointment", "item", "review", "post", "busy_time", "count", ...MONEY_RECORDS, "*", "secret"]) assert.equal(ok(kit, r, level), false, `${level} ${r} in ${kit}`);
  assert.ok(!job.tools.some((g) => g.tool.startsWith("kit:") || g.records === "*"), "no extra tool and no wildcard is left in the implied job");
  const w = plainWords(job);
  assert.ok(!w.can.some((s) => /any other tool/.test(s)), w.can.join(" | "));
  assert.ok(w.cannot.includes("Use any tool or any kind of record not listed here."));
  for (const part of Object.values(w)) for (const s of part) assert.ok(s && !/undefined|\[object|\*/.test(s), s);
});

test("hold 4: buying opens orders, and reading prices or invoices, and nothing else", () => {
  const grant = (records: string, can: string[], more: J = {}) => spec((j) => (j.tools = [{ tool: "kit:restaurant_depot", records, can, policy: "buying", ...more }]));
  for (const r of ["payout", "payroll", "refund", "discount", "payment", "estimate"]) for (const can of [["read"], ["add"]]) bad(grant(r, can), /No policy can open/);
  bad(grant("price", ["read", "update"], { fields: { update: ["amount"] } }), /cannot open update/);
  bad(grant("price", ["add"]), /cannot open add/);
  bad(grant("invoice", ["add"]), /cannot open add/);
  assert.ok(checkSpec(grant("order", ["read", "add"])).ok);
  assert.ok(checkSpec(grant("price", ["read"])).ok);
  assert.ok(checkSpec(grant("invoice", ["read"])).ok);
  // allows() refuses the same things on a job that never went through the checker, even after buying has passed.
  const [base] = checkSpec(grant("order", ["add"])).jobs;
  const forged = (records: string): J => ({ ...base, tools: [{ tool: "kit:restaurant_depot", records, can: ["read", "add", "update"], fields: { update: ["amount"] }, required: true, policy: "buying" }] });
  for (const r of ["payout", "payroll", "refund", "discount", "payment", "estimate"]) for (const level of ["read", "add", "update"])
    assert.equal((allows(forged(r), { tool: "kit:restaurant_depot", records: r, level, fields: ["amount"] }, ["buying"]) as J).why, "money", `${level} ${r}`);
  for (const r of ["price", "invoice"]) {
    for (const level of ["add", "update"]) assert.equal((allows(forged(r), { tool: "kit:restaurant_depot", records: r, level, fields: ["amount"] }, ["buying"]) as J).why, "money", `${level} ${r}`);
    assert.deepEqual(allows(forged(r), { tool: "kit:restaurant_depot", records: r, level: "read" }, ["buying"]), { ok: true });
    assert.equal((allows(forged(r), { tool: "kit:restaurant_depot", records: r, level: "read" }) as J).why, "money", `read ${r} before the policy passed`);
  }
});

test("hold 4, tightened: an order update is refused in checkSpec and in allows, even with buying passed", () => {
  // Stage 1 is reorder only: a job may see orders and place a new one. Nothing may change an order yet.
  const grant = (can: string[], more: J = {}) => spec((j) => (j.tools = [{ tool: "kit:restaurant_depot", records: "order", can, policy: "buying", ...more }]));
  bad(grant(["update"], { fields: { update: ["quantity"] } }), /cannot open update on order/);
  bad(grant(["read", "add", "update"], { fields: { update: ["quantity"] } }), /cannot open update on order/);
  assert.ok(checkSpec(grant(["read", "add"])).ok, "seeing orders and placing one stay open to buying");
  // allows() says the same about a job that never went through the checker.
  const [base] = checkSpec(grant(["add"])).jobs;
  const forged: J = { ...base, tools: [{ tool: "kit:restaurant_depot", records: "order", can: ["read", "add", "update"], fields: { update: ["quantity"] }, required: true, policy: "buying" }] };
  const ask = (level: string) => ({ tool: "kit:restaurant_depot", records: "order", level, ...(level === "update" ? { fields: ["quantity"] } : {}) });
  for (const passed of [[], ["buying"]]) assert.equal((allows(forged, ask("update"), passed) as J).why, "money", `update with ${JSON.stringify(passed)} passed`);
  assert.deepEqual(allows(forged, ask("add"), ["buying"]), { ok: true });
  assert.deepEqual(allows(forged, ask("read"), ["buying"]), { ok: true });
  assert.deepEqual((contract as J).POLICY_OPENS, { buying: { order: ["read", "add"], price: ["read"], invoice: ["read"] } }, "the whole table, written out: widening it must fail here");
  // The worked example still stands.
  assert.deepEqual(checkSpec(example("stock-reorder.json")).errors, []);
});

test("smaller a: allows answers no, and does not crash, when the ask is not well formed", () => {
  const [job] = checkSpec(example("lead-chaser.json")).jobs;
  const legacy = jobsOf(BOARD, BOARD_MANIFEST).jobs[0];
  const asks: J[] = [
    { tool: 5, records: "lead", level: "read" }, { tool: null, records: "lead", level: "read" }, { records: "lead", level: "read" }, { tool: {}, records: "lead", level: "add" },
    { tool: ["crm"], records: "lead", level: "read" }, { tool: "crm", records: 7, level: "read" }, { tool: "crm", records: "lead", level: 3 }, { tool: "crm", records: "lead" },
    { tool: "crm", records: "lead", level: "read", fields: "name" }, { tool: "crm", records: "lead", level: "read", fields: [null, {}] }, { tool: "crm", records: "lead", level: "update", fields: [7] },
    null, undefined, "crm", 4, [], {},
  ];
  // The crash from the review: a tool that is not text, asked of the implied job.
  assert.doesNotThrow(() => allows(legacy, { tool: 5, records: "lead", level: "add" } as J));
  for (const j of [legacy, job]) for (const ask of asks) {
    let v: J;
    assert.doesNotThrow(() => { v = allows(j, ask); }, `threw on ${JSON.stringify(ask)}`);
    assert.equal(v.ok, false, JSON.stringify(ask)); assert.equal(typeof v.say, "string");
  }
  // A job or a list of passed policies that is the wrong shape is a no as well.
  const ask = { tool: "crm", records: "lead", level: "read", fields: ["name"] };
  for (const j of [null, undefined, 3, {}, { tools: "all" }, { tools: [null, 3, { tool: "crm", records: "lead" }] }] as J[]) {
    let v: J;
    assert.doesNotThrow(() => { v = allows(j, ask); }, `threw on job ${JSON.stringify(j)}`);
    assert.equal(v.ok, false);
  }
  const [buyer] = checkSpec(example("stock-reorder.json")).jobs;
  for (const passed of ["buying", "not buying at all", { 0: "buying", length: 1 }, null] as J[]) assert.equal(allows(buyer, { tool: "kit:restaurant_depot", records: "order", level: "add" }, passed).ok, false, `passed = ${JSON.stringify(passed)}`);
});

test("smaller b: the same schedule listed twice in one job is an error", () => {
  const daily = { type: "schedule", every: "day", at: "09:00" };
  bad(spec((j) => (j.triggers = [daily, { ...daily }])), /same schedule/);
  bad(spec((j) => (j.triggers = [daily, { at: "09:00", every: "day", type: "schedule" }, { type: "owner", on: "run_now" }])), /same schedule/);
  bad(spec((j) => (j.triggers = [{ type: "schedule", every: "week", on: ["mon", "thu"], at: "07:30" }, { type: "schedule", every: "week", on: ["thu", "mon"], at: "07:30" }])), /same schedule/);
  assert.ok(checkSpec(spec((j) => (j.triggers = [daily, { ...daily, at: "17:00" }]))).ok, "two different schedules are fine");
});

test("what stays shut until its check is built: updates, narrowed reads, calls, and every message but an email reply in a conversation", () => {
  const row = (record: string, level: string, guard?: string) => ({ record, level, guard });
  for (const turn of [true, false]) {
    assert.equal(notYet({}, row("contact", "add"), turn), false);
    assert.equal(notYet({}, row("contact", "read"), turn), false);
    assert.equal(notYet({ fields: { add: ["name"] } }, row("contact", "add"), turn), false, "a field list for add is checked on every call, so it is open");
    assert.equal(notYet({ fields: { update: ["name"] } }, row("contact", "update"), turn), true, "no field map yet");
    assert.equal(notYet({ fields: { read: ["name"] } }, row("contact", "read"), turn), true, "nothing can narrow an answer yet");
    for (const purpose of ["reply", "transactional", "marketing", undefined]) for (const guard of ["email", undefined]) {
      assert.equal(notYet({ purpose }, row("call", "add", guard), turn), true, "a call");
      assert.equal(notYet({ purpose }, row("message", "read", guard), turn), true, "reading messages");
      // The one send that is open: a reply, by the reviewed email tool, while answering a customer.
      assert.equal(notYet({ purpose }, row("message", "add", guard), turn), !(turn && purpose === "reply" && guard === "email"), `message, ${purpose}, ${guard}, turn ${turn}`);
    }
  }
});

test("asking the owner first means no direct add: an older teammate with request_booking gets busy times only", () => {
  const board = (uses: J) => jobsOf(BOARD, { uses }).jobs[0];
  const classic = (tools: J) => jobsOf({ ...CLASSIC, agent: { ...CLASSIC.agent, tools } }).jobs[0];
  const add = (job: J) => allows(job, { tool: "calendar", records: "appointment", level: "add" }).ok;
  const see = (job: J) => allows(job, { tool: "calendar", records: "busy_time", level: "read" }).ok;
  for (const make of [board, classic]) {
    const asks = make(["calendar", "request_booking", "capture_lead", "email"]), holds = make(["calendar", "capture_lead", "email"]);
    assert.equal(add(asks), false, "with request_booking: no appointment add");
    assert.equal(see(asks), true, "busy times are still read");
    assert.equal(allows(asks, { tool: "pip", records: "booking_request", level: "add" }).ok, true, "and the booking still goes to the owner");
    assert.ok(!asks.tools.some((g: J) => g.records === "appointment"), "the permission is not on the job at all");
    assert.equal(add(holds), true, "without request_booking: as before");
    assert.equal(see(holds), true);
    // Nothing else moves with it.
    const rest = (job: J) => job.tools.filter((g: J) => !(g.tool === "calendar" && g.records === "appointment") && !(g.tool === "pip" && g.records === "booking_request"));
    assert.deepEqual(rest(asks), rest(holds));
    // No calendar at all stays no calendar at all.
    assert.equal(see(make(["request_booking"])), false); assert.equal(add(make(["request_booking"])), false);
    // Only the exact name counts, the same test that decides whether request_booking itself is offered.
    for (const near of ["Request_Booking", "request_booking ", "request-booking", ["request_booking"], null]) {
      const job = make(["calendar", near]);
      assert.equal(add(job), true, JSON.stringify(near));
      assert.equal(allows(job, { tool: "pip", records: "booking_request", level: "add" }).ok, false, `${JSON.stringify(near)} does not give request_booking either`);
    }
  }
  // A teammate with a declared job list is not touched by this: what its job lists is what it gets.
  const declared = (tools: J) => checkSpec(spec((j) => { j.tools = tools; })).jobs[0];
  assert.equal(add(declared([{ tool: "pip", records: "booking_request", can: ["add"] }, { tool: "calendar", records: "appointment", can: ["add"] }])), true);
  assert.equal(add(declared([{ tool: "pip", records: "booking_request", can: ["add"] }, { tool: "calendar", records: "busy_time", can: ["read"] }])), false);
});

test("plain words: a job that sends bookings to the owner and cannot add to the calendar says so under cannot", () => {
  const words = (uses: string[]) => plainWords(jobsOf(BOARD, { uses }).jobs[0]);
  const asks = words(["calendar", "request_booking"]);
  assert.ok(!asks.can.some((s) => /appointment/i.test(s)), asks.can.join(" | "));
  assert.ok(asks.can.includes("See busy times in your calendar."));
  assert.ok(asks.can.includes("Ask you to confirm a booking. It does not confirm one itself."));
  assert.ok(asks.cannot.includes(NO_DIRECT_BOOKING));
  const holds = words(["calendar"]);
  assert.ok(holds.can.includes("Add new appointments in your calendar."));
  assert.ok(!holds.cannot.includes(NO_DIRECT_BOOKING));
  // A declared job that lists both: it can add, so the line must not appear.
  const both = plainWords(checkSpec(spec((j) => { j.tools = [{ tool: "pip", records: "booking_request", can: ["add"] }, { tool: "calendar", records: "appointment", can: ["add"] }]; })).jobs[0]);
  assert.ok(both.can.includes("Add new appointments in your calendar.") && !both.cannot.includes(NO_DIRECT_BOOKING));
  // No sentence under "can" and "cannot" may contradict: never both "add appointments" and "cannot add an appointment".
  for (const w of [asks, holds, both]) assert.ok(!(w.can.some((s) => /Add new appointments in your calendar/.test(s)) && w.cannot.includes(NO_DIRECT_BOOKING)));
});
