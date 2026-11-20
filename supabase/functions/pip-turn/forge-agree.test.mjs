// What the Forge tells the founder a job can do must be what pip-turn really offers. This runs both on the same
// catalog and the same permission, and fails if they disagree:
//   canRun()  in ../_shared/forge-check.ts: "is anything behind this tool today?", asked before go-live
//   pip-turn  the real index.ts with the database, the model and Composio faked (tests/pip-turn/harness.mjs)
// Every tool is connected and working here, because canRun answers "once the owner has connected it".
//   node --test supabase/functions/pip-turn/forge-agree.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, baseTables, says, IDS } from "../../../tests/pip-turn/harness.mjs";
import { canRun } from "../_shared/forge-check.ts";
import { checkSpec } from "../_shared/teammate-spec.ts";

const RUN = "44444444-4444-4444-8444-444444444444";
const row = (slug, block, toolkit, record, level, more = {}) => ({ slug, block, toolkit, access: level === "read" ? "read" : "write", label: "used " + slug.toLowerCase(), enabled: true, record, level,
  hide: [], fixed: {}, schema_at: new Date().toISOString(), schema: { description: slug + ".", input: { type: "object", properties: { name: { type: "string" } } } }, ...more });

/** A TEST business with every setup step connected, one extra product connected, and these catalog rows. */
function world() {
  const t = baseTables();
  t.connection_catalog.push({ slot: "crm", label: "Customer list", blocks: ["crm"] }, { slot: "texting", label: "Texting", blocks: ["sms", "send_text"] }, { slot: "pos", label: "Point of sale", blocks: ["pos"] });
  t.business_connections.push(
    { id: "c-crm", business_id: IDS.business, slot: "crm", status: "active", choice: "hubspot", connected_account_id: "ca_crm", detail: {} },
    { id: "c-sms", business_id: IDS.business, slot: "texting", status: "active", choice: "texter", connected_account_id: "ca_sms", detail: {} },
    { id: "c-pos", business_id: IDS.business, slot: "pos", status: "active", choice: "square", connected_account_id: "ca_pos", detail: {} },
  );
  // Two extra products. HubSpot is connected both ways: as the customer-list step, and on its own.
  for (const toolkit of ["airtable", "hubspot"]) t.client_connections.push({ business_id: IDS.business, toolkit, status: "active", connected_account_id: "ca_x_" + toolkit, created_at: new Date().toISOString() });
  t.tool_catalog.push(
    row("HUBSPOT_LIST_CONTACTS", "crm", "hubspot", "contact", "read"), row("HUBSPOT_CREATE_CONTACT", "crm", "hubspot", "contact", "add"), row("HUBSPOT_UPDATE_CONTACT", "crm", "hubspot", "contact", "update"),
    row("TEXTER_SEND_MESSAGE", "sms", "texter", "message", "add"),
    row("SQUARE_LIST_ITEMS", "pos", "square", "item", "read"),                       // a money product behind a building block
    row("AIRTABLE_CREATE_LEAD", "any_tool", "airtable", "lead", "add"), row("AIRTABLE_LIST_LEADS", "any_tool", "airtable", "lead", "read"),
    row("AIRTABLE_UPDATE_LEAD", "any_tool", "airtable", "lead", "update"), row("AIRTABLE_SEND_MESSAGE", "any_tool", "airtable", "message", "add"),
    { ...row("AIRTABLE_ADD_NOTE", "any_tool", "airtable", null, null), record: undefined, level: undefined }, // found automatically before; never reviewed
    row("AIRTABLE_CREATE_TASK", "any_tool", "airtable", "task", "add", { enabled: false }),                    // reviewed, then switched off
    row("HUBSPOT_CREATE_DEAL", "any_tool", "hubspot", "deal", "add"),                                          // reviewed as an extra-product action, for a product that is also a setup step
  );
  return t;
}

