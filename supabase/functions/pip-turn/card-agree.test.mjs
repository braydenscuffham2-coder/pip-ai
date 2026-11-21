// The owner's card, the permission, and what the teammate is really handed must be the same answer.
// Seen live on TEST Fork: a teammate told a customer "I can't place a hold on the calendar myself" while her Portal
// card said, under Can, "Add new appointments in your calendar." This runs all three on the same teammate and the same
// catalog, and fails if any two disagree:
//   the grant    allows() on the job that answers the channel (../_shared/teammate-spec.ts)
//   the turn     the real pip-turn, with the database, the model and Composio faked: what it offers, and what it runs
//   the card     abilitiesOf() (../_shared/abilities.ts), called the way pip-portal calls it
//   node --test supabase/functions/pip-turn/card-agree.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, baseTables, use, says, acts, IDS } from "../../../tests/pip-turn/harness.mjs";
import { abilitiesOf, OTHER_CHANNELS } from "../_shared/abilities.ts";
import { allows, jobForMessage, jobsOf, NO_DIRECT_BOOKING } from "../_shared/teammate-spec.ts";

const HOLD = "GOOGLECALENDAR_CREATE_EVENT", BUSY = "GOOGLECALENDAR_EVENTS_LIST";
const CARD = { hold: "Add new appointments in your calendar.", busy: "See busy times in your calendar.", asks: "Ask you to confirm a booking. It does not confirm one itself." };

/** The TEST business with the calendar connected and both reviewed calendar tools in the catalog, as live. */
function world(edit) {
  const t = baseTables();
  t.tool_catalog.push({ slug: HOLD, block: "calendar", toolkit: "googlecalendar", access: "write", label: "added a calendar hold", enabled: true, record: "appointment", level: "add",
    hide: ["attendees"], fixed: { calendar_id: "primary" }, schema_at: new Date().toISOString(),
    schema: { description: "Create an event.", input: { type: "object", properties: { summary: { type: "string" }, start_datetime: { type: "string" }, calendar_id: { type: "string" } }, required: ["start_datetime", "calendar_id"] } } });
  edit(t);
  return t;
}
const SHAPES = {
  // (a) Hallie: no job list; designed with the calendar and with asking the owner to confirm a booking.
  "an older teammate that asks the owner first": (t) => { t.agent_manifests[0].manifest.uses = ["notify_owner", "capture_lead", "request_booking", "calendar", "email"]; },
  // (b) No job list, the calendar, and no request_booking: it holds the slot itself, as it always did.
  "an older teammate that does not ask first": (t) => { t.agent_manifests[0].manifest.uses = ["notify_owner", "capture_lead", "calendar", "email"]; },
  // (c) Cal: a job list whose chat job lists adding appointments.
  "a teammate whose chat job lists adding appointments": (t) => {
    t.skill_specs[0].spec = { ...t.skill_specs[0].spec, contract: "teammate/1", jobs: [{ id: "chat", name: "Chat", does: "Answers customers on the website and books them in.",
      instructions: "Answer from the facts on file. Check busy times, then hold the slot the customer picks.", triggers: [{ type: "message", channels: ["web_chat"] }],
      tools: [{ tool: "pip", records: "lead", can: ["add"] }, { tool: "calendar", records: "busy_time", can: ["read"] }, { tool: "calendar", records: "appointment", can: ["add"] }] }] };
  },
  // The same job list without the add, and with a request to the owner: the declared way to say "ask first".
  "a teammate whose chat job asks the owner and lists no add": (t) => {
    t.skill_specs[0].spec = { ...t.skill_specs[0].spec, contract: "teammate/1", jobs: [{ id: "chat", name: "Chat", does: "Answers customers on the website and asks the owner about bookings.",
      instructions: "Answer from the facts on file. Check busy times, then send the booking to the owner to confirm.", triggers: [{ type: "message", channels: ["web_chat"] }],
      tools: [{ tool: "pip", records: "booking_request", can: ["add"] }, { tool: "calendar", records: "busy_time", can: ["read"] }] }] };
  },
};
const EXPECT = {
  "an older teammate that asks the owner first": { hold: false, busy: true, asks: true, older: true },
  "an older teammate that does not ask first": { hold: true, busy: true, asks: false, older: true },
  "a teammate whose chat job lists adding appointments": { hold: true, busy: true, asks: false, older: false },
  "a teammate whose chat job asks the owner and lists no add": { hold: false, busy: true, asks: true, older: false },
};

