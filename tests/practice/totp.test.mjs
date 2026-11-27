// The practice tool's one-time codes against the published test values (RFC 6238, SHA-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { codeAt, codeOk, newSecret, base32Decode } from "../../lib/practice/totp.ts";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // the RFC's key "12345678901234567890"

test("codes match the published values", () => {
  assert.equal(base32Decode(SECRET).toString("ascii"), "12345678901234567890");
  assert.equal(codeAt(SECRET, 59_000), "287082");
  assert.equal(codeAt(SECRET, 1111111109_000), "081804");
  assert.equal(codeAt(SECRET, 1234567890_000), "005924");
});

test("the current code and its neighbours are accepted; anything else is not", () => {
  const now = 1234567890_000;
  assert.equal(codeOk(SECRET, "005924", now), true);
  assert.equal(codeOk(SECRET, codeAt(SECRET, now - 30_000), now), true);
  assert.equal(codeOk(SECRET, codeAt(SECRET, now - 90_000), now), false);
  assert.equal(codeOk(SECRET, "000000", now), false);
  assert.equal(codeOk(SECRET, "", now), false);
});

test("a new setup key is 32 base32 characters and differs each time", () => {
  const a = newSecret(), b = newSecret();
  assert.match(a, /^[A-Z2-7]{32}$/);
  assert.notEqual(a, b);
});
