// Holding the secure browser open while the owner signs in.
//
// Why this exists (found live, Nov 27 2026): on Browserbase's free plan a browser shuts down the moment the last
// program connected to it disconnects ("keep alive" is a paid setting). The Setup Agent works in short steps, each its
// own request, so the browser died between step one and step two. A holder is one request that connects and simply
// stays connected, with a small heartbeat, until the setup no longer needs the browser. Before it runs out of time it
// starts the next holder and leaves only after that one has connected, so there is never a moment with nobody holding.
//
// Pure: the tests drive it with a fake clock. The holder never looks at the page and never sees a typed value.
export const HOLD = { beat: 15000, life: 270000, overlap: 4000, hardStop: 360000 } as const;
/** States in which the setup has stopped needing its browser. */
export const RELEASED = new Set(["done", "failed", "stopped", "paused", "manual", "blocked"]);

export type Held = { ping(): Promise<boolean>; close(): void };
export type HoldDeps = {
  row(): Promise<{ state: string; browser_session_id: string | null } | null>;
  /** Start the next holder. True only once it has connected. */
  next(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
};
export type HoldEnd = "released" | "handed_over" | "browser_gone" | "out_of_time";

/** Keep `conn` open for `sessionId` until the setup lets go, the browser goes away, or the next holder takes over. */
export async function hold(conn: Held, sessionId: string, d: HoldDeps): Promise<HoldEnd> {
  const started = d.now();
  let asked = 0;
  try {
    for (;;) {
      await d.sleep(HOLD.beat);
      const r = await d.row().catch(() => undefined);
      // A read that failed is not a reason to let go; a row that says the setup moved on is.
      if (r !== undefined && (!r || r.browser_session_id !== sessionId || RELEASED.has(r.state))) return "released";
      if (!(await conn.ping().catch(() => false))) return "browser_gone";
      const age = d.now() - started;
      if (age >= HOLD.hardStop) return "out_of_time";
      if (age >= HOLD.life && d.now() - asked >= 30000) {
        asked = d.now();
        if (await d.next().catch(() => false)) { await d.sleep(HOLD.overlap); return "handed_over"; }
      }
    }
  } finally { conn.close(); }
}