/** All three answers for one teammate. The model asks for everything, allowed or not. */
async function three(edit) {
  const tables = world(edit);
  const t = await boot({ tables, composio: (path) => ({ status: 200, json: { successful: true, data: path.includes(BUSY) ? { items: [] } : { id: "evt_1" } } }), model: [
    acts(use(HOLD, { summary: "Table for Sam", start_datetime: "2026-11-21T19:00:00" }), use(BUSY, { timeMin: "2026-11-21T00:00:00-07:00" }), use("request_booking", { when: "Saturday 7pm" })),
    says("I am an AI assistant. Done."),
  ] });
  const r = await t.turn("Book me Saturday at 7pm");
  t.restore();
  assert.equal(r.status, 200);
  const offered = (t.world.model.calls[0].tools ?? []).map((x) => x.name);
  const ran = t.executed().map((c) => c.path.split("/").pop());
  // The same rows pip-turn loaded, read the way pip-turn and pip-portal each read them.
  const spec = tables.skill_specs[0], man = tables.agent_manifests.find((m) => m.spec_id === IDS.spec) ?? null;
  const job = jobForMessage(jobsOf(spec.spec, man, spec.brain).jobs, "web_chat");
  const card = abilitiesOf(spec.spec, man, spec.brain, { steps: tables.connection_catalog, tools: tables.tool_catalog.filter((x) => x.enabled) }).jobs.find((j) => j.id === job.id);
  return { r, t, job, offered, ran, card };
}

for (const [who, edit] of Object.entries(SHAPES)) {
  test(`the grant, the turn and the card agree for ${who}`, async () => {
    const want = EXPECT[who], { r, t, job, offered, ran, card } = await three(edit);
    const answers = {
      hold: { grant: allows(job, { tool: "calendar", records: "appointment", level: "add" }).ok, offered: offered.includes(HOLD), ran: ran.includes(HOLD), card: card.can.includes(CARD.hold) },
      busy: { grant: allows(job, { tool: "calendar", records: "busy_time", level: "read" }).ok, offered: offered.includes(BUSY), ran: ran.includes(BUSY), card: card.can.includes(CARD.busy) },
      asks: { grant: allows(job, { tool: "pip", records: "booking_request", level: "add" }).ok, offered: offered.includes("request_booking"), ran: t.inserts("notifications").some((n) => n.kind === "request_booking"), card: card.can.includes(CARD.asks) },
    };
    for (const [what, a] of Object.entries(answers)) {
      assert.equal(new Set(Object.values(a)).size, 1, `${what}: the grant, what was offered, what ran and the card must be one answer, got ${JSON.stringify(a)}`);
      assert.equal(a.grant, want[what], `${what} for ${who}`);
    }
    // The card never says both, and says "cannot" exactly when the teammate asks the owner and may not add.
    assert.equal(card.cannot.includes(NO_DIRECT_BOOKING), want.asks && !want.hold);
    assert.ok(!(card.can.includes(CARD.hold) && card.cannot.includes(NO_DIRECT_BOOKING)));
    assert.ok(!card.can.concat(card.notYet).some((l) => /appointment/i.test(l)) || want.hold, "appointments are mentioned as possible only where the hold is really open");
    // What the customer's turn recorded matches: a hold is "done" only where it is allowed.
    assert.equal(r.json.actions.some((x) => x.tool === HOLD && x.status === "done"), want.hold);
    assert.equal(r.json.actions.some((x) => x.tool === "request_booking" && x.status === "waiting_for_owner"), want.asks);
    assert.equal(t.executed().some((c) => c.path.endsWith(HOLD)), want.hold, "the calendar is written to only where the card says so");
    // What starts it: an older teammate's card claims website chat and nothing it cannot be sure of.
    if (want.older) assert.deepEqual(card.starts, ["When a customer reaches out by website chat.", OTHER_CHANNELS]);
    else assert.deepEqual(card.starts, ["When a customer reaches out by website chat."]);
  });
}

test("the card's 'website chat' is something the turn really does for an older teammate, and it says so without the other channels", async () => {
  const { r, card } = await three(SHAPES["an older teammate that asks the owner first"]);
  assert.equal(r.json.live, true, "a website chat message was answered");
  assert.ok(!/text|phone|email/i.test(card.starts[0]));
});