// One permission each, and the catalog tool that would do each level of it.
const CASES = [
  [{ tool: "calendar", records: "busy_time", can: ["read"] }, { read: "GOOGLECALENDAR_EVENTS_LIST" }],
  [{ tool: "calendar", records: "busy_time", can: ["read"], fields: { read: ["start"] } }, { read: "GOOGLECALENDAR_EVENTS_LIST" }],
  [{ tool: "email", records: "message", can: ["add"], purpose: "reply" }, { add: "GMAIL_SEND_EMAIL" }],
  [{ tool: "email", records: "message", can: ["add"], purpose: "transactional" }, { add: "GMAIL_SEND_EMAIL" }],
  [{ tool: "email", records: "message", can: ["add"], purpose: "marketing" }, { add: "GMAIL_SEND_EMAIL" }],
  [{ tool: "crm", records: "contact", can: ["read", "add"] }, { read: "HUBSPOT_LIST_CONTACTS", add: "HUBSPOT_CREATE_CONTACT" }],
  [{ tool: "crm", records: "contact", can: ["read", "add"], fields: { read: ["name"], add: ["name"] } }, { read: "HUBSPOT_LIST_CONTACTS", add: "HUBSPOT_CREATE_CONTACT" }],
  [{ tool: "crm", records: "contact", can: ["read", "update"], fields: { update: ["name"] } }, { read: "HUBSPOT_LIST_CONTACTS", update: "HUBSPOT_UPDATE_CONTACT" }],
  [{ tool: "crm", records: "deal", can: ["add"] }, { add: "HUBSPOT_CREATE_DEAL" }],
  [{ tool: "sms", records: "message", can: ["add"], purpose: "reply" }, { add: "TEXTER_SEND_MESSAGE" }],
  [{ tool: "send_text", records: "message", can: ["add"], purpose: "reply" }, { add: "TEXTER_SEND_MESSAGE" }],
  [{ tool: "pos", records: "item", can: ["read"] }, { read: "SQUARE_LIST_ITEMS" }],
  [{ tool: "kit:airtable", records: "lead", can: ["add"] }, { add: "AIRTABLE_CREATE_LEAD" }],
  [{ tool: "kit:airtable", records: "lead", can: ["read", "add"], fields: { add: ["name"] } }, { read: "AIRTABLE_LIST_LEADS", add: "AIRTABLE_CREATE_LEAD" }],
  [{ tool: "kit:airtable", records: "lead", can: ["read"], fields: { read: ["name"] } }, { read: "AIRTABLE_LIST_LEADS" }],
  [{ tool: "kit:airtable", records: "lead", can: ["add", "update"], fields: { update: ["name"] } }, { add: "AIRTABLE_CREATE_LEAD", update: "AIRTABLE_UPDATE_LEAD" }],
  [{ tool: "kit:airtable", records: "message", can: ["add"], purpose: "reply" }, { add: "AIRTABLE_SEND_MESSAGE" }],
  [{ tool: "kit:airtable", records: "note", can: ["add"] }, { add: "AIRTABLE_ADD_NOTE" }],
  [{ tool: "kit:airtable", records: "task", can: ["add"] }, { add: "AIRTABLE_CREATE_TASK" }],
  [{ tool: "kit:airtable", records: "contact", can: ["add"] }, { add: "AIRTABLE_CREATE_CONTACT" }],
  [{ tool: "kit:airtable", records: "deal", can: ["add"] }, { add: "AIRTABLE_CREATE_DEAL" }], // reviewed for another product only
  [{ tool: "kit:hubspot", records: "deal", can: ["add"] }, { add: "HUBSPOT_CREATE_DEAL" }],
  [{ tool: "kit:hubspot", records: "contact", can: ["add"] }, { add: "HUBSPOT_CREATE_CONTACT" }],
];
const STARTS = { "answering a customer": [{ type: "message", channels: ["web_chat"] }], "started on its own": [{ type: "owner", on: "run_now" }] };

