// The attack on the teammate contract. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/teammate-spec.attack.test.ts
// No network, no database, no keys. Nothing here is random, so every run tries exactly the same versions.
//
// It takes every worked example, breaks it in thousands of ways, and asks two questions of each broken version:
//   1. Does the checker crash? It must never.
//   2. If the checker still calls it valid, is it really safe? `safe()` below states the contract a second time, on its
//      own, without calling the checker: no delete, no wildcard, no open update, nothing over a ceiling, no money
//      without a policy that opens it, no send without a purpose. A version the checker passes and `safe()` fails is a
//      hole.
// Then it asks the permission check, allows(), a few hundred questions about every job that came out valid and about
// the implied job for older teammates, and compares each answer with `mayDo()`, a second statement of that rule.
//
// This is a new script. The first pull request spoke of an attack with 5,130 broken versions, but that script was
// never committed, so this one was written from the description. Its count is printed when it runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { ADD_ONE_RECORDS, allows, CEILING, checkSpec, isMoneyTool, jobsOf, LEVELS, MONEY_RECORDS, PIP_RECORDS, plainWords, POLICIES, POLICY_OPENS, PURPOSES, READ_ONLY_RECORDS, RECORDS, runsPerDay } from "./teammate-spec.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const DIR = new URL("../../../docs/contracts/examples/", import.meta.url);
const EXAMPLES: [string, J][] = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((f) => [f, JSON.parse(readFileSync(new URL(f, DIR), "utf8"))]);
const has = (list: readonly string[], v: unknown) => typeof v === "string" && list.includes(v);
const isObj = (v: unknown): v is Record<string, J> => !!v && typeof v === "object" && !Array.isArray(v);
const isMoney = (r: unknown) => has(MONEY_RECORDS, r);
const opened = (policy: unknown, rec: string, level: string) => typeof policy === "string" && Object.hasOwn(POLICY_OPENS, policy) && Object.hasOwn(POLICY_OPENS[policy], rec) && POLICY_OPENS[policy][rec].includes(level);
const FIELD = /^[a-z][a-z0-9_.]{0,59}$/, TOOL = /^(pip|kit:[a-z0-9_]{2,60}|[a-z][a-z0-9_]{1,39})$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

