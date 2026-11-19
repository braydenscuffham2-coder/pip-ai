// The sign-in return route on hirepip.com must pass everything to Composio unchanged and keep nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../app/api/connect/callback/route.ts";

test("the return from a sign-in is forwarded to Composio with the same query, untouched", () => {
  const q = "?state=abc.DEF-123&code=4%2F0AbC_dEf%2Bg%3D&scope=email%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send&authuser=0&prompt=consent";
  const r = GET(new Request("https://www.hirepip.com/api/connect/callback" + q));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://backend.composio.dev/api/v3/toolkits/auth/callback" + q);
});
test("it can only ever send the browser to Composio, whatever the request says", () => {
  for (const q of ["?redirect=https://evil.example", "?next=//evil.example&to=https%3A%2F%2Fevil.example", "", "?error=access_denied&state=x"]) {
    const loc = new URL(GET(new Request("https://www.hirepip.com/api/connect/callback" + q)).headers.get("location"));
    assert.equal(loc.origin, "https://backend.composio.dev");
    assert.equal(loc.pathname, "/api/v3/toolkits/auth/callback");
    assert.equal(loc.search, q);
  }
});
test("the answer is never cached and sends no referrer", () => {
  const r = GET(new Request("https://www.hirepip.com/api/connect/callback?code=x"));
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});
