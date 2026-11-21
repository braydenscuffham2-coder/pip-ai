// A save that brings no result must not erase the Board's stored work for that teammate.
// The real index.ts, with the database faked.
//   node --experimental-strip-types --test supabase/functions/pip-forge-mcp/keep-board.test.mjs
// No network, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootConnector, IDS, tables } from "./harness.mjs";

const example = (name) => JSON.parse(readFileSync(new URL(`../../../docs/contracts/examples/${name}`, import.meta.url), "utf8"));
const f = await bootConnector();
const PROMPT = "You are Hallie, the front desk for TEST Fork. Never quote a price that is not on file.";
/** What a finished Board build left on the record: its seats, its own keys, and the tests and quote columns. */
const BOARD = { seats: { gate: { system_prompt: PROMPT, critical: 0 }, voice: { never_says: ["cheap"] }, planner_2: { cases: [{ say: "Are you open?" }] } }, integration: [{ block: "calendar" }], tests: { passed: 5, total: 5 }, status: "sandbox", saved_at: "2026-11-18T10:00:00.000Z", note: "ready for go-live" };
const TESTS = { passed: 5, total: 5 }, QUOTE = { integration: [{ block: "calendar" }] };
function built() {
  const t = tables();
  Object.assign(t.skill_specs[0], { status: "sandbox", forge_stage: "board:sandbox", tests: structuredClone(TESTS), quote: structuredClone(QUOTE), spec: { board: structuredClone(BOARD), redteam: { passed: 9, total: 10 } } });
  f.reset(t);
}
const save = (more = {}) => f.tool("forge_save", { order_id: IDS.order, agent_id: "front-desk", ...more });
const row = () => f.row("skill_specs", IDS.spec);
/** The Board's own work on the record: everything under board except the three things every save stamps. */
const work = () => { const { status: _s, saved_at: _t, note: _n, ...rest } = row().spec.board; return rest; };
const WORK = (() => { const { status: _s, saved_at: _t, note: _n, ...rest } = BOARD; return rest; })();
/** The one write a save makes to the teammate's row. */
const written = () => f.writes("skill_specs").filter((w) => w.op === "patch")[0].body;

test("a save with jobs and no result keeps the Board's work, and adds the jobs", async () => {
  built();
  const jobs = example("front-desk.json");
  const r = await save({ status: "sandbox", ...jobs });
  assert.equal(r.ok, true, r.text);
  assert.equal(r.out.board, "kept as stored");
  assert.equal(r.out.jobs, "declared and checked");
  assert.deepEqual(work(), WORK, "nothing of the Board's work is lost");
  assert.equal(row().spec.board.seats.gate.system_prompt, PROMPT, "pip-turn still finds the instructions it runs");
  assert.deepEqual(row().spec.jobs, jobs.jobs);
  assert.deepEqual(row().spec.redteam, { passed: 9, total: 10 });
  assert.equal(row().status, "sandbox");
});

test("with no result, the tests and quote columns are not written at all", async () => {
  built();
  await save({ status: "sandbox", ...example("front-desk.json") });
  assert.deepEqual(Object.keys(written()).sort(), ["forge_stage", "spec", "status", "updated_at"], "only these columns are sent to the database");
  assert.deepEqual([row().tests, row().quote], [TESTS, QUOTE]);
});

test("a save with only a status keeps the Board's work and changes the status, the time and the note", async () => {
  built();
  const r = await save({ status: "needs_you", note: "waiting on the owner's calendar" });
  assert.equal(r.ok, true, r.text);
  assert.equal(r.out.board, "kept as stored");
  assert.deepEqual(work(), WORK);
  const b = row().spec.board;
  assert.deepEqual([b.status, b.note], ["needs_you", "waiting on the owner's calendar"]);
  assert.ok(b.saved_at > BOARD.saved_at, "the time is this save's");
  assert.deepEqual([row().status, row().forge_stage], ["needs_review", "board:needs_you"]);
  // The note belongs to one save. A later save with no note does not carry an old one forward, the same as a save with a result.
  await save({ status: "paused" });
  assert.equal("note" in row().spec.board, false);
  assert.deepEqual(work(), WORK, "and the work survives a second save too");
});

test("a result that is not an object counts as no result", async () => {
  for (const result of [null, undefined, "", "sandbox", 0, false]) {
    built();
    const r = await save({ status: "sandbox", result });
    assert.equal(r.ok, true, r.text);
    assert.deepEqual(work(), WORK, `result: ${JSON.stringify(result)}`);
    assert.deepEqual([row().tests, row().quote], [TESTS, QUOTE]);
  }
});

test("a save with a result replaces the Board's work, as before", async () => {
  built();
  const next = { seats: { gate: { system_prompt: "You are Hallie, version two." } }, tests: { passed: 7, total: 7 }, integration: [{ block: "email" }] };
  const r = await save({ status: "sandbox", result: next, note: "second build" });
  assert.equal(r.out.board, "replaced with this result");
  assert.deepEqual(work(), next, "the old seats and keys are gone; only the new result is there");
  assert.equal(row().spec.board.note, "second build");
  assert.deepEqual([row().tests, row().quote], [{ passed: 7, total: 7 }, { integration: [{ block: "email" }] }], "tests and quote are written from the result, as before");
  assert.deepEqual(row().spec.redteam, { passed: 9, total: 10 });
});

test("an empty result is still a result: it replaces, as before", async () => {
  built();
  const r = await save({ status: "building", result: {} });
  assert.equal(r.out.board, "replaced with this result");
  assert.deepEqual(work(), {});
  assert.deepEqual([row().tests, row().quote], [TESTS, QUOTE], "and with nothing in it, tests and quote are left alone, as before");
});

test("a teammate with nothing stored yet can still be saved without a result", async () => {
  for (const spec of [{}, { board: null }, { board: "x" }, { board: ["x"] }]) {
    const t = tables(); t.skill_specs[0].spec = spec; f.reset(t);
    const r = await save({ status: "building", note: "started" });
    assert.equal(r.ok, true, r.text);
    assert.deepEqual(Object.keys(row().spec.board).sort(), ["note", "saved_at", "status"]);
  }
});

test("a refused save with no result changes nothing", async () => {
  built();
  const before = JSON.stringify(f.world.tables);
  const r = await save({ status: "sandbox", contract: "teammate/1", jobs: [{ id: "x" }] });
  assert.equal(r.ok, false);
  assert.deepEqual(f.changes(), []);
  assert.equal(JSON.stringify(f.world.tables), before);
});

test("a sandbox save with no result files the kept work in the library, not an empty one", async () => {
  built();
  const b = f.world.tables.build_orders[0];
  b.brief = { business: "TEST Fork", industry: "restaurant", agents: [{ id: "front-desk", name: "Front desk", power: "answers", lane: "spec", uses: ["calendar"], teammate: { name: "Hallie" } }] };
  await save({ status: "sandbox", ...example("front-desk.json") });
  const [lib] = f.world.tables.agent_library;
  assert.ok(lib, "a skeleton was filed");
  assert.match(lib.skeleton.system_prompt, /Never quote a price that is not on file\./);
});
