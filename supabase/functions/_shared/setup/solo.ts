// The Setup Agent on a browser that closes when a connection leaves (Browserbase's Free plan, Nov 27 2026).
//
// On that plan the secure browser ends the moment ANY program that connected to it disconnects. The Setup Agent used
// to work in short steps, each its own request with its own connection, so the browser died between step one and
// step two. Here one request (the runner) connects once and does every step itself, waiting on the owner in between,
// and lets go only when the setup is over or its own time is nearly up. Nothing else may connect and leave.
//
// The one other program that must touch the page is vault-writer, which types the owner's login. It joins as a
// second connection and then stays connected, doing nothing, until the browser is gone (linger, below). So the
// password still passes through vault-writer alone, and no connection ever leaves a browser that is in use.
//
// The runner's time is shorter than the lingerer's on purpose: a lingerer always starts after its runner, so the
// runner always ends the browser first. A setup that needs longer than one runner pauses with its sign-in saved in
// the browser's context, and "Open it again" carries on in a fresh browser.
//
// Pure: the tests drive both loops with a fake clock.
import type { Outcome, SetupRow } from "./engine.ts";

export const SOLO = { life: 330000, poll: 1000, beat: 5000, stale: 20000, lingerBeat: 10000, lingerLife: 390000 } as const;
/** States the runner works through or waits in. Anything else is not its business. */
export const BROWSER_STATES = new Set(["opening", "find_login", "owner_control", "verify", "configuring", "testing", "saving"]);
/** States in which only the owner can move the setup on (pip-portal writes the next state). */
const OWNER_WAIT = new Set(["owner_control"]);
export const OUT_OF_TIME = "The secure browser can stay open for about five minutes at a time. Your place was kept. Tap Open it again to carry on.";

export type SoloEnd = "finished" | "not_mine" | "gone" | "out_of_time" | "lost_claim";
export type SoloDeps = {
  /** The setup's row. Throws when the read fails, so a network blip never looks like "the setup ended". */
  load(): Promise<SetupRow | null>;
  step(row: SetupRow): Promise<Outcome>;
  /** Writes a step's result only while the row is still in the state the step started from. False if it had moved. */
  save(patch: Partial<SetupRow>, ifState: string): Promise<boolean>;
  /** Marks this runner as alive. False when another runner holds the setup. */
  beat(): Promise<boolean>;
  closeBrowser(sessionId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
};

/** One runner: every step of one setup's time in the browser, on one connection. */
export async function runSolo(d: SoloDeps): Promise<SoloEnd> {
  const started = d.now();
  let lastBeat = started, misses = 0;
  for (;;) {
    let row: SetupRow | null;
    try { row = await d.load(); misses = 0; } catch { if (++misses > 20 || d.now() - started >= SOLO.life) return "gone"; await d.sleep(SOLO.poll); continue; }
    if (!row) return "gone";
    if (!BROWSER_STATES.has(row.state)) return "not_mine";            // done, failed, stopped, paused, or not started
    if (d.now() - lastBeat >= SOLO.beat) { lastBeat = d.now(); if (!(await d.beat().catch(() => true))) return "lost_claim"; }
    if (d.now() - started >= SOLO.life) {
      // Out of time. Let the browser go cleanly so its context keeps the sign-in, and tell the owner how to carry on.
      if (row.browser_session_id) await d.closeBrowser(row.browser_session_id).catch(() => {});
      await d.save({ state: "paused", browser_session_id: null, reason: OUT_OF_TIME, log: [...(row.log ?? []).slice(-150), { at: new Date(d.now()).toISOString(), step: row.step, did: "out_of_time" }] }, row.state).catch(() => false);
      return "out_of_time";
    }
    if (OWNER_WAIT.has(row.state)) { await d.sleep(SOLO.poll); continue; }
    const out = await d.step(row);
    const applied = await d.save(out.patch, row.state);
    if (!applied) continue;                                            // the owner (or a stop) moved it first: read again
    if (out.next === "end") return "finished";
    if (out.next === "wait") await d.sleep(SOLO.poll);
  }
}

export type LingerDeps = { running(): Promise<boolean>; close(): void; sleep(ms: number): Promise<void>; now(): number };
export type LingerEnd = "browser_gone" | "out_of_time";
/**
 * vault-writer after it has typed: stay connected and do nothing until the browser is gone. It never looks at the
 * page again. A check that fails to answer is not a reason to leave; only "not running" or the time limit is.
 */
export async function linger(d: LingerDeps): Promise<LingerEnd> {
  const started = d.now();
  try {
    for (;;) {
      await d.sleep(SOLO.lingerBeat);
      const up = await d.running().catch(() => true);
      if (!up) return "browser_gone";
      if (d.now() - started >= SOLO.lingerLife) return "out_of_time";
    }
  } finally { d.close(); }
}
