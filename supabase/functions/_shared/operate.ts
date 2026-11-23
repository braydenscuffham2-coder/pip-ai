// The operate contract, in code. An operator runs a whole recurring process on its own (who to contact, when, how many
// times, when to stop) and keeps a record of every case. It is not a new runtime: the Forge compiles it to ordinary
// teammate/1 jobs plus a small `operate` block, and everything that enforces limits today keeps enforcing them.
// The words are in docs/contracts/operate-spec.md; this file is what decides. Pure TypeScript, so the Forge, pip-jobs,
// pip-turn, the Portal and the tests all use the same copy.
//
//   checkOperate(spec)          is this spec's operate block valid, and does it agree with the jobs beside it?
//   touchDecision(...)          may this case be touched now? The same answer the database gives (a test keeps them equal).
//   closeReason(...)            why a case should close, if it should
//   postVerdict(...)            what may happen to one public post: publish, ask the owner, or refuse
//   operatorJobs(spec)          which jobs are case-driven (started by a case, never by their own trigger)
//   compileOperator(...)        the deterministic template that turns one operate primitive into jobs + operate block
//   operatePlainWords(op)       the same rules as sentences an owner can read
//
// A block that breaks a rule is refused whole. Nothing is quietly trimmed to fit.
import { checkSpec, CONTRACT, type Job } from "./teammate-spec.ts";

export const OPERATE = "operate/1";
export const PROCESSES = ["content_social", "review_requests", "quote_followup"] as const;
export type Process = (typeof PROCESSES)[number];
/** Why a case can end. `opted_out` is always listed. */
export const CLOSES = ["replied", "opted_out", "completed", "max_touches", "max_days"] as const;
export const AUDIENCES = ["every_customer", "named_stage"] as const;
export const CUSTOMER_CHANNELS = ["email", "sms"] as const;
export const PUBLIC_CHANNELS = ["facebook", "instagram", "google_business"] as const;
/** The primitive in the catalog that stands for each process. */
export const PRIMITIVE_OF: Record<Process, string> = {
  content_social: "operate_content_social", review_requests: "operate_review_requests", quote_followup: "operate_quote_followup",
};
/**
 * The hard ceilings per process. A spec may be stricter, never looser: the database holds the same numbers in
 * operator_process_rules, and a test keeps the two identical. `purposes` is the only purpose a send may carry, by
 * channel: a review request by text is marketing (it needs marketing consent), by email it is about a job the customer
 * already had. A quote follow-up is transactional because the customer asked for the quote.
 */
export const RULES: Record<Process, {
  reaches: "public" | "customer"; max_touches: number; min_gap_hours: number; max_days: number; first_n: number | null;
  purposes: Record<string, "transactional" | "marketing">;
}> = {
  content_social: { reaches: "public", max_touches: 3, min_gap_hours: 24, max_days: 7, first_n: 5, purposes: {} },
  review_requests: { reaches: "customer", max_touches: 2, min_gap_hours: 72, max_days: 14, first_n: null, purposes: { email: "transactional", sms: "marketing" } },
  quote_followup: { reaches: "customer", max_touches: 3, min_gap_hours: 72, max_days: 14, first_n: null, purposes: { email: "transactional", sms: "transactional" } },
};
/** The contract's own outer ceilings, whatever the process. */
export const CEIL = { touches: 4, min_gap_hours: 24, stages: 6, first_n_max: 50, accounts: 6 };

