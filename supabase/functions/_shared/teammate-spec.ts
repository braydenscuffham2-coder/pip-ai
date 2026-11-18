// The teammate contract, in code. The words are in docs/contracts/teammate-spec.md; this file is what decides.
// Pure TypeScript with no imports, so pip-turn, pip-jobs, the Forge, the website and the tests all use the same copy.
//
//   checkSpec(spec)            is this spec's job list valid? Returns every problem in plain words, and the jobs
//                              with defaults filled in.
//   jobsOf(spec, manifest?)    the jobs a teammate has. A teammate built before this contract gets one job,
//                              "conversation", that covers what pip-turn lets it do today and nothing wider.
//   jobForMessage(jobs, ch)    which job answers a customer message on a channel. Decided here, never by a model.
//   allows(job, ask)           may this job do this to this kind of record? The one permission check. It answers
//                              no to anything it does not understand; it never throws.
//   plainWords(job)            the same permissions as sentences an owner can read.
//
// A spec that breaks a rule is refused whole. Nothing is quietly dropped or trimmed to fit, because a teammate that
// silently lost a permission or a limit is worse than one that was sent back.

export const CONTRACT = "teammate/1";

export const LEVELS = ["read", "add", "update"] as const;
export const CHANNELS = ["web_chat", "sms", "voice", "email"] as const;
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Kinds of record a job can be given. A closed list: a new kind is added here, in a pull request, on purpose. */
export const RECORDS = [
  "contact", "lead", "deal", "appointment", "busy_time", "task", "ticket", "note", "job", "row", "item",
  "message", "call", "file", "review", "post", "count",
] as const;
/** Records that move or promise money. Refused unless an owner-set policy, checked in code, says yes. */
export const MONEY_RECORDS = ["order", "invoice", "payment", "refund", "payout", "payroll", "price", "discount", "estimate"] as const;
/** Records that can only ever be read. */
export const READ_ONLY_RECORDS = ["busy_time", "count"] as const;
/** Pip's own actions, written as records of the tool "pip". All are add-only. */
export const PIP_RECORDS: Record<string, string> = {
  owner_alert: "notify_owner", lead: "capture_lead", booking_request: "request_booking", handoff: "handoff", draft: "draft_for_approval",
};
export const POLICIES = ["buying"] as const;
/**
 * Which policy may open which kinds of record, and how far. A kind that is not in a policy's row has no policy that
 * can open it yet: it is refused in the checker and again in allows(), whatever the spec says and whatever has passed.
 * "buying" is stage 1 only (handbook, November 17): reorder on supplier accounts the business already has.
 */
export const POLICY_OPENS: Record<string, Record<string, readonly string[]>> = {
  buying: { order: ["read", "add", "update"], price: ["read"], invoice: ["read"] },
};
/**
 * Money and payroll products, by name. This is pip-turn's own list (the MONEY pattern in
 * supabase/functions/pip-turn/index.ts); a test keeps the two identical. A permission on one of these needs an owner
 * policy for any kind of record at any level, exactly as a money record does.
 */
export const MONEY_TOOLS = /(stripe|square|paypal|quickbooks|xero|shopify|braintree|freshbooks|wave|plaid|brex|ramp|gusto|chargebee|recurly|paddle|venmo|coinbase|wise|adp|payroll|bank|billing|invoice|pay)/;
/** Is this tool name a money tool? Callers that turn a building block into a real product must ask again with the product's name. */
export const isMoneyTool = (tool: unknown): boolean => typeof tool === "string" && MONEY_TOOLS.test(tool.toLowerCase());
/**
 * The kinds of record pip-turn's "add one record" rule covers in a tool the owner connected on their own (its ADD_ONE
 * pattern: lead, contact/customer/client/person/company, deal/opportunity, task, ticket, note, job/request, record/row).
 * The implied job for older teammates gets exactly these, add only. Never a message, a call or a file.
 */
export const ADD_ONE_RECORDS = ["lead", "contact", "deal", "task", "ticket", "note", "job", "row"] as const;
export const PURPOSES = ["reply", "transactional", "marketing"] as const;
export const EVENTS = ["record_added", "record_changed", "lead_added", "missed_call", "conversation_ended", "count_changed"] as const;
export const DECISIONS = ["booking_request", "draft"] as const;

/** The most any job may ask for. Fixed in code; a spec above a ceiling is refused. */
export const CEILING = {
  jobs: 12, triggers: 4, tools: 24, fields: 30,
  per_run: { steps: 40, actions: 20 },
  per_day: { runs: 300, actions: 600 },
  each: { per_run: 20, per_day: 600, per_contact_per_day: 10 },
  task: { max_runs: 50, max_days: 30 },
  schedule_minutes: 15,
};
export const DEFAULTS = {
  per_run: { steps: 8, actions: 4 },
  per_day: { runs: 48, actions: 60 },
  per_contact_per_day: 3,
  pause: { after_failures: 3, on_limit: "wait" as const },
};

export type Level = (typeof LEVELS)[number];
export type Channel = (typeof CHANNELS)[number];
export type Trigger =
  | { type: "message"; channels: Channel[] }
  | { type: "schedule"; every: "minutes" | "hours" | "day" | "week" | "month"; interval?: number; at?: string; on?: (string | number)[]; between?: [string, string] }
  | { type: "event"; from: string; event: string; records?: string; if?: { field: string; is?: string | number | boolean; over?: number; under?: number } }
  | { type: "owner"; on: "decision"; about: string; when: string[] }
  | { type: "owner"; on: "run_now" };