/** The tools pip-turn really shows the model for a job with this one permission, started this way. */
async function offered(grant, how, required = false) {
  const tables = world();
  const spec = { ...tables.skill_specs[0].spec, contract: "teammate/1", jobs: [{ id: "the_job", name: "The job", does: "Does one thing, to compare two answers.",
    instructions: "Do what the business asks with the tools you were given. Then stop.", triggers: STARTS[how], tools: [{ ...grant, required }] }] };
  const checked = checkSpec(spec);
  assert.deepEqual(checked.errors, [], JSON.stringify(grant));
  tables.skill_specs[0].spec = spec;
  tables.job_runs = [{ id: RUN, spec_id: IDS.spec, business_id: IDS.business, job_id: "the_job", trigger: "manual", status: "queued", attempts: 0, input: {}, state: null }];
  const claim = (args, w) => { const r = w.tables.job_runs.find((x) => x.id === args.p_run && x.status === "queued"); if (!r) return null; r.status = "running"; r.attempts++; return structuredClone(r); };
  const t = await boot({ tables, rpc: { job_claim: claim }, model: [says("I am an AI assistant. Done.")], composio: () => ({ status: 200, json: { successful: true, data: {} } }) });
  const r = how === "answering a customer" ? await t.turn("hi") : await t.call("/job", { run: RUN });
  t.restore();
  assert.equal(r.status, 200);
  // What the Forge reads: enabled rows only (loadCatalog asks for those), and the setup steps.
  const catalog = { steps: tables.connection_catalog, tools: tables.tool_catalog.filter((x) => x.enabled) };
  const line = canRun(checked.jobs, catalog)[0];
  if (required) return { r, calls: t.world.model.calls.length, ran: t.executed().length, line };
  assert.equal(t.world.model.calls.length, 1, "the model was asked once, so the list of tools it was shown is known");
  return { names: (t.world.model.calls[0].tools ?? []).map((x) => x.name), line };
}

test("for every kind of permission, the Forge's 'can it run' and what pip-turn offers are the same answer", async (t) => {
  let asked = 0, open = 0;
  for (const how of Object.keys(STARTS)) for (const [grant, tools] of CASES) {
    const { names, line } = await offered(grant, how);
    for (const level of grant.can) {
      asked++;
      const really = names.includes(tools[level]), forge = !line.missing.includes(level);
      if (really) open++;
      assert.equal(forge, really, `${how}: ${level} ${grant.records} in ${grant.tool}${grant.purpose ? ` (${grant.purpose})` : ""}${grant.fields ? ` with fields ${JSON.stringify(grant.fields)}` : ""}.\n  The Forge says: ${line.say}\n  pip-turn offered: ${names.join(", ") || "nothing"}`);
    }
  }
  t.diagnostic(`${asked} questions asked both ways; pip-turn opened ${open} of them.`);
  assert.ok(open >= 8 && asked - open >= 20, "the comparison must see both open and shut answers, or it proves nothing");
});

test("an extra product gives a job that started on its own nothing, even with the action reviewed and the product connected", async () => {
  const { names, line } = await offered({ tool: "kit:airtable", records: "lead", can: ["add"] }, "started on its own");
  assert.deepEqual(names, ["needs_a_person"]);
  assert.deepEqual(line.missing, ["add"]);
  assert.match(line.say, /A job that starts on its own cannot use an extra product at all\./);
  // When the job cannot do without it, the run stops before the model is called. The database then pauses that job
  // and tells the business (job_finish, outcome "blocked"). The Forge says the same thing earlier: it blocks go-live.
  const must = await offered({ tool: "kit:airtable", records: "lead", can: ["add"] }, "started on its own", true);
  assert.equal(must.r.json.outcome, "blocked");
  assert.match(must.r.json.error, /kit:airtable \(lead\) is not open to jobs yet/);
  assert.equal(must.calls, 0);
  assert.equal(must.ran, 0);
  assert.match(must.line.say, /This job cannot run without it, so it blocks go-live\.$/);
});