// ---------- the contract, stated a second time ----------
/** Everything wrong with a job the checker called valid. Empty means safe. */
function safe(job: J): string[] {
  const bad: string[] = [], no = (s: string) => bad.push(`${job?.id}: ${s}`);
  const keys = (o: J, allowed: string[], what: string) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) no(`${what} carries "${k}"`); };
  keys(job, ["id", "name", "does", "instructions", "triggers", "tools", "limits", "pause", "task"], "the job");
  if (!Array.isArray(job.triggers) || job.triggers.length < 1 || job.triggers.length > CEILING.triggers) no("triggers out of range");
  const schedules = new Set<string>();
  for (const t of job.triggers ?? []) {
    if (!["message", "schedule", "event", "owner"].includes(t?.type)) { no(`trigger type ${t?.type}`); continue; }
    if (t.type !== "schedule") continue;
    keys(t, ["type", "every", "interval", "at", "on", "between"], "a schedule");
    if (t.every === "minutes" ? !int(t.interval, CEILING.schedule_minutes, 720) : t.every === "hours" ? !int(t.interval, 1, 12) : !(["day", "week", "month"].includes(t.every) && TIME.test(t.at))) no(`a schedule that runs too often or at no clear time: ${JSON.stringify(t)}`);
    const k = JSON.stringify(Object.keys(t).sort().map((x) => [x, x === "on" ? [...t.on].map(String).sort() : t[x]]));
    if (schedules.has(k)) no("the same schedule twice");
    schedules.add(k);
  }
  if (!Array.isArray(job.tools) || job.tools.length > CEILING.tools) no("tools out of range");
  const L = job.limits;
  for (const g of job.tools ?? []) {
    const at = `${g?.tool}/${g?.records}`;
    keys(g, ["tool", "records", "can", "fields", "required", "purpose", "policy"], at);
    if (typeof g.tool !== "string" || !TOOL.test(g.tool) || g.tool === "box") no(`${at}: tool is a wildcard or not a tool`);
    if (!Array.isArray(g.can) || !g.can.length || new Set(g.can).size !== g.can.length || g.can.some((c: J) => !has(LEVELS, c))) no(`${at}: can is ${JSON.stringify(g.can)} (delete or a made-up level)`);
    if (g.tool === "pip") { if (!Object.hasOwn(PIP_RECORDS, g.records) || g.can.join() !== "add" || g.fields || g.policy || g.purpose) no(`${at}: not one of Pip's own add-only actions`); continue; }
    if (!has(RECORDS, g.records) && !isMoney(g.records)) no(`${at}: a wildcard or made-up kind of record`);
    if (has(READ_ONLY_RECORDS, g.records) && g.can.join() !== "read") no(`${at}: changes a read-only record`);
    if (isMoney(g.records) || isMoneyTool(g.tool)) { for (const c of g.can ?? []) if (!has(POLICIES, g.policy) || !opened(g.policy, g.records, c)) no(`${at}: money opened for ${c} with policy ${JSON.stringify(g.policy)}`); }
    else if (g.policy !== undefined) no(`${at}: a policy where none applies`);
    for (const [lvl, list] of Object.entries(g.fields ?? {})) if (!has(LEVELS, lvl) || !g.can.includes(lvl) || !Array.isArray(list) || !list.length || list.length > CEILING.fields || (list as J[]).some((f) => typeof f !== "string" || !FIELD.test(f))) no(`${at}: fields.${lvl} is ${JSON.stringify(list)}`);
    if (g.can?.includes("update") && !(Array.isArray(g.fields?.update) && g.fields.update.length)) no(`${at}: an open update`);
    if (["message", "call"].includes(g.records) && g.can?.includes("add")) {
      if (!has(PURPOSES, g.purpose) || (g.records === "call" && g.purpose === "reply")) no(`${at}: a send with purpose ${JSON.stringify(g.purpose)}`);
      if (!int(L?.each?.find((e: J) => e.tool === g.tool && e.records === g.records)?.per_contact_per_day, 1, CEILING.each.per_contact_per_day)) no(`${at}: a send with no per-person daily limit`);
    } else if (g.purpose !== undefined) no(`${at}: a purpose where none applies`);
  }
  if (!int(L?.per_run?.steps, 1, CEILING.per_run.steps) || !int(L?.per_run?.actions, 1, CEILING.per_run.actions) || L.per_run.actions > L.per_run.steps) no(`per_run over a ceiling: ${JSON.stringify(L?.per_run)}`);
  if (!int(L?.per_day?.runs, 1, CEILING.per_day.runs) || !int(L?.per_day?.actions, 1, CEILING.per_day.actions)) no(`per_day over a ceiling: ${JSON.stringify(L?.per_day)}`);
  for (const e of L?.each ?? []) for (const k of ["per_run", "per_day", "per_contact_per_day"] as const) if (e[k] !== undefined && !int(e[k], 1, CEILING.each[k])) no(`each.${k} over a ceiling: ${e[k]}`);
  if ((job.triggers ?? []).reduce((s: number, t: J) => s + runsPerDay(t), 0) > L?.per_day?.runs) no("its schedule starts more runs than its daily limit");
  if (!int(job.pause?.after_failures, 1, 3)) no(`after_failures ${job.pause?.after_failures}`);
  if (job.task && (!int(job.task.max_runs, 2, CEILING.task.max_runs) || !int(job.task.max_days, 1, CEILING.task.max_days) || job.triggers.some((t: J) => t.type === "message"))) no("a long task over a ceiling, or on a job that answers customers");
  return bad;
}
/** The permission rule, stated a second time: should allows() say yes to this? */
function mayDo(job: J, ask: J, passed: J): boolean {
  if (!isObj(ask) || !has(LEVELS, ask.level) || typeof ask.tool !== "string" || typeof ask.records !== "string") return false;
  if (ask.fields !== undefined && !(Array.isArray(ask.fields) && ask.fields.every((f: J) => typeof f === "string"))) return false;
  const g = (job.tools as J[]).find((x) => (x.tool === ask.tool || (job.legacy === true && x.tool === "kit:*" && ask.tool.startsWith("kit:"))) && x.records === ask.records);
  if (!g || !g.can.includes(ask.level)) return false;
  if ((isMoney(ask.records) || isMoneyTool(ask.tool)) && !(Array.isArray(passed) && passed.includes(g.policy) && opened(g.policy, ask.records, ask.level))) return false;
  if (has(READ_ONLY_RECORDS, ask.records) && ask.level !== "read") return false;
  const listed = g.fields?.[ask.level], named = Array.isArray(ask.fields) && ask.fields.length > 0;
  if (ask.level === "update" && !(named && listed)) return false;
  if (listed && !(named && ask.fields.every((f: J) => listed.includes(f)))) return false;
  return true;
}

