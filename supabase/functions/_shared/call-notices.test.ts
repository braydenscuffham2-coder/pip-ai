// What a call must open with, by state, and the honesty rule that holds everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASKS_IF_AI, CLAIMS_HUMAN, decide, greeting, honest, type Rule, stateOfNumber } from "./call-notices.ts";

const RULES: Rule[] = [
  { state: "US", call_ai_notice: "always", call_notes_notice: true },
  { state: "ME", call_ai_notice: "always", call_ai_from: "2025-09-24", call_notes_notice: false },
  { state: "CO", call_ai_notice: "always", call_ai_from: "2027-01-01", call_notes_notice: false },
  { state: "UT", call_ai_notice: "health", call_notes_notice: false },
  { state: "ID", call_ai_notice: "on_request", call_notes_notice: false },
  { state: "CA", call_ai_notice: "on_request", call_notes_notice: true },
];
const d = (o: Partial<Parameters<typeof decide>[0]>) => decide({ businessState: "ID", health: false, from: "+12085551234", rules: RULES, today: "2026-11-27", ...o });

test("a number's state comes from its area code; anything else is unknown", () => {
  assert.equal(stateOfNumber("+12085551234"), "ID");
  assert.equal(stateOfNumber("(207) 555-0100"), "ME");
  assert.equal(stateOfNumber("12135550100"), "CA");
  assert.equal(stateOfNumber("+18005551234"), null, "toll-free");
  assert.equal(stateOfNumber("+442071234567"), null, "not a US number");
  assert.equal(stateOfNumber("+14165550100"), null, "Canada");
  assert.equal(stateOfNumber("anonymous"), null);
  assert.equal(stateOfNumber(""), null); assert.equal(stateOfNumber(null), null);
  assert.equal(stateOfNumber("+19865550100"), "ID", "Idaho's second code");
});

test("Idaho business, Idaho caller: nothing has to be said", () => {
  const n = d({});
  assert.deepEqual([n.ai, n.notes], [false, false]);
  assert.deepEqual(n.why, { business: "ID", caller: "ID", ai: "not_required", notes: "not_required" });
});

test("the stricter of the two states wins", () => {
  assert.deepEqual([d({ from: "+12075550100" }).ai, d({ from: "+12075550100" }).why.ai], [true, "caller_from_ME"], "a Maine caller is told it is an AI");
  assert.deepEqual([d({ from: "+12135550100" }).notes, d({ from: "+12135550100" }).ai], [true, false], "a California caller is told the call is transcribed, and no more");
  const me = d({ businessState: "ME" });
  assert.deepEqual([me.ai, me.why.ai], [true, "business_in_ME"]);
  const ca = d({ businessState: "CA" });
  assert.deepEqual([ca.ai, ca.notes, ca.why.notes], [false, true, "business_in_CA"]);
});

test("a rule with a start date does nothing before that date", () => {
  assert.equal(d({ businessState: "CO", today: "2026-12-31" }).ai, false);
  assert.equal(d({ businessState: "CO", today: "2027-01-01" }).ai, true);
});

test("a rule about regulated services applies to a health business only", () => {
  assert.equal(d({ businessState: "UT" }).ai, false);
  assert.equal(d({ businessState: "UT", health: true }).ai, true);
  assert.equal(d({ from: "+18015550100", health: true }).ai, true, "and to a health business's Utah caller");
});

test("when a state cannot be told, the careful answer is used", () => {
  const unknownCaller = d({ from: "anonymous" });
  assert.deepEqual([unknownCaller.ai, unknownCaller.notes, unknownCaller.why.notes], [false, true, "caller_state_not_known"]);
  const noState = d({ businessState: null });
  assert.deepEqual([noState.ai, noState.notes, noState.why.ai], [true, true, "business_state_not_on_file"]);
  assert.deepEqual([d({ businessState: "idaho" }).ai, d({ businessState: "id" }).ai], [true, false], "only a two-letter state counts");
});

