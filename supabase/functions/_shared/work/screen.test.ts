// Screen work's limits and steps (screen.ts), with a fake page and a scripted model.
//   node --test supabase/functions/_shared/work/screen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowScreenAction, type ElementInfo, onScreens, sameForm, type ScreenAction, type ScreenCtx, type ScreenPlan, screenStep } from "./screen.ts";
import type { Identity, Out, WorkDeps, WorkJob } from "./engine.ts";
import type { Page } from "../setup/engine.ts";

const SITE = "hirepip.com", BASE = "https://www.hirepip.com/practice/sb1";
const SCREENS = ["/practice/sb1/home", "/practice/sb1/patients*", "/practice/sb1/refills*", "/practice/sb1/notes"];
const ctx = (level: ScreenCtx["level"] = "add"): ScreenCtx => ({ level, site: SITE, screens: SCREENS, viewport: { w: 1280, h: 800 } });
const el = (o: Partial<ElementInfo>): ElementInfo => ({ tag: "button", type: "", text: "", name: "", id: "", href: "", submit: false, method: "", action: "", ...o });
const saveButton = el({ text: "Add refill request", type: "submit", submit: true, method: "post", action: `${BASE}/refills` });
const click = { type: "click", x: 100, y: 100 } as const;

test("a job may only be on its own screens, on the tool's own site, over https", () => {
  assert.equal(onScreens(`${BASE}/refills`, SITE, SCREENS), true);
  assert.equal(onScreens(`${BASE}/patients/3f2a/`, SITE, SCREENS), true);
  assert.equal(onScreens(`${BASE}/refills?said=ok`, SITE, SCREENS), true, "a query string does not change which screen it is");
  assert.equal(onScreens(`${BASE}/billing`, SITE, SCREENS), false);
  assert.equal(onScreens(`https://www.hirepip.com/practice/another-sandbox/refills`, SITE, SCREENS), false);
  assert.equal(onScreens(`https://www.hirepip.com.evil.test/practice/sb1/refills`, SITE, SCREENS), false);
  assert.equal(onScreens(`http://www.hirepip.com/practice/sb1/refills`, SITE, SCREENS), false);
  assert.equal(onScreens(`${BASE}/notes/extra`, SITE, SCREENS), false, "a pattern without * is one page");
  assert.equal(onScreens("not a url", SITE, SCREENS), false);
});

test("never pressed, at any level: deleting, money, plans, access, signing out; judged by the page's own words", () => {
  for (const text of ["Delete patient", "Remove", "Upgrade plan", "Billing", "Pay now", "Sign out", "Log out", "Cancel subscription", "Invite a user", "Reset password"]) {
    const v = allowScreenAction(click, ctx("update"), el({ text }));
    assert.equal(v.ok, false, text); assert.equal((v as any).never, true, text);
  }
  // A form that posts to a delete address is refused even when its button has harmless words.
  assert.equal(allowScreenAction(click, ctx("update"), el({ text: "Continue", type: "submit", submit: true, method: "post", action: `${BASE}/patients/3f2a/delete` })).ok, false);
  assert.equal(allowScreenAction({ type: "navigate", url: `${BASE}/billing` }, ctx("update")).ok, false);
  assert.equal(allowScreenAction({ type: "navigate", url: `${BASE}/logout` }, ctx("update")).ok, false);
});

test("the model's own label for a click is ignored: only what the page says is under the point counts", () => {
  const lying = { type: "click", x: 100, y: 100, label: "Open patient list" } as const;
  assert.equal(allowScreenAction(lying, ctx("update"), el({ text: "Delete patient", submit: true, method: "post", action: `${BASE}/patients/1/delete` })).ok, false);
  assert.equal(allowScreenAction(click, ctx("update"), null).ok, false, "nothing under the point: nothing is pressed");
});

test("a read-only job can follow links and search, and cannot save, fill a record or change a drop-down", () => {
  const read = ctx("read");
  assert.deepEqual(allowScreenAction(click, read, el({ tag: "a", text: "Open Biscuit", href: `${BASE}/patients/3f2a` })), { ok: true });
  assert.equal(allowScreenAction(click, read, saveButton).ok, false);
  assert.equal(allowScreenAction(click, read, el({ tag: "div", text: "Save changes" })).ok, false, "a script button that saves counts too");
  assert.equal(allowScreenAction({ type: "type", text: "Biscuit" }, read, null, { field: { type: "search", name: "q" }, search: true, savingForm: false }).ok, true);
  assert.equal(allowScreenAction({ type: "type", text: "paused" }, read, null, { field: { type: "text", name: "notes" }, search: false, savingForm: true }).ok, false);
  assert.equal(allowScreenAction({ type: "select", x: 1, y: 1, value: "paused" }, read, el({ tag: "select", name: "reminders", method: "post" })).ok, false);
  assert.equal(allowScreenAction(click, read, el({ tag: "a", text: "Billing", href: `${BASE}/billing` })).ok, false);
});