// ---------- making broken versions ----------
const JUNK: J[] = [null, true, 0, -1, 1.5, 1e9, "", "*", "delete", "__proto__", "constructor", "kit:*", "kit:stripe", "payroll", "buying", [], {}, [null], ["*"], ["delete"], { "*": true }, "x".repeat(7000)];
const EXTRA_KEYS: [string, J][] = [["delete", true], ["approve_everything", true], ["legacy", true], ["__proto__", { can: ["delete"] }], ["policy", "buying"], ["can", ["read", "add", "update", "delete"]], ["fields", { update: ["*"] }]];
function paths(v: J, at: (string | number)[] = [], out: (string | number)[][] = []) {
  out.push(at);
  if (Array.isArray(v)) v.forEach((x, i) => paths(x, [...at, i], out));
  else if (isObj(v)) for (const k of Object.keys(v)) paths(v[k], [...at, k], out);
  return out;
}
const reach = (root: J, path: (string | number)[]) => path.reduce((o, k) => o[k], root);
const own = (o: J, k: string | number, v: J) => Object.defineProperty(o, k, { value: v, enumerable: true, configurable: true, writable: true });
/** Every broken version of one example. Each is a fresh copy with one thing changed. */
function* versions(base: J): Generator<J> {
  const change = (path: (string | number)[], edit: (parent: J, key: string | number) => void) => { const copy = structuredClone(base); if (!path.length) return copy; edit(reach(copy, path.slice(0, -1)), path[path.length - 1]); return copy; };
  for (const junk of JUNK) yield junk; // the whole spec replaced
  for (const path of paths(base)) {
    if (!path.length) continue;
    const here = reach(base, path);
    for (const junk of JUNK) yield change(path, (p, k) => own(p, k, structuredClone(junk)));
    yield change(path, (p, k) => (Array.isArray(p) ? p.splice(k as number, 1) : delete p[k]));
    if (isObj(here)) for (const [k, v] of EXTRA_KEYS) yield change(path, (p, key) => own(p[key], k, structuredClone(v)));
    if (Array.isArray(here)) {
      yield change(path, (p, key) => p[key].push(structuredClone(p[key][0])));        // the first entry twice
      for (const junk of ["delete", "*", null, {}]) yield change(path, (p, key) => p[key].push(junk));
      yield change(path, (p, key) => { while (p[key].length && p[key].length < 40) p[key].push(...structuredClone(p[key])); }); // far too many
    }
    if (typeof here === "number") for (const n of [here + 1000, here * 100, -here, here + 0.5, String(here)]) yield change(path, (p, k) => (p[k] = n));
  }
  // Aimed at the rules that matter most, for every permission of every job.
  for (let j = 0; j < base.jobs.length; j++) {
    const job = (edit: (job: J) => void) => { const copy = structuredClone(base); edit(copy.jobs[j]); return copy; };
    for (let g = 0; g < (base.jobs[j].tools ?? []).length; g++) {
      const grant = (edit: (g: J) => void) => job((x) => edit(x.tools[g]));
      for (const level of ["delete", "remove", "send", "pay", "admin", "*", "DELETE", "Delete", " delete"]) { yield grant((x) => x.can.push(level)); yield grant((x) => (x.can = [level])); }
      yield grant((x) => (x.can = ["read", "add", "update"]));                         // update with no field list
      for (const f of [["*"], [], ["a", "*"], "*", [""], ["__proto__"]]) yield grant((x) => { x.can = [...new Set([...x.can, "update"])]; x.fields = { ...(x.fields ?? {}), update: f }; });
      for (const r of ["*", "secret", "", ...MONEY_RECORDS]) { yield grant((x) => (x.records = r)); yield grant((x) => { x.records = r; x.policy = "buying"; }); yield grant((x) => { x.records = r; x.policy = "buying"; x.can = ["read", "add", "update"]; x.fields = { update: ["amount"] }; }); }
      for (const t of ["kit:*", "*", "box", "kit:stripe", "kit:quickbooks", "kit:square", "kit:shopify", "kit:gusto", "payroll", "billing"]) { yield grant((x) => (x.tool = t)); yield grant((x) => { x.tool = t; x.policy = "buying"; }); }
      for (const p of ["anything", "constructor", "__proto__", "", null, ["buying"]]) yield grant((x) => (x.policy = p));
      for (const p of ["reply", "marketing", "anything", null]) { yield grant((x) => (x.purpose = p)); yield grant((x) => { x.records = "call"; x.can = ["add"]; x.purpose = p; delete x.fields; }); }
    }
    for (const [part, key, top] of [["per_run", "steps", CEILING.per_run.steps], ["per_run", "actions", CEILING.per_run.actions], ["per_day", "runs", CEILING.per_day.runs], ["per_day", "actions", CEILING.per_day.actions]] as const)
      for (const n of [top + 1, top * 10, 0, -1, 1.5, "5", null, Infinity]) yield job((x) => { x.limits = { ...(x.limits ?? {}), [part]: { ...(x.limits?.[part] ?? {}), [key]: n } }; });
    for (const interval of [0, 1, 5, 14, 14.9, -15, "15"]) yield job((x) => (x.triggers = [{ type: "schedule", every: "minutes", interval }]));
    yield job((x) => (x.triggers = [{ type: "schedule", every: "minutes", interval: 15 }]));     // more starts than the daily limit
    yield job((x) => x.triggers.push({ type: "schedule", every: "day", at: "09:00" }, { at: "09:00", type: "schedule", every: "day" }));
    yield job((x) => (x.triggers = [{ type: "schedule", cron: "* * * * *" }]));
    yield job((x) => (x.pause = { after_failures: 4 }));
    yield job((x) => (x.pause = { after_failures: 0 }));
    yield job((x) => (x.task = { max_runs: CEILING.task.max_runs + 1, max_days: 1 }));
    yield job((x) => (x.task = { max_runs: 2, max_days: CEILING.task.max_days + 1 }));
    yield job((x) => (x.legacy = true));
  }
  yield { ...structuredClone(base), jobs: [...structuredClone(base.jobs), ...structuredClone(base.jobs)] };   // every job twice
  yield { ...structuredClone(base), contract: "teammate/2" };
  yield { jobs: structuredClone(base.jobs) };                                                                    // no contract key
}

