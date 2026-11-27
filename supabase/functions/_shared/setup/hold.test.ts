// The holder keeps the secure browser open between the Setup Agent's steps (see hold.ts for why).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hold, HOLD } from "./hold.ts";

function world(rows: (i: number) => { state: string; browser_session_id: string | null } | null, opts: { pingDiesAt?: number; nextOk?: (n: number) => boolean; rowThrowsAt?: number } = {}) {
  let t = 0, beats = 0, closed = 0, nexts = 0, pings = 0;
  const conn = { ping: () => { pings++; return Promise.resolve(!(opts.pingDiesAt && pings >= opts.pingDiesAt)); }, close: () => { closed++; } };
  const deps = {
    row: () => { beats++; if (opts.rowThrowsAt === beats) return Promise.reject(new Error("network")); return Promise.resolve(rows(beats)); },
    next: () => { nexts++; return Promise.resolve(opts.nextOk ? opts.nextOk(nexts) : true); },
    sleep: (ms: number) => { t += ms; return Promise.resolve(); },
    now: () => t,
  };
  return { conn, deps, stats: () => ({ t, beats, closed, nexts, pings }) };
}
const live = () => ({ state: "owner_control", browser_session_id: "s1" });

test("it holds while the owner is signing in and lets go when the setup finishes", async () => {
  const w = world((i) => (i < 5 ? live() : { state: "done", browser_session_id: "s1" }));
  assert.equal(await hold(w.conn, "s1", w.deps), "released");
  assert.deepEqual([w.stats().beats, w.stats().pings, w.stats().closed], [5, 4, 1]);
});

test("it lets go when the setup pauses, stops, or moves to a different browser", async () => {
  for (const row of [{ state: "paused", browser_session_id: null }, { state: "stopped", browser_session_id: null }, { state: "configuring", browser_session_id: "s2" }, null]) {
    const w = world(() => row);
    assert.equal(await hold(w.conn, "s1", w.deps), "released");
    assert.equal(w.stats().closed, 1);
  }
});

test("one failed read of the setup is not a reason to drop the browser", async () => {
  const w = world((i) => (i < 4 ? live() : { state: "done", browser_session_id: "s1" }), { rowThrowsAt: 2 });
  assert.equal(await hold(w.conn, "s1", w.deps), "released");
  assert.equal(w.stats().beats, 4);
});

test("before its time runs out it starts the next holder and leaves only after that one has connected", async () => {
  const w = world(live);
  assert.equal(await hold(w.conn, "s1", w.deps), "handed_over");
  const s = w.stats();
  assert.equal(s.nexts, 1);
  assert.ok(s.t >= HOLD.life + HOLD.overlap && s.t < HOLD.hardStop, `left at ${s.t}`);
  assert.equal(s.closed, 1);
});

test("if the next holder cannot start it keeps holding, asks again, and only then runs out of time", async () => {
  const w = world(live, { nextOk: (n) => n >= 3 });
  assert.equal(await hold(w.conn, "s1", w.deps), "handed_over");
  assert.equal(w.stats().nexts, 3);
  const never = world(live, { nextOk: () => false });
  assert.equal(await hold(never.conn, "s1", never.deps), "out_of_time");
  assert.ok(never.stats().nexts >= 2);
  assert.equal(never.stats().closed, 1);
});

test("it notices when the browser itself is gone", async () => {
  const w = world(live, { pingDiesAt: 3 });
  assert.equal(await hold(w.conn, "s1", w.deps), "browser_gone");
  assert.equal(w.stats().closed, 1);
});
