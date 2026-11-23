// Tests for the operator's run-time steps. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/operate-run.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { caseKeyFor, contactOf, contextOf, dueRun, eventPlan, inCallingHours, isOperatorRun, operatorInput, operatorSend, passes, recordIdOf, type SendRefs } from "./operate-run.ts";
import { compileOperator } from "./operate.ts";
import { CONTRACT } from "./teammate-spec.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const specFor = (p: "review_requests" | "quote_followup" | "content_social"): J => { const c = compileOperator(p, { business: "Fork Plumbing", teammate: "Pip", channels: p === "content_social" ? ["facebook"] : ["email"] }); return { contract: CONTRACT, jobs: c.jobs, operate: c.operate }; };
const REVIEW = specFor("review_requests"), QUOTE = specFor("quote_followup"), POSTS = specFor("content_social");
const job = (s: J, id: string) => s.jobs.find((j: J) => j.id === id);

test("calling hours: 08:00 up to but not including 20:00, in the business's own zone", () => {
  assert.equal(inCallingHours(new Date("2026-11-02T17:00:00Z"), "America/Boise"), true);   // 10:00
  assert.equal(inCallingHours(new Date("2026-11-03T03:30:00Z"), "America/Boise"), false);  // 20:30 the day before
  assert.equal(inCallingHours(new Date("2026-11-02T15:00:00Z"), "America/Boise"), true);   // 08:00 exactly
  assert.equal(inCallingHours(new Date("2026-11-03T03:00:00Z"), "America/Boise"), false);  // 20:00 exactly
  assert.equal(inCallingHours(new Date("2026-11-02T10:00:00Z"), "America/Boise"), false);  // 03:00
});
test("the record an event is about, and the case key", () => {
  assert.equal(recordIdOf({ key: "k1", data: { id: 42 } }), "42");
  assert.equal(recordIdOf({ key: "k1", data: { record_id: "abc" } }), "abc");
  assert.equal(recordIdOf({ key: "k1", data: {} }), "k1");
  for (const bad of [{}, { key: "" }, { key: "has space" }, { key: "x".repeat(200) }, { key: null, data: null }]) assert.equal(recordIdOf(bad as J), null);
  assert.equal(caseKeyFor("ask_review", "42"), "c:ask_review:42");
  assert.ok(caseKeyFor("a", "x".repeat(300)).length <= 200);
});
test("the customer's email comes from the event data, or nowhere", () => {
  assert.deepEqual(contactOf({ contact_email: " a@example.test " }), { contact: "a@example.test", kind: "email" });
  assert.deepEqual(contactOf({ contact: { email: "b@example.test" } }), { contact: "b@example.test", kind: "email" });
  for (const bad of [null, {}, { email: "nope" }, { contact: "a@example.test" }, { email: 5 }]) assert.equal(contactOf(bad), null);
});
test("passes() is the same test pip-jobs uses for an event's condition", () => {
  assert.equal(passes(undefined, {}), true);
  assert.equal(passes({ field: "status", is: "completed" }, { status: "completed" }), true);
  assert.equal(passes({ field: "status", is: "completed" }, { status: "open" }), false);
  assert.equal(passes({ field: "n", over: 2 }, { n: 3 }), true);
  assert.equal(passes({ field: "n", under: 2 }, { n: "3" }), false);
});
test("a finished job opens one review case; a job no longer finished closes it; other events do nothing", () => {
  const j = job(REVIEW, "ask_review"), ev = { from: "field_service", event: "record_changed", records: "job", key: "e1" };
  assert.deepEqual(eventPlan(REVIEW, j, { ...ev, data: { id: 7, status: "completed", contact_email: "a@example.test" } }), { kind: "open", case_key: "c:ask_review:7", contact: "a@example.test", stage: null, context: { email: "a@example.test" } });
  assert.deepEqual(eventPlan(REVIEW, j, { ...ev, data: { id: 7, status: "scheduled" } }), { kind: "finish", case_key: "c:ask_review:7" });
  assert.deepEqual(eventPlan(REVIEW, j, { ...ev, event: "other", data: { id: 7, status: "completed" } }), { kind: "none" });
  assert.deepEqual(eventPlan(REVIEW, j, { ...ev, from: "crm", data: { id: 7, status: "completed" } }), { kind: "none" });
  assert.deepEqual(eventPlan(REVIEW, j, { ...ev, key: "has space", data: {} }), { kind: "none" });
});
test("a quote reaching 'quote sent' opens a case with no amount carried; leaving it closes the case", () => {
  const j = job(QUOTE, "follow_up_quote"), ev = { from: "crm", event: "record_changed", records: "deal", key: "e2" };
  const open = eventPlan(QUOTE, j, { ...ev, data: { id: "D-9", stage: "quote_sent", amount: 4200, contact_email: "a@example.test" } });
  assert.equal(open.kind, "open");
  assert.equal(JSON.stringify(open).includes("4200"), false, "the amount never enters the case");
  assert.equal(eventPlan(QUOTE, j, { ...ev, data: { id: "D-9", stage: "won" } }).kind, "finish");
});
test("a job that is not case-driven (the posting operator, or any other teammate) is never planned here", () => {
  const ev = { from: "x", event: "record_changed", records: "job", key: "e", data: { id: 1 } };
  assert.deepEqual(eventPlan(POSTS, job(POSTS, "plan_week"), ev), { kind: "none" });
  assert.deepEqual(eventPlan({ contract: CONTRACT, jobs: [] }, { id: "x", triggers: [{ type: "event", from: "x", event: "record_changed", records: "job" }] }, ev), { kind: "none" });
  for (const s of [null, undefined, 1, "x", {}]) assert.doesNotThrow(() => eventPlan(s, { id: "a", triggers: [] }, ev));
});
test("a due case becomes one run keyed by case and touch, so a second knock starts nothing", () => {
  assert.deepEqual(dueRun({ case_key: "c:a:1", touches: 0 }), { key: "o:c:a:1:1", input: { operator: { case_key: "c:a:1", touch: 1 }, customer: {} } });
  assert.deepEqual(dueRun({ case_key: "c:a:1", touches: 1, context: { first_name: "Pat", email: "p@example.test", amount: "4200" } }).input.customer, { first_name: "Pat", email: "p@example.test" });
  assert.equal(dueRun({ case_key: "c:a:1", touches: 1 }).key, "o:c:a:1:2");
  assert.equal(dueRun({ case_key: "c:a:1", touches: 1 }).key === dueRun({ case_key: "c:a:1", touches: 1 }).key, true);
});
test("operatorInput accepts only the shape pip-jobs writes", () => {
  assert.deepEqual(operatorInput({ operator: { case_key: "c:a:1", touch: 2 } }), { case_key: "c:a:1", touch: 2 });
  for (const bad of [null, {}, { operator: null }, { operator: { case_key: "", touch: 1 } }, { operator: { case_key: "k", touch: 0 } }, { operator: { case_key: "k", touch: 1.5 } }, { operator: { case_key: "k", touch: 99 } }, { operator: { case_key: "k".repeat(201), touch: 1 } }, { operator: { case_key: 5, touch: 1 } }]) assert.equal(operatorInput(bad), null);
  assert.equal(isOperatorRun(REVIEW, "ask_review", { operator: { case_key: "k", touch: 1 } }), true);
  assert.equal(isOperatorRun(REVIEW, "ask_review", {}), false, "started without a case: no send tool");
  assert.equal(isOperatorRun(POSTS, "plan_week", { operator: { case_key: "k", touch: 1 } }), false);
});

