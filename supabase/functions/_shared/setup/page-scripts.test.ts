// The scripts the Setup Agent runs inside the tool's page, run here in a simulated page (jsdom).
// Skips itself when jsdom is not installed (npm i --no-save jsdom to run it).
//   node --test supabase/functions/_shared/setup/page-scripts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MASK_JS, SIGNED_IN_JS, TAG_LOGIN_JS } from "./guards.ts";
import { fillLogin } from "./cdp.ts";
import type { Page } from "./engine.ts";

let JSDOM: any = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* not installed */ }

const LOGIN = `<form action="/session"><label>Email <input type="email" name="email"></label><label>Password <input type="password" name="password"></label>
  <input type="text" name="otp" placeholder="One-time code"><button type="submit">Sign in</button></form><input type="text" name="search">`;

function pageFrom(html: string) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: "outside-only", url: "https://app.example.com/login" });
  const w = dom.window;
  // jsdom lays nothing out: give every element a size so "visible" checks pass, as in a real browser.
  w.Element.prototype.getBoundingClientRect = function () { return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0 }; };
  let submitted = 0;
  w.HTMLFormElement.prototype.requestSubmit = function () { submitted++; };
  w.document.addEventListener("submit", (e: any) => { e.preventDefault(); submitted++; });
  const page = {
    evaluate: async (js: string) => w.eval(js),
    type: async (t: string) => { const el = w.document.activeElement; if (el && "value" in el) el.value += t; },
  } as unknown as Page;
  return { w, page, submitted: () => submitted };
}

test("the login step tags the username, password and submit button by the page's own markup", { skip: !JSDOM }, async () => {
  const { w, page } = pageFrom(LOGIN);
  assert.deepEqual({ ...(await page.evaluate(TAG_LOGIN_JS)) }, { user: true, pass: true, submit: true, twoStep: false });
  assert.equal(w.document.querySelector("[data-pip-user]").name, "email");
  assert.equal(w.document.querySelector("[data-pip-pass]").name, "password");
  assert.equal(w.document.querySelector("[data-pip-submit]").textContent, "Sign in");
});

test("a two-step login (email first) is recognised, so the owner finishes on the page", { skip: !JSDOM }, async () => {
  const { page } = pageFrom(`<form><input type="email" name="email"><button>Next</button></form>`);
  assert.deepEqual({ ...(await page.evaluate(TAG_LOGIN_JS)) }, { user: true, pass: false, submit: true, twoStep: true });
});

test("vault-writer types into the tagged fields, marks them as secret, and submits", { skip: !JSDOM }, async () => {
  const { w, page, submitted } = pageFrom(LOGIN);
  await page.evaluate(TAG_LOGIN_JS);
  const r = await fillLogin(page, "owner@testfork.example", "Tr0ub4dor&3");
  assert.deepEqual(r, { user: true, pass: true, submitted: true });
  assert.equal(w.document.querySelector("[name=email]").value, "owner@testfork.example");
  assert.equal(w.document.querySelector("[name=password]").value, "Tr0ub4dor&3");
  assert.equal(w.document.querySelector("[name=email]").dataset.pipFilled, "1", "the username is masked too");
  assert.ok(submitted() >= 1);
});

test("before any screenshot, every secret field and every filled field is blurred", { skip: !JSDOM }, async () => {
  const { w, page } = pageFrom(LOGIN);
  await page.evaluate(TAG_LOGIN_JS);
  await fillLogin(page, "owner@testfork.example", "Tr0ub4dor&3");
  const r = await page.evaluate(MASK_JS);
  assert.equal(r.masked, 3, "password, one-time code, and the filled email");
  for (const n of ["password", "otp", "email"]) assert.match(w.document.querySelector(`[name=${n}]`).style.filter, /blur/, n);
  assert.equal(w.document.querySelector("[name=search]").style.filter, "", "ordinary fields stay readable");
  assert.equal(r.exposed, 0);
  assert.equal(r.captcha, false);
});

test("a 'show password' toggle does not get past the mask, and a captcha frame is reported", { skip: !JSDOM }, async () => {
  const { w, page } = pageFrom(LOGIN + `<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>`);
  await page.evaluate(MASK_JS);
  const pw = w.document.querySelector("[name=password]");
  pw.value = "Tr0ub4dor&3";
  pw.style.removeProperty("filter");
  pw.type = "text"; // the site's own "show password" button
  await new Promise((r) => setTimeout(r, 0)); // let the watcher run
  assert.match(pw.style.filter, /blur/, "re-masked");
  const r = await page.evaluate(MASK_JS);
  assert.equal(r.captcha, true);
});

test("signed-in check: a password field still on screen means still signing in", { skip: !JSDOM }, async () => {
  assert.equal((await pageFrom(LOGIN).page.evaluate(SIGNED_IN_JS)).passwordShowing, true);
  assert.equal((await pageFrom(`<h1>Dashboard</h1>`).page.evaluate(SIGNED_IN_JS)).passwordShowing, false);
});
