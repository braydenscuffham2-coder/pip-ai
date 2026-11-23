// The Setup Agent's whole flow with every outside thing faked: the cloud browser, the model, the budget, Composio.
//   node --test supabase/functions/_shared/setup/engine.test.ts
// Each test drives step() the way setup-run does (save the patch, run again on "again") and checks what the owner and
// the model would see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Deps, type Page, type SetupRow, step } from "./engine.ts";
import { MASK_JS, SIGNED_IN_JS, TAG_LOGIN_JS } from "./guards.ts";

const SECRET = "Tr0ub4dor&3-correct-horse";

function fakePage(o: { login?: any; mask?: any; signedIn?: any } = {}) {
  const did: string[] = [];
  const page: Page & { did: string[]; shots: number } = {
    did, shots: 0,
    async goto(url) { did.push(`goto ${url}`); },
    async evaluate(js: string) {
      if (js === TAG_LOGIN_JS) return o.login ?? { user: true, pass: true, submit: true, twoStep: false };
      if (js === MASK_JS) return o.mask ?? { masked: 1, exposed: 0, captcha: false, url: "https://app.example.com/home" };
      if (js === SIGNED_IN_JS) return o.signedIn ?? { url: "https://app.example.com/home", passwordShowing: false };
      return null;
    },
    async screenshot() { page.shots++; return "SCREENSHOT"; },
    async click(x, y) { did.push(`click ${x},${y}`); },
    async type(t) { did.push(`type ${t}`); },
    async key(k) { did.push(`key ${k}`); },
    async scroll(dy) { did.push(`scroll ${dy}`); },
    async focused() { return { type: "text", name: "display_name" }; },
    viewport: () => ({ w: 1280, h: 800 }),
  };
  return page;
}

function world(over: Partial<Deps> & { actions?: any[]; page?: ReturnType<typeof fakePage>; usage?: any } = {}) {
  const page = over.page ?? fakePage();
  const seen: string[] = [], spent: number[] = [], events: string[] = [];
  const actions = [...(over.actions ?? [])];
  const deps: Deps = {
    paused: async () => false,
    take: async (usd) => { spent.push(usd); return null; },
    terms: async () => "unknown",
    healthBlocked: async () => false,
    steps: async () => ["Turn on the API in Settings."],
    browser: { open: async () => ({ sessionId: "bb_1", contextId: "ctx_1" }), page: async () => page, close: async () => { events.push("closed"); } },
    model: async (input) => { seen.push(JSON.stringify(input)); return { action: actions.shift() ?? { type: "done" }, usage: over.usage ?? { input_tokens: 8000, output_tokens: 200 } }; },
    composioTest: async () => null,
    done: async (_r, ok) => { events.push(ok ? "done_ok" : "done_bad"); },
    reSignIn: async () => { events.push("resignin"); },
    ...over,
  };
  return { deps, page, seen, spent, events };
}
const row = (over: Partial<SetupRow> = {}): SetupRow => ({ id: "s1", business_id: "b1", tool: "Supplier portal", tool_key: "supplier-portal", login_url: "https://app.example.com/login", mode: "browser",
  state: "queued", reason: null, step: 0, plan: {}, browser_session_id: null, browser_context_id: null, consent_at: null, composio_done: false, cost_usd: 0, cost_cap_usd: 2, owner_taps: 0, result: null, log: [], created_at: "", ...over });

/** Runs steps until one waits or ends, like setup-run's chain. */
async function drive(r: SetupRow, deps: Deps, max = 60) {
  const states: string[] = [];
  for (let i = 0; i < max; i++) {
    const out = await step(r, deps);
    r = { ...r, ...out.patch } as SetupRow;
    states.push(r.state);
    if (out.next !== "again") return { r, states, next: out.next };
  }
  throw new Error("did not settle");
}

test("a new setup waits for the owner's consent before any browser opens", async () => {
  const w = world();
  const { r, next } = await drive(row(), w.deps);
  assert.deepEqual([r.state, next], ["consent", "wait"]);
  assert.equal(r.browser_session_id, null);
});

test("after consent: the browser opens, the login form is found by its markup (no model), and the owner gets control", async () => {
  const w = world();
  const { r, states } = await drive(row({ state: "consent", consent_at: "now" }), w.deps);
  assert.deepEqual(states, ["opening", "find_login", "owner_control"]);
  assert.equal(r.plan.keybox, true);
  assert.equal(w.seen.length, 0, "no model call to find a normal login form");
  assert.equal(w.page.shots, 0, "no screenshot");
});

test("while the owner has control nothing is looked at, however often it is asked", async () => {
  const w = world();
  let r = row({ state: "owner_control", browser_session_id: "bb_1" });
  for (let i = 0; i < 5; i++) r = { ...r, ...(await step(r, w.deps)).patch } as SetupRow;
  assert.equal(r.state, "owner_control");
  assert.equal(w.page.shots, 0);
  assert.equal(w.seen.length, 0);
});

