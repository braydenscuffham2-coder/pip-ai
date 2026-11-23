// The Portal's vault step: what it refuses before anything is stored.
//   node --test supabase/functions/_shared/vault-input.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { vaultRefusal } from "./vault-input.ts";

test("a field named like a secret is refused, as before", () => {
  assert.equal(vaultRefusal({ tool_name: "Supplier portal", password: "x" })?.code, "vault_closed");
});

test("a secret typed into an ordinary field is refused too", () => {
  assert.equal(vaultRefusal({ tool_name: "Supplier portal, my password is hunter2" })?.code, "vault_closed");
  assert.equal(vaultRefusal({ tool_name: "Card 4111 1111 1111 1111" })?.code, "vault_closed");
});

test("a sign-in link with a username or password in it is refused", () => {
  assert.equal(vaultRefusal({ tool_name: "Supplier portal", login_url: "https://owner:hunter2@portal.example.com/login" })?.code, "vault_closed");
  assert.equal(vaultRefusal({ tool_name: "Supplier portal", login_url: "https://owner@portal.example.com/login" })?.code, "vault_closed");
});

test("a link that is not a web page is refused", () => {
  assert.equal(vaultRefusal({ tool_name: "Supplier portal", login_url: "javascript:alert(1)" })?.code, "bad_link");
  assert.equal(vaultRefusal({ tool_name: "Supplier portal", login_url: "not a link" })?.code, "bad_link");
});

test("an ordinary request passes", () => {
  assert.equal(vaultRefusal({ tool_name: "Sysco supplier portal", login_url: "https://shop.sysco.com/login" }), null);
  assert.equal(vaultRefusal({ tool_name: "Sysco supplier portal" }), null);
});
