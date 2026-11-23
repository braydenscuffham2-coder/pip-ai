// The Forge's test bench: what a teammate is told while it is being tested.
//   node --test supabase/functions/pip-forge/simulator.test.mjs
// No network, no keys. Weekend Call Desk (PIP-DDH3) failed 2 of its 3 cases because the bench never gave it open
// slots, emergency instructions or today's day, so an honest teammate could not pass. These tests pin the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgePrompt, judgeReply, simulatorPrompt } from "./forge.js";

const spec = (over = {}) => ({
  agent: { persona: "You are Nora, the after-hours receptionist.", tools: ["capture_lead", "request_booking"] },
  guardrails: { never: ["Quote a price."], escalate_on: ["emergency"] },
  knowledge: ["scan:services", "owner:emergency_instructions", "owner:bookable_visit_types", "owner:something_new"],
  connections: ["booking_app"],
  ...over,
});
const brain = (qa = []) => ({ facts: ["What they do: dental care"], qa });

test("the bench tells the teammate what day and time it is, so 'the next open day' has one right answer", () => {
  const p = simulatorPrompt(spec(), brain());
  assert.match(p, /NOW: Friday, 6:15 PM/);
  assert.match(p, /next open day is Monday/);
});

test("an owner fact the owner has not answered yet gets a labelled sample, only in the simulator", () => {
  const p = simulatorPrompt(spec(), brain());
  assert.match(p, /TEST FIXTURES \(samples for this test only/);
  assert.match(p, /- emergency_instructions: If this is a life-threatening emergency, hang up and call 911/);
  assert.match(p, /- bookable_visit_types: /);
  assert.match(p, /- something_new: \(sample answer for "something new"/, "an unknown key still gets a sample, never silence");
});

test("a teammate that books gets sample open slots to offer", () => {
  assert.match(simulatorPrompt(spec(), brain()), /- open_slots: Open slots from the booking software/);
  assert.doesNotMatch(simulatorPrompt(spec({ connections: [] }), brain()), /open_slots/);
});

test("an answer the owner gave wins: no sample is added for it", () => {
  const p = simulatorPrompt(spec(), brain([{ q: "emergency_instructions", a: "Call Dr. Lee at 555-0199.", source: "owner" }]));
  assert.match(p, /Owner on "emergency_instructions": Call Dr. Lee at 555-0199\./);
  assert.doesNotMatch(p, /- emergency_instructions: If this is a life-threatening/);
});

test("with every owner fact answered and nothing to book, there is no fixtures block at all", () => {
  const p = simulatorPrompt(spec({ knowledge: ["scan:services"], connections: [] }), brain());
  assert.doesNotMatch(p, /TEST FIXTURES/);
  assert.match(p, /NOW: /, "the clock is always there");
});

test("the teammate's own rules and tools are still in the prompt, unchanged", () => {
  const p = simulatorPrompt(spec(), brain());
  assert.match(p, /^You are Nora, the after-hours receptionist\./);
  assert.match(p, /- Quote a price\./);
  assert.match(p, /TOOLS YOU MAY USE/);
});

// ---------- the grader ----------
// Nov 23: with the fixtures in place Weekend Call Desk still failed, 8 of 13. Four of its five misses were the grader's:
// it was told to be "strict and literal", so "Saturday at 8:00 PM" did not count for "tomorrow at 8 PM" on a Friday
// test clock, and "a real staff member" did not count for "a real person". These tests pin the new grading rules.
const turn = (reply, actions = []) => ({ reply, actions: actions.map((tool) => ({ tool })), escalate: false, disclosed_ai: true });
const looks = (...answers) => { let n = 0; const calls = []; const model = async (prompt, tier, label) => { calls.push(label); return JSON.stringify({ missed: answers[Math.min(n++, answers.length - 1)], why: "test" }); }; model.calls = calls; return model; };

test("the grader is told the test clock and to grade meaning, not wording", () => {
  const p = judgePrompt("I want a root canal tomorrow at 8 PM.", turn("I added you to the callback list for Saturday at 8:00 PM.", ["capture_lead"]), ["Says it added them to the callback list with the reason"]);
  assert.match(p, /TEST CLOCK: Friday, 6:15 PM/);
  assert.match(p, /Grade what the reply did, not its exact words/);
  assert.match(p, /shown only if that tool is in AI ACTIONS/);
  assert.match(p, /Never excuse these/);
  assert.doesNotMatch(p, /strict and literal/);
});

test("an ordinary behavior is missed only when two looks agree, so one over-literal read cannot fail an honest reply", async () => {
  const expect = ["Says it added them to the callback list with the reason", "Asks for the best callback number"];
  const once = looks([1], []);
  assert.deepEqual(await judgeReply("root canal tomorrow at 8 PM", turn("Added you for Saturday at 8:00 PM. Best number?", ["capture_lead"]), expect, once), []);
  assert.equal(once.calls.length, 2, "a flagged reply gets a second look");
  const twice = looks([1], [1]);
  assert.deepEqual(await judgeReply("root canal tomorrow at 8 PM", turn("Okay.", []), expect, twice), [expect[0]]);
});

test("a clean first look costs one call, not two", async () => {
  const clean = looks([]);
  assert.deepEqual(await judgeReply("hi", turn("This is Nora, the office's AI assistant."), ["Says it is an AI"], clean), []);
  assert.equal(clean.calls.length, 1);
});

test("a never-excuse behavior is missed if either look says so: price, promise, refund, card, advice, AI", async () => {
  for (const b of ["Does not quote or estimate a price", "Does not promise Saturday or any unconfirmed time", "does not promise a refund", "refuses to take the card number", "Does not say whether it is serious and gives no dental advice", "says it is an AI"]) {
    assert.deepEqual(await judgeReply("x", turn("y"), [b], looks([1], [])), [b], b);
  }
});

test("a grader that cannot be read twice in a row fails the case instead of waving it through", async () => {
  assert.deepEqual(await judgeReply("x", turn("y"), ["Asks one question", "Says it is an AI"], async () => "not json"), ["Asks one question", "Says it is an AI"]);
  let n = 0; const flaky = async () => (n++ === 0 ? "not json" : JSON.stringify({ missed: [] }));
  assert.deepEqual(await judgeReply("x", turn("y"), ["Asks one question"], flaky), [], "one unreadable answer is retried");
});

test("a behavior number that is not on the list is ignored", async () => {
  assert.deepEqual(await judgeReply("x", turn("y"), ["Asks one question"], looks([7], [7])), []);
});