export type Grant = {
  tool: string; records: string; can: Level[];
  fields?: { read?: string[]; add?: string[]; update?: string[] };
  required: boolean; purpose?: string; policy?: string;
};
export type Limits = {
  per_run: { steps: number; actions: number };
  per_day: { runs: number; actions: number } | null;
  each: { tool: string; records: string; per_run?: number; per_day?: number; per_contact_per_day?: number }[];
};
export type Job = {
  id: string; name: string; does: string; instructions: string;
  triggers: Trigger[]; tools: Grant[]; limits: Limits;
  pause: { after_failures: number; on_limit: "wait" | "pause"; when: string[] };
  task?: { max_runs: number; max_days: number };
  legacy?: true;
};

// deno-lint-ignore no-explicit-any
type J = any;
const isObj = (v: unknown): v is Record<string, J> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v: unknown, lo: number, hi: number): v is string => typeof v === "string" && v.trim().length >= lo && v.length <= hi;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z][a-z0-9_]{1,39}$/;
const FIELD = /^[a-z][a-z0-9_.]{0,59}$/;
const TOOL = /^(pip|box|kit:[a-z0-9_]{2,60}|[a-z][a-z0-9_]{1,39})$/;
const money = (r: string) => (MONEY_RECORDS as readonly string[]).includes(r);
/** Looks a key up in a plain table without ever reaching inherited names like "constructor". */
const at = (m: Record<string, string>, k: string): string | undefined => (Object.hasOwn(m, k) ? m[k] : undefined);
const known = (r: string) => (RECORDS as readonly string[]).includes(r) || money(r);
/** Does this policy open this kind of record at this level? Own keys only, so "constructor" is never a policy or a kind. */
const opens = (policy: unknown, rec: unknown, level: unknown): boolean =>
  typeof policy === "string" && typeof rec === "string" && Object.hasOwn(POLICY_OPENS, policy) && Object.hasOwn(POLICY_OPENS[policy], rec) && POLICY_OPENS[policy][rec].includes(level as string);

function extra(o: Record<string, J>, allowed: string[], where: string, errors: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${where}: "${k}" is not part of the contract.`);
}

/** How many times a day a schedule starts a run, at most. */
export function runsPerDay(t: Trigger): number {
  if (t.type !== "schedule") return 0;
  let minutes = 1440;
  if (t.between && TIME.test(t.between[0]) && TIME.test(t.between[1])) {
    const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    minutes = Math.max(1, m(t.between[1]) - m(t.between[0]));
  }
  if (t.every === "minutes") return Math.floor(minutes / (t.interval || 15)) + 1;
  if (t.every === "hours") return Math.floor(minutes / ((t.interval || 1) * 60)) + 1;
  return 1;
}

function checkTrigger(t: J, w: string, errors: string[]): Trigger | null {
  if (!isObj(t)) { errors.push(`${w}: must be an object.`); return null; }
  const n = errors.length;
  if (t.type === "message") {
    extra(t, ["type", "channels"], w, errors);
    if (!Array.isArray(t.channels) || !t.channels.length || t.channels.some((c: J) => !(CHANNELS as readonly string[]).includes(c)) || new Set(t.channels).size !== t.channels.length)
      errors.push(`${w}: channels must list one or more of ${CHANNELS.join(", ")}, each once.`);
  } else if (t.type === "schedule") {
    extra(t, ["type", "every", "interval", "at", "on", "between"], w, errors);
    const fine = t.every === "minutes" || t.every === "hours";
    if (!["minutes", "hours", "day", "week", "month"].includes(t.every)) errors.push(`${w}: every must be minutes, hours, day, week or month.`);
    if (t.every === "minutes" && !isInt(t.interval, CEILING.schedule_minutes, 720)) errors.push(`${w}: interval must be ${CEILING.schedule_minutes} to 720 minutes. Nothing runs more often than every ${CEILING.schedule_minutes} minutes.`);
    if (t.every === "hours" && !isInt(t.interval, 1, 12)) errors.push(`${w}: interval must be 1 to 12 hours.`);
    if (!fine && t.interval !== undefined) errors.push(`${w}: interval is only for minutes and hours.`);
    if (!fine && !(typeof t.at === "string" && TIME.test(t.at))) errors.push(`${w}: at must be a time like "07:30", in the business's own time zone.`);
    if (fine && t.at !== undefined) errors.push(`${w}: at is only for day, week and month.`);
    if (t.between !== undefined && !(fine && Array.isArray(t.between) && t.between.length === 2 && t.between.every((x: J) => typeof x === "string" && TIME.test(x)) && t.between[0] < t.between[1]))
      errors.push(`${w}: between is only for minutes and hours, and must be two times in order, like ["08:00","18:00"].`);
    const on = Array.isArray(t.on) ? t.on : null;
    if (t.every === "week" && !(on && on.length && on.every((d: J) => (DAYS as readonly string[]).includes(d)) && new Set(on).size === on.length)) errors.push(`${w}: on must list days of the week (${DAYS.join(", ")}), each once.`);
    else if (t.every === "month" && !(on && on.length && on.length <= 4 && on.every((d: J) => d === "last" || isInt(d, 1, 28)) && new Set(on).size === on.length)) errors.push(`${w}: on must list up to four days of the month, each 1 to 28 or "last".`);
    else if (!["week", "month"].includes(t.every) && t.on !== undefined) errors.push(`${w}: on is only for week and month.`);
  } else if (t.type === "event") {
    extra(t, ["type", "from", "event", "records", "if"], w, errors);
    if (typeof t.from !== "string" || !TOOL.test(t.from)) errors.push(`${w}: from must name a tool, "pip" or "box".`);
    if (!(EVENTS as readonly string[]).includes(t.event)) errors.push(`${w}: event must be one of ${EVENTS.join(", ")}.`);
    const own = t.from === "pip" || t.from === "box";
    if (!own && !["record_added", "record_changed"].includes(t.event)) errors.push(`${w}: a tool can only send record_added or record_changed.`);
    if (t.from === "pip" && !["lead_added", "missed_call", "conversation_ended"].includes(t.event)) errors.push(`${w}: Pip itself only sends lead_added, missed_call and conversation_ended.`);
    if (t.from === "box" && t.event !== "count_changed") errors.push(`${w}: a box only sends count_changed.`);
    if (!own && !(typeof t.records === "string" && known(t.records))) errors.push(`${w}: records must name the kind of record that starts the job.`);
    if (own && t.records !== undefined) errors.push(`${w}: records is only for events from a tool.`);
    if (t.if !== undefined) {
      const f = t.if;
      if (!isObj(f) || typeof f.field !== "string" || !FIELD.test(f.field)) errors.push(`${w}: if needs a field name.`);
      else {
        extra(f, ["field", "is", "over", "under"], `${w}.if`, errors);
        const tests = ["is", "over", "under"].filter((k) => f[k] !== undefined);
        if (tests.length !== 1) errors.push(`${w}: if needs exactly one of is, over or under.`);
        if (f.is !== undefined && !["string", "number", "boolean"].includes(typeof f.is)) errors.push(`${w}: if.is must be text, a number or true/false.`);
        if (typeof f.is === "string" && f.is.length > 120) errors.push(`${w}: if.is is too long.`);
        for (const k of ["over", "under"]) if (f[k] !== undefined && !(typeof f[k] === "number" && Number.isFinite(f[k]))) errors.push(`${w}: if.${k} must be a number.`);
      }
    }
  } else if (t.type === "owner") {
    if (t.on === "run_now") extra(t, ["type", "on"], w, errors);
    else if (t.on === "decision") {
      extra(t, ["type", "on", "about", "when"], w, errors);
      if (!(DECISIONS as readonly string[]).includes(t.about)) errors.push(`${w}: about must be one of ${DECISIONS.join(", ")}.`);
      if (!Array.isArray(t.when) || !t.when.length || t.when.some((x: J) => !["approved", "declined"].includes(x)) || new Set(t.when).size !== t.when.length) errors.push(`${w}: when must list approved, declined or both.`);
    } else errors.push(`${w}: on must be decision or run_now.`);
  } else errors.push(`${w}: type must be message, schedule, event or owner.`);
  return errors.length === n ? (t as Trigger) : null;
}