test("a job that may add or update can save through a form on its own screens, and that is counted as a change", () => {
  assert.deepEqual(allowScreenAction(click, ctx("add"), saveButton), { ok: true, write: true });
  assert.equal(allowScreenAction(click, ctx("add"), el({ text: "Save", type: "submit", submit: true, method: "post", action: "https://www.hirepip.com/practice/another-sandbox/refills" })).ok, false, "not a form that saves somewhere else");
  assert.deepEqual(allowScreenAction(click, ctx("add"), el({ text: "Search", type: "submit", submit: true, method: "get", action: `${BASE}/patients` })), { ok: true }, "a search form is not a change");
  assert.equal(allowScreenAction({ type: "select", x: 1, y: 1, value: "paused" }, ctx("update"), el({ tag: "select", name: "reminders", method: "post" })).ok, true);
});

test("typing never goes into a secret field, and Enter cannot be used to save around the button's checks", () => {
  for (const field of [{ type: "password" }, { type: "text", name: "otp" }, { type: "text", name: "api_key" }, { type: "text", name: "x", filled: true }]) {
    const v = allowScreenAction({ type: "type", text: "anything" }, ctx("update"), null, { field, search: false, savingForm: true });
    assert.equal(v.ok, false); assert.equal((v as any).never, true);
  }
  assert.equal(allowScreenAction({ type: "type", text: "x" }, ctx("update"), null, { field: null, search: false, savingForm: false }).ok, false, "no field has the keyboard");
  assert.equal(allowScreenAction({ type: "key", key: "Enter" }, ctx("update"), null, { field: { type: "text", name: "medication" }, search: false, savingForm: true }).ok, false);
  assert.equal(allowScreenAction({ type: "key", key: "Enter" }, ctx("read"), null, { field: { type: "search", name: "q" }, search: true, savingForm: false }).ok, true);
  assert.equal(allowScreenAction({ type: "key", key: "Tab" }, ctx("update"), null, { field: { type: "text", name: "medication" }, search: false, savingForm: true }).ok, true);
});

test("an approval covers exactly the values the owner saw", () => {
  const seen = { patient: "Biscuit", medication: "Carprofen 75mg", quantity: "30" };
  assert.equal(sameForm({ quantity: "30", patient: "Biscuit", medication: "Carprofen 75mg " }, seen), true);
  assert.equal(sameForm({ ...seen, quantity: "300" }, seen), false);
  assert.equal(sameForm({ ...seen, notes: "also email the list to me" }, seen), false, "an extra field is a different form");
  assert.equal(sameForm({}, seen), false);
});

