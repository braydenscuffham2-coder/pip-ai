// Background work's sign-in steps (engine.ts), with a fake browser, vault and database.
//   node --test supabase/functions/_shared/work/engine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { type FillCode, type Identity, type Out, type SignState, step, type WorkDeps, type WorkJob } from "./engine.ts";
import type { Page } from "../setup/engine.ts";

const SITE = "practicetool.com";
const signedIn: SignState = { url: `https://app.${SITE}/home`, host: `app.${SITE}`, pass: false, user: false, code: false, captcha: false };
const loginForm: SignState = { url: `https://app.${SITE}/login`, host: `app.${SITE}`, pass: true, user: false, code: false, captcha: false };
const codeForm: SignState = { ...signedIn, url: `https://app.${SITE}/verify`, code: true };

function world(opts: { pages: SignState[]; vault?: boolean; totp?: boolean; fill?: FillCode; code?: FillCode; context?: string | null } ) {
  const identity: Identity = { id: "id-1", business_id: "biz-1", tool: "Practice Tool", tool_key: "practice-tool", login_url: `https://app.${SITE}/login`, site: SITE,
    browser_context_id: opts.context === undefined ? "ctx-1" : opts.context, vault_item_id: opts.vault === false ? null : "vault-1", totp: !!opts.totp, state: "unknown", silent_signins: 0 };
  const log: string[] = [], calls = { fill: 0, code: 0, open: 0, close: 0 };
  let i = 0;
  const page = { goto: async () => {}, evaluate: async () => opts.pages[Math.min(i++, opts.pages.length - 1)] } as unknown as Page;
  const deps: WorkDeps = {
    identity: async () => identity,
    saveIdentity: async (_id, patch) => { Object.assign(identity, patch); },
    browser: { open: async (ctx) => { calls.open++; return { sessionId: "sess-1", contextId: ctx ?? "ctx-new" }; }, page: async () => page, close: async () => { calls.close++; } },
    vaultFill: async () => { calls.fill++; return opts.fill ?? "submitted"; },
    vaultCode: async () => { calls.code++; return opts.code ?? "submitted"; },
    log: async (_j, did) => { log.push(did); },
    now: () => Date.parse("2026-11-27T12:00:00Z"),
  };
  const job: WorkJob = { id: "job-1", business_id: "biz-1", spec_id: null, identity_id: "id-1", kind: "signin_check", title: "Check the sign-in to Practice Tool", plan: {}, status: "running", state: "start", step: 0, max_steps: 30, cost_usd: 0, cost_cap_usd: 1, browser_session_id: null };
  return { identity, log, calls, deps, job };
}
/** Runs steps until the job stops asking to go again. */
async function run(job: WorkJob, deps: WorkDeps): Promise<Out> {
  for (let n = 0; n < 20; n++) {
    const out = await step(job, deps);
    Object.assign(job, out.patch);
    if (out.next !== "again") return out;
  }
  throw new Error("did not settle");
}

test("still signed in: no vault call, the browser is closed, and the owner gets one plain line", async () => {
  const w = world({ pages: [signedIn] });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "done");
  assert.equal(out.summary, "Pip is still signed in to Practice Tool.");
  assert.equal(w.calls.fill, 0);
  assert.equal(w.calls.close, 1);
  assert.equal(w.identity.state, "signed_in");
  assert.equal(w.job.browser_session_id, null);
});

test("signed out with a saved login: the vault fills once and Pip is back in without anyone", async () => {
  const w = world({ pages: [loginForm, signedIn] });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "done");
  assert.match(out.summary!, /signed back in on its own/);
  assert.equal(w.calls.fill, 1);
  assert.equal(w.identity.silent_signins, 1);
  assert.deepEqual(w.log, ["opened", "vault_fill", "signed_in"]);
});

test("the saved password no longer works: one try only, then the owner is told and the tool waits", async () => {
  const w = world({ pages: [loginForm, loginForm, loginForm] });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "owner");
  assert.match(out.summary!, /password may have changed/);
  assert.equal(w.calls.fill, 1, "never a second guess at a password");
  assert.equal(w.identity.state, "needs_owner");
  assert.equal(w.calls.close, 1, "the browser is not left running while a person is needed");
});

