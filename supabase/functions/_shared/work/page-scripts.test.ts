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
