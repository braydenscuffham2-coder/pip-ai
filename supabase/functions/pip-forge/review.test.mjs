// The Forge's independent review: who did it is written down, and an answer that cannot be read is never a pass.
// Run: node --test supabase/functions/pip-forge/review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runForgeJob } from "./forge.js";

const SPEC = { skill_id: "front-desk", name: "Front desk", version: 1, goal: "Answer the phone", channels: [], triggers: [], connections: [], agent: { persona: "You answer calls.", tools: [] }, guardrails: { never: [], escalate_on: [] }, tests: [] };
function world(reviewer, lane = "spec") {
  const w = { row: { id: 1, skill_id: "front-desk", business: "TEST Shop", brain: { lane, agent: { agent_id: "front-desk", name: "Front desk", lane, uses: [], presented: {} }, facts: [], qa: [] }, spec: SPEC, tests: { total: 4, passed: 4, ratio: 1, cases: [] }, quote: {}, status: "draft" }, queue: [], notes: [], asked: 0 };
  const db = { flag: async () => true, getSpec: async () => w.row, updateSpec: async (_id, p) => { Object.assign(w.row, p); }, enqueue: async (j) => { w.queue.push(j); }, notify: async (id, kind, body) => { w.notes.push({ id, kind, body }); }, orderAgentsAllAtLeast: async () => false, setOrderStatus: async () => {}, createBox: async () => "box" };
  const counted = reviewer && Object.assign(async (p) => { w.asked++; return reviewer(p); }, reviewer.label ? { label: reviewer.label } : {});
  w.run = (attempt = 1) => runForgeJob({ id: 9, order_id: "o1", spec_id: 1, stage: "review", attempt, status: "queued", log: [] }, { model: async () => { throw new Error("the review stage must not call the writing model"); }, reviewer: counted, db });
  return w;
}
const says = (answer, label) => Object.assign(async () => answer, label ? { label } : {});
const OK = JSON.stringify({ blocking: [], notes: ["the tests cover the price case"] });

test("a review on Pip's own key is recorded under its own name, and a clean one moves the build on", async () => {
  const w = world(says(OK, "claude-opus"));
  const out = await w.run();
  assert.equal(out.outcome, "next"); assert.equal(out.detail, "1 notes");
  assert.deepEqual(w.row.review, { blocking: [], notes: ["the tests cover the price case"], reviewer: "claude-opus" });
  assert.deepEqual(w.queue.map((j) => j.stage), ["stage"]); assert.equal(w.asked, 1);
});

test("a reviewer with no label is the second vendor's, as before", async () => {
  const w = world(says(OK));
  await w.run();
  assert.equal(w.row.review.reviewer, "openai");
});

test("a blocking finding sends the build back to be fixed, and after the last attempt it goes to the founder", async () => {
  const blocked = JSON.stringify({ blocking: ["promises a 20 minute arrival"], notes: [] });
  const w = world(says(blocked, "claude-opus"));
  const first = await w.run(1);
  assert.equal(first.outcome, "retry"); assert.deepEqual(w.queue.map((j) => [j.stage, j.attempt]), [["compile", 2]]);
  assert.deepEqual(w.queue[0].log.at(-1).errors, ["reviewer: promises a 20 minute arrival"]);
  const last = world(says(blocked, "claude-opus"));
  const out = await last.run(3);
  assert.equal(out.outcome, "founder"); assert.equal(last.row.status, "needs_review"); assert.equal(last.row.forge_stage, "review_blocked");
  assert.deepEqual(last.notes.map((n) => n.kind), ["needs_founder"]); assert.deepEqual(last.queue, []);
});

test("an answer that cannot be read is asked for once more, and is never counted as a pass", async () => {
  let n = 0;
  const flaky = Object.assign(async () => (++n === 1 ? "I looked at it and it seems fine." : OK), { label: "claude-opus" });
  const w = world(flaky);
  await w.run();
  assert.equal(w.asked, 2); assert.equal(w.row.review.reviewer, "claude-opus"); assert.equal(w.row.review.skipped, undefined);

  for (const junk of ["", "no json here", JSON.stringify({ notes: ["no blocking key"] }), JSON.stringify({ blocking: "none" })]) {
    const bad = world(says(junk, "claude-opus"));
    const out = await bad.run();
    assert.equal(bad.asked, 2, "asked twice, no more");
    assert.match(bad.row.review.skipped, /could not be read/); assert.equal(bad.row.review.reviewer, "claude-opus");
    assert.equal(out.outcome, "next", "a written teammate still moves on, with the skip on its record");
    assert.match(out.detail, /could not be read/);
  }
});

test("an operator is never staged on a review that did not happen", async () => {
  for (const reviewer of [null, says("not json", "claude-opus")]) {
    const w = world(reviewer, "operate");
    const out = await w.run();
    assert.equal(out.outcome, "founder"); assert.equal(w.row.forge_stage, "review_unavailable"); assert.deepEqual(w.queue, []);
  }
});

test("the key engine always has a reviewer: with no second vendor's key it reviews on Opus", () => {
  const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(src, /const reviewer = OPENAI \? openaiModel\(\{ apiKey: OPENAI \}\) : Object\.assign\(\(prompt: string\) => model\(prompt, 'opus', 'forge:review'\), \{ label: 'claude-opus' \}\);/);
  assert.doesNotMatch(src, /reviewer = OPENAI \?[^\n]*: null/);
});