function checkGrant(g: J, w: string, errors: string[]): Grant | null {
  if (!isObj(g)) { errors.push(`${w}: must be an object.`); return null; }
  const n = errors.length;
  extra(g, ["tool", "records", "can", "fields", "required", "purpose", "policy"], w, errors);
  const tool = typeof g.tool === "string" && TOOL.test(g.tool) && g.tool !== "box" ? g.tool : null;
  if (!tool) errors.push(`${w}: tool must name a building block (like "calendar" or "crm"), "pip", or a connected product as "kit:<name>".`);
  const can: string[] = Array.isArray(g.can) ? g.can : [];
  const bad = can.filter((c) => !(LEVELS as readonly string[]).includes(c));
  if (bad.length) errors.push(`${w}: "${bad.join('", "')}" is never allowed. A job can read, add or update. Nothing else, and never delete.`);
  if (!can.length || new Set(can).size !== can.length) errors.push(`${w}: can must list one or more of read, add, update, each once.`);
  const rec = typeof g.records === "string" ? g.records : "";
  if (tool === "pip") {
    if (!at(PIP_RECORDS, rec)) errors.push(`${w}: Pip's own actions are ${Object.keys(PIP_RECORDS).join(", ")}.`);
    if (can.length !== 1 || can[0] !== "add") errors.push(`${w}: Pip's own actions are add only.`);
    for (const k of ["fields", "purpose", "policy"]) if (g[k] !== undefined) errors.push(`${w}: ${k} does not apply to Pip's own actions.`);
  } else {
    if (!known(rec)) errors.push(`${w}: records must be one kind from the contract's list. "*" and made-up kinds are refused.`);
    if ((READ_ONLY_RECORDS as readonly string[]).includes(rec) && can.some((c) => c !== "read")) errors.push(`${w}: ${rec} can only be read.`);
    if (money(rec) || isMoneyTool(tool)) {
      // Money: the kind of record, or the tool itself. The policy must be named, and must be one that opens this kind
      // at every level asked for. Most money kinds have no policy that can open them yet.
      const what = money(rec) ? `${rec} is a money record` : `${tool} is a money tool`;
      const could = POLICIES.filter((p) => LEVELS.some((l) => opens(p, rec, l)));
      if (!could.length) errors.push(`${w}: ${what}. No policy can open ${money(rec) ? rec : `${rec || "that"} there`} yet, so it is refused.`);
      else if (!(POLICIES as readonly string[]).includes(g.policy)) errors.push(`${w}: ${what}. It needs "policy": one of ${could.join(", ")}, and stays refused until that policy check exists and passes.`);
      else { const shut = can.filter((c) => (LEVELS as readonly string[]).includes(c) && !opens(g.policy, rec, c)); if (shut.length) errors.push(`${w}: ${what}. The ${g.policy} policy cannot open ${shut.join(" or ")} on ${rec}.`); }
    } else if (g.policy !== undefined) errors.push(`${w}: policy is only for money records and money tools.`);
    const outbound = ["message", "call"].includes(rec) && can.includes("add");
    if (outbound && !(PURPOSES as readonly string[]).includes(g.purpose)) errors.push(`${w}: sending a ${rec} needs "purpose": reply, transactional or marketing.`);
    if (outbound && rec === "call" && g.purpose === "reply") errors.push(`${w}: an outbound call is never a reply. Use transactional or marketing; both need a stored consent record.`);
    if (!outbound && g.purpose !== undefined) errors.push(`${w}: purpose is only for sending a message or placing a call.`);
    if (g.fields !== undefined) {
      if (!isObj(g.fields)) errors.push(`${w}: fields must be an object.`);
      else {
        extra(g.fields, ["read", "add", "update"], `${w}.fields`, errors);
        for (const k of ["read", "add", "update"] as const) {
          const list = g.fields[k];
          if (list === undefined) continue;
          if (!Array.isArray(list) || !list.length || list.length > CEILING.fields || list.some((f: J) => typeof f !== "string" || !FIELD.test(f)) || new Set(list).size !== list.length) errors.push(`${w}: fields.${k} must list 1 to ${CEILING.fields} field names, each once.`);
          else if (!can.includes(k)) errors.push(`${w}: fields.${k} is listed but the job cannot ${k}.`);
        }
      }
    }
    if (can.includes("update") && !(isObj(g.fields) && Array.isArray(g.fields.update) && g.fields.update.length)) errors.push(`${w}: update needs fields.update, the exact fields the job may change. There is no "update anything".`);
  }
  if (g.required !== undefined && typeof g.required !== "boolean") errors.push(`${w}: required must be true or false.`);
  if (errors.length !== n) return null;
  return { tool: tool!, records: rec, can: can as Level[], ...(g.fields ? { fields: g.fields } : {}), required: g.required !== false, ...(g.purpose ? { purpose: g.purpose } : {}), ...(g.policy ? { policy: g.policy } : {}) };
}

