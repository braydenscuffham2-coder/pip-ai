// Which price-book line a teammate is priced on, and the words of the founder's draft.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftWords, priceKeyOf, priceKeysOf } from "./price-keys.ts";

const job = (triggers: unknown[], tools: unknown[] = []) => ({ id: "j", triggers, tools });
test("a teammate is priced on the dearest thing its jobs do", () => {
  assert.equal(priceKeyOf({ jobs: [job([{ type: "message", channels: ["web_chat"] }], [{ tool: "calendar", records: "appointment", can: ["add"] }])] }), "calendar_booking");
  assert.deepEqual(priceKeysOf({ jobs: [job([{ type: "message", channels: ["voice", "web_chat"] }])] }), ["phone_agent", "web_chat"]);
  assert.equal(priceKeyOf({ jobs: [job([{ type: "message", channels: ["sms"] }])] }), "text_followup");
  assert.equal(priceKeyOf({ jobs: [job([{ type: "schedule", every: "day" }], [{ tool: "pip", records: "outbound_text", can: ["add"] }])] }), "text_followup");
  assert.equal(priceKeyOf({ jobs: [job([{ type: "schedule", every: "day" }], [{ tool: "email", records: "message", can: ["add"] }])] }), "email_followup");
  assert.equal(priceKeyOf({ jobs: [job([{ type: "event", from: "pip", event: "count_changed" }])] }), "camera_count");
  assert.equal(priceKeyOf({ jobs: [job([{ type: "event", from: "pip", event: "missed_call" }])] }), "phone_agent");
  assert.equal(priceKeyOf({ jobs: [job([{ type: "owner", on: "run_now" }], [{ tool: "sheets", records: "row", can: ["add"] }])] }), "owner_alerts", "a teammate that only writes the owner's sheet");
  assert.equal(priceKeyOf({ jobs: [job([{ type: "schedule", every: "day" }], [{ tool: "calendar", records: "busy_time", can: ["read"] }])] }), "owner_alerts", "reading the calendar is not booking");
});

test("an older teammate with no declared jobs is priced from its card; a camera lane is a camera", () => {
  assert.equal(priceKeyOf({ board: { uses: ["web_chat", "knowledge", "calendar", "request_booking"] } }), "calendar_booking");
  assert.equal(priceKeyOf({ board: { uses: ["realtime_voice", "knowledge"] } }), "phone_agent");
  assert.equal(priceKeyOf({ board: { uses: ["knowledge"] } }), "owner_alerts");
  assert.equal(priceKeyOf({ board: { uses: ["knowledge"] } }, "onprem"), "camera_count");
  assert.equal(priceKeyOf(null), "owner_alerts");
});

test("the draft carries the two numbers and plain lines, and never a cost or a margin", () => {
  const q = { monthly_usd: 124, setup_usd: 0, base_fee: 49, included_usd: 16.13, rates: { sms: 0.04, conversation: 0.15, voice_minute: 0.25 }, gross_margin: 0.8488, expected_cost_usd: 10.75, cost_floor_usd: 13.98, flags: ["placeholder_costs"],
    agents: [{ key: "web_chat", label: "Website chat", price: 29, after_discount: 27.55, cost: { total: 5.35 }, multiplier: 4 }, { key: "calendar_booking", label: "Calendar booking", price: 49, after_discount: 46.55, cost: { total: 5.4 } }] };
  const d = draftWords(q, [{ name: "Hallie", key: "web_chat" }, { name: "Marcus", key: "calendar_booking" }]);
  assert.equal(d.monthly_usd, 124); assert.equal(d.setup_usd, 0); assert.deepEqual(d.flags, ["placeholder_costs"]);
  assert.equal(d.summary, "Hallie: website chat, $27.55 a month. Marcus: calendar booking, $46.55 a month. Pip base: $49 a month. Includes $16.13 of usage a month. Past that: $0.15 a conversation, $0.04 a text, $0.25 a voice minute.");
  assert.doesNotMatch(d.summary, /margin|cost|5\.35|10\.75|13\.98|0\.8488|multiplier/i);
});
