// What pip-jobs and pip-turn do for an operator at run time, as pure, injectable steps so each can be tested with no
// network and no database. The rules themselves (cadence, purposes, closing) live in operate.ts and in the database;
// this file only orders the steps and fails closed.
//
//   pip-jobs:  eventPlan -> open a case, or note that its work is finished;  dueRun -> start one run for one due case
//   pip-turn:  operatorInput -> operatorSend (reserve the touch, ask the database, ask the consent gate, then send)
import { EMAIL_OPT_OUT_LINE } from "./optout.ts";
import { CEIL, isCaseDriven, localClock } from "./operate.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const EMAIL_ONE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const AI_RE = /(\b(ai|artificial intelligence|automated assistant|virtual assistant|bot)\b|\ba\.i\.)/i;

/** An operator may only start a touch in these local hours. The database checks the same window when it reserves the touch. */
export const CALLING_HOURS = { from: "08:00", to: "20:00" } as const;
export const inCallingHours = (at: Date, tz: string): boolean => { const t = localClock(at, tz); return t >= CALLING_HOURS.from && t < CALLING_HOURS.to; };

// ---------- pip-jobs ----------
/** The record an event is about: its own id if it carries one, else the caller's key. Anything odd is no id. */
export function recordIdOf(b: { key?: unknown; data?: unknown }): string | null {
  const d = isObj(b?.data) ? b.data : {};
  for (const v of [d.record_id, d.id, b?.key]) {
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (/^[A-Za-z0-9_.:@-]{1,120}$/.test(s)) return s;
  }
  return null;
}
export const caseKeyFor = (job: string, id: string): string => `c:${job}:${id}`.slice(0, 200);
/** The customer a record is about, from the event's data. Email only here; a phone needs the number registered first. */
export function contactOf(data: unknown): { contact: string; kind: "email" } | null {
  const d = isObj(data) ? data : {}, c = isObj(d.contact) ? d.contact : {};
  for (const v of [d.contact_email, d.customer_email, d.email, c.email]) if (typeof v === "string" && EMAIL_ONE.test(v.trim())) return { contact: v.trim(), kind: "email" };
  return null;
}
/** The same test an event trigger's `if` uses in pip-jobs. */
export function passes(cond: J, data: J): boolean {
  if (!cond) return true;
  const v = data && typeof data === "object" ? data[cond.field] : undefined;
  if (cond.is !== undefined) return v === cond.is || (v != null && String(v) === String(cond.is));
  const n = typeof v === "number" ? v : Number.NaN;
  return cond.over !== undefined ? n > cond.over : n < cond.under;
}
/**
 * What a message to this customer may use, taken from the event: a first name, the address, one service, one date.
 * Nothing else is kept, and never an amount: the database keeps the same short list and empties it when the case closes.
 */
export function contextOf(data: unknown): Record<string, string> {
  const d = isObj(data) ? data : {}, c = isObj(d.contact) ? d.contact : {}, out: Record<string, string> = {};
  const pick = (k: string, ...from: unknown[]) => { const v = from.find((x) => typeof x === "string" && x.trim()); if (typeof v === "string") out[k] = v.trim().slice(0, 120); };
  pick("first_name", d.first_name, c.first_name); pick("name", d.name, d.customer_name, c.name);
  const e = contactOf(data); if (e) out.email = e.contact; else if (typeof d.email === "string" && EMAIL_ONE.test(d.email.trim())) out.email = d.email.trim();
  pick("service", d.service, d.service_type, d.job_type); pick("when", d.when, d.completed_at, d.date);
  return out;
}
export type EventPlan = { kind: "open"; case_key: string; contact: string | null; stage: string | null; context: Record<string, string> } | { kind: "finish"; case_key: string } | { kind: "none" };
/**
 * What an event means for a customer operator's stage job. A matching event whose condition holds opens a case (once:
 * the database refuses a second case for the same key). A matching event whose condition no longer holds means the
 * work the case was about has moved on, which closes it if the spec lists "completed". It never starts a run itself.
 */
export function eventPlan(spec: J, job: { id: string; triggers: J[] }, b: { from?: string; event?: string; records?: string; key?: unknown; data?: unknown }): EventPlan {
  if (!isCaseDriven(spec, job.id)) return { kind: "none" };
  const t = job.triggers.find((x: J) => x?.type === "event" && x.from === b.from && x.event === b.event && (x.records ?? null) === (b.records ?? null));
  const id = recordIdOf(b);
  if (!t || !id) return { kind: "none" };
  const key = caseKeyFor(job.id, id);
  if (!passes(t.if, b.data)) return { kind: "finish", case_key: key };
  const stage = typeof (b.data as J)?.stage === "string" ? String((b.data as J).stage).slice(0, 80) : null;
  return { kind: "open", case_key: key, contact: contactOf(b.data)?.contact ?? null, stage, context: contextOf(b.data) };
}
/** One run per due case per touch. The key makes starting it twice impossible. */
export const dueRun = (c: { case_key: string; touches: number; context?: unknown }) => ({
  key: `o:${c.case_key}:${c.touches + 1}`.slice(0, 200),
  input: { operator: { case_key: c.case_key, touch: c.touches + 1 }, customer: contextOf(c.context) },
});

