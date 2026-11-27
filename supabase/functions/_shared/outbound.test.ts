// The one outbound gate, its plain refusals, and the shape of a text Pip sends first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstText, gate, phone, refusal } from "./outbound.ts";

test("the gate fails closed: an error, an empty answer or anything but allowed:true is a no", async () => {
  const calls: unknown[] = [];
  const yes = async (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return { data: { allowed: true, ledger_id: 7 } }; };
  assert.deepEqual(await gate(yes, { business: "b", spec: "s", channel: "sms", to: "+12085550100", first: true }), { allowed: true, reason: null, consent_id: 7 });
  assert.deepEqual(calls[0], ["outbound_gate", { p_business: "b", p_spec: "s", p_channel: "sms", p_to: "+12085550100", p_first: true, p_given_in_chat: false }]);
  assert.equal((await gate(async () => ({ data: { allowed: false, reason: "opted_out" } }), { business: "b", channel: "email", to: "a@example.test" })).reason, "opted_out");
  for (const bad of [async () => ({ data: null }), async () => ({ data: { allowed: "yes" } }), async () => ({ data: { allowed: true }, error: { message: "x" } }), async () => { throw new Error("down"); }]) {
    // deno-lint-ignore no-explicit-any
    const r = await gate(bad as any, { business: "b", channel: "post" });
    assert.equal(r.allowed, false);
  }
});

test("a refusal tells the teammate nothing was sent and gives no way around it", () => {
  for (const r of ["opted_out", "paused", "texting_first_off", "no_consent_on_file", "outside_hours", "frequency_cap", "business_disconnected", "something_new", null]) {
    for (const ch of ["email", "sms", "post"] as const) { const t = refusal(r, ch); assert.match(t, /^Blocked: /); assert.match(t, /[Nn]othing was sent|Do not try again/); assert.doesNotMatch(t, /try again later|another (way|channel)/i); }
  }
});

test("a first text carries the AI line and STOP once, and stays short", () => {
  const t = firstText("Your table for four is held for 7pm Friday.", "Hallie", "TEST Fork")!;
  assert.match(t, /^Your table for four is held for 7pm Friday\. This is Hallie, an AI assistant for TEST Fork\. Reply STOP to opt out\.$/);
  assert.ok(firstText("x".repeat(900), "Hallie", "TEST Fork")!.length <= 480);
  assert.equal(firstText("Hi. Reply STOP to opt out.", "Hallie", "TEST Fork"), "Hi. Reply STOP to opt out.");
  assert.equal(firstText("  ", "Hallie", "TEST Fork"), null);
});

test("phone numbers: US ten digits and +country are accepted, anything else is not", () => {
  assert.equal(phone("(208) 555-0100"), "+12085550100"); assert.equal(phone("1 208 555 0100"), "+12085550100"); assert.equal(phone("+442079460000"), "+442079460000");
  for (const bad of ["555-0100", "0000000000", "call me", "", null, "+1"]) assert.equal(phone(bad), null);
});
