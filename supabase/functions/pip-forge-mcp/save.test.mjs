// The teammate contract on every build, through the real founder connector (index.ts) with the database faked.
//   node --experimental-strip-types --test supabase/functions/pip-forge-mcp/save.test.mjs
// No network, no keys. The decisions themselves are tested in ../_shared/forge-check.test.ts; this file proves the
// connector asks them and that a refusal writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootConnector, IDS, tables } from "./harness.mjs";

const example = (name) => JSON.parse(readFileSync(new URL(`../../../docs/contracts/examples/${name}`, import.meta.url), "utf8"));
const f = await bootConnector();
const BOARD = { seats: { gate: { system_prompt: "You are Hallie, the front desk for TEST Fork." } }, tests: { passed: 5, total: 5 } };
const save = (more = {}) => f.tool("forge_save", { order_id: IDS.order, agent_id: "front-desk", status: "sandbox", result: BOARD, ...more });
const spec = () => f.row("skill_specs", IDS.spec);
/** Puts a spec straight onto the record, as if it had been saved before today's rules (or through another door). */
const stored = (s, status = "sandbox") => { const t = tables(); t.skill_specs[0].spec = s; t.skill_specs[0].status = status; f.reset(t); };
const broken = () => { const b = example("front-desk.json"); b.jobs[0].tools[4].can = ["read", "delete"]; b.jobs[1].surprise = true; return b; };

test("the builder is told how to write jobs: in the save tool, when it takes an order, and when it connects", async () => {
  const { tools } = await f.rpc("tools/list");
  const t = tools.find((x) => x.name === "forge_save");
  assert.deepEqual(Object.keys(t.inputSchema.properties).sort(), ["agent_id", "contract", "jobs", "note", "order_id", "result", "status"]);
  assert.deepEqual(t.inputSchema.properties.contract.enum, ["teammate/1"]);
  assert.deepEqual(t.inputSchema.required, ["order_id"], "a save with no jobs is still a valid call");
  for (const must of [/Every thing the owner asked for becomes a job/, /never a pretend ability/, /refused/, /docs\/contracts\/teammate-spec\.md/, /docs\/contracts\/examples/]) assert.match(t.description, must);
  assert.match(t.inputSchema.properties.jobs.description, /triggers.*tools.*read, add, update/);
  f.reset();
  const take = await f.tool("forge_take", { order_id: IDS.order });
  assert.equal(take.out.jobs_guide.contract, "teammate/1");
  assert.match(take.out.jobs_guide.rule, /Every thing the owner asked for becomes a job/);
  assert.equal(take.out.agents[0].jobs_check, null, "nothing has been checked for this teammate yet");
  const init = await f.rpc("initialize", { protocolVersion: "2025-06-18" });
  assert.match(init.instructions, /write its jobs \(contract teammate\/1\) and send them with forge_save/);
});

test("a valid new-style build saves: contract and jobs at the top of the spec, beside the Board's work", async () => {
  f.reset();
  const jobs = example("front-desk.json");
  const r = await save(jobs);
  assert.equal(r.ok, true, r.text);
  assert.equal(r.out.jobs, "declared and checked");
  const s = spec();
  assert.equal(s.status, "sandbox");
  assert.equal(s.spec.contract, "teammate/1");
  assert.deepEqual(s.spec.jobs, jobs.jobs);
  assert.equal(s.spec.board.seats.gate.system_prompt, BOARD.seats.gate.system_prompt, "pip-turn still finds the Board's prompt where it looks");
  assert.equal(s.spec.board.status, "sandbox");
  assert.equal("jobs" in s.spec.board || "contract" in s.spec.board, false, "jobs are not buried inside the Board's own notes");
  assert.deepEqual(s.tests, BOARD.tests);
  assert.equal(s.spec.forge_check.declared, true);
  // The honest gaps come back with the save, as plain lines.
  assert.ok(r.out.can_run.includes("Front desk: Calendar: ready. Pip can see busy times there once the owner has connected it."));
  assert.ok(r.out.can_run.some((l) => /Booking follow-up: Email: A job that starts on its own cannot send messages there yet\. The job carries on without it\./.test(l)));
  assert.deepEqual(r.out.blocks_golive, [], "nothing this teammate cannot do without is missing");
  assert.equal(f.row("build_orders", IDS.order).status, "awaiting_golive", "the rest of the save behaves as before");
  const take = await f.tool("forge_take", { order_id: IDS.order });
  assert.equal(take.out.agents[0].jobs_check.declared, true, "the Board can see what the Forge recorded");
});