// deno-lint-ignore no-explicit-any
type J = any;
const isObj = (v: unknown): v is Record<string, J> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v: unknown, lo: number, hi: number): v is string => typeof v === "string" && v.trim().length >= lo && v.length <= hi;
const ID = /^[a-z][a-z0-9_]{1,39}$/;
const SLOT = /^[a-z][a-z0-9_]{1,39}$/;
/** Words that mean the audience is being filtered by how happy the customer is. Refused: Google's policy and the FTC. */
export const SENTIMENT = /\b(happy|satisf|delight|positive|promoter|nps|rating|rated|stars?|sentiment|good (?:experience|feedback)|only (?:the )?(?:best|good|great))\b|\b[45][\s-]?stars?\b/i;
const extra = (o: Record<string, J>, allowed: string[], where: string, errors: string[]) => {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${where}: "${k}" is not part of the contract.`);
};

export type Operate = {
  version: typeof OPERATE; process: Process; goal: string;
  case: { from: { tool: string; records: string } | { schedule: "day" | "week" }; closes_when: string[] };
  touches: { max: number; min_gap_hours: number; channels: string[] };
  audience?: { who: (typeof AUDIENCES)[number]; stage?: string };
  public: { posts: boolean; channels: string[]; approval?: string };
  approvals: { brand_voice: boolean; accounts: string[] };
  stages: { id: string; job: string; does: string }[];
};

/** The spec's operate block, checked. `ok` is false if anything at all is wrong; `errors` says what, in plain words. */
export function checkOperate(spec: unknown): { ok: boolean; errors: string[]; operate: Operate | null } {
  const errors: string[] = [], s = spec as J;
  if (!isObj(s) || s.operate === undefined) return { ok: false, errors: ["The spec has no operate block."], operate: null };
  const o = s.operate;
  if (!isObj(o)) return { ok: false, errors: ["operate must be an object."], operate: null };
  extra(o, ["version", "process", "goal", "case", "touches", "audience", "public", "approvals", "stages"], "operate", errors);
  if (o.version !== OPERATE) errors.push(`operate.version must be "${OPERATE}".`);
  const proc = (PROCESSES as readonly string[]).includes(o.process) ? (o.process as Process) : null;
  if (!proc) errors.push(`operate.process must be one of ${PROCESSES.join(", ")}. A new process is a code change, not a spec change.`);
  if (!isStr(o.goal, 10, 200)) errors.push("operate.goal is one plain sentence for the owner, 10 to 200 characters.");
  const rules = proc ? RULES[proc] : null;
  // The operate block rides on a teammate/1 spec: the jobs it names must be real, checked jobs.
  const base = checkSpec(s);
  if (!base.ok) errors.push(`operate needs a valid ${CONTRACT} job list beside it: ${base.errors[0] ?? "the jobs are not valid"}`);
  const jobs: Job[] = base.jobs;

  // ---- case ----
  const k = o.case;
  if (!isObj(k)) errors.push("operate.case must be an object.");
  else {
    extra(k, ["from", "closes_when"], "operate.case", errors);
    const f = k.from;
    if (!isObj(f)) errors.push("operate.case.from must say what opens a case.");
    else if ("schedule" in f) {
      extra(f, ["schedule"], "operate.case.from", errors);
      if (!["day", "week"].includes(f.schedule)) errors.push("operate.case.from.schedule must be day or week.");
      if (proc && rules!.reaches !== "public") errors.push("A process that reaches customers opens a case from a record, not from a schedule.");
    } else {
      extra(f, ["tool", "records"], "operate.case.from", errors);
      if (typeof f.tool !== "string" || !ID.test(f.tool) || typeof f.records !== "string" || !ID.test(f.records)) errors.push("operate.case.from needs a tool and a kind of record, like crm and lead.");
      else if (!jobs.some((j) => j.tools.some((g) => g.tool === f.tool && g.records === f.records && g.can.includes("read"))))
        errors.push(`operate.case.from is ${f.tool}/${f.records}, so a job needs read on it. A case never starts from a record no job can see.`);
      if (proc && rules!.reaches === "public") errors.push("Posting to the public opens a case from a schedule, not from a customer record.");
    }
    const c = k.closes_when;
    if (!Array.isArray(c) || !c.length || c.some((x: J) => !(CLOSES as readonly string[]).includes(x)) || new Set(c).size !== c.length) errors.push(`operate.case.closes_when must list one or more of ${CLOSES.join(", ")}, each once.`);
    else if (!c.includes("opted_out")) errors.push("operate.case.closes_when must always include opted_out. A person who says stop is never contacted again.");
  }

  // ---- touches ----
  const t = o.touches;
  if (!isObj(t)) errors.push("operate.touches must be an object.");
  else {
    extra(t, ["max", "min_gap_hours", "channels"], "operate.touches", errors);
    if (!isInt(t.max, 1, CEIL.touches)) errors.push(`operate.touches.max must be a whole number from 1 to ${CEIL.touches}.`);
    else if (rules && t.max > rules.max_touches) errors.push(`operate.touches.max is ${t.max}, but ${proc} never goes past ${rules.max_touches}.`);
    if (!isInt(t.min_gap_hours, CEIL.min_gap_hours, 24 * 30)) errors.push(`operate.touches.min_gap_hours must be at least ${CEIL.min_gap_hours}. Nothing is contacted twice in a day.`);
    else if (rules && t.min_gap_hours < rules.min_gap_hours) errors.push(`operate.touches.min_gap_hours is ${t.min_gap_hours}, but ${proc} waits at least ${rules.min_gap_hours} hours between touches.`);
    const ch = t.channels;
    if (!Array.isArray(ch) || ch.some((x: J) => typeof x !== "string") || new Set(ch).size !== ch.length) errors.push("operate.touches.channels must be a list, each channel once.");
    else if (rules?.reaches === "public" && ch.length) errors.push("A process that posts to the public has no customer channels. List the places it posts under operate.public.channels.");
    else if (rules?.reaches === "customer" && (!ch.length || ch.some((x: string) => !(CUSTOMER_CHANNELS as readonly string[]).includes(x)))) errors.push(`operate.touches.channels must list one or more of ${CUSTOMER_CHANNELS.join(", ")}.`);
  }

  // ---- audience: every customer, never filtered by how happy they are ----
  const a = o.audience;
  if (rules?.reaches === "public") { if (a !== undefined) errors.push("A process that posts to the public has no audience."); }
  else if (rules) {
    if (!isObj(a)) errors.push(`operate.audience must say who is asked: { "who": "every_customer" } or a named stage.`);
    else {
      extra(a, ["who", "stage"], "operate.audience", errors);
      if (!(AUDIENCES as readonly string[]).includes(a.who)) errors.push(`operate.audience.who must be one of ${AUDIENCES.join(", ")}. Anything that picks customers by how happy they are is refused.`);
      if (typeof a.who === "string" && SENTIMENT.test(a.who)) errors.push("operate.audience may not choose customers by happiness, rating or sentiment. Review requests go to every customer (Google's policy and the FTC).");
      if (a.who === "named_stage") {
        if (!isStr(a.stage, 2, 40)) errors.push("operate.audience.stage names the stage in the owner's software that is asked, 2 to 40 characters.");
        else if (SENTIMENT.test(a.stage)) errors.push("operate.audience.stage may not be a happiness, rating or sentiment filter. Review requests go to every customer.");
      } else if (a.stage !== undefined) errors.push("operate.audience.stage is only for a named stage.");
    }
  }

  // ---- public ----
  const p = o.public;
  const pub = isObj(p) ? p : null;
  if (!pub) errors.push("operate.public must say whether the operator posts to the public: { \"posts\": false } for none.");
  else {
    extra(pub, ["posts", "channels", "approval"], "operate.public", errors);
    if (typeof pub.posts !== "boolean") errors.push("operate.public.posts must be true or false.");
    if (pub.posts === true) {
      if (!Array.isArray(pub.channels) || !pub.channels.length || pub.channels.length > 3 || pub.channels.some((x: J) => !(PUBLIC_CHANNELS as readonly string[]).includes(x)) || new Set(pub.channels).size !== pub.channels.length) errors.push(`operate.public.channels must list one or more of ${PUBLIC_CHANNELS.join(", ")}, each once.`);
      const m = typeof pub.approval === "string" ? /^first_n:(\d{1,2})$/.exec(pub.approval) : null;
      if (pub.approval !== "always" && !(m && Number(m[1]) >= (rules?.first_n ?? 5) && Number(m[1]) <= CEIL.first_n_max)) errors.push(`operate.public.approval must be "always" or "first_n:N" with N from ${rules?.first_n ?? 5} to ${CEIL.first_n_max}. The first ${rules?.first_n ?? 5} posts always need the owner.`);
    } else if (pub.posts === false) { if (pub.channels !== undefined || pub.approval !== undefined) errors.push("operate.public.channels and approval are only for an operator that posts."); }
    if (rules && rules.reaches === "public" && pub.posts !== true) errors.push(`${proc} posts to the public, so operate.public.posts must be true.`);
    if (rules && rules.reaches === "customer" && pub.posts === true) errors.push(`${proc} reaches customers one at a time and never posts to the public.`);
  }

  // ---- approvals: public posting needs the owner's voice and accounts, once ----
  const ap = o.approvals;
  if (!isObj(ap)) errors.push("operate.approvals must be an object.");
  else {
    extra(ap, ["brand_voice", "accounts"], "operate.approvals", errors);
    if (typeof ap.brand_voice !== "boolean") errors.push("operate.approvals.brand_voice must be true or false.");
    if (!Array.isArray(ap.accounts) || ap.accounts.length > CEIL.accounts || ap.accounts.some((x: J) => typeof x !== "string" || !SLOT.test(x)) || new Set(ap.accounts).size !== ap.accounts.length) errors.push(`operate.approvals.accounts must list up to ${CEIL.accounts} account slots, each once.`);
    else if (pub?.posts === true && (ap.brand_voice !== true || !ap.accounts.length)) errors.push("An operator that posts to the public needs approvals.brand_voice true and at least one account. The owner approves the voice and the accounts once, before it can go live.");
    else if (pub?.posts === false && (ap.brand_voice === true || ap.accounts.length)) errors.push("approvals are for an operator that posts to the public; this one does not post.");
  }

  // ---- stages: every stage is a real job ----
  const st = o.stages;
  const operateJobs = new Set<string>();
  if (!Array.isArray(st) || !st.length || st.length > CEIL.stages) errors.push(`operate.stages must list 1 to ${CEIL.stages} stages.`);
  else {
    const seen = new Set<string>();
    st.forEach((x: J, i: number) => {
      const w = `operate.stages[${i}]`;
      if (!isObj(x)) { errors.push(`${w}: must be an object.`); return; }
      extra(x, ["id", "job", "does"], w, errors);
      if (typeof x.id !== "string" || !ID.test(x.id)) errors.push(`${w}: id must be lower-case letters, digits and underscores.`);
      else if (seen.has(x.id)) errors.push(`${w}: the stage "${x.id}" is listed twice.`); else seen.add(x.id);
      if (typeof x.job !== "string" || !jobs.some((j) => j.id === x.job)) errors.push(`${w}: job "${String(x.job).slice(0, 40)}" is not one of the spec's jobs.`);
      else operateJobs.add(x.job);
      if (!isStr(x.does, 10, 200)) errors.push(`${w}: does is one plain sentence for the owner, 10 to 200 characters.`);
    });
  }

  // ---- what the stage jobs may do: the purpose of every send is decided here, never by the job's own words ----
  if (proc && rules) for (const j of jobs.filter((x) => operateJobs.has(x.id))) for (const g of j.tools) {
    const sends = g.records === "message" && g.can.includes("add") && g.tool !== "pip";
    if (rules.reaches === "public" && sends) errors.push(`jobs.${j.id}: an operator that posts to the public sends no messages to customers.`);
    if (rules.reaches === "public" && g.records === "message") continue;
    if (sends && rules.reaches === "customer") {
      const channel = g.tool === "email" ? "email" : ["sms", "send_text"].includes(g.tool) ? "sms" : null;
      const want = channel ? rules.purposes[channel] : undefined;
      if (!channel || !want) errors.push(`jobs.${j.id}: ${g.tool}/message is not a channel ${proc} may use. Use ${Object.keys(rules.purposes).join(" or ")}.`);
      else if (g.purpose !== want) errors.push(`jobs.${j.id}: ${proc} sends by ${channel} only as "${want}", not "${g.purpose}".`);
      else if (Array.isArray(t?.channels) && !t.channels.includes(channel)) errors.push(`jobs.${j.id}: sends by ${channel}, which operate.touches.channels does not list.`);
    }
    if (["estimate", "invoice", "price", "discount", "payment", "order"].includes(g.records)) errors.push(`jobs.${j.id}: ${g.records} is a money record. An operator never touches amounts.`);
  }
  if (rules?.reaches === "customer" && Array.isArray(t?.channels)) {
    for (const c of t.channels) if (!jobs.some((j) => operateJobs.has(j.id) && j.tools.some((g) => g.records === "message" && g.can.includes("add") && (c === "email" ? g.tool === "email" : ["sms", "send_text"].includes(g.tool)))))
      errors.push(`operate.touches.channels lists ${c}, but no stage job can send by ${c}.`);
  }
  return { ok: errors.length === 0, errors, operate: errors.length ? null : (o as Operate) };
}

