// POST /job in the real pip-turn, with the database, the model and Composio faked. No network, no keys.
//   node --test supabase/functions/pip-turn/job.test.mjs
// It uses lane 09's harness (tests/pip-turn/harness.mjs) unchanged. That harness fakes the database for POST /turn;
// POST /job also needs the job_* database functions and two more query filters, so the fake it makes is wrapped here.
// The real rules for those functions are tested against a real Postgres in ../pip-jobs/rules.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, baseTables, use, says, acts, IDS } from "../../../tests/pip-turn/harness.mjs";

const RUN = "44444444-4444-4444-8444-444444444444";
const ok = (data = {}) => ({ status: 200, json: { successful: true, data } });
const fresh = () => new Date().toISOString();

/** A TEST business whose teammate has one job: add a row to the sheet and hold a calendar slot, each with a field list. */
function tables(editJob = () => {}) {
  const t = baseTables();
  const job = {
    id: "daily_line", name: "Daily line", does: "Adds one line to the sheet and holds a slot on the calendar.",
    instructions: "Add one row to the sheet with the date and a note, then hold the slot on the calendar. Then stop.",
    triggers: [{ type: "owner", on: "run_now" }],
    tools: [
      { tool: "sheets", records: "row", can: ["add"], fields: { add: ["date", "note"] } },
      { tool: "calendar", records: "appointment", can: ["add"], fields: { add: ["summary", "start_datetime"] }, required: false },
    ],
  };
  editJob(job);
  t.skill_specs[0].spec = { ...t.skill_specs[0].spec, contract: "teammate/1", jobs: [job] };
  t.connection_catalog = t.connection_catalog.map((c) => (c.slot === "sheet" ? { ...c, blocks: ["data_sink", "sheets"] } : c));
  t.business_connections.push({ id: "c-sheet", business_id: IDS.business, slot: "sheet", status: "active", choice: "googlesheets", connected_account_id: "ca_sheet", detail: { spreadsheet_id: "sheet_1" } });
  t.tool_catalog.find((r) => r.slug === "GOOGLECALENDAR_EVENTS_LIST").record = "busy_time";
  t.tool_catalog.find((r) => r.slug === "GOOGLECALENDAR_EVENTS_LIST").level = "read";
  t.tool_catalog.find((r) => r.slug === "GMAIL_SEND_EMAIL").record = "message";
  t.tool_catalog.find((r) => r.slug === "GMAIL_SEND_EMAIL").level = "add";
  t.tool_catalog.push(
    { slug: "GOOGLECALENDAR_CREATE_EVENT", block: "calendar", toolkit: "googlecalendar", access: "write", label: "held a slot on the calendar", enabled: true, record: "appointment", level: "add",
      hide: ["send_updates"], fixed: { calendar_id: "primary" }, schema_at: fresh(),
      schema: { description: "Create an event.", input: { type: "object", properties: { summary: { type: "string" }, start_datetime: { type: "string" }, attendees: { type: "array" }, description: { type: "string" }, send_updates: { type: "boolean" }, calendar_id: { type: "string" } }, required: ["start_datetime", "calendar_id"] } } },
    { slug: "GOOGLESHEETS_CREATE_GOOGLE_SHEET1", block: "data_sink", toolkit: "googlesheets", access: "write", label: "made the sheet", enabled: true, record: "row", level: "add", guard: "pip_sheet", role: "create", schema_at: fresh(),
      schema: { description: "Create a sheet.", input: { type: "object", properties: { title: { type: "string" } } } } },
    { slug: "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", block: "data_sink", toolkit: "googlesheets", access: "write", label: "added a row", enabled: true, record: "row", level: "add", guard: "pip_sheet", role: "append", schema_at: fresh(),
      schema: { description: "Append values.", input: { type: "object", properties: { spreadsheetId: { type: "string" }, range: { type: "string" }, valueInputOption: { type: "string" }, values: { type: "array" } } } } },
  );
  t.job_runs = [{ id: RUN, spec_id: IDS.spec, business_id: IDS.business, job_id: "daily_line", trigger: "manual", status: "queued", attempts: 0, input: {}, state: null }];
  t.job_actions = [];
  return t;
}

/** Boots pip-turn through the harness, with the job_* database functions and the neq/in filters added to its fake. */
async function bootJob(opts) {
  let made, world;
  const rpc = {
    job_claim: ({ p_run }) => { const r = world.tables.job_runs.find((x) => x.id === p_run && x.status === "queued"); if (!r) return null; r.status = "running"; r.attempts++; return structuredClone(r); },
    job_finish: ({ p_run, p_outcome, p_summary, p_error }) => { const r = world.tables.job_runs.find((x) => x.id === p_run && x.status === "running"); if (!r) return null; r.status = { done: "done", continue: "queued", retry: "queued", dead_end: "dead_end", blocked: "failed" }[p_outcome]; r.summary = p_summary; r.error = p_error; return r.status; },
    job_action_begin: ({ p_run, p_seq, p_tool }) => { const a = world.tables.job_actions.find((x) => x.run_id === p_run && x.seq === p_seq); if (a) return { status: a.status === "started" ? "unknown" : a.status, result: a.result, tool: a.tool }; world.tables.job_actions.push({ run_id: p_run, seq: p_seq, tool: p_tool, status: "started" }); return { status: "fresh" }; },
    job_action_end: ({ p_run, p_seq, p_status, p_result }) => { const a = world.tables.job_actions.find((x) => x.run_id === p_run && x.seq === p_seq); if (a?.status === "started") { a.status = p_status; a.result = p_result; } return null; },
  };
  const wrap = (db) => ({
    from: (table) => { const q = db.from(table); q.neq = (c, v) => { q.filters.push((r) => r[c] !== v); return q; }; q.in = (c, vs) => { q.filters.push((r) => vs.includes(r[c])); return q; }; return q; },
    rpc: async (name, args) => { const r = await db.rpc(name, args); return Object.hasOwn(rpc, name) ? { data: rpc[name](args), error: null } : r; },
  });
  Object.defineProperty(globalThis, "__pipTurnMock", { configurable: true, set: (v) => { made = v; }, get: () => ({ createClient: (...a) => wrap(made.createClient(...a)) }) });
  let t;
  try { t = await boot(opts); } finally { delete globalThis.__pipTurnMock; }
  world = t.world;
  return { ...t, job: () => t.call("/job", { run: RUN }), run: () => world.tables.job_runs[0] };
}