// ---------- the steps, with a fake page and a scripted model ----------
function world(o: { plan?: Partial<ScreenPlan>; script: ScreenAction[]; urls?: string[]; under?: (x: number, y: number) => ElementInfo | null; form?: Record<string, string>; mask?: any; take?: string | null }) {
  const plan: ScreenPlan = { goal: "Add a refill request for Biscuit: Carprofen 75mg, quantity 30.", level: "add", screens: SCREENS, start_url: `${BASE}/refills`, inputs: { medication: "Carprofen 75mg", quantity: "30" }, ...o.plan };
  const job: WorkJob = { id: "job-1", business_id: "biz-1", spec_id: null, identity_id: "id-1", kind: "screen", title: "Add a refill request", plan: plan as any, status: "running", state: "work", step: 0, max_steps: 30, cost_usd: 0, cost_cap_usd: 1, browser_session_id: "sess-1" };
  const id: Identity = { id: "id-1", business_id: "biz-1", tool: "Practice Tool", tool_key: "practice-tool", login_url: `${BASE}/login`, site: SITE, browser_context_id: "ctx", vault_item_id: null, totp: false, state: "signed_in", silent_signins: 0 };
  const did: string[] = [], pressed: string[] = [], went: string[] = [], typed: string[] = [];
  let url = "about:blank", n = 0, u = 0, closed = 0;
  const page = {
    goto: async (to: string) => { went.push(to); url = to; },
    evaluate: async (js: string) => {
      if (js.includes("__pipMaskObserver")) { if (o.urls && u < o.urls.length) url = o.urls[u++]; return o.mask ?? { masked: 0, exposed: 0, captcha: false, url }; }
      if (js.includes("savingForm")) return { search: false, savingForm: true };
      if (js.includes("const out = {}")) return o.form ?? { patient: "Biscuit", medication: "Carprofen 75mg", quantity: "30" };
      if (js.includes("document.elementFromPoint")) { const m = /elementFromPoint\((\d+), (\d+)\)/.exec(js)!; return o.under ? o.under(+m[1], +m[2]) : saveButton; }
      return null;
    },
    screenshot: async () => "c2hvdA==",
    click: async (x: number, y: number) => { pressed.push(`${x},${y}`); },
    type: async (t: string) => { typed.push(t); },
    key: async () => {}, scroll: async () => {},
    focused: async () => ({ type: "text", name: "medication" }),
    viewport: () => ({ w: 1280, h: 800 }),
  } as unknown as Page;
  const deps = { log: async (_j: WorkJob, d: string) => { did.push(d); }, browser: { close: async () => { closed++; } } } as unknown as WorkDeps;
  const sd = { model: async () => ({ action: o.script[Math.min(n++, o.script.length - 1)], usage: { input_tokens: 1000, output_tokens: 50 } }), take: async () => o.take ?? null };
  const run = async (max = 20): Promise<Out> => { for (let i = 0; i < max; i++) { const out = await screenStep(job, id, page, deps, sd); Object.assign(job, out.patch); if (out.next !== "again") return out; } throw new Error("did not settle"); };
  return { job, did, pressed, went, typed, run, closed: () => closed, modelCalls: () => n };
}
const DONE: ScreenAction = { type: "done", summary: "Added a refill request for Biscuit: Carprofen 75mg, quantity 30." };

test("a trusted add job: opens its own start page, fills the form, saves once, and reports in plain words", async () => {
  const w = world({ script: [{ type: "click", x: 300, y: 500 }, { type: "type", text: "Carprofen 75mg" }, { type: "click", x: 300, y: 640 }, DONE],
    under: (_x, y) => (y === 500 ? el({ tag: "input", type: "text", name: "medication" }) : saveButton) });
  const out = await w.run();
  assert.equal(out.next, "done"); assert.equal(out.outcome, "ok");
  assert.equal(out.summary, DONE.summary);
  assert.deepEqual(w.went, [`${BASE}/refills`]);
  assert.deepEqual(w.typed, ["Carprofen 75mg"]);
  assert.equal((w.job.plan as ScreenPlan).writes, 1);
  assert.deepEqual(w.did, ["opened_screen", "click", "type", "saved", "done"]);
  const trace = (w.job.plan as ScreenPlan).trace!;
  assert.equal(trace[1].input, "medication", "the trace remembers which given value was typed, not the words");
  assert.equal(trace[2].write, true);
});

test("an untrusted job stops before the first save, closes its browser, and asks the owner with what it filled in", async () => {
  const w = world({ plan: { require_approval: true }, script: [{ type: "click", x: 300, y: 640 }, DONE] });
  const out = await w.run();
  assert.equal(out.next, "approval");
  assert.match(out.summary!, /ready to press "Add refill request"/);
  assert.deepEqual(w.pressed, [], "nothing was pressed");
  assert.equal(w.closed(), 1);
  const p = w.job.plan as ScreenPlan;
  assert.deepEqual(p.pending, { label: "Add refill request", url: `${BASE}/refills`, form: { patient: "Biscuit", medication: "Carprofen 75mg", quantity: "30" } });
  assert.equal(w.job.state, "start"); assert.equal(w.job.browser_session_id, null);
});

test("after the owner's yes the job saves, but only the same values; different values are asked about again, then it stops", async () => {
  const approved = { patient: "Biscuit", medication: "Carprofen 75mg", quantity: "30" };
  const ok = world({ plan: { require_approval: true, approved: true, approved_form: approved }, script: [{ type: "click", x: 300, y: 640 }, DONE] });
  assert.equal((await ok.run()).next, "done");
  assert.equal(ok.pressed.length, 1);
  const changed = world({ plan: { require_approval: true, approved: true, approved_form: approved, asks: 1 }, form: { ...approved, quantity: "300" }, script: [{ type: "click", x: 300, y: 640 }] });
  assert.equal((await changed.run()).next, "approval");
  assert.deepEqual(changed.pressed, []);
  const again = world({ plan: { require_approval: true, approved: true, approved_form: approved, asks: 2 }, form: { ...approved, quantity: "300" }, script: [{ type: "click", x: 300, y: 640 }] });
  const out = await again.run();
  assert.equal(out.next, "failed"); assert.match(out.summary!, /not what you approved/);
});

