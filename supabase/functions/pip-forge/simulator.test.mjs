// The Forge's test bench: what a teammate is told while it is being tested.
//   node --test supabase/functions/pip-forge/simulator.test.mjs
// No network, no keys. Weekend Call Desk (PIP-DDH3) failed 2 of its 3 cases because the bench never gave it open
// slots, emergency instructions or today's day, so an honest teammate could not pass. These tests pin the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulatorPrompt } from "./forge.js";

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