/**
 * The jobs a case starts. Posting to the public is not case-driven (a schedule and the owner's decisions start those
 * jobs, and the database's post check guards the publish). A customer process is: its stage jobs are started only when
 * a case is due, never by their own trigger, so a trigger cannot start a touch the cadence has not allowed.
 */
export function operatorJobs(spec: unknown): { process: Process | null; caseDriven: Set<string>; stageOf: Map<string, string> } {
  const s = spec as J, o = isObj(s) ? s.operate : null;
  const none = { process: null, caseDriven: new Set<string>(), stageOf: new Map<string, string>() };
  if (!isObj(o) || o.version !== OPERATE || !(PROCESSES as readonly string[]).includes(o.process) || !Array.isArray(o.stages)) return none;
  const proc = o.process as Process, caseDriven = new Set<string>(), stageOf = new Map<string, string>();
  for (const x of o.stages) if (isObj(x) && typeof x.id === "string" && typeof x.job === "string") { stageOf.set(x.id, x.job); if (RULES[proc].reaches === "customer") caseDriven.add(x.job); }
  return { process: proc, caseDriven, stageOf };
}
/** Is this job a stage job of a customer operator? Those are the only jobs that may send on their own, and only through a case. */
export const isCaseDriven = (spec: unknown, jobId: string): boolean => operatorJobs(spec).caseDriven.has(jobId);

