// pip-forge's two doors, through the real index.ts (and the real bundled forge.js) with the database and the model
// faked: the founder console's Go live button, and a spec the API-key engine saves.
//   node --experimental-strip-types --test supabase/functions/pip-forge/golive.test.mjs
// No network, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootForge, IDS, tables } from "../pip-forge-mcp/harness.mjs";

const example = (name) => JSON.parse(readFileSync(new URL(`../../../docs/contracts/examples/${name}`, import.meta.url), "utf8"));
const f = await bootForge();
const BOARD = { seats: { gate: { system_prompt: "You are Hallie, the front desk for TEST Fork." } } };
const stored = (s) => { const t = tables(); t.skill_specs[0].spec = s; t.skill_specs[0].status = "sandbox"; f.reset(t); };
const spec = () => f.row("skill_specs", IDS.spec);

test("the console's Go live works for an older-shape teammate, as it does today", async () => {
  for (const s of [{ board: BOARD }, { name: "Front desk", agent: { persona: "You are the front desk.", tools: [] } }]) {
    stored(s);
    const r = await f.console("golive", IDS.spec);
    assert.deepEqual([r.status, r.json], [200, { ok: true, outcome: "done" }]);
    assert.equal(spec().status, "live");
    assert.equal(f.world.reads.some((t) => /catalog/.test(t)), false);
  }
});

test("the console's Go live works for a valid new-style teammate", async () => {
  stored({ board: BOARD, ...example("daily-sheet-line.json") });
  const r = await f.console("golive", IDS.spec);
  assert.equal(r.status, 200);
  assert.equal(spec().status, "live");
});

test("the console's Go live is refused for a failing contract, with the reason, and nothing is switched on", async () => {
  const b = example("front-desk.json"); b.jobs[0].tools[4].can = ["read", "delete"];
  stored({ board: BOARD, ...b });
  const r = await f.console("golive", IDS.spec);
  assert.equal(r.status, 409);
  assert.equal(r.json.ok, false);
  assert.match(r.json.error, /do not pass the teammate contract as it stands today.*"delete" is never allowed/);
  assert.equal(spec().status, "sandbox");
  assert.deepEqual(f.changes(), []);
});

test("the console's Go live is refused when a job's required tool has nothing behind it", async () => {
  stored({ board: BOARD, ...example("stock-reorder.json") });
  const r = await f.console("golive", IDS.spec);
  assert.equal(r.status, 409);
  assert.match(r.json.error, /Point of sale: Pip cannot act there yet/);
  assert.equal(spec().status, "sandbox");
  assert.deepEqual(f.changes(), []);
});

test("the other console buttons are untouched", async () => {
  stored({ board: BOARD, ...example("stock-reorder.json") });
  spec().status = "live";
  const r = await f.console("pause", IDS.spec);
  assert.deepEqual([r.status, r.json], [200, { ok: true }]);
  assert.equal(spec().status, "paused");
});

test("a spec the API-key engine compiles still saves, and its record says it has no declared jobs", async () => {
  const t = tables();
  t.skill_specs[0] = { ...t.skill_specs[0], status: "draft", forge_stage: "queued", business: "TEST Fork", spec: {},
    brain: { facts: ["Open 9 to 5."], qa: [], lane: "spec", agent: { name: "Front desk", teammate: { name: "Hallie" }, uses: ["web_chat", "capture_lead"], presented: { tagline: "Answers the door." } } } };
  f.reset(t);
  f.world.rpc.claim_build_job = () => [{ id: 7, order_id: IDS.order, spec_id: IDS.spec, stage: "compile", attempt: 1, status: "running", log: [] }];
  // What the model hands back: a Skill Spec, with a made-up `jobs` key the engine's own cleaner drops.
  f.world.model = () => JSON.stringify({
    skill_id: "front-desk", name: "Front desk", version: 1, goal: "Answer customers and take their details.", channels: ["web_chat"], triggers: ["inbound_message"], connections: [],
    agent: { model: "fast", persona: "You are Hallie, the front desk for TEST Fork. You answer questions from the facts on file, take the customer's details, and never quote a price that is not on file.", tools: ["capture_lead"] },
    guardrails: { never: ["quote a price that is not on file"], escalate_on: ["lawyer"] },
    tests: [{ say: "Are you open?", expect: ["gives the hours"] }, { say: "How much?", expect: ["does not state a price"] }, { say: "I want a lawyer", expect: ["hands off"] }],
    contract: "teammate/1", jobs: [{ id: "x" }],
  });
  const r = await f.post("/run");
  assert.equal(r.status, 200);
  await f.settle();
  const s = spec();
  assert.equal(s.forge_stage, "compiled", JSON.stringify(f.world.log.filter((w) => w.table === "build_jobs")).slice(0, 400));
  assert.equal(s.status, "testing");
  assert.equal(s.spec.agent.tools[0], "capture_lead", "the compiled Skill Spec is saved as before");
  assert.equal("contract" in s.spec || "jobs" in s.spec, false, "the engine's cleaner keeps only the Skill Spec's own keys");
  assert.equal(s.spec.forge_check.declared, false);
  assert.equal(typeof s.spec.forge_check.at, "string");
  assert.deepEqual(f.world.outside, []);
});