// ---------- questions for allows() ----------
const HOSTILE_ASKS: J[] = [null, undefined, 0, "", "crm", [], {}, { tool: 5, records: "lead", level: "add" }, { tool: null, records: "lead", level: "read" }, { tool: {}, records: {}, level: {} }, { tool: ["kit:x"], records: "lead", level: "add" },
  { tool: "crm", records: 7, level: "read" }, { tool: "crm", records: "lead", level: 3 }, { tool: "crm", records: "lead", level: "read", fields: "name" }, { tool: "crm", records: "lead", level: "update", fields: [null, {}, 7] },
  { tool: "__proto__", records: "constructor", level: "toString" }, { tool: "constructor", records: "__proto__", level: "read" }];
function* asksFor(job: J): Generator<J> {
  const tools = [...new Set([...job.tools.map((g: J) => g.tool), "crm", "kit:hubspot", "kit:stripe", "kit:slack", "kit:*", "pip"])];
  const records = [...new Set([...job.tools.map((g: J) => g.records), "contact", "message", "call", "file", "order", "payment", "payroll", "price", "*"])];
  for (const tool of tools) for (const rec of records) for (const level of [...LEVELS, "delete", "*"]) {
    const g = job.tools.find((x: J) => x.tool === tool && x.records === rec);
    const listed: string[] = g?.fields?.[level] ?? [];
    for (const fields of [undefined, [], listed.slice(0, 1), listed, [...listed, "not_granted"], ["not_granted"]]) yield { tool, records: rec, level, ...(fields ? { fields } : {}) };
  }
}
/** Asks allows() everything in asksFor, with and without the buying policy passed, and checks each answer. */
function question(job: J, label: string): number {
  let n = 0;
  for (const passed of [[], ["buying"], ["something_else"]]) for (const ask of asksFor(job)) {
    n++;
    const v = allows(job, ask, passed);
    assert.equal(v.ok, mayDo(job, ask, passed), `${label}: allows said ${v.ok} to ${JSON.stringify(ask)} with ${JSON.stringify(passed)} passed`);
    if (!v.ok) assert.ok(typeof v.say === "string" && v.say.length > 0);
  }
  for (const ask of HOSTILE_ASKS) for (const passed of [[], ["buying"], "buying", null] as J[]) { n++; assert.equal(allows(job, ask, passed).ok, false, `${label}: ${JSON.stringify(ask)}`); }
  return n;
}