// ---------------------------------------------------------------------------------------------------------------
// The cadence, as pure rules. The database enforces the same rules in operator_case_touch; tests/operate/parity.json
// is run through both, so they cannot drift.
// ---------------------------------------------------------------------------------------------------------------
export type CaseState = { status: "open" | "done" | "stopped"; touches: number; opened_at: string; last_touch_at: string | null };
export type CaseRules = { max_touches: number; min_gap_hours: number; max_days: number };
export type Hours = { from: string; to: string };
export type TouchWhy = "closed" | "wrong_touch" | "max_touches" | "expired" | "too_soon" | "outside_hours";
/** The local clock time ("HH:MM") for an instant in a time zone. */
export function localClock(at: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const h = p.find((x) => x.type === "hour")!.value, m = p.find((x) => x.type === "minute")!.value;
  return `${h === "24" ? "00" : h}:${m}`;
}
/** May this case be touched now, as touch number `touchNo`? Checked in this order, so a test can name the first rule that stops it. */
export function touchDecision(c: CaseState, r: CaseRules, now: Date, touchNo: number, hours: Hours, tz: string): { ok: true } | { ok: false; why: TouchWhy } {
  if (c.status !== "open") return { ok: false, why: "closed" };
  if (touchNo !== c.touches + 1) return { ok: false, why: "wrong_touch" };
  if (c.touches >= r.max_touches) return { ok: false, why: "max_touches" };
  if (now.getTime() - new Date(c.opened_at).getTime() > r.max_days * 86400000) return { ok: false, why: "expired" };
  if (c.last_touch_at && now.getTime() - new Date(c.last_touch_at).getTime() < r.min_gap_hours * 3600000) return { ok: false, why: "too_soon" };
  const clock = localClock(now, tz);
  if (clock < hours.from || clock >= hours.to) return { ok: false, why: "outside_hours" };
  return { ok: true };
}
export type Signals = { replied?: boolean; opted_out?: boolean; completed?: boolean };
/** Why a case should close now, or null. The reasons a spec did not list (other than the ones that are always on) do not close it. */
export function closeReason(c: CaseState, r: CaseRules, closesWhen: string[], now: Date, s: Signals = {}): string | null {
  if (c.status !== "open") return null;
  if (s.opted_out) return "opted_out"; // always, whatever the spec lists
  if (s.replied && closesWhen.includes("replied")) return "replied";
  if (s.completed && closesWhen.includes("completed")) return "completed";
  if (c.touches >= r.max_touches) return "max_touches"; // the cap is not optional
  if (now.getTime() - new Date(c.opened_at).getTime() > r.max_days * 86400000) return "max_days";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Public posts
// ---------------------------------------------------------------------------------------------------------------
const PRICE = /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:%|percent)\s?(?:off|discount)?\b|\b(?:price|priced|pricing|cost|costs|from only|starting at|starts at)\b/i;
const OFFER = /\b(?:off|discount|deal|special|promo|promotion|coupon|free|bogo|save|sale|limited time|offer)\b/i;
const GUARANTEE = /\b(?:guarantee[ds]?|warranty|warrant(?:y|ies)|promise[ds]?|100\s?%|money[- ]back|satisfaction)\b/i;
/** Things a post may never claim: made-up reviews, testimonials, or before-and-after results. */
const INVENTED = /\bbefore\s*(?:and|&|\/)\s*after\b|\btestimonial|\b(?:our|a|one of our) (?:customers?|clients?) (?:said|says|told us|raves?|wrote)|["“][^"”]{12,}["”]\s*[-–—]\s*[A-Z][a-z]+|\b[45][\s-]?stars?\s+(?:review|rating)s?\b/i;
export type Post = { text: string; customerNames?: string[]; usesCustomerPhoto?: boolean };
/** What about a post makes it need the owner, in plain words. Empty means nothing does. */
export function riskOfPost(p: Post): string[] {
  const t = String(p?.text ?? ""), why: string[] = [];
  if (PRICE.test(t)) why.push("it names a price");
  if (OFFER.test(t)) why.push("it makes an offer");
  if (GUARANTEE.test(t)) why.push("it makes a guarantee");
  if (p?.usesCustomerPhoto) why.push("it uses a customer's photo");
  for (const n of p?.customerNames ?? []) if (typeof n === "string" && n.trim().length >= 2 && new RegExp(`\\b${n.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)) { why.push("it names a customer"); break; }
  return why;
}
export const inventsEvidence = (p: Post): boolean => INVENTED.test(String(p?.text ?? ""));
export type PostCtx = {
  approved: boolean; ownerApproved: boolean; published: number; thisWeek: number;
  rules: { first_n: number; weekly_cap: number; always: boolean };
};
/**
 * What may happen to one post. `refuse` ends it (the operator never invents evidence, and it never posts without the
 * owner's approved voice and account); `owner` sends it for the owner's decision; `publish` may go out now.
 * The first N posts need the owner whatever they say, and so does any post that carries a risk. The weekly cap holds for all.
 */
export function postVerdict(p: Post, c: PostCtx): { action: "publish" | "owner" | "refuse"; why: string } {
  if (!c.approved) return { action: "refuse", why: "The owner has not approved the brand voice and the accounts yet." };
  if (inventsEvidence(p)) return { action: "refuse", why: "A post may not contain a testimonial, an invented review, or a before-and-after claim." };
  if (c.thisWeek >= c.rules.weekly_cap) return { action: "refuse", why: `This week's limit of ${c.rules.weekly_cap} posts is used.` };
  const risk = riskOfPost(p);
  if (!c.ownerApproved) {
    if (c.rules.always) return { action: "owner", why: "Every post needs the owner." };
    if (c.published < c.rules.first_n) return { action: "owner", why: `The first ${c.rules.first_n} posts need the owner (${c.published} so far).` };
    if (risk.length) return { action: "owner", why: `This post needs the owner: ${risk.join(", ")}.` };
  }
  return { action: "publish", why: c.ownerApproved ? "The owner approved this post." : "Past the first posts, with nothing in it that needs the owner." };
}

// ---------------------------------------------------------------------------------------------------------------
// The deterministic compile. No model: a template per process turns the operate primitive and the business's own
// facts into teammate/1 jobs plus the operate block. A model may only fill in the owner-facing wording elsewhere.
// ---------------------------------------------------------------------------------------------------------------
export type CompileCtx = {
  business: string; teammate: string;
  /** The building blocks the business connected, by role. Each is the tool name a job lists. */
  crm?: string; field_service?: string; email?: string; sms?: string; social?: string;
  /** The kind of record a quote or a finished job is, in the owner's software. */
  deal?: string; job?: string;
  accounts?: string[]; channels?: string[]; audience?: { who: "every_customer" | "named_stage"; stage?: string };
};
const wk = (every: "week", on: string[], at: string) => ({ type: "schedule" as const, every, on, at });
const PAUSE = { after_failures: 2, on_limit: "pause" as const };

/** The jobs and operate block for one process. The result is checked by checkSpec and checkOperate before anything is saved. */
export function compileOperator(process: Process, ctx: CompileCtx): { jobs: J[]; operate: J; needs: string[] } {
  const who = `${ctx.business}`;
  const needs: string[] = [];
  if (process === "content_social") {
    const accounts = (ctx.accounts?.length ? ctx.accounts : ["facebook"]).slice(0, CEIL.accounts);
    needs.push("Owner approves the brand voice and each account once, before it can go live");
    return {
      needs,
      jobs: [
        { id: "plan_week", name: "Plan the week's posts", does: `Drafts up to three posts a week for ${who} from facts the owner has already given, and sends each to the owner.`,
          instructions: `Every Monday, write up to 3 short social posts for ${who} using only the business facts on file. Never invent a customer quote, a review, a result, a price, an offer or a guarantee. Never use a customer's name or photo. Save each post as a draft for the owner to approve with the draft tool. Do not publish anything yourself in this job.`,
          triggers: [wk("week", ["mon"], "08:00")],
          tools: [{ tool: "pip", records: "draft", can: ["add"] }],
          limits: { per_run: { steps: 10, actions: 4 }, per_day: { runs: 2, actions: 8 } }, pause: PAUSE },
        { id: "publish_post", name: "Publish an approved post", does: "Publishes a post the owner approved, to the accounts the owner connected, and nothing else.",
          instructions: `Publish exactly the approved draft text, unchanged, to the connected account. If the owner declined it, do nothing. If a check says the post may not go out, stop and tell the owner why. Never edit the text.`,
          triggers: [{ type: "owner", on: "decision", about: "draft", when: ["approved"] }],
          tools: [{ tool: ctx.social ?? "social_posting", records: "post", can: ["add"] }],
          limits: { per_run: { steps: 6, actions: 3 }, per_day: { runs: 6, actions: 6 } }, pause: PAUSE },
      ],
      operate: {
        version: OPERATE, process, goal: `Keep ${who}'s social accounts active with a few owner-approved posts a week.`,
        case: { from: { schedule: "week" }, closes_when: ["opted_out", "max_touches", "max_days"] },
        touches: { max: 3, min_gap_hours: 24, channels: [] },
        public: { posts: true, channels: ctx.channels?.length ? ctx.channels : ["facebook"], approval: "first_n:5" },
        approvals: { brand_voice: true, accounts },
        stages: [{ id: "plan", job: "plan_week", does: "Plans the week and sends each draft to the owner." }, { id: "publish", job: "publish_post", does: "Publishes only what the owner approved." }],
      },
    };
  }
  const crm = ctx.crm ?? "crm", fs = ctx.field_service ?? "field_service";
  const channels = (ctx.channels?.length ? ctx.channels : ["email"]).filter((c) => (CUSTOMER_CHANNELS as readonly string[]).includes(c));
  const sendGrants = channels.map((c) => ({ tool: c === "email" ? (ctx.email ?? "email") : (ctx.sms ?? "send_text"), records: "message", can: ["add"], purpose: RULES[process].purposes[c] }));
  if (channels.includes("sms")) needs.push("A2P 10DLC registration (2-4 weeks)", "Customers' marketing consent on file for text requests");
  const audience = ctx.audience ?? { who: "every_customer" as const };
  if (process === "review_requests") {
    const rec = ctx.job ?? "job", src = fs;
    return {
      needs,
      jobs: [
        { id: "ask_review", name: "Ask for a review", does: `After a job for ${who} is finished, asks that customer for a review with one link, and sends one reminder.`,
          instructions: `A job was just finished. Look up the customer on this job. Write a short, warm message thanking them and giving the review link the owner set. Ask every customer the same way. Never ask only some customers, never ask about how happy they were first, never offer anything in return. If they reply, do not answer; the owner will. If they say stop, never message them again.`,
          triggers: [{ type: "event", from: src, event: "record_changed", records: rec, if: { field: "status", is: "completed" } }],
          tools: [{ tool: src, records: rec, can: ["read"] }, { tool: crm, records: "contact", can: ["read"] }, ...sendGrants, { tool: "pip", records: "handoff", can: ["add"] }],
          limits: { per_run: { steps: 8, actions: 3 }, per_day: { runs: 60, actions: 120 }, each: sendGrants.map((g) => ({ tool: g.tool, records: "message", per_run: 1, per_day: 80, per_contact_per_day: 1 })) },
          pause: { ...PAUSE, when: ["a customer complains or asks for something other than a review"] } },
      ],
      operate: {
        version: OPERATE, process, goal: `Ask every ${who} customer for a review after a finished job, once, with one reminder.`,
        case: { from: { tool: src, records: rec }, closes_when: ["replied", "opted_out", "completed", "max_touches", "max_days"] },
        touches: { max: 2, min_gap_hours: 72, channels },
        audience: audience.who === "named_stage" ? { who: "named_stage", stage: audience.stage ?? "Completed" } : { who: "every_customer" },
        public: { posts: false }, approvals: { brand_voice: false, accounts: [] },
        stages: [{ id: "ask", job: "ask_review", does: "Asks the customer for a review, then once more three days later if they have not answered." }],
      },
    };
  }
  const deal = ctx.deal ?? "deal";
  return {
    needs,
    jobs: [
      { id: "follow_up_quote", name: "Follow up on a quote", does: `After ${who} sends a quote, checks in up to three times, then stops.`,
        instructions: `A quote was sent to this customer. Check in politely and answer only what they asked about, using the business facts on file. Never state or change a price, a discount, an amount or a promise. If they want to book, hand off to the owner. If they reply, do not continue; the owner will. If they say stop, never message them again.`,
        triggers: [{ type: "event", from: crm, event: "record_changed", records: deal, if: { field: "stage", is: "quote_sent" } }],
        tools: [{ tool: crm, records: deal, can: ["read"] }, { tool: crm, records: "contact", can: ["read"] }, ...sendGrants, { tool: "pip", records: "handoff", can: ["add"] }, { tool: "pip", records: "booking_request", can: ["add"] }],
        limits: { per_run: { steps: 8, actions: 3 }, per_day: { runs: 60, actions: 120 }, each: sendGrants.map((g) => ({ tool: g.tool, records: "message", per_run: 1, per_day: 80, per_contact_per_day: 1 })) },
        pause: { ...PAUSE, when: ["a customer disputes a price or asks for a different price"] } },
    ],
    operate: {
      version: OPERATE, process, goal: `Follow up on every quote ${who} sends, up to three times, then stop.`,
      case: { from: { tool: crm, records: deal }, closes_when: ["replied", "opted_out", "completed", "max_touches", "max_days"] },
      touches: { max: 3, min_gap_hours: 72, channels },
      audience: audience.who === "named_stage" ? { who: "named_stage", stage: audience.stage ?? "Quote sent" } : { who: "every_customer" },
      public: { posts: false }, approvals: { brand_voice: false, accounts: [] },
      stages: [{ id: "follow_up", job: "follow_up_quote", does: "Checks in on the quote, up to three times 72 hours apart." }],
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The same rules in words an owner can read. This is what the founder sees before go-live and the owner in the Portal.
// ---------------------------------------------------------------------------------------------------------------
const list = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
export function operatePlainWords(op: Operate): { what: string[]; stops: string[]; needsYou: string[] } {
  const r = RULES[op.process], what: string[] = [op.goal], stops: string[] = [], needsYou: string[] = [];
  if (r.reaches === "customer") {
    what.push(`It contacts customers by ${list(op.touches.channels)}, at most ${op.touches.max} time${op.touches.max === 1 ? "" : "s"} each, at least ${Math.round(op.touches.min_gap_hours / 24)} day${op.touches.min_gap_hours >= 48 ? "s" : ""} apart, and only in the hours the law allows.`);
    what.push(op.audience?.who === "named_stage" ? `It asks customers at the "${op.audience.stage}" stage.` : "It asks every customer, with no filter on how happy they are.");
    stops.push("The moment a customer says STOP it never contacts them again.");
    if (op.case.closes_when.includes("replied")) stops.push("When a customer replies it stops and hands the conversation to you.");
    stops.push(`After ${op.touches.max} touches, or ${r.max_days} days, it stops.`);
    for (const c of op.touches.channels) what.push(r.purposes[c] === "marketing" ? `Texts go only to people who agreed to hear from you by text.` : `${c === "email" ? "Emails" : "Texts"} go only to people with a record of a relationship with you.`);
  } else {
    what.push(`It posts to ${list(op.public.channels)}, at most ${r.max_touches} posts a week.`);
    needsYou.push("Approve the brand voice and each account once, before anything is posted.");
    needsYou.push(op.public.approval === "always" ? "Approve every post." : `Approve the first ${op.public.approval!.slice(8)} posts, and any post that names a price, an offer, a guarantee, a customer or a customer's photo.`);
    stops.push("It never invents a review, a testimonial or a before-and-after claim.");
    stops.push("If you pause it, or take back an approval, it stops posting.");
  }
  return { what, stops, needsYou };
}

// ---------------------------------------------------------------------------------------------------------------
// What the Forge calls. `compileForForge` turns the Brain's candidate (the operator primitive in `uses`) into a full
// teammate spec, with no model. `dryRun` is the operator lane's test stage: fake cases through every rule, in fake time.
// ---------------------------------------------------------------------------------------------------------------
/** The process an agent's primitives name, if any. More than one operator in one teammate is refused: they are separate teammates. */
export function processOfUses(uses: unknown): { process: Process | null; error?: string } {
  const have = PROCESSES.filter((p) => Array.isArray(uses) && uses.includes(PRIMITIVE_OF[p]));
  return have.length === 1 ? { process: have[0] } : have.length > 1 ? { process: null, error: "One teammate runs one operator. Split these into separate teammates." } : { process: null };
}
export type ForgeAgent = { name?: string; teammate?: unknown; uses?: unknown; operate_accounts?: unknown; operate_stage?: unknown };
export function compileForForge(agent: ForgeAgent, business: string): { ok: boolean; spec: J | null; errors: string[]; needs: string[] } {
  const p = processOfUses(agent?.uses);
  if (!p.process) return { ok: false, spec: null, errors: [p.error ?? "This teammate has no operator primitive."], needs: [] };
  const uses = (agent.uses as string[]) ?? [];
  const t = agent.teammate as J, teammate = typeof t === "string" ? t : typeof t?.name === "string" ? t.name : "Pip";
  const channels = p.process === "content_social"
    ? [...new Set((["facebook", "instagram", "google_business"] as const).filter((c) => uses.includes("social_posting") && (c !== "google_business" || uses.includes("google_profile"))))]
    : (["email", "sms"] as const).filter((c) => uses.includes(c === "sms" ? "send_text" : "email") || (c === "sms" && uses.includes("sms")));
  const accounts = Array.isArray(agent.operate_accounts) ? (agent.operate_accounts as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
  const c = compileOperator(p.process, {
    business: String(business || "the business").slice(0, 120), teammate: String(teammate).slice(0, 60),
    ...(p.process === "content_social" ? { accounts: accounts?.length ? accounts : channels.slice(0, 1), channels: channels.length ? channels : ["facebook"] } : { channels: channels.length ? [...channels] : ["email"] }),
    ...(p.process === "quote_followup" && typeof agent.operate_stage === "string" ? { audience: { who: "named_stage" as const, stage: agent.operate_stage } } : {}),
  });
  const spec = { contract: CONTRACT, name: String(agent.name || `${teammate} the ${p.process.replace(/_/g, " ")} operator`).slice(0, 120), version: 1, jobs: c.jobs, operate: c.operate };
  const base = checkSpec(spec), op = checkOperate(spec);
  const errors = [...(base.ok ? [] : base.errors), ...(op.ok ? [] : op.errors)];
  return { ok: !errors.length, spec: errors.length ? null : spec, errors, needs: c.needs };
}

export type DryCase = { name: string; ok: boolean; detail: string };
const D = 86400000, H = 3600000;
/**
 * Fake cases through every rule, in fake time. It uses the same pure rules the database repeats, so a pass here and a
 * pass in tests/db/operate.test.mjs mean the same thing. Returns the shape the Forge's other test stage returns.
 */
export function dryRun(spec: unknown): { ok: boolean; passed: number; total: number; ratio: number; must_not_promise_ok: boolean; cases: DryCase[]; ran: string } {
  const cases: DryCase[] = [], add = (name: string, ok: boolean, detail: string) => cases.push({ name, ok, detail });
  const c = checkOperate(spec);
  if (!c.ok || !c.operate) { add("the operate block is valid", false, c.errors.join(" | ")); return done(cases); }
  const op = c.operate, r = RULES[op.process], tz = "America/Boise", hours = { from: "08:00", to: "20:00" };
  const rules = { max_touches: op.touches.max, min_gap_hours: op.touches.min_gap_hours, max_days: r.max_days };
  const t0 = Date.parse("2026-11-02T17:00:00Z"); // 10:00 in Boise
  if (r.reaches === "customer") {
    // 1. left alone, a case ends after at most max touches, spaced at least the gap apart, inside the window
    for (let k = 1; k <= 3; k++) {
      const st = { status: "open" as const, touches: 0, opened_at: new Date(t0).toISOString(), last_touch_at: null as string | null };
      let now = t0, n = 0, bad = "";
      for (let step = 0; step < 40 && !bad; step++) {
        const ok = touchDecision(st as never, rules, new Date(now), st.touches + 1, hours, tz);
        if (ok.ok) { st.touches++; if (st.last_touch_at && now - Date.parse(st.last_touch_at) < r.min_gap_hours * H) bad = "touches closer than the gap"; st.last_touch_at = new Date(now).toISOString(); n++; }
        now += 6 * H + k * H;
      }
      if (n > op.touches.max) bad ||= `${n} touches, more than ${op.touches.max}`;
      if (n === 0) bad ||= "never reached the customer";
      add(`case ${k}: left alone, it stops at the limit`, !bad, bad || `${n} touch${n === 1 ? "" : "es"}, then stopped`);
    }
    // 2. a touch outside the hours, a touch too soon, and a touch out of order are each refused
    const fresh = { status: "open" as const, touches: 0, opened_at: new Date(t0).toISOString(), last_touch_at: null };
    const night = touchDecision(fresh, rules, new Date(t0 + 11 * H), 1, hours, tz);
    add("a touch at night is refused", !night.ok && night.why === "outside_hours", night.ok ? "it was allowed" : night.why);
    const soon = touchDecision({ ...fresh, touches: 1, last_touch_at: new Date(t0).toISOString() }, rules, new Date(t0 + 24 * H), 2, hours, tz);
    add("a second touch inside the gap is refused", op.touches.max < 2 || (!soon.ok && soon.why === "too_soon"), soon.ok ? "it was allowed" : soon.why);
    const skip = touchDecision(fresh, rules, new Date(t0), 2, hours, tz);
    add("a touch out of order is refused", !skip.ok && skip.why === "wrong_touch", skip.ok ? "it was allowed" : skip.why);
    const old = touchDecision({ ...fresh, touches: 1, last_touch_at: new Date(t0).toISOString() }, rules, new Date(t0 + (r.max_days + 1) * D), 2, hours, tz);
    add("a case past its window is refused", !old.ok && old.why === "expired", old.ok ? "it was allowed" : old.why);
    // 3. the stops
    const s0 = { status: "open" as const, touches: 1, opened_at: new Date(t0).toISOString(), last_touch_at: new Date(t0).toISOString() };
    add("STOP closes the case, whatever the spec lists", closeReason(s0, rules, [], new Date(t0 + H), { opted_out: true }) === "opted_out", "STOP");
    add("a reply closes the case", !op.case.closes_when.includes("replied") || closeReason(s0, rules, op.case.closes_when, new Date(t0 + H), { replied: true }) === "replied", "reply");
    add("the audience has no happiness filter", !SENTIMENT.test(JSON.stringify(op.audience ?? {})) && !SENTIMENT.test(op.goal), "no filter");
    add("every channel has a purpose that fits the rules", op.touches.channels.every((ch) => ch in r.purposes), op.touches.channels.join(", "));
  } else {
    const ctx = { approved: true, ownerApproved: false, published: 0, thisWeek: 0, rules: { first_n: r.first_n ?? 5, weekly_cap: r.max_touches, always: op.public.approval === "always" } };
    const plain = { text: "Spring is here. Book your tune-up before the rush." };
    add("the first posts go to the owner", postVerdict(plain, ctx).action === "owner", postVerdict(plain, ctx).why);
    add("past the first posts, a plain post may go out", postVerdict(plain, { ...ctx, published: ctx.rules.first_n }).action === (ctx.rules.always ? "owner" : "publish"), "after the first posts");
    for (const [what, text] of [["a price", "Drain cleaning from $99 this week"], ["an offer", "Free estimate for new customers, limited time"], ["a guarantee", "We guarantee the job done right"]] as const)
      add(`a post with ${what} goes to the owner`, postVerdict({ text }, { ...ctx, published: 20 }).action === "owner", what);
    add("a made-up testimonial is refused", postVerdict({ text: "One of our customers said we saved her kitchen." }, { ...ctx, published: 20, ownerApproved: true }).action === "refuse", "testimonial");
    add("a before-and-after claim is refused", postVerdict({ text: "See the before and after of this bathroom" }, { ...ctx, published: 20, ownerApproved: true }).action === "refuse", "before and after");
    add("the weekly limit holds even for an approved post", postVerdict(plain, { ...ctx, published: 20, ownerApproved: true, thisWeek: r.max_touches }).action === "refuse", `${r.max_touches} a week`);
    add("without the owner's approved voice and accounts, nothing posts", postVerdict(plain, { ...ctx, approved: false, published: 20, ownerApproved: true }).action === "refuse", "approvals");
    add("the plan job cannot publish", !((c.operate.stages.find((s) => s.job === "plan_week") && (spec as J).jobs.find((j: J) => j.id === "plan_week")?.tools?.some((t: J) => t.tool === "social_posting"))), "plan_week holds no posting tool");
  }
  return done(cases);
  function done(cs: DryCase[]) {
    const passed = cs.filter((x) => x.ok).length;
    return { ok: passed === cs.length && cs.length > 0, passed, total: cs.length, ratio: cs.length ? passed / cs.length : 0, must_not_promise_ok: passed === cs.length && cs.length > 0, cases: cs, ran: "dry run with fake cases and a fake clock; nothing was sent or posted" };
  }
}