test("signed in: configure, test, save; the model sees masked screenshots only and is charged for each call", async () => {
  const w = world({ actions: [{ type: "click", x: 100, y: 120, label: "Settings" }, { type: "type", text: "Pip" }, { type: "done" }, { type: "done" }] });
  const { r, states } = await drive(row({ state: "verify", browser_session_id: "bb_1" }), w.deps);
  assert.deepEqual([r.state, r.result], ["done", "passed"]);
  assert.ok(states.includes("configuring") && states.includes("testing") && states.includes("saving"));
  assert.deepEqual(w.page.did, ["click 100,120", "type Pip"]);
  assert.equal(w.spent.length, 4);
  assert.ok(r.cost_usd > 0);
  assert.deepEqual(w.events, ["closed", "done_ok"]);
});

test("a click on something about money or deleting is refused in code, and the model is told why", async () => {
  const w = world({ actions: [{ type: "click", x: 10, y: 10, label: "Upgrade to Pro" }, { type: "done" }, { type: "done" }] });
  const { r } = await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w.deps);
  assert.equal(w.page.did.length, 0, "nothing was clicked");
  assert.ok(r.log.some((e: any) => e.did === "refused" && /never presses/.test(e.why)));
  assert.match(w.seen[1], /refused: Pip never presses/, "the next prompt carries the refusal");
});

test("typing into a secret field is refused even when the model asks", async () => {
  const page = fakePage();
  page.focused = async () => ({ type: "password" });
  const w = world({ page, actions: [{ type: "type", text: "guess" }, { type: "done" }, { type: "done" }] });
  await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w.deps);
  assert.equal(page.did.some((d) => d.startsWith("type")), false);
});

test("a captcha, or a secret showing on the page, hands control back to the owner with no screenshot", async () => {
  for (const mask of [{ masked: 0, exposed: 0, captcha: true, url: "https://app.example.com" }, { masked: 1, exposed: 1, captcha: false, url: "https://app.example.com" }]) {
    const page = fakePage({ mask });
    const w = world({ page });
    const { r } = await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w.deps);
    assert.equal(r.state, "owner_control");
    assert.equal(page.shots, 0);
    assert.equal(w.seen.length, 0);
  }
});

test("still on the sign-in page after the owner taps I'm signed in: back to the owner, model not called", async () => {
  const w = world({ page: fakePage({ signedIn: { url: "https://app.example.com/login", passwordShowing: true } }) });
  const { r } = await drive(row({ state: "verify", browser_session_id: "bb_1" }), w.deps);
  assert.equal(r.state, "owner_control");
  assert.match(r.reason!, /Still on the sign-in page/);
});

test("the model asking for the owner hands control back", async () => {
  const w = world({ actions: [{ type: "need_owner", reason: "It wants a code sent to your phone." }] });
  const { r } = await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w.deps);
  assert.deepEqual([r.state, r.reason], ["owner_control", "It wants a code sent to your phone."]);
});

test("each setup stops at its own cost cap, and at the day's budget", async () => {
  const w = world({ usage: { input_tokens: 2_000_000, output_tokens: 0 }, actions: [{ type: "scroll", dy: 100 }, { type: "scroll", dy: 100 }] });
  const { r } = await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w.deps);
  assert.equal(r.state, "failed");
  assert.match(r.reason!, /\$2 cap/);
  const w2 = world({ take: async () => "daily_limit" });
  const out = await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w2.deps);
  assert.match(out.r.reason!, /budget said daily_limit/);
});

test("the kill switch stops a setup between steps", async () => {
  const w = world({ paused: async () => true });
  const { r } = await drive(row({ state: "configuring", browser_session_id: "bb_1" }), w.deps);
  assert.equal(r.state, "stopped");
});

test("a tool whose terms forbid automation gets no browser; a health business without agreements is blocked", async () => {
  assert.equal((await drive(row(), world({ terms: async () => "forbidden" }).deps)).r.state, "manual");
  assert.equal((await drive(row(), world({ healthBlocked: async () => true }).deps)).r.state, "blocked");
});

test("a tool with an API waits for the owner's Composio sign-in, then runs its test through Composio", async () => {
  const w = world({ composioTest: async () => true });
  assert.equal((await drive(row({ mode: "composio" }), w.deps)).r.state, "composio");
  const { r } = await drive(row({ mode: "composio", state: "composio", composio_done: true }), w.deps);
  assert.deepEqual([r.state, r.result], ["done", "passed"]);
  assert.equal(w.seen.length, 0, "no model, no browser");
});

test("a lost browser pauses only this tool and sends the owner a one-tap re-sign-in", async () => {
  const w = world();
  w.deps.browser.page = async () => null;
  const { r } = await drive(row({ state: "configuring", browser_session_id: "bb_gone" }), w.deps);
  assert.equal(r.state, "paused");
  assert.deepEqual(w.events, ["resignin"]);
});

test("nothing the model is shown, and nothing in the step log, ever holds the owner's login", async () => {
  // The login only ever exists in vault-writer. Here the page even "has" it typed in; the engine must never read it out.
  const page = fakePage();
  page.did.push(`type ${SECRET}`); // what vault-writer typed, before the engine runs
  const w = world({ page, actions: [{ type: "click", x: 1, y: 1, label: "Next" }, { type: "done" }, { type: "done" }] });
  const { r } = await drive(row({ state: "verify", browser_session_id: "bb_1" }), w.deps);
  assert.equal(JSON.stringify(w.seen).includes(SECRET), false);
  assert.equal(JSON.stringify(r).includes(SECRET), false);
});
