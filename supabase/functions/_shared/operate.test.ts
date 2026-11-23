// Tests for the operate contract. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/operate.test.ts
// No network, no database, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CEIL, checkOperate, closeReason, compileOperator, isCaseDriven, localClock, OPERATE, operatorJobs, operatePlainWords, PRIMITIVE_OF, PROCESSES, riskOfPost, RULES, postVerdict, touchDecision, inventsEvidence } from "./operate.ts";
import { checkSpec, CONTRACT } from "./teammate-spec.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** A full teammate spec for a process, built by the same template the Forge uses. */
function specFor(process: (typeof PROCESSES)[number], ctx: J = {}): J {
  const c = compileOperator(process, { business: "Fork Plumbing", teammate: "Pip", ...ctx });
  return { contract: CONTRACT, jobs: c.jobs, operate: c.operate };
}
const bad = (s: J, re: RegExp) => { const c = checkOperate(s); assert.equal(c.ok, false, "expected the block to be refused"); assert.ok(c.errors.some((e) => re.test(e)), `no error matched ${re}: ${c.errors.join(" | ")}`); assert.equal(c.operate, null, "a refused block returns nothing"); };

// ---------- the templates compile to valid specs ----------
for (const p of PROCESSES) {
  test(`${p}: the template compiles to jobs that pass teammate/1 and an operate block that passes operate/1`, () => {
    const s = specFor(p, p === "content_social" ? { accounts: ["facebook", "instagram"], channels: ["facebook", "instagram"] } : { channels: ["email"] });
    const base = checkSpec(s);
    assert.equal(base.ok, true, base.errors.join(" | "));
    const c = checkOperate(s);
    assert.equal(c.ok, true, c.errors.join(" | "));
    assert.equal(c.operate!.version, OPERATE);
    assert.equal(c.operate!.process, p);
  });
}
test("the compile is deterministic: the same input gives the same bytes", () => {
  for (const p of PROCESSES) assert.equal(JSON.stringify(specFor(p)), JSON.stringify(specFor(p)));
});
test("a review operator with text as well as email compiles, and says what it needs", () => {
  const c = compileOperator("review_requests", { business: "Fork Plumbing", teammate: "Pip", channels: ["email", "sms"] });
  assert.ok(c.needs.some((n) => /10DLC/.test(n)));
  const s = { contract: CONTRACT, jobs: c.jobs, operate: c.operate };
  assert.equal(checkOperate(s).ok, true, checkOperate(s).errors.join(" | "));
});
test("each process has one primitive in the catalog and one set of rules", () => {
  for (const p of PROCESSES) { assert.match(PRIMITIVE_OF[p], /^operate_/); assert.ok(RULES[p].max_touches <= CEIL.touches); assert.ok(RULES[p].min_gap_hours >= CEIL.min_gap_hours); }
});

