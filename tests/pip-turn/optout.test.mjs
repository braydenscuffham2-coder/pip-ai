// Job 1: STOP, the AI line and a consent record on every outbound email, and the SMS word list kept in step.
// Each test lets the fake model try to send, then checks what pip-turn's code did before and after.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boot, use, says, acts } from "./harness.mjs";
import { STOP_WORDS, STOP_PHRASE, isStopRequest, EMAIL_OPT_OUT_LINE } from "../../supabase/functions/_shared/optout.ts";

const ok = (data = {}) => ({ status: 200, json: { successful: true, data } });
const send = (body = "Your table is held.") => [acts(use("GMAIL_SEND_EMAIL", { recipient_email: "sam@customer.example", body })), says("I am an AI assistant. Sent.")];

/** A tiny stand-in for the database's consent rules: opted-out addresses are refused, everyone else is allowed. */
function ledger() {
  const state = { revoked: new Set(), granted: new Set() };
  return {
    state,
    rpc: {
      portal_email_gate: (a) => (state.revoked.has(a.p_to.toLowerCase()) ? { allowed: false, reason: "opted_out" } : (a.p_given_in_chat && state.granted.add(a.p_to.toLowerCase()), { allowed: true })),
      portal_email_in: (a) => {
        const who = a.p_from.toLowerCase();
        if (a.p_kind === "stop") { state.revoked.add(who); return { allowed: false, reason: "opted_out" }; }
        if (state.revoked.has(who)) return { allowed: false, reason: "opted_out" };
        state.granted.add(who); return { allowed: true };
      },
    },
  };
}

test("an email is checked for opt-out before it is sent, and the address the customer typed is passed as given in the chat", async () => {
  const l = ledger();
  const t = await boot({ rpc: l.rpc, model: send(), composio: () => ok() });
  await t.turn("I am sam@customer.example, email me");
  const gate = t.rpcs("portal_email_gate");
  assert.equal(gate.length, 1);
  assert.equal(gate[0].args.p_to, "sam@customer.example");
  assert.equal(gate[0].args.p_given_in_chat, true);
  assert.equal(t.executed().length, 1);
  t.restore();
});

test("every email that goes out leaves one record, saying it carried the AI line and the opt-out line", async () => {
  const t = await boot({ rpc: ledger().rpc, model: send(), composio: () => ok() });
  await t.turn("I am sam@customer.example, email me");
  const rec = t.rpcs("portal_outbound_sent");
  assert.equal(rec.length, t.executed().length, "one record per email sent");
  assert.deepEqual({ ...rec[0].args, p_business: "x", p_spec: "x" }, { p_business: "x", p_spec: "x", p_contact: "sam@customer.example", p_kind: "email", p_channel: "email", p_ai_disclosed: true, p_opt_out_offered: true });
  const body = t.executed()[0].body.arguments.body;
  assert.match(body, /an AI assistant for TEST Fork/);
  assert.ok(body.endsWith(EMAIL_OPT_OUT_LINE), "the opt-out line is the last thing in the email");
  t.restore();
});

test("an opt-out line the model already wrote is not added twice", async () => {
  const t = await boot({ rpc: ledger().rpc, model: send("Held. Reply STOP to unsubscribe."), composio: () => ok() });
  await t.turn("I am sam@customer.example, email me");
  assert.equal((t.executed()[0].body.arguments.body.match(/reply stop/gi) ?? []).length, 1);
  t.restore();
});

test("an email to someone who opted out is never sent, never recorded as sent, and the model is told so", async () => {
  const l = ledger(); l.state.revoked.add("sam@customer.example");
  const t = await boot({ rpc: l.rpc, model: send(), composio: () => ok() });
  const r = await t.turn("I am sam@customer.example, email me");
  assert.deepEqual(r.json.actions, [{ tool: "GMAIL_SEND_EMAIL", status: "blocked" }]);
  assert.equal(t.executed().length, 0, "nothing reached Composio");
  assert.equal(t.rpcs("portal_outbound_sent").length, 0);
  assert.match(JSON.stringify(t.toolResults()), /asked not to be emailed/);
  t.restore();
});

test("if the database cannot confirm permission, the email is not sent (fails closed)", async () => {
  for (const answer of [null, { allowed: false, reason: "business_disconnected" }, { reason: "x" }]) {
    const t = await boot({ rpc: { portal_email_gate: () => answer }, model: send(), composio: () => ok() });
    const r = await t.turn("I am sam@customer.example, email me");
    assert.deepEqual(r.json.actions, [{ tool: "GMAIL_SEND_EMAIL", status: "blocked" }], JSON.stringify(answer));
    assert.equal(t.executed().length, 0);
    assert.equal(t.rpcs("portal_outbound_sent").length, 0);
    t.restore();
  }
});