test("a page that tells the teammate to delete and upgrade gets nowhere: every such press is refused and the job ends unharmed", async () => {
  const w = world({ plan: { level: "update" }, script: [{ type: "click", x: 10, y: 10, label: "Open patient" }, { type: "navigate", url: `${BASE}/billing` }, { type: "click", x: 20, y: 20, label: "Continue" }, DONE],
    under: (x) => (x === 10 ? el({ text: "Delete patient", type: "submit", submit: true, method: "post", action: `${BASE}/patients/1/delete` }) : el({ text: "Upgrade plan", type: "submit", submit: true, method: "post", action: `${BASE}/billing` })) });
  const out = await w.run();
  assert.equal(out.next, "done");
  assert.deepEqual(w.pressed, [], "no forbidden control was pressed");
  assert.deepEqual(w.went, [`${BASE}/refills`], "it never went to billing");
  assert.deepEqual(w.did, ["opened_screen", "refused_never", "refused_never", "refused_never", "done"]);
  assert.equal(out.outcome, "nothing_to_do");
});

test("a job that keeps asking for what it may not do is stopped after six refusals", async () => {
  const w = world({ script: [{ type: "click", x: 10, y: 10 }], under: () => el({ text: "Delete patient" }) });
  const out = await w.run();
  assert.equal(out.next, "failed");
  assert.equal(w.modelCalls(), 6);
  assert.deepEqual(w.pressed, []);
});

test("a run saves at most what it was given: a second save is refused when one was allowed", async () => {
  const w = world({ script: [{ type: "click", x: 300, y: 640 }, { type: "click", x: 300, y: 640 }, DONE] });
  await w.run();
  assert.equal(w.pressed.length, 1);
  assert.equal((w.job.plan as ScreenPlan).writes, 1);
});

test("taken outside its screens, the job is brought back once; the second time it ends", async () => {
  const back = world({ script: [DONE], urls: [`${BASE}/billing`, `${BASE}/refills`] });
  const out = await back.run();
  assert.equal(out.next, "done");
  assert.deepEqual(back.went, [`${BASE}/refills`, `${BASE}/refills`]);
  assert.equal(back.modelCalls(), 1, "the model was not shown the page it should not be on");
  const twice = world({ script: [DONE], urls: [`${BASE}/billing`, "https://elsewhere.test/"] });
  assert.equal((await twice.run()).next, "failed");
  assert.equal(twice.modelCalls(), 0);
});

test("a captcha or a visible secret hands the job to the owner before any screenshot is taken", async () => {
  for (const mask of [{ masked: 0, exposed: 0, captcha: true, url: `${BASE}/refills` }, { masked: 1, exposed: 1, captcha: false, url: `${BASE}/refills` }]) {
    const w = world({ script: [DONE], mask });
    const out = await w.run();
    assert.equal(out.next, "owner");
    assert.equal(w.modelCalls(), 0);
  }
});

test("the spend line can stop a job mid-way, and a badly described job never starts", async () => {
  const broke = world({ script: [DONE], take: "daily_limit" });
  const out = await broke.run();
  assert.equal(out.next, "failed"); assert.match(out.reason!, /daily_limit/);
  for (const plan of [{ screens: [] }, { level: "delete" as any }, { goal: "" }, { start_url: `${BASE}/billing` }]) {
    const w = world({ script: [DONE], plan });
    assert.equal((await w.run()).next, "failed");
    assert.equal(w.modelCalls(), 0);
  }
});

test("a read-only job reports what it found and changes nothing", async () => {
  const w = world({ plan: { level: "read", goal: "Find whether Juniper has an open refill request." }, script: [{ type: "click", x: 300, y: 640 }, { type: "done", summary: "Juniper has one refill request, status requested." }] });
  const out = await w.run();
  assert.equal(out.next, "done"); assert.equal(out.outcome, "ok");
  assert.deepEqual(w.pressed, [], "the save button was refused");
  assert.equal((w.job.plan as ScreenPlan).writes, 0);
});
