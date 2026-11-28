// The Forge's independent review: who did it is written down, and an answer that cannot be read is never a pass.
// Run: node --test supabase/functions/pip-forge/review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderConsole, runForgeJob } from "./forge.js";
import { unsettled } from "../_shared/forge-check.ts";

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
  assert.deepEqual(w.row.review, { blocking: [], before_golive: [], notes: ["the tests cover the price case"], reviewer: "claude-opus" });
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

// ---- two lists: what a rewrite can fix, and what only a person can settle ----
const HOURS = "The shop's hours are not loaded: load Saturday hours before it is switched on.";
const SHOWN = "The owner was shown a teammate that follows up on estimates; this build only answers people who write in. Tell the owner and get their yes.";

test("what only a person can settle does not send the build back: it is staged, and the list is kept", async () => {
  const w = world(says(JSON.stringify({ blocking: [], before_golive: [HOURS, SHOWN, "  "], notes: ["fine"] }), "claude-opus"));
  const out = await w.run();
  assert.equal(out.outcome, "next"); assert.equal(out.detail, "1 notes, 2 to settle before go-live");
  assert.deepEqual(w.row.review.before_golive, [HOURS, SHOWN]); assert.deepEqual(w.queue.map((j) => j.stage), ["stage"]);
});

test("a spec defect still sends it back, whatever else is listed", async () => {
  const w = world(says(JSON.stringify({ blocking: ["says it stopped texts, and it has no texting"], before_golive: [HOURS], notes: [] }), "claude-opus"));
  const out = await w.run(1);
  assert.equal(out.outcome, "retry"); assert.deepEqual(w.queue.map((j) => j.stage), ["compile"]);
  assert.deepEqual(w.queue[0].log.at(-1).errors, ["reviewer: says it stopped texts, and it has no texting"], "only what a rewrite can fix goes to the rewrite");
});

test("the reviewer is told where the build is and how to sort what it finds", async () => {
  let seen = "";
  const w = world(Object.assign(async (p) => { seen = p; return OK; }, { label: "claude-opus" }));
  await w.run();
  assert.match(seen, /staged in a sandbox/); assert.match(seen, /not loaded yet is expected at this point and is not a defect/);
  assert.match(seen, /"blocking": something wrong in the compiled spec that rewriting it can fix/);
  assert.match(seen, /"before_golive": something only the owner or Pip's founder can settle/);
  assert.match(seen, /A rewrite can change only the persona, the opener, the never rules, the escalation phrases and the tests \(fix one or add one\)/);
  assert.match(seen, /a test can only judge the reply and the names of the tools used/); assert.match(seen, /Give the 6 that matter most/);
  assert.match(seen, /Return JSON: \{"blocking": \[one line each\], "before_golive": \[one line each\], "notes": \[one line each\]\}/);
});

test("go-live is refused, with the list, until the tap says they are settled", () => {
  const review = { blocking: [], before_golive: [HOURS, SHOWN], notes: [], reviewer: "claude-opus" };
  const no = unsettled(review, false);
  assert.equal(no[0], "The review raised things only you or the owner can settle. Nothing was switched on.");
  assert.deepEqual(no.slice(1, 3), [`- ${HOURS}`, `- ${SHOWN}`]); assert.match(no.at(-1), /say they are settled/);
  assert.equal(unsettled(review, true), null);
  for (const v of [undefined, "true", 1, null]) assert.ok(unsettled(review, v), "only a plain true settles it");
  for (const r of [null, undefined, {}, { before_golive: [] }, { before_golive: ["", "  "] }, { before_golive: "hours" }, { skipped: "none" }, []]) assert.equal(unsettled(r, false), null, JSON.stringify(r));
});

test("both go-live paths ask the same question, and the console shows the list with a box to tick", () => {
  const forge = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(forge, /const open = unsettled\(\(spec as any\)\.review, b\?\.settled === true\);\n\s+if \(open\) return json\(\{ ok: false, error: open\.join\(' '\)/);
  const mcp = readFileSync(new URL("../pip-forge-mcp/index.ts", import.meta.url), "utf8");
  assert.match(mcp, /const open = unsettled\(s\.review, a\?\.settled === true\);\n\s+if \(open\) \{ out\.push\(\{ id: s\.skill_id, live: false, before_golive: true/);
  assert.match(mcp, /select=id,skill_id,status,spec,review`/);
  assert.ok(mcp.indexOf("const open = unsettled(") < mcp.indexOf("await patch('skill_specs', `id=eq.${s.id}`, { status: 'live'"), "asked before anything is switched on");
  const page = renderConsole([{ id: "o1", code: "PIP-TEST", domain: "x.test", status: "awaiting_golive", created_at: "2026-11-28T00:00:00Z", order: { business: { name: "TEST Shop" }, owner: { name: "Test Owner" }, package: { agents: [{ agent_id: "front-desk", name: "Front desk", uses: [], presented: {} }] } }, specs: [{ id: "s1", order_id: "o1", skill_id: "front-desk", status: "sandbox", forge_stage: "sandbox", tests: null, quote: {}, review: { blocking: [], before_golive: [HOURS], notes: [], reviewer: "claude-opus" } }] }], "tok");
  assert.match(page, /1 to settle before go-live/); assert.ok(page.includes("Saturday hours"));
  assert.match(page, /id="settled-s1"/); assert.match(page, /body:JSON\.stringify\(\{note,settled\}\)/);
});
