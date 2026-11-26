// The part a teammate needs that Pip has not built before: the Forge thinks it through and never drops it.
// Run: node --test supabase/functions/pip-forge/part.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIMITIVES, buildOrder, partPlan, partPrompt, renderConsole, runForgeJob } from "./forge.js";

const first = (kind) => PRIMITIVES.find((p) => p.kind === kind).id;
const goodSpec = () => JSON.stringify({
  name: "Tap List Keeper", goal: "Answer what is pouring tonight from the published tap list",
  channels: [first("channel")], triggers: [first("trigger")], connections: [],
  agent: { persona: "You answer guests of the taproom about what is pouring tonight, using only the tap list the owner published. You are an AI and say so. You never invent a beer.", tools: [] },
  guardrails: { never: ["never say it can read the keg scale"], escalate_on: ["complaint"] },
  tests: [1, 2, 3].map((n) => ({ say: `question ${n}`, expect: ["answers from the tap list"] })),
});
const plan = { part: "Keg level reader", does: "Reads how full each keg is so the tap list updates itself.", route: "hardware", built_from: [first("channel"), "made_up_block"], needs: ["a scale under each keg"], day_one: "Answers from the tap list the owner types in.", proof: "A keg emptied in the test drops off the list within a minute.", risk: "A wrong reading takes a beer off the list while it still pours." };

function world(agent, answers) {
  const row = { id: "s1", skill_id: "tap-list-keeper", business: "TEST Taproom", brain: { facts: ["What they do: a taproom"], qa: [], agent, lane: "spec" }, quote: null };
  const calls = [], queued = [], notes = [];
  const db = { getSpec: async () => row, updateSpec: async (_id, patch) => { Object.assign(row, patch); }, enqueue: async (j) => { queued.push(j); }, notify: async (_id, kind, body) => { notes.push({ kind, body }); }, flag: async () => false };
  const model = async (prompt, tier, label) => { calls.push({ label, tier, prompt }); const a = answers[label.split(":")[1]]; if (a instanceof Error) throw a; return a; };
  return { row, calls, queued, notes, run: (stage = "compile", attempt = 1) => runForgeJob({ id: "j1", order_id: "o1", spec_id: "s1", stage, attempt, log: [] }, { db, model }) };
}
const agent = (builds) => ({ agent_id: "tap-list-keeper", name: "Tap List Keeper", teammate: { name: "Wren", role: "Tap list" }, lane: "spec", uses: [first("channel")], power: "answers", builds, presented: { tagline: "Knows what is pouring" } });

test("the order keeps the part the Brain asked for", () => {
  const order = buildOrder({ order_id: "o", lead_id: "l", domain: "taproom.test", scan_id: null, result: { skills: [{ id: "tap-list-keeper", name: "Tap List Keeper", teammate: { name: "Wren", role: "Tap list" }, lane: "spec", uses: [first("channel")], builds: "  a reader for   keg levels " }], profile: { name: "TEST Taproom", industry: "restaurant", facts: [] }, answers: {} }, owner: { name: "T", email: "t@example.test" }, chosen: ["tap-list-keeper"], consent: { ai_disclosure_ack: true, tos_version: "1" } });
  assert.equal(order.package.agents[0].builds, "a reader for keg levels");
});

test("a teammate with a new part: the Forge thinks first, keeps the answer, and tells the compiler not to pretend", async () => {
  const w = world(agent("a reader for keg levels"), { part: JSON.stringify(plan), compile: goodSpec() });
  const out = await w.run();
  assert.equal(out.outcome, "next");
  assert.deepEqual(w.calls.map((c) => c.label.split(":")[1]), ["part", "compile"]);
  assert.equal(w.calls[0].tier, "opus");
  assert.match(w.calls[0].prompt, /a reader for keg levels/);
  assert.match(w.calls[1].prompt, /ONE PART IS NOT BUILT YET/);
  assert.match(w.calls[1].prompt, /never says or implies it can already do this part/);
  assert.equal(w.row.quote.part.route, "hardware");
  assert.deepEqual(w.row.quote.part.built_from, [first("channel")], "a block that does not exist is not kept");
  assert.ok(w.row.quote.waitingOn.some((x) => x.id === "new_part" && /scale under each keg/.test(x.setup)), "the founder sees what is missing");
  assert.equal(w.queued[0].stage, "test");
});

test("a retry does not pay for the thinking twice", async () => {
  const w = world(agent("a reader for keg levels"), { part: JSON.stringify(plan), compile: goodSpec() });
  await w.run(); await w.run("compile", 2);
  assert.equal(w.calls.filter((c) => c.label.startsWith("forge:part")).length, 1);
  assert.equal(w.row.quote.part.part, "Keg level reader", "the plan survives the second compile");
});

test("an unreadable or failed think step still keeps the idea, marked for the founder to read", async () => {
  for (const bad of ["not json at all", new Error("model down")]) {
    const w = world(agent("a reader for keg levels"), { part: bad, compile: goodSpec() });
    const out = await w.run();
    assert.equal(out.outcome, "next");
    assert.equal(w.row.quote.part.route, "founder");
    assert.equal(w.row.quote.part.thought, false);
    assert.deepEqual(w.row.quote.part.needs, ["a reader for keg levels"]);
  }
});

test("compose is only accepted when it stands on parts that exist", () => {
  assert.equal(partPlan({ ...plan, route: "compose", built_from: ["made_up_block"] }, "x").route, "founder");
  assert.equal(partPlan({ ...plan, route: "compose" }, "x").route, "compose");
  assert.equal(partPlan({ ...plan, route: "teleport" }, "x").route, "founder");
});

test("an ordinary teammate costs no extra call and gets no note", async () => {
  const w = world(agent(undefined), { compile: goodSpec() });
  await w.run();
  assert.deepEqual(w.calls.map((c) => c.label.split(":")[1]), ["compile"]);
  assert.doesNotMatch(w.calls[0].prompt, /ONE PART IS NOT BUILT YET/);
  assert.equal(w.row.quote.part, undefined);
});

test("the thinking prompt lists the parts Pip has and forbids pretending", () => {
  const p = partPrompt(agent("a reader for keg levels"), "TEST Taproom");
  assert.match(p, new RegExp(first("channel") + ": "));
  assert.match(p, /Never say the part exists/);
  assert.doesNotMatch(p, /\$\d/);
});