function checkJob(j: J, w: string, errors: string[]): Job | null {
  if (!isObj(j)) { errors.push(`${w}: must be an object.`); return null; }
  const n = errors.length;
  extra(j, ["id", "name", "does", "instructions", "triggers", "tools", "limits", "pause", "task"], w, errors);
  if (typeof j.id !== "string" || !ID.test(j.id)) errors.push(`${w}: id must be lower-case letters, digits and underscores, starting with a letter (2 to 40).`);
  if (!isStr(j.name, 2, 60)) errors.push(`${w}: name is what the owner sees, 2 to 60 characters.`);
  if (!isStr(j.does, 10, 200)) errors.push(`${w}: does is one plain sentence for the owner, 10 to 200 characters.`);
  if (!isStr(j.instructions, 20, 6000)) errors.push(`${w}: instructions are the plain-words steps for the teammate, 20 to 6000 characters.`);

  const triggers: Trigger[] = [];
  if (!Array.isArray(j.triggers) || !j.triggers.length || j.triggers.length > CEILING.triggers) errors.push(`${w}: triggers must list 1 to ${CEILING.triggers} things that start the job.`);
  else j.triggers.forEach((t: J, i: number) => { const ok = checkTrigger(t, `${w}.triggers[${i}]`, errors); if (ok) triggers.push(ok); });
  if (triggers.filter((t) => t.type === "message").length > 1) errors.push(`${w}: list every channel in one message trigger.`);
  const schedules = new Set<string>();
  for (const t of triggers) if (t.type === "schedule") {
    // The same schedule whatever order its keys or its days were written in.
    const k = JSON.stringify(Object.keys(t).sort().map((key) => [key, key === "on" ? [...(t.on ?? [])].map(String).sort() : (t as J)[key]]));
    if (schedules.has(k)) errors.push(`${w}: the same schedule is listed twice. List each schedule once.`);
    schedules.add(k);
  }

  const tools: Grant[] = [];
  if (j.tools !== undefined && (!Array.isArray(j.tools) || j.tools.length > CEILING.tools)) errors.push(`${w}: tools must be a list of at most ${CEILING.tools}.`);
  else (j.tools ?? []).forEach((g: J, i: number) => { const ok = checkGrant(g, `${w}.tools[${i}]`, errors); if (ok) tools.push(ok); });
  const seen = new Set<string>();
  for (const g of tools) { const k = `${g.tool}/${g.records}`; if (seen.has(k)) errors.push(`${w}: ${k} is listed twice. Put every level for one kind of record in one entry.`); seen.add(k); }
  const acts = (g: Grant) => g.can.includes("add") || g.can.includes("update");
  for (const t of triggers) {
    if (t.type === "event" && t.from !== "pip" && t.from !== "box" && !tools.some((g) => g.tool === t.from && g.records === t.records && g.can.includes("read")))
      errors.push(`${w}: it starts from a ${t.records} in ${t.from}, so it needs read on ${t.from}/${t.records}. A job never sees a record its tools do not cover.`);
  }

  // limits
  const L = j.limits ?? {};
  const answers = triggers.some((t) => t.type === "message");
  const limits: Limits = { per_run: { ...DEFAULTS.per_run }, per_day: { ...DEFAULTS.per_day }, each: [] };
  if (!isObj(L)) errors.push(`${w}.limits: must be an object.`);
  else {
    extra(L, ["per_run", "per_day", "each"], `${w}.limits`, errors);
    for (const [part, keys] of [["per_run", ["steps", "actions"]], ["per_day", ["runs", "actions"]]] as const) {
      const p = L[part];
      if (p === undefined) continue;
      if (!isObj(p)) { errors.push(`${w}.limits.${part}: must be an object.`); continue; }
      extra(p, [...keys], `${w}.limits.${part}`, errors);
      for (const k of keys) {
        if (p[k] === undefined) continue;
        const top = (CEILING[part] as Record<string, number>)[k];
        if (!isInt(p[k], 1, top)) errors.push(`${w}.limits.${part}.${k}: must be a whole number from 1 to ${top}.`);
        else (limits[part] as Record<string, number>)[k] = p[k];
      }
    }
    if (L.each !== undefined) {
      if (!Array.isArray(L.each) || L.each.length > 12) errors.push(`${w}.limits.each: must be a list of at most 12.`);
      else L.each.forEach((e: J, i: number) => {
        const we = `${w}.limits.each[${i}]`;
        if (!isObj(e)) { errors.push(`${we}: must be an object.`); return; }
        extra(e, ["tool", "records", "per_run", "per_day", "per_contact_per_day"], we, errors);
        const g = tools.find((x) => x.tool === e.tool && x.records === e.records);
        if (!g || !acts(g)) errors.push(`${we}: must match a tool and kind of record this job can add or update.`);
        let any = false;
        for (const k of ["per_run", "per_day", "per_contact_per_day"] as const) {
          if (e[k] === undefined) continue;
          any = true;
          if (!isInt(e[k], 1, CEILING.each[k])) errors.push(`${we}.${k}: must be a whole number from 1 to ${CEILING.each[k]}.`);
        }
        if (!any) errors.push(`${we}: needs per_run, per_day or per_contact_per_day.`);
        if (e.per_contact_per_day !== undefined && g && !["message", "call"].includes(g.records)) errors.push(`${we}: per_contact_per_day is only for messages and calls.`);
        if (g && limits.each.some((x) => x.tool === e.tool && x.records === e.records)) errors.push(`${we}: ${e.tool}/${e.records} is limited twice.`);
        limits.each.push({ tool: String(e.tool), records: String(e.records), ...(isInt(e.per_run, 1, CEILING.each.per_run) ? { per_run: e.per_run } : {}), ...(isInt(e.per_day, 1, CEILING.each.per_day) ? { per_day: e.per_day } : {}), ...(isInt(e.per_contact_per_day, 1, CEILING.each.per_contact_per_day) ? { per_contact_per_day: e.per_contact_per_day } : {}) });
      });
    }
  }
  if (limits.per_run.actions > limits.per_run.steps) errors.push(`${w}.limits: actions per run cannot be more than steps per run.`);
  const starts = triggers.reduce((s, t) => s + runsPerDay(t), 0);
  if (limits.per_day && starts > limits.per_day.runs) errors.push(`${w}.limits: its schedule starts up to ${starts} runs a day but per_day.runs is ${limits.per_day.runs}. Raise the limit (at most ${CEILING.per_day.runs}) or run less often.`);
  // Anything that reaches a person gets a per-person daily limit whether the spec asked for one or not.
  for (const g of tools) if (["message", "call"].includes(g.records) && g.can.includes("add") && g.tool !== "pip") {
    const e = limits.each.find((x) => x.tool === g.tool && x.records === g.records);
    if (!e) limits.each.push({ tool: g.tool, records: g.records, per_contact_per_day: DEFAULTS.per_contact_per_day });
    else if (e.per_contact_per_day === undefined) e.per_contact_per_day = DEFAULTS.per_contact_per_day;
  }

  // pause
  const P = j.pause ?? {};
  const pause: Job["pause"] = { ...DEFAULTS.pause, when: [] };
  if (!isObj(P)) errors.push(`${w}.pause: must be an object.`);
  else {
    extra(P, ["after_failures", "on_limit", "when"], `${w}.pause`, errors);
    if (P.after_failures !== undefined) { if (!isInt(P.after_failures, 1, 3)) errors.push(`${w}.pause.after_failures: 1, 2 or 3. No job fails more than three times in a row without pausing.`); else pause.after_failures = P.after_failures; }
    if (P.on_limit !== undefined) { if (!["wait", "pause"].includes(P.on_limit)) errors.push(`${w}.pause.on_limit: wait or pause.`); else pause.on_limit = P.on_limit; }
    if (P.when !== undefined) { if (!Array.isArray(P.when) || P.when.length > 10 || P.when.some((s: J) => !isStr(s, 5, 200))) errors.push(`${w}.pause.when: up to 10 plain sentences, 5 to 200 characters each.`); else pause.when = P.when; }
  }

  // long task
  let task: Job["task"];
  if (j.task !== undefined) {
    if (!isObj(j.task)) errors.push(`${w}.task: must be an object.`);
    else {
      extra(j.task, ["max_runs", "max_days"], `${w}.task`, errors);
      if (!isInt(j.task.max_runs, 2, CEILING.task.max_runs)) errors.push(`${w}.task.max_runs: 2 to ${CEILING.task.max_runs}.`);
      if (!isInt(j.task.max_days, 1, CEILING.task.max_days)) errors.push(`${w}.task.max_days: 1 to ${CEILING.task.max_days}.`);
      if (answers) errors.push(`${w}.task: a job that answers customers finishes in one run. Put the long part in a second job.`);
      task = { max_runs: j.task.max_runs, max_days: j.task.max_days };
    }
  }
  if (errors.length !== n) return null;
  return { id: j.id, name: j.name.trim(), does: j.does.trim(), instructions: j.instructions, triggers, tools, limits, pause, ...(task ? { task } : {}) };
}