test("a save with gaps is not blocked: the gaps are returned, and the ones that stop go-live are named", async () => {
  f.reset();
  const r = await save(example("stock-reorder.json"));
  assert.equal(r.ok, true, r.text);
  assert.equal(spec().status, "sandbox");
  assert.ok(r.out.can_run.some((l) => /Point of sale: Pip cannot act there yet/.test(l)));
  assert.equal(r.out.blocks_golive.length, 3);
  assert.deepEqual(spec().spec.forge_check.blocks_golive, r.out.blocks_golive);
});

test("a broken build is refused with every problem in plain words, and nothing is written", async () => {
  for (const status of ["sandbox", "building", "needs_you"]) {
    f.reset();
    const before = JSON.stringify(f.world.tables);
    const r = await save({ ...broken(), status });
    assert.equal(r.ok, false);
    assert.match(r.text, /^Not saved\. These jobs do not pass the teammate contract\./);
    assert.match(r.text, /- jobs\[0\] \(front_desk\)\.tools\[4\]: "delete" is never allowed\. A job can read, add or update\. Nothing else, and never delete\./);
    assert.match(r.text, /- jobs\[1\] \(booking_follow_up\): "surprise" is not part of the contract\./, "the second job's problem is listed too, not only the first");
    assert.deepEqual(f.changes(), [], "no row was changed or added anywhere");
    assert.equal(JSON.stringify(f.world.tables), before);
  }
});

test("a refusal is not cut short: a long list of problems reaches the builder", async () => {
  f.reset();
  const b = example("front-desk.json");
  for (let i = 0; i < 30; i++) b.jobs[0][`made_up_key_${i}`] = 1;
  const r = await save(b);
  assert.equal(r.ok, false);
  assert.ok(r.text.length > 1500);
  assert.match(r.text, /"made_up_key_29" is not part of the contract/);
});

test("jobs with no contract name, or sent for the whole team, are refused and nothing is written", async () => {
  f.reset();
  const half = await save({ jobs: example("front-desk.json").jobs });
  assert.equal(half.ok, false);
  assert.match(half.text, /contract must be "teammate\/1"/);
  const team = await f.tool("forge_save", { order_id: IDS.order, result: { plan: "x" }, ...example("front-desk.json") });
  assert.equal(team.ok, false);
  assert.match(team.text, /jobs belong to one teammate/);
  assert.deepEqual(f.changes(), []);
});

test("an older-shape build still saves, and the record says it has no declared jobs", async () => {
  f.reset();
  const r = await save();
  assert.equal(r.ok, true, r.text);
  assert.equal(r.out.jobs, "none declared");
  assert.match(r.out.can_run[0], /^No declared jobs\. This teammate runs the older way/);
  assert.deepEqual(r.out.blocks_golive, []);
  const s = spec();
  assert.equal(s.status, "sandbox");
  assert.equal(s.spec.board.seats.gate.system_prompt, BOARD.seats.gate.system_prompt);
  assert.equal("contract" in s.spec || "jobs" in s.spec, false);
  assert.equal(s.spec.forge_check.declared, false);
  assert.equal(f.world.log.some((w) => w.op === "patch" && w.table === "skill_specs"), true);
  // The team-level save is untouched.
  const team = await f.tool("forge_save", { order_id: IDS.order, result: { plan: "x" } });
  assert.deepEqual(team.out, { ok: true, saved: "team" });
});

test("jobs tucked inside result are not run, and the save says so instead of staying quiet", async () => {
  f.reset();
  const r = await save({ result: { ...BOARD, ...example("front-desk.json") } });
  assert.equal(r.ok, true);
  assert.equal(r.out.jobs, "none declared");
  assert.match(r.out.note, /Jobs only count when sent as contract and jobs beside result/);
  assert.equal("jobs" in spec().spec, false);
});

test("a later save with no jobs keeps the ones on the record; one that no longer passes cannot be marked ready", async () => {
  f.reset();
  await save(example("front-desk.json"));
  const again = await save({ status: "needs_you", note: "waiting on the owner" });
  assert.equal(again.ok, true);
  assert.equal(again.out.jobs, "declared and checked");
  assert.equal(spec().spec.jobs.length, 2);
  stored({ board: BOARD, ...broken() }, "testing");
  const ready = await save();
  assert.equal(ready.ok, false);
  assert.match(ready.text, /no longer pass the teammate contract, so it cannot be marked ready/);
  assert.deepEqual(f.changes(), []);
  const failed = await save({ status: "failed" });
  assert.equal(failed.ok, true, "the Board can still record that the build failed");
  assert.equal(failed.out.jobs, "declared, but they no longer pass the contract check");
  assert.equal(spec().spec.forge_check.ok, false);
});