test("hold 1: through POST /job, a job that lists fields.add cannot fill a field outside the list", async () => {
  const t = await bootJob({ tables: tables(), composio: () => ok(), model: [
    // The model has been talked into adding more than the job allows, in both tools.
    acts(use("save_to_sheet", { row: { date: "2026-11-18", note: "Daily line", card_number: "4242 4242" } }), use("GOOGLECALENDAR_CREATE_EVENT", { summary: "Hold", start_datetime: "2026-11-19T09:00:00", attendees: ["x@evil.example"] })),
    acts(use("save_to_sheet", { row: { date: "2026-11-18", note: "Daily line" } }), use("GOOGLECALENDAR_CREATE_EVENT", { summary: "Hold", start_datetime: "2026-11-19T09:00:00" })),
    says("Added the line and held the slot."),
  ] });
  const r = await t.job();
  t.restore();
  assert.equal(r.status, 200); assert.equal(r.json.claimed, true); assert.equal(r.json.outcome, "done");
  assert.equal(r.json.refusals, 2, "both calls that named a field outside the list were refused");
  const results = t.toolResults().map((x) => x.content);
  assert.match(results[0], /Refused: Outside this job's permissions: card_number/);
  assert.match(results[1], /Refused: Outside this job's permissions: attendees/);
  const sent = t.executed();
  assert.equal(sent.length, 2, "only the two calls inside the lists reached the tools");
  assert.ok(!JSON.stringify(sent).includes("4242") && !JSON.stringify(sent).includes("evil.example"), "nothing from the refused calls was sent");
  assert.match(JSON.stringify(sent[0].body), /date: 2026-11-18/); assert.match(JSON.stringify(sent[0].body), /note: Daily line/);
  assert.deepEqual(sent[1].body.arguments, { summary: "Hold", start_datetime: "2026-11-19T09:00:00", calendar_id: "primary" }, "the fixed value is set by code and is not one of the model's fields");
  assert.equal(t.world.tables.job_actions.length, 2, "refused calls were never written down as attempts");
  assert.equal(t.rpcs("portal_log").filter((x) => /may not do/.test(x.args.p_summary)).length, 2, "and each refusal is in the activity log");
  assert.equal(t.run().status, "done");
  // The model is told which fields it may fill in.
  const offered = t.world.model.calls[0].tools;
  assert.match(offered.find((x) => x.name === "save_to_sheet").description, /date, note/);
  assert.match(offered.find((x) => x.name === "GOOGLECALENDAR_CREATE_EVENT").description, /summary, start_datetime/);
});

test("hold 1: through POST /job, a job with no field list is not narrowed", async () => {
  const t = await bootJob({ tables: tables((j) => { for (const g of j.tools) delete g.fields; }), composio: () => ok(), model: [
    acts(use("save_to_sheet", { row: { date: "2026-11-18", anything: "else" } })), says("Added."),
  ] });
  const r = await t.job();
  t.restore();
  assert.equal(r.json.outcome, "done"); assert.equal(r.json.refusals, 0); assert.equal(t.executed().length, 1);
});

test("hold 1: through POST /job, a read is not offered when the job lists what it may see, because nothing can narrow the answer yet", async () => {
  const t = await bootJob({ tables: tables((j) => j.tools.push({ tool: "calendar", records: "busy_time", can: ["read"], fields: { read: ["start"] }, required: false })), composio: () => ok({ items: [] }), model: [
    acts(use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "2026-11-18T00:00:00Z" })), says("Could not look."),
  ] });
  const r = await t.job();
  t.restore();
  assert.ok(!t.world.model.calls[0].tools.some((x) => x.name === "GOOGLECALENDAR_EVENTS_LIST"), "not shown to the model");
  assert.equal(t.executed().length, 0, "and not run when asked for anyway");
  assert.equal(r.json.refusals, 1);
});

test("a calendar hold never invites anyone: with no field list, an attendee the model adds is dropped before the tool is called", async () => {
  const t = await bootJob({ tables: tables((j) => { for (const g of j.tools) delete g.fields; }), composio: () => ok(), model: [
    acts(use("GOOGLECALENDAR_CREATE_EVENT", { summary: "Hold", start_datetime: "2026-11-19T09:00:00", attendees: ["x@evil.example"], send_updates: "all" })),
    says("Held the slot."),
  ] });
  const r = await t.job();
  t.restore();
  assert.equal(r.json.outcome, "done");
  const sent = t.executed();
  assert.equal(sent.length, 1);
  assert.ok(!JSON.stringify(sent).includes("evil.example") && !("attendees" in sent[0].body.arguments) && !("send_updates" in sent[0].body.arguments), "no attendee and no notification setting reached the calendar");
  assert.equal(sent[0].body.arguments.summary, "Hold");
});