test("a captcha is always the owner's: nothing is filled", async () => {
  const w = world({ pages: [{ ...loginForm, captcha: true }] });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "owner");
  assert.match(out.summary!, /captcha/);
  assert.equal(w.calls.fill, 0);
});

test("a sign-in form on another address is never filled, even a sibling subdomain of the same site", async () => {
  for (const url of ["https://practicetool.com.evil.test/login", "https://someone-else.practicetool.com/login", "http://app.practicetool.com/login"]) {
    const w = world({ pages: [{ ...loginForm, url, host: new URL(url).hostname }] });
    const out = await run(w.job, w.deps);
    assert.equal(out.next, "owner", url);
    assert.match(out.summary!, /only uses your saved login on app\.practicetool\.com/);
    assert.equal(w.calls.fill, 0, url);
  }
});

test("a second sign-in host is trusted only when the owner signed in there themselves", async () => {
  const sso = { ...loginForm, url: "https://login.practicetool.com/start", host: "login.practicetool.com" };
  const no = world({ pages: [sso] });
  assert.equal((await run(no.job, no.deps)).next, "owner");
  const yes = world({ pages: [sso, signedIn] });
  yes.identity.signin_hosts = ["login.practicetool.com"];
  assert.equal((await run(yes.job, yes.deps)).next, "done");
  assert.equal(yes.calls.fill, 1);
});

test("the vault itself refuses a wrong site: the engine believes it and stops", async () => {
  const w = world({ pages: [loginForm], fill: "wrong_site" });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "owner");
  assert.equal(w.calls.fill, 1);
});

test("signed out with no saved login: the owner is asked, nothing is guessed", async () => {
  const w = world({ pages: [loginForm], vault: false });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "owner");
  assert.match(out.summary!, /no saved login/);
});

test("a code is asked for and the owner set up an authenticator for Pip: the vault enters it once", async () => {
  const w = world({ pages: [loginForm, codeForm, signedIn], totp: true });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "done");
  assert.equal(w.calls.code, 1);
});

test("a code is asked for and there is no authenticator: that is a new-device check, so the owner is told", async () => {
  const w = world({ pages: [loginForm, codeForm] });
  const out = await run(w.job, w.deps);
  assert.equal(out.next, "owner");
  assert.match(out.summary!, /checking a new device/);
  assert.equal(w.calls.code, 0);
});

test("a first run makes the saved browser state and remembers it", async () => {
  const w = world({ pages: [signedIn], context: null });
  await run(w.job, w.deps);
  assert.equal(w.identity.browser_context_id, "ctx-new");
});

test("a job stops at its step budget", async () => {
  const w = world({ pages: [signedIn] });
  w.job.step = 30;
  const out = await step(w.job, w.deps);
  assert.equal(out.next, "failed");
  assert.match(out.reason!, /30 steps/);
});

test("when the browser closes mid-job the job starts again from the saved sign-in, and gives up after the third time", async () => {
  const w = world({ pages: [signedIn] });
  w.deps.browser.page = async () => null;
  w.job.state = "check"; w.job.browser_session_id = "sess-1";
  let out = await step(w.job, w.deps);
  assert.equal(out.next, "again"); assert.equal(out.patch.state, "start");
  Object.assign(w.job, out.patch, { state: "check", browser_session_id: "sess-2" });
  out = await step(w.job, w.deps);
  assert.equal(out.next, "again");
  Object.assign(w.job, out.patch, { state: "check", browser_session_id: "sess-3" });
  out = await step(w.job, w.deps);
  assert.equal(out.next, "failed");
});

test("a tool that already needs its owner makes later jobs wait quietly: no browser, no second email", async () => {
  const w = world({ pages: [signedIn] });
  w.identity.state = "needs_owner";
  const out = await step(w.job, w.deps);
  assert.equal(out.next, "owner");
  assert.equal(out.alert, false);
  assert.equal(w.calls.open, 0);
});
