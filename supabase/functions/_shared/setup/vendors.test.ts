// What Pip asks Browserbase for when it opens a browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionBody } from "./vendors.ts";

test("a browser is always asked for with captcha solving and recording off, and a time limit", () => {
  for (const keep of [false, true]) {
    const b = sessionBody("proj_1", "ctx_1", 15, keep);
    assert.equal(b.browserSettings.solveCaptchas, false); assert.equal(b.browserSettings.recordSession, false);
    assert.deepEqual(b.browserSettings.context, { id: "ctx_1", persist: true }); assert.equal(b.timeout, 900); assert.equal(b.projectId, "proj_1");
  }
  assert.equal(sessionBody(undefined, "c", 0, false).timeout, 60, "never less than a minute");
  assert.equal(sessionBody(undefined, "c", 100000, true).timeout, 21600, "never more than six hours, kept alive or not");
  assert.ok(!("projectId" in sessionBody(undefined, "c", 15, false)));
});

test("keep alive is only sent when the switch is on, because the Free plan refuses it", () => {
  assert.ok(!("keepAlive" in sessionBody("p", "c", 15, false)));
  assert.equal(sessionBody("p", "c", 15, true).keepAlive, true);
});