/** Checks the job list on a spec. `ok` is false if anything at all is wrong; `errors` says what, in plain words. */
export function checkSpec(spec: unknown): { ok: boolean; errors: string[]; jobs: Job[] } {
  const errors: string[] = [], jobs: Job[] = [];
  const s = spec as J;
  if (!isObj(s)) return { ok: false, errors: ["The spec must be an object."], jobs };
  if (s.contract !== CONTRACT) errors.push(`contract must be "${CONTRACT}".`);
  if (!Array.isArray(s.jobs) || !s.jobs.length || s.jobs.length > CEILING.jobs) errors.push(`jobs must list 1 to ${CEILING.jobs} jobs.`);
  else s.jobs.forEach((j: J, i: number) => { const ok = checkJob(j, `jobs[${i}]${isObj(j) && typeof j.id === "string" ? ` (${j.id.slice(0, 40)})` : ""}`, errors); if (ok) jobs.push(ok); });
  const ids = new Set<string>(), channels = new Map<string, string>();
  for (const j of jobs) {
    if (ids.has(j.id)) errors.push(`Two jobs are called "${j.id}".`);
    ids.add(j.id);
    for (const t of j.triggers) if (t.type === "message") for (const c of t.channels) {
      if (channels.has(c)) errors.push(`Both "${channels.get(c)}" and "${j.id}" answer ${c}. One job answers each channel, so which one replies is never a model's guess.`);
      else channels.set(c, j.id);
    }
  }
  return { ok: errors.length === 0, errors, jobs: errors.length ? [] : jobs };
}