// ---------- go-live ----------
const golive = (more = {}) => f.tool("forge_golive", { order_id: IDS.order, ...more });

test("go-live works for a valid new-style teammate", async () => {
  stored({ board: BOARD, ...example("front-desk.json") });
  const r = await golive();
  assert.deepEqual(r.out, { ok: true, agents: [{ id: "front-desk", live: true, declared_jobs: true }] });
  assert.equal(spec().status, "live");
  assert.equal(f.row("build_orders", IDS.order).status, "live");
});

test("go-live works for an older-shape teammate, as it does today, without reading the catalogs", async () => {
  for (const s of [{ board: BOARD }, { board: BOARD, forge_check: { declared: false } }, { name: "Front desk", agent: { persona: "You are the front desk.", tools: [] } }]) {
    stored(s);
    const r = await golive();
    assert.deepEqual(r.out, { ok: true, agents: [{ id: "front-desk", live: true, declared_jobs: false }] });
    assert.equal(spec().status, "live");
    assert.equal(f.world.reads.some((t) => /catalog/.test(t)), false, "today's go-live gains no new way to fail");
  }
});

test("go-live is refused when the contract check fails at that moment, and nothing is switched on", async () => {
  // On the record with a note saying it passed: the contract may have tightened since the build.
  stored({ board: BOARD, ...broken(), forge_check: { declared: true, ok: true, lines: [], blocks_golive: [] } });
  for (const how of [{}, { agent_id: "front-desk" }]) {
    const r = await golive(how);
    assert.equal(r.out.ok, false);
    assert.equal(r.out.agents[0].live, false);
    assert.match(r.out.agents[0].why, /do not pass the teammate contract as it stands today/);
    assert.match(r.out.agents[0].why, /"delete" is never allowed/);
    assert.equal(spec().status, "sandbox");
    assert.deepEqual(f.writes("skill_specs"), []);
    assert.notEqual(f.row("build_orders", IDS.order).status, "live");
  }
});

test("go-live is refused when a job's required tool has nothing behind it", async () => {
  stored({ board: BOARD, ...example("stock-reorder.json") });
  const r = await golive();
  assert.equal(r.out.ok, false);
  assert.match(r.out.agents[0].why, /A job needs a tool that has nothing behind it yet/);
  assert.match(r.out.agents[0].why, /Point of sale: Pip cannot act there yet/);
  assert.equal(spec().status, "sandbox");
  assert.deepEqual(f.writes("skill_specs"), []);
  // A reviewed tool that is switched off does not count, and neither does one found automatically.
  stored({ board: BOARD, ...example("daily-sheet-line.json") });
  f.world.tables.tool_catalog.find((t) => t.block === "data_sink").enabled = false;
  assert.equal((await golive()).out.ok, false);
  assert.equal(spec().status, "sandbox");
});

test("go-live fails closed when what exists cannot be read", async () => {
  stored({ board: BOARD, ...example("daily-sheet-line.json") });
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).includes("tool_catalog") ? Promise.resolve(new Response(JSON.stringify({ message: "database down" }), { status: 500 })) : real(url, init));
  try {
    const r = await golive();
    assert.equal(r.out.ok, false);
    assert.match(r.out.agents[0].why, /database down/);
    assert.equal(spec().status, "sandbox");
  } finally { globalThis.fetch = real; }
});

test("on one order, a teammate that passes goes live and one that does not stays off", async () => {
  const t = tables();
  t.skill_specs[0].status = "sandbox";
  t.skill_specs[0].spec = { board: BOARD, ...example("stock-reorder.json") };
  t.skill_specs.push({ ...structuredClone(t.skill_specs[0]), id: IDS.spec2, skill_id: "daily-line", spec: { board: BOARD, ...example("daily-sheet-line.json") } });
  f.reset(t);
  const r = await golive();
  assert.equal(r.out.ok, true);
  assert.deepEqual(r.out.agents.map((a) => [a.id, a.live]), [["front-desk", false], ["daily-line", true]]);
  assert.equal(f.row("skill_specs", IDS.spec2).status, "live");
  assert.equal(spec().status, "sandbox");
  assert.equal(f.row("build_orders", IDS.order).status, "building", "the order is not live while one teammate is held back");
});

test("the database's own go-live refusals still come through as before", async () => {
  stored({ board: BOARD });
  f.world.refuse = { skill_specs: "shelf: Twilio is not funded yet" };
  const r = await golive();
  assert.deepEqual(r.out.agents, [{ id: "front-desk", live: false, why: "Twilio is not funded yet" }]);
});

test("the connector talks to nobody but its own database in these flows", () => {
  assert.deepEqual(f.world.outside, []);
});
