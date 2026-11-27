// The script background work runs in a tool's page to tell what kind of page it is, run in a simulated page (jsdom).
//   node --test supabase/functions/_shared/work/page-scripts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGN_STATE_JS } from "./engine.ts";

let JSDOM: any = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* not installed */ }

function read(html: string, url = "https://app.practicetool.com/login") {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: "outside-only", url });
  dom.window.Element.prototype.getBoundingClientRect = function () { return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0 }; };
  return { ...dom.window.eval(SIGN_STATE_JS) };
}

test("a password form reads as signed out", { skip: !JSDOM }, () => {
  const s = read(`<form><input type="email" name="email"><input type="password" name="password"><button>Sign in</button></form>`);
  assert.deepEqual([s.pass, s.user, s.code, s.captcha], [true, false, false, false]);
  assert.equal(s.host, "app.practicetool.com");
});

test("a username-first form reads as signed out, with no password field yet", { skip: !JSDOM }, () => {
  const s = read(`<form><input type="email" name="email" autocomplete="username"><button>Next</button></form>`);
  assert.deepEqual([s.pass, s.user, s.code], [false, true, false]);
});

test("a code prompt is told apart from a password form and from an ordinary page", { skip: !JSDOM }, () => {
  const s = read(`<form><label>Enter the 6-digit code <input type="text" name="otp" autocomplete="one-time-code"></label><button>Verify</button></form>`);
  assert.deepEqual([s.pass, s.user, s.code], [false, false, true]);
});

test("the tool's own pages, with search boxes and record forms, read as signed in", { skip: !JSDOM }, () => {
  const s = read(`<input type="search" name="q" placeholder="Search patients"><form><input name="pet_name"><input name="owner_phone"><textarea name="notes"></textarea><button>Save</button></form>`, "https://app.practicetool.com/patients");
  assert.deepEqual([s.pass, s.user, s.code, s.captcha], [false, false, false, false]);
});

test("a captcha frame is reported", { skip: !JSDOM }, () => {
  const s = read(`<form><input type="password" name="p"></form><iframe src="https://www.google.com/recaptcha/api2/anchor?k=x"></iframe>`);
  assert.equal(s.captcha, true);
});

test("a hidden password field does not make a signed-in page look signed out", { skip: !JSDOM }, () => {
  const s = read(`<input type="password" name="p" style="display:none"><h1>Dashboard</h1>`);
  assert.equal(s.pass, false);
});

test("a record form with an email field on a signed-in page is never mistaken for a sign-in", { skip: !JSDOM }, () => {
  const s = read(`<h1>New client</h1><form><input name="client_name"><input type="email" name="email"><input name="phone"><button>Save</button></form>`, "https://app.practicetool.com/clients/new");
  assert.equal(s.user, false);
  const one = read(`<form><input type="email" name="email" placeholder="Invite a teammate"><button>Send invite</button></form>`, "https://app.practicetool.com/team");
  assert.equal(one.user, false, "one email field with an unrelated button is not a sign-in either");
});

// ---------- screen work's page scripts ----------
import { ELEMENT_AT_JS, FORM_AT_JS, SELECT_AT_JS } from "./screen.ts";

function pageWith(html: string, pick: string, url = "https://www.hirepip.com/practice/sb1/refills") {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: "outside-only", url });
  const w = dom.window;
  // jsdom lays nothing out, so "the element under the point" is chosen by the test.
  w.document.elementFromPoint = () => w.document.querySelector(pick);
  return w;
}
const REFILL = `<form method="post" action="/practice/sb1/refills"><select name="patient"><option>Biscuit</option><option>Juniper</option></select>
  <input name="medication" value="Carprofen 75mg"><input name="quantity" value="30"><input type="hidden" name="csrf" value="tok"><input type="password" name="pin" value="1234"><input name="api_key" value="k">
  <button type="submit"><span id="inner">Add refill request</span></button></form>
  <form method="get" action="/practice/sb1/patients"><input type="search" name="q"><button>Search</button></form>
  <a id="bill" href="/practice/sb1/billing">Billing</a><form method="post" action="/practice/sb1/patients/9/delete"><button id="del">Delete patient</button></form>`;

test("the page reports what is really under a point: a saving button, even when the click lands on text inside it", { skip: !JSDOM }, () => {
  const e = { ...pageWith(REFILL, "#inner").eval(ELEMENT_AT_JS(10, 10)) };
  assert.deepEqual([e.tag, e.text, e.submit, e.method], ["button", "Add refill request", true, "post"]);
  assert.equal(e.action, "https://www.hirepip.com/practice/sb1/refills");
});

test("a search button, a link and a delete button are each told apart by the page's own markup", { skip: !JSDOM }, () => {
  const search = { ...pageWith(REFILL, "form[method=get] button").eval(ELEMENT_AT_JS(1, 1)) };
  assert.deepEqual([search.submit, search.method], [true, "get"]);
  const link = { ...pageWith(REFILL, "#bill").eval(ELEMENT_AT_JS(1, 1)) };
  assert.deepEqual([link.tag, link.href], ["a", "https://www.hirepip.com/practice/sb1/billing"]);
  const del = { ...pageWith(REFILL, "#del").eval(ELEMENT_AT_JS(1, 1)) };
  assert.equal(del.action, "https://www.hirepip.com/practice/sb1/patients/9/delete");
  assert.equal(del.text, "Delete patient");
});

test("the form shown to the owner for approval holds the record's values and never a secret or hidden field", { skip: !JSDOM }, () => {
  const form = { ...pageWith(REFILL, "#inner").eval(FORM_AT_JS(10, 10)) };
  assert.deepEqual(form, { patient: "Biscuit", medication: "Carprofen 75mg", quantity: "30" });
});

test("a drop-down option is chosen by its words, and a wrong name gets the real options back", { skip: !JSDOM }, () => {
  const w = pageWith(REFILL, "select[name=patient]");
  assert.deepEqual({ ...w.eval(SELECT_AT_JS(1, 1, "juniper")) }, { ok: true, chosen: "Juniper" });
  assert.equal(w.document.querySelector("select[name=patient]").value, "Juniper");
  const miss = w.eval(SELECT_AT_JS(1, 1, "Rex"));
  assert.equal(miss.ok, false); assert.deepEqual([...miss.options], ["Biscuit", "Juniper"]);
  assert.equal(pageWith(REFILL, "#bill").eval(SELECT_AT_JS(1, 1, "Biscuit")).why, "no_select");
});
