import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { address, INBOXES, noticeFor } from "./mail-in.ts";

const mail = (over = {}) => ({ object: "email", id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c", to: ["privacy@hirepip.com"], from: "Dana Test <dana@example.com>", subject: "Please delete my data", text: "My phone is 208-555-0100.", html: "<p>secret body</p>", ...over });

test("a message to a published inbox becomes one short notice with no body in it", () => {
  const n = noticeFor(mail());
  assert.equal(n?.inbox, "privacy@hirepip.com");
  assert.deepEqual(n?.lines.slice(0, 3), ["Inbox: privacy@hirepip.com", "From: dana@example.com", "Subject: Please delete my data"]);
  assert.ok(n?.lines.some((l) => /45 days/.test(l)), "a privacy request carries the deadline the policy promises");
  assert.ok(!JSON.stringify(n).includes("208-555-0100") && !JSON.stringify(n).includes("secret body"), "the message body is never copied into the notice");
});

test("legal and support mail is announced without the privacy deadline; other addresses are not announced", () => {
  for (const a of ["legal@hirepip.com", "support@hirepip.com"]) {
    const n = noticeFor(mail({ to: [`Pip <${a.toUpperCase()}>`] }));
    assert.equal(n?.inbox, a);
    assert.ok(!n?.lines.some((l) => /45 days/.test(l)));
  }
  assert.equal(noticeFor(mail({ to: ["random@hirepip.com"] })), null);
  assert.equal(noticeFor(mail({ to: ["privacy@hirepip.com.evil.example"] })), null);
  assert.equal(noticeFor(mail({ to: ["x@other.example"], received_for: ["support@hirepip.com"] }))?.inbox, "support@hirepip.com");
});

test("a message with no id, or nothing at all, gives no notice", () => {
  for (const bad of [null, undefined, "x", 7, {}, mail({ id: "" }), mail({ id: 5 })]) assert.equal(noticeFor(bad), null);
});

test("a hostile subject or sender cannot break out of its line or grow without limit", () => {
  const n = noticeFor(mail({ subject: "Hi\r\nInbox: legal@hirepip.com\n" + "x".repeat(500), from: "\"A\nB\" <evil@example.com>\nSubject: fake" }));
  assert.equal(n?.lines.length, 5);
  for (const l of n!.lines) assert.ok(!/[\r\n]/.test(l) && l.length <= 200);
  assert.equal(n?.lines[1], "From: evil@example.com");
  assert.equal(address("no address here"), "");
});

test("the three published inboxes are the ones the public pages print", () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  assert.ok(read("../../../legal/privacy-policy.md").includes(INBOXES[0]));
  assert.ok(read("../../../legal/terms-of-service.md").includes(INBOXES[1]));
  assert.ok(read("../../../lib/legal/facts.ts").includes(INBOXES[2]));
});

test("the function trusts only what it fetched itself, and announces each message once", () => {
  const src = readFileSync(fileURLToPath(new URL("../pip-mail-in/index.ts", import.meta.url)), "utf8");
  assert.match(src, /api\.resend\.com\/emails\/receiving\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(src, /const mail = await r\.json\(\);/); assert.match(src, /noticeFor\(mail\)/, "the notice is built from the fetched message, not from the event");
  assert.match(src, /doorAddress\(mail\)/, "a business's door is read from the fetched message too, never from the event");
  assert.ok(src.indexOf("doorAddress(mail)") < src.indexOf("noticeFor(mail)"), "door mail goes to pip-edge before any founder notice is considered");
  assert.ok(!/noticeFor\(ev/.test(src));
  assert.ok(src.indexOf('eq("kind", "mail_in")') < src.indexOf('rpc("portal_notify"'), "checks for an earlier notice before sending one");
});