// ---------- pip-turn ----------
/** The case a run is working, if its input names one in the shape pip-jobs writes. Anything else is not an operator run. */
export function operatorInput(input: unknown): { case_key: string; touch: number } | null {
  const o = isObj(input) && isObj(input.operator) ? input.operator : null;
  if (!o || typeof o.case_key !== "string" || !o.case_key || o.case_key.length > 200 || !Number.isInteger(o.touch)) return null;
  const touch = o.touch as number;
  return touch >= 1 && touch <= CEIL.touches ? { case_key: o.case_key, touch } : null;
}
/** Does this run get to offer a customer send? Only a case-driven job started by pip-jobs for a case. */
export const isOperatorRun = (spec: unknown, jobId: string, input: unknown): boolean => isCaseDriven(spec, jobId) && operatorInput(input) !== null;

export type SendRefs = {
  caseId(spec: string, caseKey: string): Promise<string | null>;
  reserve(caseId: string, touch: number): Promise<{ ok: boolean; why?: string }>;
  check(spec: string, caseKey: string, channel: string, touch: number, recipient: string): Promise<{ ok: boolean; why?: string; purpose?: string }>;
  gate(to: string): Promise<{ allowed: boolean; reason?: string }>;
};
const SAY: Record<string, string> = {
  no_case: "there is no open case for this customer", closed: "this customer's case is closed", wrong_touch: "this is not the next message the case allows",
  max_touches: "the limit on messages to this customer is reached", expired: "the window for this customer has ended", too_soon: "it is too soon after the last message",
  outside_hours: "it is outside calling hours", touch_not_reserved: "the message was not reserved first", channel_not_allowed: "this channel is not allowed for this process",
  lane_off: "operators are switched off", recipient_unknown: "the customer's address could not be matched", recipient_mismatch: "that address is not the customer this case is about",
  opted_out: "this person asked not to be emailed", unconfirmed: "the send could not be confirmed",
};
const blocked = (why: string, team?: string) => ({ ok: false as const, why, text: `Blocked: ${SAY[why] ?? "the send could not be confirmed"}. Nothing was sent. ${team ?? "Do not try again; the owner will be told."}` });

/**
 * Everything that must be true before an operator's email goes out, in order, failing closed at the first step that
 * cannot say yes: the right case and touch, the touch reserved BEFORE anything is sent, the database's own check
 * (purpose, and that the address is the one this case is about), then the live consent gate. Only then does the
 * email get the AI line and the opt-out line. A thrown error from any step is a refusal.
 */
export async function operatorSend(refs: SendRefs, o: { spec: string; input: unknown; channel: string; args: J; teammate: string; business: string }):
  Promise<{ ok: true; args: J; to: string; purpose: string } | { ok: false; why: string; text: string }> {
  try {
    const op = operatorInput(o.input);
    if (!op) return blocked("no_case");
    if (o.channel !== "email") return blocked("channel_not_allowed"); // a text needs a registered number first; nothing is offered until then
    const args = isObj(o.args) ? { ...o.args } : {};
    const to = [args.recipient_email, args.to].find((v) => typeof v === "string" && EMAIL_ONE.test(v.trim()));
    if (typeof to !== "string") return blocked("recipient_unknown");
    // A malformed call is refused before a touch is spent on it.
    const key = ["body", "message_body", "content"].find((k) => typeof args[k] === "string" && String(args[k]).trim());
    if (!key) return blocked("unconfirmed");
    const id = await refs.caseId(o.spec, op.case_key);
    if (!id) return blocked("no_case");
    const held = await refs.reserve(id, op.touch);
    if (held?.ok !== true) return blocked(String(held?.why ?? "unconfirmed"));
    const chk = await refs.check(o.spec, op.case_key, "email", op.touch, to.trim());
    if (chk?.ok !== true || typeof chk.purpose !== "string") return blocked(String(chk?.why ?? "unconfirmed"));
    const gate = await refs.gate(to.trim());
    if (gate?.allowed !== true) return blocked(gate?.reason === "opted_out" ? "opted_out" : "unconfirmed");
    let body = String(args[key]);
    if (!AI_RE.test(body)) body = `${body}\n\nSent by ${o.teammate}, an AI assistant for ${o.business}.`;
    if (!/reply stop/i.test(body)) body = `${body}\n${EMAIL_OPT_OUT_LINE}`;
    return { ok: true, args: { ...args, [key]: body }, to: to.trim(), purpose: chk.purpose };
  } catch {
    return blocked("unconfirmed");
  }
}