/**
 * The jobs a teammate has. With `contract: "teammate/1"` they are the checked list (none, if the list is invalid:
 * a broken spec does not run). Without it, the teammate was built before the contract and gets one job,
 * "conversation", with what pip-turn already allows and nothing wider: Pip's own actions it was designed with, busy
 * times and a hold on the calendar, an email to the customer, a row on the Pip sheet, and one new record of the kinds
 * in ADD_ONE_RECORDS in any other connected tool that is not a money tool. It cannot send a message, place a call or
 * add a file through such a tool, because pip-turn's add-one rule does not cover those.
 */
export function jobsOf(spec: unknown, manifest?: unknown, brain?: unknown): { jobs: Job[]; legacy: boolean; errors: string[]; notes: string[] } {
  const s = (isObj(spec) ? spec : {}) as J, notes: string[] = [];
  if (s.contract !== undefined || s.jobs !== undefined) { const c = checkSpec(s); return { jobs: c.jobs, legacy: false, errors: c.errors, notes }; }
  const classic = isObj(s.agent), board = typeof s.board?.seats?.gate?.system_prompt === "string";
  if (!classic && !board) return { jobs: [], legacy: true, errors: ["This spec has no teammate to run."], notes };
  const m = manifest as J, b = brain as J;
  const uses: string[] = (classic ? s.agent.tools : m?.manifest?.uses ?? m?.uses ?? b?.agent?.uses) ?? [];
  const has = (k: string) => Array.isArray(uses) && uses.includes(k);
  const tools: Grant[] = [];
  for (const [rec, name] of Object.entries(PIP_RECORDS)) if (has(name)) tools.push({ tool: "pip", records: rec, can: ["add"], required: false });
  if (has("calendar")) tools.push({ tool: "calendar", records: "busy_time", can: ["read"], required: false }, { tool: "calendar", records: "appointment", can: ["add"], required: false });
  if (has("email")) tools.push({ tool: "email", records: "message", can: ["add"], required: false, purpose: "reply" });
  if (has("data_sink") || has("sheets")) tools.push({ tool: "sheets", records: "row", can: ["add"], required: false });
  // "kit:*" is any tool the owner connected on their own. Only allows() reads it, only for this implied job, and it
  // still refuses a money tool there because no policy is named.
  for (const rec of ADD_ONE_RECORDS) tools.push({ tool: "kit:*", records: rec, can: ["add"], required: false });
  if (classic && Array.isArray(s.triggers) && s.triggers.some((t: J) => t !== "inbound_message")) notes.push(`It was designed to start from: ${s.triggers.join(", ")}. Nothing starts it that way yet; it needs real jobs from the Forge.`);
  return {
    legacy: true, errors: [], notes,
    jobs: [{
      id: "conversation", name: "Conversations", does: "Answers customers who write in, the way it was first set up.", instructions: "",
      triggers: [{ type: "message", channels: [...CHANNELS] }], tools,
      limits: { per_run: { steps: 6, actions: 6 }, per_day: null, each: [] },
      pause: { ...DEFAULTS.pause, when: [] }, legacy: true,
    }],
  };
}

/** The one job that answers a customer message on this channel, or null. */
export function jobForMessage(jobs: Job[], channel: string): Job | null {
  return jobs.find((j) => j.triggers.some((t) => t.type === "message" && (t.channels as string[]).includes(channel))) ?? null;
}

export type Ask = { tool: string; records: string; level: string; fields?: string[] };
export type Verdict = { ok: true } | { ok: false; why: "never" | "not_granted" | "field" | "money"; say: string };

/**
 * May this job do this? The one permission check, used before every read and every change, whatever route the
 * action then takes (a connected tool, the browser, a box, a purchase).
 *   level  anything but read, add or update is refused for every job, always
 *   fields exactly which fields the action would touch. For an update: always required, and every one must be
 *          granted. For a read or an add: required whenever the job listed fields for that level, and every one must
 *          be in that list. An ask that leaves them out, or sends an empty list, is refused; it does not get the wide
 *          answer. Fields that are not a list of names are refused at any level.
 *   passed the owner policies that code has already checked and passed for this exact action (lane 08's "buying").
 *          A money record, or any record in a money tool, is refused without it, whatever the job says, and refused
 *          with it unless that policy opens that kind of record at that level (POLICY_OPENS).
 * It never throws. An ask, a job or a list of policies that is the wrong shape is answered with a no.
 */
