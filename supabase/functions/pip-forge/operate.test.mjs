// The operator lane in the Forge's stage machine, through the real bundled forge.js with the database faked.
//   node --experimental-strip-types --test supabase/functions/pip-forge/operate.test.mjs
// No network, no keys, no model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runForgeJob } from "./forge.js";
import { compileForForge, dryRun, PRIMITIVE_OF } from "../_shared/operate.ts";

const AGENT = (p = "review_requests") => ({ agent_id: `op_${p}`, name: "Ask for reviews", lane: "operate", teammate: { name: "Pip" }, uses: [PRIMITIVE_OF[p], p === "content_social" ? "social_posting" : "email"] });
function world({ flag = true, lane = "operate", agent = AGENT(), spec = {}, reviewer = null } = {}) {
  const w = { rows: { 1: { id: 1, skill_id: agent.agent_id, domain: "fork.test", business: "Fork Plumbing", brain: { lane, agent }, spec, tests: null, quote: {}, status: "draft" } }, queue: [], notes: [], flagReads: 0 };
  w.db = {
    flag: async () => (w.flagReads++, flag),
    getSpec: async (id) => w.rows[id] ?? null,
    updateSpec: async (id, p) => { Object.assign(w.rows[id], p); },
    enqueue: async (j) => { w.queue.push(j); },
    notify: async (id, kind, body) => { w.notes.push({ id, kind, body }); },
    orderAgentsAllAtLeast: async () => false,
    setOrderStatus: async () => {},
    createBox: async () => "box",
  };
  w.deps = { model: async () => { throw new Error("the operator lane must never call the writing model"); }, reviewer, db: w.db, operate: { compile: compileForForge, dryRun } };
  w.run = (stage, attempt = 1) => runForgeJob({ id: 9, order_id: "o1", spec_id: 1, stage, attempt, status: "queued", log: [] }, w.deps);
  return w;
}
const approve = async () => JSON.stringify({ blocking: [], notes: ["fine"] });

test("with the lane off, every stage but go-live stops and writes nothing but the stop", async () => {
  for (const stage of ["compile", "test", "review", "stage"]) {
    const w = world({ flag: false });
    const r = await w.run(stage);
    assert.equal(r.outcome, "founder");
    assert.match(r.detail, /not switched on/);
    assert.equal(w.rows[1].forge_stage, "operate_off");
    assert.equal(w.queue.length, 0);
    assert.equal(w.rows[1].status, "needs_review");
  }
});
test("an operator goes compile, test, review, stage, and ends in the dry-run sandbox", async () => {
  const w = world({ reviewer: approve });
  let r = await w.run("compile");
  assert.equal(r.outcome, "next");
  assert.equal(w.rows[1].spec.operate.process, "review_requests");
  assert.equal(w.queue.at(-1).stage, "test");
  r = await w.run("test");
  assert.equal(r.outcome, "next");
  assert.equal(w.rows[1].tests.ok, true);
  assert.equal(w.queue.at(-1).stage, "review");
  r = await w.run("review");
  assert.equal(r.outcome, "next");
  assert.equal(w.queue.at(-1).stage, "stage");
  r = await w.run("stage");
  assert.equal(w.rows[1].status, "sandbox");
  assert.equal(w.rows[1].forge_stage, "operator_dry_run");
  assert.ok(w.notes.some((n) => n.kind === "awaiting_golive"));
});
test("operators always go through review: with no reviewer nothing is staged", async () => {
  const w = world({ reviewer: null });
  await w.run("compile"); await w.run("test");
  const r = await w.run("review");
  assert.equal(r.outcome, "founder");
  assert.equal(w.rows[1].forge_stage, "review_unavailable");
  assert.notEqual(w.rows[1].status, "sandbox");
  assert.equal(w.queue.some((j) => j.stage === "stage"), false, "no stage job was queued");
});
test("a reviewer's blocking note sends it back to compile, then gives up after the last attempt", async () => {
  const w = world({ reviewer: async () => JSON.stringify({ blocking: ["promises a discount"], notes: [] }) });
  await w.run("compile"); await w.run("test");
  const r = await w.run("review", 1);
  assert.equal(r.outcome, "retry");
  assert.equal(w.queue.at(-1).stage, "compile");
  const last = await w.run("review", 3);
  assert.notEqual(last.outcome, "next");
});
test("a build with no operator primitive fails at compile and does not call the model", async () => {
  const w = world({ agent: { ...AGENT(), uses: ["email"] } });
  const r = await w.run("compile");
  assert.equal(r.outcome, "founder");
  assert.equal(w.rows[1].forge_stage, "compile_failed");
  assert.equal(w.queue.length, 0);
});
test("a failing dry run stops at test with the failing checks named", async () => {
  const w = world({ reviewer: approve });
  await w.run("compile");
  w.rows[1].spec.operate.touches.max = 9;
  const r = await w.run("test");
  assert.equal(r.outcome, "founder");
  assert.equal(w.rows[1].forge_stage, "tests_failed");
  assert.equal(w.queue.some((j) => j.stage === "review"), false, "nothing new was queued");
});
test("without the operate dependency the lane cannot compile", async () => {
  const w = world();
  delete w.deps.operate;
  assert.equal((await w.run("compile")).outcome, "founder");
});
test("every other lane never reads the switch and is unchanged", async () => {
  const w = world({ lane: "spec", agent: { ...AGENT(), lane: "spec" } });
  await w.run("compile").catch(() => {});
  assert.equal(w.flagReads, 0);
});
test("go-live is not blocked by the stage machine's switch (the gate in forge-check decides)", async () => {
  const w = world({ flag: false });
  const r = await w.run("golive");
  assert.equal(r.outcome, "done");
  assert.equal(w.flagReads, 0);
});