test("a failed send is not recorded as sent", async () => {
  const t = await boot({ rpc: ledger().rpc, model: send(), composio: () => ({ status: 200, json: { successful: false, error: { message: "mailbox full" } } }) });
  await t.turn("I am sam@customer.example, email me");
  assert.equal(t.rpcs("portal_outbound_sent").length, 0);
  t.restore();
});

test("STOP by email is recorded, the model is not called, nobody is emailed, and the sender gets no reply", async () => {
  const l = ledger();
  const t = await boot({ rpc: l.rpc, model: send(), composio: () => ok() });
  for (const msg of ["STOP", "stop.", "Unsubscribe\n\nOn Tue Sam wrote: ...", "please stop emailing me", "Don't email me again"]) {
    const r = await t.turn(msg, { channel: "email", visitor: "sam@customer.example" });
    assert.equal(r.json.reply, "", msg);
    assert.equal(r.json.opted_out, true);
  }
  assert.equal(t.world.model.calls.length, 0, "the model was never called");
  assert.equal(t.executed().length, 0);
  assert.ok(t.rpcs("portal_email_in").every((c) => c.args.p_kind === "stop" && c.args.p_from === "sam@customer.example"));
  t.restore();
});

test("after STOP by email, a later email from the same address is not answered and not emailed back", async () => {
  const l = ledger();
  const t = await boot({ rpc: l.rpc, model: send(), composio: () => ok() });
  await t.turn("STOP", { channel: "email", visitor: "sam@customer.example" });
  const r = await t.turn("actually, are you open Friday?", { channel: "email", visitor: "sam@customer.example" });
  assert.equal(r.json.reply, "");
  assert.equal(t.world.model.calls.length, 0);
  t.restore();
});

test("an ordinary email is recorded as 'wrote first' and answered; a sentence with 'stop' in it is not a STOP", async () => {
  const t = await boot({ rpc: ledger().rpc, model: [says("This is Hallie, an AI assistant for TEST Fork. We open at 5.")] });
  const r = await t.turn("Please don't stop by before five, are you open?", { channel: "email", visitor: "sam@customer.example" });
  assert.match(r.json.reply, /AI assistant/);
  assert.equal(t.rpcs("portal_email_in")[0].args.p_kind, "message");
  t.restore();
});

test("the STOP words are the same here as in the text route", () => {
  const sms = readFileSync(new URL("../../supabase/functions/pip-run/index.ts", import.meta.url), "utf8");
  const words = JSON.parse(sms.match(/const STOP_WORDS = (\[[^\]]*\])/)[1]);
  assert.deepEqual(words, STOP_WORDS);
  // Every phrase the text route understands, the email path understands too.
  for (const p of ["stop texting me", "stop messaging me", "stop contacting me", "take me off", "remove me from the list", "do not text me", "don't contact me"]) {
    assert.ok(STOP_PHRASE.test(p) && isStopRequest(p), p);
  }
});

test("ordinary words are not STOP", () => {
  for (const m of ["Can you stop by at 5?", "I need help", "end of the month works", "Thanks!", ""]) assert.equal(isStopRequest(m), false, m);
});

test("the one outbound gate: when sending is paused, no email goes out and none is recorded", async () => {
  const t = await boot({ rpc: { outbound_paused: true }, model: send(), composio: () => ok() });
  const r = await t.turn("I am sam@customer.example, email me");
  assert.deepEqual(r.json.actions, [{ tool: "GMAIL_SEND_EMAIL", status: "blocked" }]);
  assert.equal(t.executed().length, 0);
  assert.equal(t.rpcs("portal_outbound_sent").length, 0);
  assert.equal(t.rpcs("outbound_gate").length, 1, "the gate was asked once");
  assert.equal(t.rpcs("portal_email_gate").length, 0, "and the email gate was never reached");
  t.restore();
});

test("on a phone call the teammate is told to answer in a sentence or two and is given a small reply budget; chat is unchanged", async () => {
  const t = await boot({ model: [says("We open at five on Friday.")] });
  await t.turn("What time do you open on Friday?", { channel: "voice" });
  const call = t.world.model.calls[0];
  assert.equal(call.max_tokens, 320);
  assert.match(call.system[0].text, /THIS IS A PHONE CALL\. The caller hears your words read aloud\. Answer in one or two short sentences\./);
  t.restore();
  const w = await boot({ model: [says("We open at 5 PM on Friday.")] });
  await w.turn("What time do you open on Friday?");
  assert.equal(w.world.model.calls[0].max_tokens, 1600);
  assert.doesNotMatch(w.world.model.calls[0].system[0].text, /PHONE CALL/);
  w.restore();
});