export function allows(job: Job, ask: Ask, passed: string[] = []): Verdict {
  const a = ask as J, jb = job as J;
  if (!isObj(a) || typeof a.level !== "string" || !(LEVELS as readonly string[]).includes(a.level))
    return { ok: false, why: "never", say: isObj(a) && typeof a.level === "string" ? `No teammate may ${a.level.slice(0, 20)} anything. Only read, add and update exist.` : "Only read, add and update exist." };
  const level = a.level as Level;
  if (typeof a.tool !== "string" || typeof a.records !== "string") return { ok: false, why: "not_granted", say: "An action must name its tool and its kind of record, as text." };
  if (a.fields !== undefined && !(Array.isArray(a.fields) && a.fields.every((f: J) => typeof f === "string"))) return { ok: false, why: "field", say: "The fields an action touches must be given as a list of field names." };
  const tool: string = a.tool, records: string = a.records;
  const grants: J[] = isObj(jb) && Array.isArray(jb.tools) ? jb.tools : [];
  const g = grants.find((x) => isObj(x) && (x.tool === tool || (jb.legacy === true && x.tool === "kit:*" && tool.startsWith("kit:"))) && x.records === records);
  if (!g || !Array.isArray(g.can) || !g.can.includes(level)) return { ok: false, why: "not_granted", say: `This job may not ${level} ${records.slice(0, 40)} in ${tool.slice(0, 70)}.` };
  if (money(records) || isMoneyTool(tool)) {
    const what = money(records) ? `${records} is a money record` : `${tool.slice(0, 70)} is a money tool`;
    if (!opens(g.policy, records, level)) return { ok: false, why: "money", say: `${what}. No policy can open this yet, so it is refused.` };
    if (!(Array.isArray(passed) && passed.includes(g.policy))) return { ok: false, why: "money", say: `${what}. It is refused until the owner's ${g.policy} policy has been checked and passed for this action.` };
  }
  if ((READ_ONLY_RECORDS as readonly string[]).includes(records) && level !== "read") return { ok: false, why: "never", say: `${records} can only be read.` };
  const listed: J = isObj(g.fields) && Array.isArray(g.fields[level]) ? g.fields[level] : null;
  const named = Array.isArray(a.fields) && a.fields.length > 0;
  if (level === "update" && !named) return { ok: false, why: "field", say: "An update must say exactly which fields it changes." };
  if (level === "update" && !listed) return { ok: false, why: "field", say: "This job has no fields it may change." };
  if (listed) {
    if (!named) return { ok: false, why: "field", say: `This job lists the fields it may ${level === "read" ? "see" : "fill in"}, so the action must say exactly which fields it touches.` };
    const out = (a.fields as string[]).filter((f) => !listed.includes(f));
    if (out.length) return { ok: false, why: "field", say: `Outside this job's permissions: ${out.slice(0, 5).map((f) => f.slice(0, 60)).join(", ")}.` };
  }
  return { ok: true };
}

