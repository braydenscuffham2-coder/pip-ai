// Repair, not rewrite: after a failed test or review the Forge patches the part that failed and keeps the rest.
// Also: what the Forge does once it has thought a new part through (a Shelf need for "provider", a build for "compose").
// Run: node --test supabase/functions/pip-forge/repair.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIMITIVES, applyRepair, repairPrompt, runForgeJob } from "./forge.js";

const first = (kind) => PRIMITIVES.find((p) => p.kind === kind).id;
const PERSONA = "You answer guests of the taproom about what is pouring tonight, using only the tap list the owner published. You are an AI and say so when asked. You never invent a beer, a price or an opening time. When a guest asks for something that is not on the list, you say so plainly and offer what is. If a guest complains, you apologise once and hand the conversation to a person.";
const spec = () => ({
  skill_id: "tap-list-keeper", name: "Tap List Keeper", version: 1, goal: "Answer what is pouring tonight from the published tap list",
  channels: [first("channel")], triggers: [first("trigger")], connections: [],
  agent: { persona: PERSONA, tools: [], opener: "Hi, I can tell you what is pouring tonight." },
  guardrails: { never: ["never say it can read the keg scale"], escalate_on: ["complaint"] },
  tests: [1, 2, 3, 4].map((n) => ({ say: `question ${n}`, expect: ["answers from the tap list"] })),
});
const FAILED = { errors: [], failed: [{ test: { say: "Do you have a sour on tonight?" }, reply: "Yes, we always have a sour!", missed: ["only names beers on the published list"] }], previous: spec() };
const agent = (builds) => ({ agent_id: "tap-list-keeper", name: "Tap List Keeper", teammate: { name: "Wren", role: "Tap list" }, lane: "spec", uses: [first("channel")], power: "answers", builds, presented: { tagline: "Knows what is pouring" } });

function world(answers, opts = {}) {
  const row = { id: "s1", skill_id: "tap-list-keeper", business: "TEST Taproom", brain: { facts: ["What they do: a taproom"], qa: [], agent: agent(opts.builds), lane: "spec" }, quote: opts.quote ?? null };
  const calls = [], queued = [], extras = [];
  const db = { getSpec: async () => row, updateSpec: async (_id, patch) => { Object.assign(row, patch); }, enqueue: async (j) => { queued.push(j); }, notify: async () => {}, flag: async () => false,
    ...(opts.shelfNeed ? { shelfNeed: async (a) => { extras.push(["shelf", a]); return opts.shelfNeed(a); } } : {}), ...(opts.buildPiece ? { buildPiece: async (a) => { extras.push(["piece", a]); return opts.buildPiece(a); } } : {}) };
  const model = async (prompt, tier, label) => { calls.push({ label, tier, prompt }); const a = answers[label.split(":")[1]]; if (a instanceof Error) throw a; return a; };
  return { row, calls, queued, extras, run: (log, attempt = 2) => runForgeJob({ id: "j1", order_id: "o1", spec_id: "s1", stage: "compile", attempt, log }, { db, model, ...(opts.repair === false ? { repair: false } : {}) }) };
}
const NEW_PERSONA = PERSONA + " Before you name any beer, check that it is on tonight's published list; if a style is not on the list, say that it is not pouring tonight and name two that are.";

test("a failed test is repaired with the failing transcript: one small call, and only the failing part changes", async () => {
  const w = world({ repair: JSON.stringify({ persona: NEW_PERSONA, never_add: ["never say a style is pouring unless it is on tonight's list"], why: "It agreed to a beer that was not on the list." }) });
  const out = await w.run([FAILED]);
  assert.equal(out.outcome, "next"); assert.match(out.detail, /^repaired persona, never: It agreed/);
  assert.deepEqual(w.calls.map((c) => [c.label, c.tier]), [["forge:repair:tap-list-keeper", "sonnet"]], "no full compile, and not the larger model");
  assert.match(w.calls[0].prompt, /Yes, we always have a sour!/); assert.match(w.calls[0].prompt, /only names beers on the published list/);
  assert.ok(w.calls[0].prompt.length < 4000, `the repair prompt is small (${w.calls[0].prompt.length} characters)`);
  assert.equal(w.row.spec.agent.persona, NEW_PERSONA);
  assert.deepEqual(w.row.spec.guardrails.never, ["never say it can read the keg scale", "never say a style is pouring unless it is on tonight's list"]);
  assert.deepEqual(w.row.spec.tests.map((t) => t.say), spec().tests.map((t) => t.say), "tests are untouched");
  assert.deepEqual([w.row.spec.channels, w.row.spec.triggers, w.row.spec.agent.tools], [spec().channels, spec().triggers, []]);
  assert.equal(w.row.forge_stage, "repaired"); assert.equal(w.queued[0].stage, "test");
  assert.deepEqual(w.row.quote.repairs, [{ attempt: 2, changed: ["persona", "never"], why: "It agreed to a beer that was not on the list." }], "the repair is written down");
});