test("attack: no broken version of an example crashes the checker or comes out valid and unsafe", (t) => {
  let tried = 0, refused = 0, stillValid = 0, asked = 0;
  const seen = new Set<string>();
  for (const [file, base] of EXAMPLES) {
    assert.deepEqual(checkSpec(base).errors, [], `${file} must start out valid`);
    for (const v of versions(base)) {
      tried++;
      let c: J;
      assert.doesNotThrow(() => { c = checkSpec(v); }, `${file}: the checker crashed on a broken version`);
      assert.doesNotThrow(() => jobsOf(v), `${file}: jobsOf crashed on a broken version`);
      if (!c.ok) {
        refused++;
        assert.equal(c.jobs.length, 0, `${file}: a refused spec returned jobs`);
        assert.ok(c.errors.length > 0 && c.errors.every((e: J) => typeof e === "string" && e.length > 0), `${file}: a refused spec must say why`);
        assert.equal(jobsOf(v).jobs.length, 0, `${file}: a refused spec must not run`);
        continue;
      }
      stillValid++;
      const holes = c.jobs.flatMap(safe);
      assert.deepEqual(holes, [], `${file}: the checker passed an unsafe version:\n${JSON.stringify(v).slice(0, 1500)}`);
      const ids = c.jobs.map((j: J) => j.id), channels = c.jobs.flatMap((j: J) => j.triggers.filter((x: J) => x.type === "message").flatMap((x: J) => x.channels));
      assert.ok(c.jobs.length <= CEILING.jobs && new Set(ids).size === ids.length && new Set(channels).size === channels.length, `${file}: two jobs share an id or a channel`);
      for (const job of c.jobs) {
        assert.doesNotThrow(() => plainWords(job), `${file}: plainWords crashed`);
        // Ask allows() about each different set of permissions once.
        const key = JSON.stringify(job.tools);
        if (!seen.has(key)) { seen.add(key); asked += question(job, `${file} (${job.id})`); }
      }
    }
  }
  t.diagnostic(`${tried} broken versions tried: ${refused} refused, ${stillValid} still valid and checked safe. ${asked} permission questions asked of ${seen.size} different valid jobs.`);
  assert.ok(tried >= 5000, `only ${tried} versions were tried; the attack has shrunk`);
  assert.ok(refused > tried / 2 && stillValid > 100, "the attack must both break specs and leave some valid, or it proves nothing");
});

