// The older chat path (/api/runtime/chat, classic specs) must say it is an AI on the first reply, in code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withAiNotice } from "../../lib/skills/ai-notice.ts";

test("the first reply says it is an AI even when the model forgets", () => {
  assert.equal(withAiNotice("Sure, we open at 9.", true, "Maya", "TEST Fork"), "This is Maya, an AI assistant for TEST Fork. Sure, we open at 9.");
});
test("a first reply that already says so is left alone", () => {
  const r = "Hi, I'm Maya, an AI assistant for TEST Fork. We open at 9.";
  assert.equal(withAiNotice(r, true, "Maya", "TEST Fork"), r);
});
test("later replies are not changed", () => {
  assert.equal(withAiNotice("We open at 9.", false, "Maya", "TEST Fork"), "We open at 9.");
});
test("a word that only contains the letters 'ai' does not count as saying it", () => {
  assert.match(withAiNotice("Please wait, I will explain.", true, "Maya", "TEST Fork"), /^This is Maya, an AI assistant for TEST Fork\./);
});
test("missing names still produce a true sentence", () => {
  assert.equal(withAiNotice("Hello.", true, "", "TEST Fork"), "This is an AI assistant for TEST Fork. Hello.");
  assert.equal(withAiNotice("Hello.", true, "", ""), "This is an AI assistant. Hello.");
});