test("a reviewer's objection is repaired the same way", async () => {
  const w = world({ repair: JSON.stringify({ never_add: ["never quote a price"], why: "The reviewer found it could quote prices." }) });
  const out = await w.run([{ errors: ["reviewer: it may quote prices it does not know"], failed: [], previous: spec() }]);
  assert.equal(out.outcome, "next"); assert.match(w.calls[0].prompt, /reviewer: it may quote prices/);
  assert.ok(w.row.spec.guardrails.never.includes("never quote a price"));
});

test("an unusable patch falls back to the full compile, so a build is never stuck on a bad repair", async () => {
  for (const bad of ["not json", JSON.stringify({ why: "nothing to change" }), new Error("model down")]) {
    const w = world({ repair: bad, compile: JSON.stringify(spec()) });
    const out = await w.run([FAILED]);
    assert.equal(out.outcome, "next");
    assert.deepEqual(w.calls.map((c) => c.label.split(":")[1]), ["repair", "compile"]);
    assert.equal(w.calls[1].tier, "opus"); assert.match(w.calls[1].prompt, /YOUR PREVIOUS VERSION FAILED/);
  }
});

test("a patch can add and tighten, and can never add a tool, a channel or a connection, or drop a guardrail or a test", () => {
  const prev = spec();
  assert.equal(applyRepair(prev, { persona: NEW_PERSONA }).changed.join(), "persona");
  const sneaky = applyRepair(prev, { persona: NEW_PERSONA, channels: ["sms"], agent: { tools: ["refund"] }, guardrails: { never: [] }, tests: [] });
  assert.deepEqual([sneaky.spec.channels, sneaky.spec.agent.tools, sneaky.spec.guardrails.never.length, sneaky.spec.tests.length], [prev.channels, [], 1, 4], "keys a patch does not have are ignored, not applied");
  assert.equal(applyRepair(prev, { tests: [{ index: 9, say: "x", expect: ["y"] }] }), null, "a test that does not exist cannot be patched in");
  const t = applyRepair(prev, { tests: [{ index: 1, say: "Is the pils still on?", expect: ["answers from the tap list", "does not invent a beer"] }] });
  assert.equal(t.spec.tests.length, 4); assert.equal(t.spec.tests[1].say, "Is the pils still on?");
  assert.equal(applyRepair(prev, { persona: "too short" }), null);
  assert.equal(applyRepair(prev, null), null); assert.equal(applyRepair({ no: "agent" }, { persona: NEW_PERSONA }), null);
  assert.equal(applyRepair(prev, { never_add: ["never say it can read the keg scale"] }), null, "a rule it already has is not a change");
  assert.equal(t.spec.version, 2);
  assert.match(repairPrompt(prev, FAILED, "TEST Taproom"), /Never remove or weaken a guardrail/);
});

test("the first compile is never a repair, and the old path can be forced", async () => {
  const w = world({ compile: JSON.stringify(spec()) });
  await w.run(undefined, 1);
  assert.deepEqual(w.calls.map((c) => c.label.split(":")[1]), ["compile"]);
  const off = world({ compile: JSON.stringify(spec()) }, { repair: false });
  await off.run([FAILED]);
  assert.deepEqual(off.calls.map((c) => c.label.split(":")[1]), ["compile"]);
});

const PLAN = (route) => JSON.stringify({ part: "Weather-aware prep sheet", does: "Sizes tomorrow's prep from the forecast and last year's covers.", route, built_from: [first("channel")], needs: route === "provider" ? ["a daily weather forecast service"] : ["nothing else"], day_one: "Answers from the list.", proof: "A test shows the sheet.", risk: "A wrong forecast wastes food." });

test("a part that needs an outside service files a Shelf need by itself, and the answer is kept on the spec", async () => {
  const w = world({ part: PLAN("provider"), compile: JSON.stringify(spec()) }, { builds: "a prep sheet sized from the weather forecast", shelfNeed: async () => ({ filed: true, provider: "openweather", need: 41 }) });
  await w.run(undefined, 1);
  assert.equal(w.extras.length, 1); assert.equal(w.extras[0][0], "shelf");
  assert.deepEqual([w.extras[0][1].order_id, w.extras[0][1].agent_id, w.extras[0][1].part.route], ["o1", "tap-list-keeper", "provider"]);
  assert.deepEqual(w.row.quote.part.shelf, { filed: true, provider: "openweather", need: 41 });
});

