// The redaction step every customer message goes through (supabase/functions/_shared/redact.ts).
//   node --test supabase/functions/_shared/redact.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "./redact.ts";

test("card numbers that pass the card checksum are removed, in any common spacing", () => {
  for (const c of ["4111111111111111", "4111 1111 1111 1111", "4111-1111-1111-1111", "5555 5555 5555 4444", "3782 822463 10005", "6011111111111117"]) {
    const r = redact(`card ${c} thanks`);
    assert.equal(r.text, "card [card number removed] thanks", c);
    assert.deepEqual(r.kinds, ["card"]);
  }
});

test("long numbers that fail the checksum stay: tracking and order numbers are not cards", () => {
  assert.equal(redact("tracking 1234567890123456").text, "tracking 1234567890123456");
});

test("SSNs written the usual way, or named, are removed", () => {
  assert.equal(redact("ssn 123-45-6789").text, "ssn [SSN removed]");
  assert.equal(redact("my social security number is 123456789").text, "my social security number is [SSN removed]");
  assert.deepEqual(redact("123 45 6789").kinds, ["ssn"]);
});

test("passwords, PINs and one-time codes lose their value and keep their label", () => {
  assert.equal(redact("my password is hunter2").text, "my password is [removed]");
  assert.equal(redact("Password: \"correct horse\" ok").text, "Password: [removed] ok");
  assert.equal(redact("pin = 0000").text, "pin = [removed]");
  assert.equal(redact("the code is 482913").text, "the code is [code removed]");
  assert.equal(redact("verification code: 4829").text, "verification code: [code removed]");
});

test("bank account and routing numbers are removed", () => {
  assert.equal(redact("routing number 021000021 account number 12345678").text, "routing number [number removed] account number [number removed]");
});

test("everyday text is untouched", () => {
  for (const s of ["Call me at (208) 555-0100", "Party of 4 at 7:30 PM on 12/24", "Is the pin code for the gate on the website?", "I'd like a cleaning next week", "Order 12345678"]) {
    const r = redact(s);
    assert.equal(r.text, s, s);
    assert.deepEqual(r.kinds, []);
  }
});

test("bad input never throws", () => {
  assert.deepEqual(redact(""), { text: "", kinds: [] });
  assert.deepEqual(redact(undefined as unknown as string), { text: "", kinds: [] });
});

test("ZIP, area, gate and order codes are not secrets and stay", () => {
  for (const s of ["my zip code is 83642", "Zip code 83646 please", "gate code is 4521", "promo code 2026", "job code: 77120", "order code 558812"]) {
    const r = redact(s);
    assert.equal(r.text, s, s);
    assert.deepEqual(r.kinds, []);
  }
  assert.equal(redact("the code is 482913").text, "the code is [code removed]");
  assert.equal(redact("zip code 83642 and my verification code is 482913").text, "zip code 83642 and my verification code is [code removed]");
});

test("a customer's own account number stays unless the message is about a bank", () => {
  const plain = "my account number is 10044871, can you see my last visit?";
  assert.equal(redact(plain).text, plain);
  assert.deepEqual(redact(plain).kinds, []);
  const bank = redact("bank account number 1234567890 routing 021000021");
  assert.ok(!/1234567890|021000021/.test(bank.text), bank.text);
  assert.deepEqual(bank.kinds, ["bank"]);
  const checking = redact("pay from checking, account 000123456789");
  assert.ok(!checking.text.includes("000123456789"), checking.text);
});