test("attack: the implied job for older teammates never opens more than pip-turn's add-one rule", (t) => {
  const NAMES = [...Object.values(PIP_RECORDS), "calendar", "email", "data_sink", "sheets", "web_chat", "kit:*", "*", "delete", "stripe", "payroll", "constructor", "__proto__"];
  const lists: J[] = [[], NAMES, ...NAMES.map((n) => [n]), null, "all", 7, {}, [null, {}, 5, ["calendar"]], NAMES.map((n) => n.toUpperCase())];
  const tools = ["pip", "calendar", "email", "sheets", "crm", "sms", "kit:*", "kit:hubspot", "kit:airtable", "kit:slack", "kit:twilio", "kit:dropbox", "kit:stripe", "kit:quickbooks", "kit:square", "kit:shopify", "kit:gusto", "kit:paypal", "payroll"];
  const records = [...RECORDS, ...MONEY_RECORDS, ...Object.keys(PIP_RECORDS), "*", "secret"];
  const addOne: readonly string[] = ADD_ONE_RECORDS;
  let shapes = 0, asked = 0;
  for (const uses of lists) for (const shape of [{ spec: { board: { seats: { gate: { system_prompt: "You are Hallie." } } } }, manifest: { uses } }, { spec: { board: { seats: { gate: { system_prompt: "x" } } } }, manifest: { manifest: { uses } } }, { spec: { agent: { persona: "You are Paige.", tools: uses }, triggers: ["schedule"] }, manifest: undefined }] as J[]) {
    shapes++;
    let r: J;
    assert.doesNotThrow(() => { r = jobsOf(shape.spec, shape.manifest); }, `jobsOf crashed on uses = ${JSON.stringify(uses)}`);
    assert.equal(r.legacy, true); assert.equal(r.jobs.length, 1);
    const job = r.jobs[0];
    assert.ok(job.tools.every((g: J) => g.records !== "*" && !g.can.includes("update") && !g.policy), "the implied job has a wildcard record, an update or a policy");
    for (const tool of tools) for (const rec of records) for (const level of [...LEVELS, "delete"]) for (const passed of [[], ["buying"]]) {
      asked++;
      const ask = { tool, records: rec, level }, v = allows(job, ask, passed);
      assert.equal(v.ok, mayDo(job, ask, passed), `allows said ${v.ok} to ${JSON.stringify(ask)}`);
      if (!v.ok) continue;
      assert.ok(level === "add" || (level === "read" && tool === "calendar" && rec === "busy_time"), `the implied job may ${level} ${rec} in ${tool}`);
      assert.ok(!isMoneyTool(tool) && !isMoney(rec), `the implied job reached money: ${tool}/${rec}`);
      if (tool.startsWith("kit:")) assert.ok(addOne.includes(rec) && tool !== "kit:*" || (tool === "kit:*" && addOne.includes(rec)), `the implied job may add ${rec} in ${tool}`);
      if (["message", "call", "file"].includes(rec)) assert.ok(tool === "email" && rec === "message", `the implied job may send a ${rec} through ${tool}`);
    }
    for (const ask of HOSTILE_ASKS) { asked++; assert.equal(allows(job, ask).ok, false, JSON.stringify(ask)); }
  }
  t.diagnostic(`${shapes} older teammate shapes, ${asked} permission questions.`);
});

