// The Setup Agent's hard limits (guards.ts).
//   node --test supabase/functions/_shared/setup/guards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowAction, canScreenshot, costOf, isCaptchaUrl, isSecretField, leaks, sessionMinutes, sliceHashes, siteOf } from "./guards.ts";

test("the model sees the page only in its own states, never while the owner has control", () => {
  for (const s of ["find_login", "verify", "configuring", "testing"]) assert.equal(canScreenshot(s), true, s);
  for (const s of ["owner_control", "consent", "opening", "saving", "paused", "done"]) assert.equal(canScreenshot(s), false, s);
});

test("secret fields are recognised by type, autocomplete, name, label, and by having been filled by the vault", () => {
  assert.equal(isSecretField({ type: "password" }), true);
  assert.equal(isSecretField({ type: "text", autocomplete: "one-time-code" }), true);
  assert.equal(isSecretField({ type: "text", name: "otp_code" }), true);
  assert.equal(isSecretField({ type: "text", label: "Verification code" }), true);
  assert.equal(isSecretField({ type: "text", name: "api_key" }), true);
  assert.equal(isSecretField({ type: "email", name: "email", filled: true }), true, "a field the vault filled stays secret");
  assert.equal(isSecretField({ type: "text", name: "business_name", label: "Business name" }), false);
  assert.equal(isSecretField({ type: "email", name: "email" }), false);
});

test("captcha and bot-check frames are recognised", () => {
  for (const u of ["https://www.google.com/recaptcha/api2/anchor", "https://newassets.hcaptcha.com/captcha/v1", "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/turnstile", "https://client-api.arkoselabs.com/fc"]) assert.equal(isCaptchaUrl(u), true, u);
  assert.equal(isCaptchaUrl("https://app.example.com/settings"), false);
});

test("the site a setup may move around in is the login page's own domain", () => {
  assert.equal(siteOf("https://login.hubspot.com/login"), "hubspot.com");
  assert.equal(siteOf("https://app.supplier.co.uk/sign-in"), "supplier.co.uk");
  assert.equal(siteOf("not a url"), null);
});

const ctx = { state: "configuring", site: "example.com", viewport: { w: 1280, h: 800 } };

test("the model may click, type into ordinary fields, scroll and move inside the tool's site", () => {
  assert.deepEqual(allowAction({ type: "click", x: 100, y: 200, label: "Settings" }, ctx), { ok: true });
  assert.deepEqual(allowAction({ type: "type", text: "Front desk", field: { type: "text", name: "display_name" } }, ctx), { ok: true });
  assert.deepEqual(allowAction({ type: "navigate", url: "https://app.example.com/settings/integrations" }, ctx), { ok: true });
  assert.deepEqual(allowAction({ type: "scroll", dy: 400 }, ctx), { ok: true });
});

test("the model may never type into a secret field, even one it thinks is ordinary", () => {
  const r = allowAction({ type: "type", text: "hunter2", field: { type: "password" } }, ctx);
  assert.equal(r.ok, false);
  assert.equal(allowAction({ type: "type", text: "x", field: { type: "text", autocomplete: "one-time-code" } }, ctx).ok, false);
});

test("money, deletion, plan changes and giving access away are never pressed", () => {
  for (const label of ["Delete account", "Upgrade to Pro", "Buy now", "Add card", "Cancel subscription", "Transfer ownership", "Billing", "Place order", "Change password"]) {
    assert.equal(allowAction({ type: "click", x: 10, y: 10, label }, ctx).ok, false, label);
  }
});

test("the model may not leave the tool's site, or act at all while the owner has control", () => {
  assert.equal(allowAction({ type: "navigate", url: "https://evil.example.net/" }, ctx).ok, false);
  assert.equal(allowAction({ type: "navigate", url: "http://app.example.com/" }, ctx).ok, false, "https only");
  assert.equal(allowAction({ type: "click", x: 10, y: 10 }, { ...ctx, state: "owner_control" }).ok, false);
  assert.equal(allowAction({ type: "click", x: 5000, y: 10 }, ctx).ok, false, "off the page");
});

test("cost per call is priced at Sonnet 5.5 list rates", () => {
  assert.equal(costOf({ input_tokens: 1_000_000, output_tokens: 100_000 }), 2 + 1);
});

test("the leak check finds a secret's 8-character slices in text without knowing the secret", async () => {
  const hashes = new Set(await sliceHashes("Tr0ub4dor&3-correct-horse"));
  assert.ok((await leaks("the log says Tr0ub4dor&3 here", hashes)) > 0);
  assert.ok((await leaks("…correct-horse…", hashes)) > 0, "a fragment of 8 or more characters is still found");
  assert.equal(await leaks("nothing to see, password [removed]", hashes), 0);
});

test("a browser session defaults to 15 minutes (the Free plan's limit) and only a sensible setting changes it", () => {
  for (const v of [undefined, null, "", "soon", {}, NaN, true]) assert.equal(sessionMinutes(v), 15, String(v));
  assert.equal(sessionMinutes(30), 30);
  assert.equal(sessionMinutes("45"), 45);
  assert.equal(sessionMinutes(1), 5, "never under 5 minutes");
  assert.equal(sessionMinutes(100000), 360, "never over 6 hours");
});
