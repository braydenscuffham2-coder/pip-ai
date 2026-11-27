// One connection for a whole setup: the runner and the lingerer, with a fake clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BROWSER_STATES, linger, OUT_OF_TIME, runSolo, SOLO, type SoloDeps } from "./solo.ts";
import type { Outcome, SetupRow } from "./engine.ts";

const base = (o: Partial<SetupRow> = {}): SetupRow => ({ id: "s1", business_id: "b1", tool: "Tool", tool_key: "tool", login_url: "https://tool.example/login", mode: "browser", state: "opening", reason: null, step: 0, plan: {}, browser_session_id: null, browser_context_id: null, consent_at: "x", composio_done: false, cost_usd: 0, cost_cap_usd: 1, owner_taps: 0, result: null, log: [], created_at: "x", ...o });

/** A world with one row, a clock, and a scripted step function. */
function world(row: SetupRow, script: (r: SetupRow, w: any) => Outcome | Promise<Outcome>) {
  const w: any = { row, t: 0, steps: [] as string[], saves: [] as any[], closed: [] as string[], beats: 0, sleeps: 0, beatOk: true, loadFails: 0, onSleep: null as null | ((w: any) => void) };
  const d: SoloDeps = {
    async load() { if (w.loadFails > 0) { w.loadFails--; throw new Error("read failed"); } return w.row ? { ...w.row } : null; },
    async step(r) { w.steps.push(r.state); w.t += 2000; return await script(r, w); },
    async save(patch, ifState) { if (!w.row || w.row.state !== ifState) { w.saves.push({ refused: ifState }); return false; } w.row = { ...w.row, ...patch }; w.saves.push(patch); return true; },
    async beat() { w.beats++; return w.beatOk; },
    async closeBrowser(id) { w.closed.push(id); },
    async sleep(ms) { w.t += ms; w.sleeps++; w.onSleep?.(w); },
    now: () => w.t,
  };
  return { w, d };
}
const flow: Record<string, Outcome> = {
  opening: { patch: { state: "find_login", browser_session_id: "sess1", browser_context_id: "ctx1" }, next: "again" },
  find_login: { patch: { state: "owner_control", reason: "Your turn" }, next: "wait" },
  verify: { patch: { state: "configuring", step: 0 }, next: "again" },
  configuring: { patch: { state: "testing", step: 0 }, next: "again" },
  testing: { patch: { state: "saving", result: "passed" }, next: "again" },
  saving: { patch: { state: "done", browser_session_id: null }, next: "end" },
};

test("one runner takes a setup from opening to done, waiting on the owner without stepping", async () => {
  const { w, d } = world(base(), (r) => flow[r.state]);
  w.onSleep = (w: any) => { if (w.row.state === "owner_control" && w.sleeps === 6) w.row = { ...w.row, state: "verify" }; }; // the owner taps "I'm signed in"
  assert.equal(await runSolo(d), "finished");
  assert.deepEqual(w.steps, ["opening", "find_login", "verify", "configuring", "testing", "saving"], "owner_control is never stepped: the model does not look while the owner has control");
  assert.equal(w.row.state, "done");
  assert.deepEqual(w.closed, [], "the engine's own saving step closes the browser, not the runner");
});

test("out of time: the browser is let go cleanly, the setup pauses with its place kept, and the owner is told how to carry on", async () => {
  const { w, d } = world(base({ state: "owner_control", browser_session_id: "sess1" }), (r) => flow[r.state]);
  assert.equal(await runSolo(d), "out_of_time");
  assert.deepEqual(w.closed, ["sess1"]);
  assert.equal(w.row.state, "paused"); assert.equal(w.row.browser_session_id, null); assert.equal(w.row.reason, OUT_OF_TIME);
  assert.equal(w.row.log.at(-1).did, "out_of_time");
  assert.ok(w.t >= SOLO.life && w.t < SOLO.life + 5000, "it leaves at its limit, not later: " + w.t);
  assert.ok(SOLO.life + 30000 < SOLO.lingerLife, "a runner always ends before a lingerer that joined it");
  assert.deepEqual(w.steps, [], "nothing was stepped while the owner had control");
});