test("rules that could not be read mean both notices", () => {
  for (const rules of [null, undefined, []] as const) {
    const n = d({ rules: rules as never });
    assert.deepEqual([n.ai, n.notes, n.why.ai], [true, true, "rules_not_read"]);
  }
});

test("an owner can have the line always say it is an AI", () => {
  const n = d({ line: "always" });
  assert.deepEqual([n.ai, n.notes, n.why.ai], [true, false, "line_set_to_always"]);
  assert.equal(d({ line: "law" }).ai, false);
});

test("the greeting says only what must be said, and says it first", () => {
  assert.equal(greeting("Hallie", "TEST Fork", { ai: false, notes: false }), "Thanks for calling TEST Fork, this is Hallie. How can I help?");
  assert.equal(greeting("Hallie", "TEST Fork", { ai: true, notes: false }), "Thanks for calling TEST Fork. This is Hallie, an AI assistant. How can I help?");
  assert.equal(greeting("Hallie", "TEST Fork", { ai: false, notes: true }), "Thanks for calling TEST Fork, this is Hallie. This call is transcribed. How can I help?");
  assert.equal(greeting("Hallie", "TEST Fork", { ai: true, notes: true }), "Thanks for calling TEST Fork. This is Hallie, an AI assistant, and this call is transcribed. How can I help?");
  for (const ai of [true, false]) for (const notes of [true, false]) {
    const g = greeting("Hallie", "TEST Fork", { ai, notes });
    assert.equal(/\bAI\b/.test(g), ai); assert.equal(/transcribed/.test(g), notes);
    assert.equal(/\b(person|human|receptionist)\b/i.test(g), false, "it never says what it is not");
    assert.ok(g.length <= 110, g);
  }
});

test("a question about who is speaking is recognised", () => {
  for (const q of ["Are you a real person?", "are you a robot", "Am I talking to a human?", "is this a recording", "Is this AI?", "wait, are you an AI", "am I speaking with a real person", "Can I talk to a real person?", "you sound like a robot", "is this a real person or a machine", "Are you human?", "r u a bot"]) assert.ok(ASKS_IF_AI.test(q), q);
  for (const q of ["What time do you open?", "I'd like a table for six", "Is this TEST Fork?", "are you open on Sunday", "do you have a real fireplace", "I'm a real estate agent", "is the person who called me there", "are you live music tonight"]) assert.equal(ASKS_IF_AI.test(q), false, q);
});

test("asked, the reply always says AI; the answer the model gave is kept", () => {
  assert.equal(honest("We open at five.", "are you a robot? what time do you open", "TEST Fork"), "I'm an AI assistant for TEST Fork. We open at five.");
  assert.equal(honest("I'm an AI assistant, and yes, we open at five.", "are you a real person?", "TEST Fork"), "I'm an AI assistant, and yes, we open at five.", "a reply that already says it is left alone");
  assert.equal(honest("We open at five.", "what time do you open", "TEST Fork"), "We open at five.", "not asked: nothing is added");
});

test("a reply that claims to be a person never reaches the customer", () => {
  for (const lie of ["Yes, I'm a real person.", "I am a human, how can I help?", "No, I'm not a robot. What do you need?", "I'm not an AI, I work the front desk.", "This is a real person, yes.", "Yes, I'm real."]) {
    assert.ok(CLAIMS_HUMAN.test(lie), lie);
    const out = honest(lie, "are you real?", "TEST Fork");
    assert.match(out, /^I'm an AI assistant for TEST Fork\./); assert.equal(CLAIMS_HUMAN.test(out), false);
  }
  for (const fine of ["I'm not a person, I'm an AI assistant.", "A person will call you back.", "I'm here to help.", "I am not able to book that.", "No, I'm an AI assistant for TEST Fork."]) assert.equal(CLAIMS_HUMAN.test(fine), false, fine);
  assert.equal(honest("Yes, I'm a real person.", "ok", "TEST Fork").startsWith("I'm an AI assistant"), true, "even when nobody asked");
});