test("attack: a job that never went through the checker still gets no money, no delete and no open update out of allows", (t) => {
  // allows() is the last line. These jobs are written by hand with permissions the checker would refuse, as if a bug
  // or a bad build had let them through.
  const forged: J[] = [];
  for (const policy of ["buying", "anything", "constructor", "__proto__", undefined, ["buying"]]) {
    for (const rec of MONEY_RECORDS) forged.push({ tool: "kit:supplier", records: rec, can: ["read", "add", "update", "delete"], fields: { update: ["amount"] }, required: true, policy });
    for (const tool of ["kit:stripe", "kit:quickbooks", "kit:shopify", "payroll"]) for (const rec of ["contact", "item", "order", "payment"]) forged.push({ tool, records: rec, can: ["read", "add", "update"], fields: { update: ["unit_price"] }, required: true, policy });
  }
  forged.push({ tool: "crm", records: "contact", can: ["read", "add", "update", "delete"], required: true });           // delete, and an update with no field list
  forged.push({ tool: "crm", records: "contact", can: ["update"], fields: { update: [] }, required: true });
  forged.push({ tool: "calendar", records: "busy_time", can: ["read", "add", "update"], fields: { update: ["start"] }, required: true });
  forged.push({ tool: "kit:*", records: "*", can: ["read", "add", "update"], fields: { update: ["x"] }, required: true }); // the wildcard, outside the implied job
  const NEVER = ["payment", "refund", "payout", "payroll", "discount", "estimate"]; // written out here on purpose: opening one of these must fail this test
  let asked = 0, jobs = 0;
  // Two honest jobs to bend: one with field lists, one that already has a real buying permission.
  const honest = EXAMPLES.flatMap(([file, base]) => checkSpec(base).jobs.map((job) => [file, job] as [string, J])).filter(([, job]) => ["lead_chaser", "stock_reorder"].includes(job.id));
  assert.equal(honest.length, 2);
  for (const [file, job] of honest) for (const g of forged) {
    jobs++;
    const bent: J = { ...job, tools: [...job.tools.filter((x: J) => !(x.tool === g.tool && x.records === g.records)), g] };
    asked += question(bent, `${file} (${job.id}) with ${g.tool}/${g.records} forged`);
    for (const level of [...LEVELS, "delete"]) for (const fields of [undefined, ["amount"], ["unit_price"], ["x"], ["start"]]) for (const passed of [[], ["buying"], ["buying", "anything", "constructor", "__proto__"]]) {
      asked++;
      const v = allows(bent, { tool: g.tool, records: g.records, level, ...(fields ? { fields } : {}) }, passed);
      if (!v.ok) continue;
      assert.ok(has(LEVELS, level), `${level} was allowed`);
      assert.ok(!NEVER.includes(g.records), `${level} ${g.records} was allowed`);
      if (isMoney(g.records) || isMoneyTool(g.tool)) {
        assert.ok(passed.includes("buying") && g.policy === "buying", `${g.tool}/${g.records} opened without the buying policy passing`);
        assert.ok(g.records === "order" || (level === "read" && ["price", "invoice"].includes(g.records)), `buying opened ${level} ${g.records} in ${g.tool}`);
      }
      if (level === "update") assert.ok(fields && g.fields?.update?.includes(fields[0]), `an open update on ${g.tool}/${g.records}`);
      if (has(READ_ONLY_RECORDS, g.records)) assert.equal(level, "read");
      if (g.tool === "kit:*") assert.equal(v.ok && g.records, "*", "the wildcard matched something");
    }
    // The wildcard grant must not stretch to a real tool or a real kind of record outside the implied job.
    if (g.tool === "kit:*") for (const level of LEVELS) assert.equal(allows(bent, { tool: "kit:hubspot", records: "contact", level, fields: ["x"] }).ok, false);
  }
  t.diagnostic(`${jobs} hand-made jobs, ${asked} permission questions.`);
});