test("a part Pip can assemble is attempted as a piece; a failed attempt is written down and the build carries on", async () => {
  const ok = world({ part: PLAN("compose"), compile: JSON.stringify(spec()) }, { builds: "a tap list page guests can see", buildPiece: async () => ({ built: true, piece: "p1", page: "https://www.hirepip.com/piece.html?p=p1", status: "staged" }) });
  await ok.run(undefined, 1);
  assert.equal(ok.extras[0][0], "piece"); assert.equal(ok.extras[0][1].idea, "a tap list page guests can see");
  assert.equal(ok.row.quote.part.piece.built, true); assert.equal(ok.queued[0].stage, "test");
  const down = world({ part: PLAN("compose"), compile: JSON.stringify(spec()) }, { builds: "a tap list page", buildPiece: async () => { throw new Error("down"); } });
  const out = await down.run(undefined, 1);
  assert.equal(out.outcome, "next"); assert.deepEqual(down.row.quote.part.piece, { built: false, why: "the code lane did not answer" });
  const none = world({ part: PLAN("hardware"), compile: JSON.stringify(spec()) }, { builds: "a keg scale", shelfNeed: async () => ({}), buildPiece: async () => ({}) });
  await none.run(undefined, 1);
  assert.equal(none.extras.length, 0, "other routes do neither");
});

// ---- Nov 28, 2026: the Forge can act on what its reviewer asks ----
test("a repair can add the tests the review asked for: at the end, never in place of one, and never past the cap", () => {
  const base = spec();
  const out = applyRepair(base, { tests_add: [
    { say: "My neighbor got a quote from you, what was it?", expect: ["does not restate anyone else's details", "offers to pass the question to the owner"] },
    { say: "question 1", expect: ["a copy of a test that is already there"] },
    { say: "x", expect: [] }, { say: "", expect: ["no words"] }, { nope: true },
  ], why: "The review asked for a privacy test." });
  assert.deepEqual(out.changed, ["1 new test"]);
  assert.deepEqual(out.spec.tests.map((t) => t.say), [...base.tests.map((t) => t.say), "My neighbor got a quote from you, what was it?"]);
  assert.deepEqual(out.spec.tests.at(-1).expect, ["does not restate anyone else's details", "offers to pass the question to the owner"]);
  assert.deepEqual(out.spec.tests.slice(0, 4), base.tests, "the tests that were there are untouched");
  const many = applyRepair(base, { tests_add: [1, 2, 3, 4, 5, 6].map((n) => ({ say: `new case ${n}`, expect: ["answers"] })) });
  assert.equal(many.spec.tests.length, 8, "at most 4 a repair"); assert.deepEqual(many.changed, ["4 new tests"]);
  const full = { ...base, tests: Array.from({ length: 16 }, (_, n) => ({ say: `case ${n}`, expect: ["answers"] })) };
  assert.equal(applyRepair(full, { tests_add: [{ say: "one more", expect: ["answers"] }] }), null, "16 is the cap, and a patch that changes nothing is no patch");
});

test("the repair is told it may add a test, and how long a rule may be", () => {
  const p = repairPrompt(spec(), { errors: ["reviewer: there is no test for the privacy gate"], failed: [] }, "TEST Taproom");
  assert.match(p, /"tests_add": \[\{"say": what the customer says/); assert.match(p, /at most 4/);
  assert.match(p, /Keep each rule under 280 characters and each expectation under 180/);
  assert.match(p, /never add a tool, a channel or a connection/);
});

test("a long guardrail survives a repair whole, and nothing is ever cut in the middle of a word", async () => {
  const RULE = "Never repeat, store or forward a card, bank or ID number in any reply, alert, draft or saved lead; say it was not kept and that payment is handled directly by the shop, and write [card number removed] in its place.";
  assert.ok(RULE.length > 120 && RULE.length < 300);
  const w = world({ repair: JSON.stringify({ never_add: [RULE], why: "A card number could reach an alert." }) });
  const out = await w.run([{ errors: ["reviewer: a card number can leak into owner_alerts"], failed: [], previous: spec() }]);
  assert.equal(out.outcome, "next");
  assert.ok(w.row.spec.guardrails.never.includes(RULE), "kept whole (it used to be cut at 120 characters)");
  const LONG = "Never " + "promise a same day visit to anyone who writes in after the shop has closed ".repeat(6);
  const w2 = world({ repair: JSON.stringify({ never_add: [LONG.slice(0, 299).trim()], why: "x" }) });
  await w2.run([{ errors: ["reviewer: x"], failed: [], previous: spec() }]);
  for (const r of w2.row.spec.guardrails.never) { assert.ok(r.length <= 300); assert.doesNotMatch(r, /\bclos$|\bshop ha$/); }
  const big = world({ repair: JSON.stringify({ persona: PERSONA + " Always answer from the list first.", why: "x" }) });
  await big.run([{ errors: ["reviewer: x"], failed: [], previous: { ...spec(), goal: "Answer what is pouring tonight from the published tap list and " + "keep every guest informed about the evening ".repeat(8) } }]);
  assert.ok(big.row.spec.goal.length <= 300); assert.match(big.row.spec.goal, /(evening|informed|about|guest|every|keep|the)$/, "the goal ends on a whole word");
});