test("a stop by the owner wins over a step that was in flight", async () => {
  const { w, d } = world(base({ state: "configuring", browser_session_id: "sess1" }), (r, w) => { w.row = { ...w.row, state: "stopped" }; return { patch: { state: "configuring", step: 1 }, next: "again" }; });
  assert.equal(await runSolo(d), "not_mine");
  assert.equal(w.row.state, "stopped", "the step's result was not written over the stop");
  assert.deepEqual(w.saves, [{ refused: "configuring" }]);
});

test("the runner leaves at once when the setup is not in the browser any more", async () => {
  for (const state of ["done", "failed", "stopped", "paused", "manual", "blocked", "queued", "consent", "composio"]) {
    const { w, d } = world(base({ state }), () => { throw new Error("must not step"); });
    assert.equal(await runSolo(d), "not_mine", state); assert.equal(w.steps.length, 0);
    assert.equal(BROWSER_STATES.has(state), false);
  }
  const { d } = world(null as any, () => { throw new Error("must not step"); });
  assert.equal(await runSolo(d), "gone");
});

test("a second runner that has lost the claim stops without touching anything", async () => {
  const { w, d } = world(base({ state: "owner_control", browser_session_id: "sess1" }), (r) => flow[r.state]);
  w.beatOk = false;
  assert.equal(await runSolo(d), "lost_claim");
  assert.deepEqual(w.closed, []); assert.equal(w.row.state, "owner_control"); assert.deepEqual(w.saves, []);
});

test("a read that fails is not the end of the setup; many in a row is", async () => {
  let x = world(base({ state: "verify", browser_session_id: "sess1" }), (r) => flow[r.state]); x.w.loadFails = 3;
  assert.equal(await runSolo(x.d), "finished"); assert.equal(x.w.row.state, "done");
  x = world(base({ state: "verify" }), (r) => flow[r.state]); x.w.loadFails = 1000;
  assert.equal(await runSolo(x.d), "gone"); assert.equal(x.w.steps.length, 0);
});

test("the runner says it is alive about every five seconds", async () => {
  const { w, d } = world(base({ state: "owner_control", browser_session_id: "sess1" }), (r) => flow[r.state]);
  await runSolo(d);
  assert.ok(w.beats >= 60 && w.beats <= 70, String(w.beats));
  assert.ok(SOLO.stale >= SOLO.beat * 3, "a runner is only called dead after several missed beats");
});

test("a step that throws ends the runner with the error, for the caller to record", async () => {
  const { d } = world(base({ state: "configuring", browser_session_id: "sess1" }), () => { throw new Error("boom"); });
  await assert.rejects(() => runSolo(d), /boom/);
});

test("the lingerer stays connected until the browser is gone, then closes", async () => {
  const w = { t: 0, up: 5, closed: 0, checks: 0 };
  const end = await linger({ async running() { w.checks++; return --w.up > 0; }, close() { w.closed++; }, async sleep(ms) { w.t += ms; }, now: () => w.t });
  assert.equal(end, "browser_gone"); assert.equal(w.closed, 1); assert.equal(w.checks, 5); assert.equal(w.t, 5 * SOLO.lingerBeat);
});

test("the lingerer does not leave because a check failed to answer, and never outstays its limit", async () => {
  const w = { t: 0, closed: 0 };
  const end = await linger({ async running() { throw new Error("no answer"); }, close() { w.closed++; }, async sleep(ms) { w.t += ms; }, now: () => w.t });
  assert.equal(end, "out_of_time"); assert.equal(w.closed, 1);
  assert.ok(w.t >= SOLO.lingerLife && w.t <= SOLO.lingerLife + SOLO.lingerBeat);
  assert.ok(SOLO.lingerLife <= 395000, "inside the function's own time limit");
});