// ---------- refusals, one rule at a time ----------
test("a spec with no operate block is refused", () => bad({ contract: CONTRACT, jobs: specFor("quote_followup").jobs }, /no operate block/));
test("an operate block that is not an object is refused", () => bad({ ...specFor("quote_followup"), operate: "yes" }, /must be an object/));
test("a key that is not part of the contract is refused, at the top and inside", () => {
  const s = specFor("quote_followup"); s.operate.send_anything = true; bad(s, /"send_anything" is not part of the contract/);
  const t = specFor("quote_followup"); t.operate.touches.unlimited = true; bad(t, /"unlimited" is not part of the contract/);
});
test("the version must be exact", () => { const s = specFor("quote_followup"); s.operate.version = "operate/2"; bad(s, /version must be/); });
test("a process that is not in the closed list is refused", () => { const s = specFor("quote_followup"); s.operate.process = "cold_outreach"; bad(s, /process must be one of/); });
test("the goal is a plain sentence", () => { const s = specFor("quote_followup"); s.operate.goal = "ok"; bad(s, /goal is one plain sentence/); });
test("the jobs beside it must be a valid teammate/1 list", () => { const s = specFor("quote_followup"); s.jobs[0].triggers = []; bad(s, /valid teammate\/1 job list/); });
test("a case from a record needs a job that can read that record", () => {
  const s = specFor("quote_followup"); s.operate.case.from = { tool: "crm", records: "lead" }; bad(s, /operate\.case\.from is crm\/lead, so a job needs read on it/);
});
test("a customer process cannot open a case from a schedule", () => { const s = specFor("quote_followup"); s.operate.case.from = { schedule: "week" }; bad(s, /opens a case from a record/); });
test("a public process cannot open a case from a customer record", () => { const s = specFor("content_social"); s.operate.case.from = { tool: "crm", records: "lead" }; bad(s, /opens a case from a schedule|needs read/); });
test("closes_when always includes opted_out", () => { const s = specFor("quote_followup"); s.operate.case.closes_when = ["replied", "max_touches"]; bad(s, /must always include opted_out/); });
test("closes_when only lists known reasons, each once", () => {
  const s = specFor("quote_followup"); s.operate.case.closes_when = ["opted_out", "angry"]; bad(s, /closes_when must list/);
  const t = specFor("quote_followup"); t.operate.case.closes_when = ["opted_out", "opted_out"]; bad(t, /closes_when must list/);
});
test("touches.max cannot pass the contract ceiling or the process's own", () => {
  const s = specFor("quote_followup"); s.operate.touches.max = 9; bad(s, /from 1 to 4/);
  const t = specFor("review_requests"); t.operate.touches.max = 3; bad(t, /never goes past 2/);
});
test("two touches in a day are refused", () => { const s = specFor("quote_followup"); s.operate.touches.min_gap_hours = 12; bad(s, /at least 24/); });
test("a gap shorter than the process's own is refused", () => { const s = specFor("quote_followup"); s.operate.touches.min_gap_hours = 48; bad(s, /waits at least 72 hours/); });
test("a customer process must list real customer channels", () => {
  const s = specFor("quote_followup"); s.operate.touches.channels = []; bad(s, /one or more of email, sms/);
  const t = specFor("quote_followup"); t.operate.touches.channels = ["whatsapp"]; bad(t, /one or more of email, sms/);
});
test("a public process has no customer channels", () => { const s = specFor("content_social"); s.operate.touches.channels = ["email"]; bad(s, /no customer channels/); });
test("review requests cannot be aimed at happy customers", () => {
  for (const who of ["happy_only", "satisfied", "promoters", "five_star", "positive_feedback"]) {
    const s = specFor("review_requests"); s.operate.audience = { who }; bad(s, /audience\.who must be one of|may not choose customers by happiness/);
  }
});
test("a named stage may not be a sentiment filter in disguise", () => {
  for (const stage of ["Happy customers", "5 star jobs", "Good feedback", "NPS promoters", "Rated 4+", "only the best"]) {
    const s = specFor("review_requests"); s.operate.audience = { who: "named_stage", stage }; bad(s, /may not be a happiness, rating or sentiment filter/);
  }
});
test("a named stage that is a plain stage is accepted", () => {
  const s = specFor("review_requests"); s.operate.audience = { who: "named_stage", stage: "Completed" };
  assert.equal(checkOperate(s).ok, true, checkOperate(s).errors.join(" | "));
});
test("a stage name without named_stage is refused, and named_stage needs a name", () => {
  const s = specFor("review_requests"); s.operate.audience = { who: "every_customer", stage: "Completed" }; bad(s, /only for a named stage/);
  const t = specFor("review_requests"); t.operate.audience = { who: "named_stage" }; bad(t, /names the stage/);
});
test("a public process has no audience", () => { const s = specFor("content_social"); s.operate.audience = { who: "every_customer" }; bad(s, /has no audience/); });
test("posting to the public needs the voice and an account approved", () => {
  const s = specFor("content_social"); s.operate.approvals.brand_voice = false; bad(s, /needs approvals\.brand_voice true/);
  const t = specFor("content_social"); t.operate.approvals.accounts = []; bad(t, /at least one account/);
});
test("the first five posts always need the owner: first_n below five is refused", () => {
  const s = specFor("content_social"); s.operate.public.approval = "first_n:3"; bad(s, /"first_n:N" with N from 5 to 50/);
  const t = specFor("content_social"); t.operate.public.approval = "never"; bad(t, /"always" or "first_n:N"/);
  const u = specFor("content_social"); u.operate.public.approval = "always";
  assert.equal(checkOperate(u).ok, true);
});
test("a content operator must post, and a customer operator must not", () => {
  const s = specFor("content_social"); s.operate.public = { posts: false }; s.operate.approvals = { brand_voice: false, accounts: [] }; bad(s, /so operate\.public\.posts must be true/);
  const t = specFor("review_requests"); t.operate.public = { posts: true, channels: ["facebook"], approval: "always" }; t.operate.approvals = { brand_voice: true, accounts: ["facebook"] }; bad(t, /never posts to the public/);
});
test("an operator that does not post cannot ask for approvals", () => { const s = specFor("quote_followup"); s.operate.approvals = { brand_voice: true, accounts: [] }; bad(s, /this one does not post/); });
test("public channels must be known, and listed once", () => {
  const s = specFor("content_social"); s.operate.public.channels = ["tiktok"]; bad(s, /one or more of facebook, instagram, google_business/);
  const t = specFor("content_social"); t.operate.public.channels = ["facebook", "facebook"]; bad(t, /each once/);
});
test("every stage names a real job, once", () => {
  const s = specFor("quote_followup"); s.operate.stages[0].job = "ghost"; bad(s, /is not one of the spec's jobs/);
  const t = specFor("quote_followup"); t.operate.stages.push({ ...t.operate.stages[0] }); bad(t, /listed twice/);
  const u = specFor("quote_followup"); u.operate.stages = []; bad(u, /1 to 6 stages/);
});
test("the purpose of a send is fixed by the process, not by the job", () => {
  const s = specFor("quote_followup"); const g = s.jobs[0].tools.find((x: J) => x.records === "message"); g.purpose = "marketing"; bad(s, /only as "transactional", not "marketing"/);
  const t = specFor("review_requests", { channels: ["email", "sms"] }); const sms = t.jobs[0].tools.find((x: J) => x.tool === "send_text"); sms.purpose = "transactional"; bad(t, /only as "marketing", not "transactional"/);
});
test("a stage job may only send on a channel the operate block lists", () => {
  const s = specFor("review_requests", { channels: ["email", "sms"] }); s.operate.touches.channels = ["email"]; bad(s, /sends by sms, which operate\.touches\.channels does not list/);
});
test("a listed channel needs a job that can send on it", () => { const s = specFor("review_requests"); s.operate.touches.channels = ["email", "sms"]; bad(s, /no stage job can send by sms/); });
test("a stage job that touches money is refused", () => {
  const s = specFor("quote_followup"); s.jobs[0].tools.push({ tool: "accounting", records: "estimate", can: ["read"], policy: "buying" }); bad(s, /money record|teammate\/1 job list/);
});
test("a public operator's jobs send no customer messages", () => {
  const s = specFor("content_social"); s.jobs[0].tools.push({ tool: "email", records: "message", can: ["add"], purpose: "transactional" }); bad(s, /sends no messages to customers/);
});

// ---------- the cadence ----------
const T0 = "2026-11-02T16:00:00Z"; // 09:00 in Boise (MST, UTC-7)
const open = (over: J = {}) => ({ status: "open" as const, touches: 0, opened_at: T0, last_touch_at: null, ...over });
const R = RULES.quote_followup, H = { from: "09:00", to: "20:00" }, TZ = "America/Boise";
const at = (iso: string) => new Date(iso);
test("localClock reads the business's own clock, across the date line and DST", () => {
  assert.equal(localClock(at("2026-11-02T16:00:00Z"), TZ), "09:00");
  assert.equal(localClock(at("2026-07-02T16:00:00Z"), TZ), "10:00");
  assert.equal(localClock(at("2026-11-02T07:00:00Z"), "UTC"), "07:00");
  assert.equal(localClock(at("2026-11-02T00:05:00Z"), "UTC"), "00:05");
});
test("a first touch inside the hours is allowed", () => assert.deepEqual(touchDecision(open(), R, at("2026-11-02T17:00:00Z"), 1, H, TZ), { ok: true }));
test("a closed case is never touched", () => { for (const status of ["done", "stopped"] as const) assert.deepEqual(touchDecision(open({ status }), R, at("2026-11-02T17:00:00Z"), 1, H, TZ), { ok: false, why: "closed" }); });
test("a touch must be the next one: it cannot repeat or skip", () => {
  assert.deepEqual(touchDecision(open({ touches: 1, last_touch_at: T0 }), R, at("2026-11-06T17:00:00Z"), 1, H, TZ), { ok: false, why: "wrong_touch" });
  assert.deepEqual(touchDecision(open(), R, at("2026-11-02T17:00:00Z"), 2, H, TZ), { ok: false, why: "wrong_touch" });
});
test("the cap holds: no fourth quote follow-up", () => assert.deepEqual(touchDecision(open({ touches: 3, last_touch_at: T0 }), R, at("2026-11-12T17:00:00Z"), 4, H, TZ), { ok: false, why: "max_touches" }));
test("a case older than its days is expired, not touched", () => assert.deepEqual(touchDecision(open({ touches: 1, last_touch_at: "2026-11-03T16:00:00Z" }), R, at("2026-11-20T17:00:00Z"), 2, H, TZ), { ok: false, why: "expired" }));
test("the gap holds: 71 hours is too soon, 72 is fine", () => {
  const c = open({ touches: 1, last_touch_at: "2026-11-02T17:00:00Z" });
  assert.deepEqual(touchDecision(c, R, at("2026-11-05T16:00:00Z"), 2, H, TZ), { ok: false, why: "too_soon" });
  assert.deepEqual(touchDecision(c, R, at("2026-11-05T17:00:00Z"), 2, H, TZ), { ok: true });
});
test("quiet hours hold: before 09:00 and from 20:00 local is outside", () => {
  assert.deepEqual(touchDecision(open(), R, at("2026-11-02T15:59:00Z"), 1, H, TZ), { ok: false, why: "outside_hours" });
  assert.deepEqual(touchDecision(open(), R, at("2026-11-03T03:00:00Z"), 1, H, TZ), { ok: false, why: "outside_hours" });
  assert.deepEqual(touchDecision(open(), R, at("2026-11-02T16:00:00Z"), 1, H, TZ), { ok: true });
});
test("the first rule that stops a touch is the one reported", () => {
  // closed beats everything; max beats expired; expired beats too_soon
  assert.equal((touchDecision(open({ status: "done", touches: 9 }), R, at("2030-01-01T00:00:00Z"), 99, H, TZ) as J).why, "closed");
  assert.equal((touchDecision(open({ touches: 3, last_touch_at: T0 }), R, at("2030-01-01T00:00:00Z"), 4, H, TZ) as J).why, "max_touches");
});

// ---------- why a case closes ----------
test("STOP closes a case whatever the spec lists", () => assert.equal(closeReason(open(), R, ["max_touches"], at("2026-11-02T17:00:00Z"), { opted_out: true }), "opted_out"));
test("a reply closes a case only if the spec says so", () => {
  assert.equal(closeReason(open(), R, ["opted_out", "replied"], at("2026-11-02T17:00:00Z"), { replied: true }), "replied");
  assert.equal(closeReason(open(), R, ["opted_out"], at("2026-11-02T17:00:00Z"), { replied: true }), null);
});
test("the cap and the days close a case whether or not the spec lists them", () => {
  assert.equal(closeReason(open({ touches: 3 }), R, ["opted_out"], at("2026-11-02T17:00:00Z")), "max_touches");
  assert.equal(closeReason(open({ touches: 1 }), R, ["opted_out"], at("2026-11-30T17:00:00Z")), "max_days");
});
test("a case that is already closed has no new reason", () => assert.equal(closeReason(open({ status: "done" }), R, ["opted_out"], at("2026-11-02T17:00:00Z"), { opted_out: true }), null));
test("a booking (completed) closes a quote case", () => assert.equal(closeReason(open(), R, ["opted_out", "completed"], at("2026-11-02T17:00:00Z"), { completed: true }), "completed"));

// ---------- public posts ----------
const ctx = (over: J = {}) => ({ approved: true, ownerApproved: false, published: 9, thisWeek: 0, rules: { first_n: 5, weekly_cap: 3, always: false }, ...over });
test("nothing is posted before the owner approved the voice and the account", () => assert.equal(postVerdict({ text: "A plain tip" }, ctx({ approved: false })).action, "refuse"));
test("the first five posts go to the owner, however safe", () => {
  for (const published of [0, 1, 4]) assert.equal(postVerdict({ text: "Check your water heater this fall." }, ctx({ published })).action, "owner");
  assert.equal(postVerdict({ text: "Check your water heater this fall." }, ctx({ published: 5 })).action, "publish");
});
test("a post that names a price, an offer or a guarantee always goes to the owner", () => {
  for (const text of ["Drain cleaning from $89 this week", "20% off any repair", "Book now and get a free inspection", "Every repair carries our guarantee", "Our 100% satisfaction promise"])
    assert.equal(postVerdict({ text }, ctx()).action, "owner", text);
});
test("a post with a customer's name or photo always goes to the owner", () => {
  assert.equal(postVerdict({ text: "Thanks to Maria Lopez for having us out!", customerNames: ["Maria Lopez"] }, ctx()).action, "owner");
  assert.equal(postVerdict({ text: "A tidy install.", usesCustomerPhoto: true }, ctx()).action, "owner");
  assert.equal(postVerdict({ text: "Thanks Maria!", customerNames: ["Maria Lopez"] }, ctx()).action, "publish", "a first name alone is not the listed customer");
});
test("a name is matched as a whole word, not inside another word", () => assert.deepEqual(riskOfPost({ text: "Amaranth is a lovely plant.", customerNames: ["Ana"] }), []));
test("a name with regex characters cannot break the check", () => assert.doesNotThrow(() => riskOfPost({ text: "Hello", customerNames: ["(((", "a.*", "[x"] })));
test("an invented review, testimonial or before-and-after is refused, not sent to the owner", () => {
  for (const text of ["Before and after: our latest bathroom", "One of our customers said we were the best plumbers ever", "\"Best service I have ever had in my life\" - Sarah", "A 5 star review from this week", "Read our testimonials"])
    { assert.equal(inventsEvidence({ text }), true, text); assert.equal(postVerdict({ text }, ctx({ ownerApproved: true })).action, "refuse", `${text} refused even if the owner approved`); }
});
test("an ordinary seasonal tip is not mistaken for invented evidence", () => assert.equal(inventsEvidence({ text: "Frozen pipes burst when water expands. Know where your shutoff is." }), false));
test("the weekly cap holds even for an approved post", () => assert.equal(postVerdict({ text: "A tip" }, ctx({ thisWeek: 3, ownerApproved: true })).action, "refuse"));
test("an owner-approved post goes out, whatever it says, once the voice is approved and the cap is not reached", () => assert.equal(postVerdict({ text: "Drain cleaning from $89" }, ctx({ ownerApproved: true, published: 0 })).action, "publish"));
test("with approval 'always', every post goes to the owner", () => assert.equal(postVerdict({ text: "A tip" }, ctx({ rules: { first_n: 5, weekly_cap: 3, always: true } })).action, "owner"));

// ---------- case-driven jobs, and the words an owner reads ----------
test("customer stage jobs are case-driven; a content operator's jobs are not", () => {
  const q = specFor("quote_followup"), c = specFor("content_social");
  assert.equal(isCaseDriven(q, "follow_up_quote"), true);
  assert.equal(isCaseDriven(c, "plan_week"), false);
  assert.equal(isCaseDriven({}, "x"), false);
  assert.equal(isCaseDriven({ operate: { version: OPERATE, process: "nope", stages: [] } }, "x"), false);
});
test("operatorJobs maps stage ids to jobs", () => assert.equal(operatorJobs(specFor("quote_followup")).stageOf.get("follow_up"), "follow_up_quote"));
test("plain words say who is contacted, how often, and when it stops", () => {
  const w = operatePlainWords(checkOperate(specFor("review_requests")).operate!);
  assert.ok(w.what.some((x) => /every customer, with no filter on how happy/.test(x)));
  assert.ok(w.stops.some((x) => /STOP it never contacts them again/.test(x)));
  assert.ok(w.stops.some((x) => /replies it stops and hands/.test(x)));
});
test("plain words for a public operator name what the owner must approve", () => {
  const w = operatePlainWords(checkOperate(specFor("content_social")).operate!);
  assert.ok(w.needsYou.some((x) => /brand voice and each account once/.test(x)));
  assert.ok(w.needsYou.some((x) => /first 5 posts/.test(x)));
  assert.ok(w.stops.some((x) => /never invents a review/.test(x)));
});

// ---------- it never throws, whatever it is handed ----------
test("checkOperate never throws on strange input", () => {
  const strange: J[] = [null, undefined, 1, "x", [], {}, { operate: null }, { operate: [] }, { operate: { stages: "x", touches: [], public: 1, approvals: 0, case: [] } }, { contract: CONTRACT, jobs: "x", operate: {} }, { operate: { process: { toString() { throw new Error("boom"); } } } }];
  for (const s of strange) assert.doesNotThrow(() => checkOperate(s));
  const base = specFor("quote_followup");
  for (const key of Object.keys(base.operate)) for (const v of [null, 0, "", [], {}, true]) { const s = clone(base); s.operate[key] = v; assert.doesNotThrow(() => checkOperate(s)); assert.equal(checkOperate(s).ok, false, `${key}=${JSON.stringify(v)} should not pass`); }
});