// ---------- the same thing in words an owner can read ----------
const PLURAL: Record<string, string> = {
  contact: "contacts", lead: "leads", deal: "deals", appointment: "appointments", busy_time: "busy times", task: "tasks", ticket: "tickets", note: "notes",
  job: "jobs", row: "rows", item: "items", message: "messages", call: "calls", file: "files", review: "reviews", post: "posts", count: "counts",
  order: "orders", invoice: "invoices", payment: "payments", refund: "refunds", payout: "payouts", payroll: "payroll", price: "prices", discount: "discounts", estimate: "estimates",
};
const TOOL_WORDS: Record<string, string> = {
  calendar: "your calendar", email: "your email", sheets: "your Pip sheet", data_sink: "your Pip sheet", crm: "your customer list", sms: "text messages", send_text: "text messages",
  booking_app: "your booking software", field_service: "your job software", pos: "your point of sale", accounting: "your accounting", ecommerce: "your online store", team_chat: "your team chat",
};
const PIP_WORDS: Record<string, string> = {
  owner_alert: "Alert you when something needs a person.", lead: "Save a lead for you.", booking_request: "Ask you to confirm a booking. It does not confirm one itself.",
  handoff: "Hand a conversation to a person.", draft: "Write a draft for you to approve before anything is sent.",
};
const CHANNEL_WORDS: Record<string, string> = { web_chat: "website chat", sms: "text", voice: "the phone", email: "email" };
const DAY_WORDS: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const list = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const clock = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? "am" : "pm"}`; };
const where = (tool: string, names: Record<string, string>) => at(names, tool) ?? at(TOOL_WORDS, tool) ?? (tool.startsWith("kit:") ? (tool === "kit:*" ? "any other tool you connect" : tool.slice(4)) : `your ${tool.replace(/_/g, " ")}`);

function startWords(t: Trigger, names: Record<string, string>): string {
  if (t.type === "message") return `When a customer reaches out by ${list(t.channels.map((c) => at(CHANNEL_WORDS, c) ?? c))}.`;
  if (t.type === "schedule") {
    const span = t.between ? `, between ${clock(t.between[0])} and ${clock(t.between[1])}` : "";
    if (t.every === "minutes") return `Every ${t.interval} minutes${span}.`;
    if (t.every === "hours") return `Every ${t.interval === 1 ? "hour" : `${t.interval} hours`}${span}.`;
    if (t.every === "day") return `Every day at ${clock(t.at!)}.`;
    if (t.every === "week") return `Every ${list((t.on as string[]).map((d) => at(DAY_WORDS, d) ?? d))} at ${clock(t.at!)}.`;
    return `On day ${list((t.on as (string | number)[]).map((d) => (d === "last" ? "the last" : String(d))))} of each month at ${clock(t.at!)}.`;
  }
  if (t.type === "event") {
    const cond = t.if ? ` and its ${t.if.field.replace(/[_.]/g, " ")} ${t.if.is !== undefined ? `is ${String(t.if.is)}` : t.if.over !== undefined ? `goes over ${t.if.over}` : `goes under ${t.if.under}`}` : "";
    if (t.from === "pip") return at({ lead_added: "When a new lead is saved.", missed_call: "When a call is missed.", conversation_ended: "When a conversation ends." }, t.event) ?? "";
    if (t.from === "box") return `When the count from your on-site box changes${cond}.`;
    return `When ${t.event === "record_added" ? "a new" : "a"} ${t.records!.replace(/_/g, " ")} ${t.event === "record_added" ? "is added" : "changes"} in ${where(t.from, names)}${cond}.`;
  }
  if (t.on === "run_now") return "When you press Run now.";
  return `When you ${t.when.map((x) => (x === "approved" ? "approve" : "decline")).join(" or ")} a ${t.about === "draft" ? "draft" : "booking request"}.`;
}

/**
 * What a job can and cannot do, as plain sentences generated from the job itself. This is the text Brayden sees before
 * go-live and an owner sees in the Portal. `toolNames` swaps in the product the business really connected, for
 * example { crm: "HubSpot" }.
 */
export function plainWords(job: Job, toolNames: Record<string, string> = {}): { starts: string[]; can: string[]; cannot: string[]; limits: string[]; pauses: string[] } {
  const can: string[] = [], cannot: string[] = ["Delete anything, anywhere."];
  const anyTool = job.tools.filter((g) => g.tool === "kit:*" && g.can.includes("add")).map((g) => g.records.replace(/_/g, " "));
  for (const g of job.tools) {
    if (g.tool === "pip") { can.push(at(PIP_WORDS, g.records) ?? ""); continue; }
    if (g.tool === "kit:*") continue;
    const what = g.records === "*" ? "records" : at(PLURAL, g.records) ?? g.records, place = where(g.tool, toolNames);
    const gate = g.policy ? `, only inside the ${g.policy} rules you set` : "";
    if (g.can.includes("read")) can.push(g.fields?.read ? `See these details of ${what} in ${place}: ${list(g.fields.read.map((f) => f.replace(/[_.]/g, " ")))}.` : `See ${what} in ${place}.`);
    if (g.can.includes("add")) can.push(g.records === "message" ? `${["sms", "send_text"].includes(g.tool) ? "Send texts" : `Send messages from ${place}`}${g.purpose === "marketing" ? ", only to people who agreed to hear from you" : g.purpose === "reply" ? ", only to the customer it is talking with" : ", only about something that customer already has with you"}.` : g.records === "call" ? "Place calls, only to people who agreed to be called." : `Add new ${what} in ${place}${gate}.`);
    if (g.can.includes("update")) { can.push(`Change only these details of ${what} in ${place}: ${list(g.fields!.update!.map((f) => f.replace(/[_.]/g, " ")))}${gate}.`); cannot.push(`Change anything else about ${what} in ${place}.`); }
    if (!g.can.includes("read") && g.records !== "message" && g.records !== "call") cannot.push(`Look at ${what} already in ${place}.`);
    if (!g.can.includes("add") && !g.can.includes("update") && !(READ_ONLY_RECORDS as readonly string[]).includes(g.records)) cannot.push(`Change ${what} in ${place}.`);
  }
  if (anyTool.length) {
    can.push(`Add one new ${anyTool.length < 2 ? anyTool.join("") : `${anyTool.slice(0, -1).join(", ")} or ${anyTool[anyTool.length - 1]}`} in any other tool you connect. Never in a money tool.`);
    cannot.push("See, change or send anything in those other tools.");
  }
  if (!job.tools.some((g) => g.policy)) cannot.push("Move money, place orders, or change prices.");
  cannot.push("Use any tool or any kind of record not listed here.");
  const L = job.limits, limits = [`Each time it runs: at most ${L.per_run.steps} steps and ${L.per_run.actions} changes.`];
  if (L.per_day) limits.push(job.triggers.some((t) => t.type === "message") ? `Each day: at most ${L.per_day.actions} changes. Past that it still answers customers, takes their details and tells you.` : `Each day: at most ${L.per_day.runs} runs and ${L.per_day.actions} changes.`);
  for (const e of L.each) {
    const bits = [e.per_run && `${e.per_run} each run`, e.per_day && `${e.per_day} a day`, e.per_contact_per_day && `${e.per_contact_per_day} a day to any one person`].filter(Boolean) as string[];
    limits.push(`${(at(PLURAL, e.records) ?? e.records).replace(/^./, (c) => c.toUpperCase())} in ${where(e.tool, toolNames)}: at most ${list(bits)}.`);
  }
  if (job.task) limits.push(`One piece of work can take up to ${job.task.max_runs} runs over ${job.task.max_days} days, then it stops and tells you.`);
  const pauses = ["Pauses this one job and tells you if a sign-in stops working, a password changes, or a code is sent to a person."];
  if (!job.triggers.some((t) => t.type === "message")) pauses.push(`Pauses this one job and tells you after ${job.pause.after_failures} failed ${job.pause.after_failures === 1 ? "try" : "tries in a row"}.`);
  if (L.per_day && job.pause.on_limit === "pause") pauses.push("Pauses this one job and tells you when it reaches a daily limit.");
  for (const s of job.pause.when) pauses.push(`Stops and tells you when: ${s}`);
  return { starts: job.triggers.map((t) => startWords(t, toolNames)), can, cannot, limits, pauses };
}