// ---------- the send ----------
function refs(over: Partial<SendRefs> = {}): SendRefs & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    caseId: async () => (calls.push("case"), "case-1"),
    reserve: async () => (calls.push("reserve"), { ok: true }),
    check: async () => (calls.push("check"), { ok: true, purpose: "transactional" }),
    gate: async () => (calls.push("gate"), { allowed: true }),
    ...over,
  } as J;
}
const ASK = (args: J = { recipient_email: "a@example.test", body: "Thanks for choosing us. Would you leave a review?" }, channel = "email", input: J = { operator: { case_key: "c:ask_review:7", touch: 1 } }) => ({ spec: "s1", input, channel, args, teammate: "Pip", business: "Fork Plumbing" });

test("a send reserves the touch first, then asks the database, then the consent gate, then adds the two lines", async () => {
  const r = refs();
  const out = await operatorSend(r, ASK());
  assert.equal(out.ok, true);
  assert.deepEqual(r.calls, ["case", "reserve", "check", "gate"]);
  if (out.ok) {
    assert.match(out.args.body, /Sent by Pip, an AI assistant for Fork Plumbing\./);
    assert.match(out.args.body, /Reply STOP to opt out of further emails\./);
    assert.equal(out.to, "a@example.test"); assert.equal(out.purpose, "transactional");
  }
});
test("the lines are not doubled when the body already carries them", async () => {
  const out = await operatorSend(refs(), ASK({ recipient_email: "a@example.test", body: "Hi from the automated assistant. Reply STOP to stop." }));
  assert.equal(out.ok && (out.args.body.match(/reply stop/gi) ?? []).length, 1);
  assert.equal(out.ok && /Sent by Pip/.test(out.args.body), false);
});
test("every refusal sends nothing, and later steps are never reached", async () => {
  const cases: [string, Partial<SendRefs>, string[]][] = [
    ["no case row", { caseId: async () => null }, ["no open case"]],
    ["touch refused (too soon)", { reserve: async () => ({ ok: false, why: "too_soon" }) }, ["too soon"]],
    ["touch refused (hours)", { reserve: async () => ({ ok: false, why: "outside_hours" }) }, ["outside calling hours"]],
    ["database check refuses the address", { check: async () => ({ ok: false, why: "recipient_mismatch" }) }, ["not the customer"]],
    ["database check gives no purpose", { check: async () => ({ ok: true }) }, ["could not be confirmed"]],
    ["consent gate says opted out", { gate: async () => ({ allowed: false, reason: "opted_out" }) }, ["asked not to be emailed"]],
    ["consent gate cannot say", { gate: async () => ({ allowed: false }) }, ["could not be confirmed"]],
    ["a step throws", { check: async () => { throw new Error("db down"); } }, ["could not be confirmed"]],
    ["a step returns junk", { reserve: async () => null as J }, ["could not be confirmed"]],
  ];
  for (const [name, over, say] of cases) {
    const out = await operatorSend(refs(over), ASK());
    assert.equal(out.ok, false, name);
    if (!out.ok) for (const s of say) assert.match(out.text, new RegExp(s), name);
  }
});
test("a refused touch never reaches the consent gate, and a refused address never reaches it either", async () => {
  const a = refs({ reserve: async () => ({ ok: false, why: "max_touches" }) }); await operatorSend(a, ASK()); assert.equal(a.calls.includes("gate"), false); assert.equal(a.calls.includes("check"), false);
  const b = refs({ check: async () => ({ ok: false, why: "recipient_unknown" }) }); await operatorSend(b, ASK()); assert.equal(b.calls.includes("gate"), false);
});
test("a text, a call, a missing case or address, or an address in the wrong field all send nothing", async () => {
  for (const [name, a] of [["sms", ASK(undefined, "sms")], ["voice", ASK(undefined, "voice")], ["no case", ASK(undefined, "email", {})], ["no address", ASK({ body: "hi" })], ["bad address", ASK({ recipient_email: "nope", body: "hi" })], ["no body", ASK({ recipient_email: "a@example.test" })]] as const) {
    const r = refs(), out = await operatorSend(r, a as J);
    assert.equal(out.ok, false, name);
    assert.equal(r.calls.includes("gate"), false, `${name}: never reached the gate`);
  }
});
test("a body that names a second address is still sent only to the case's own customer", async () => {
  let asked = "";
  const out = await operatorSend(refs({ check: async (_s, _k, _c, _t, to) => ((asked = to), { ok: true, purpose: "transactional" }) }), ASK({ recipient_email: "a@example.test", cc: "x@example.test", body: "Hi, copy to x@example.test" }));
  assert.equal(asked, "a@example.test");
  assert.equal(out.ok && out.to, "a@example.test");
});

test("the customer context is a short list, trimmed, with no amount, and never throws", () => {
  assert.deepEqual(contextOf({ first_name: " Pat ", name: "Pat Lee", email: "p@example.test", service_type: "Water heater", completed_at: "2026-11-10", amount: 4200, total: "4200", card: "4242", notes: "secret" }), { first_name: "Pat", name: "Pat Lee", email: "p@example.test", service: "Water heater", when: "2026-11-10" });
  assert.ok(Object.values(contextOf({ name: "x".repeat(500) })).every((v) => v.length <= 120));
  for (const v of [null, undefined, 1, "x", [], { contact: 5 }, { email: "nope" }]) assert.deepEqual(contextOf(v), {});
});
test("a quote event's context never carries the amount through the plan either", () => {
  const p = eventPlan(QUOTE, job(QUOTE, "follow_up_quote"), { from: "crm", event: "record_changed", records: "deal", key: "e", data: { id: "D-1", stage: "quote_sent", amount: 4200, total: 4200, contact_email: "a@example.test" } });
  assert.equal(JSON.stringify(p).includes("4200"), false);
});
