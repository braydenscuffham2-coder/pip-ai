// Tests for the Forge's check on a build. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/forge-check.test.ts
// No network, no database, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { BUILDER_NOTE, canRun, type Catalog, checkBuild, declares, goLive, loadCatalog, NO_CATALOG, OLDER_SHAPE, saveBuild, stamp } from "./forge-check.ts";
import { checkSpec } from "./teammate-spec.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const ROOT = new URL("../../../", import.meta.url);
const example = (name: string) => JSON.parse(readFileSync(new URL(`docs/contracts/examples/${name}`, ROOT), "utf8"));
const AT = "2026-11-18T12:00:00.000Z";

/** What exists today, as the two catalogs say it: three setup steps with reviewed tools, the rest with nothing. */
const TODAY: Catalog = {
  steps: [
    { slot: "calendar", label: "Calendar", blocks: ["calendar"] },
    { slot: "email", label: "Email", blocks: ["email"] },
    { slot: "sheet", label: "Spreadsheet", blocks: ["data_sink", "sheets"] },
    { slot: "booking", label: "Booking software", blocks: ["booking_app"] },
    { slot: "pos", label: "Point of sale", blocks: ["pos"] },
    { slot: "accounting", label: "Accounting", blocks: ["accounting"] },
    { slot: "crm", label: "Customer list", blocks: ["crm"] },
    { slot: "texting", label: "Texting", blocks: ["sms", "send_text"] },
  ],
  tools: [
    { block: "calendar", record: "busy_time", level: "read" },
    { block: "calendar", record: "appointment", level: "add" },
    { block: "email", record: "message", level: "add" },
    { block: "data_sink", record: "row", level: "add" },
    { block: "any_tool" }, // found automatically for an extra product; never reviewed for jobs
  ],
};
const BOARD = { board: { seats: { gate: { system_prompt: "You are Hallie." } } }, redteam: { passed: 9, total: 10 } };
const CLASSIC = { name: "Front desk", agent: { persona: "You are the front desk.", tools: ["capture_lead"] }, guardrails: { never: ["quote prices"] } };

/** One valid job, changed by `edit`, wrapped as what a save brings. */
function sent(edit: (j: J) => void = () => {}) {
  const j: J = {
    id: "front_desk", name: "Front desk", does: "Answers customers and checks the calendar for free times.",
    instructions: "Answer from the facts on file. Check busy times before offering a slot. Send a booking request to the owner.",
    triggers: [{ type: "message", channels: ["web_chat"] }],
    tools: [{ tool: "pip", records: "booking_request", can: ["add"] }, { tool: "calendar", records: "busy_time", can: ["read"] }],
  };
  edit(j);
  return { contract: "teammate/1", jobs: [j] };
}
const save = (stored: J, bring: J, ready = true, cat = TODAY) => saveBuild(stored, bring, { ready, at: AT }, cat);
const lines = (jobs: J, cat = TODAY) => canRun(checkSpec(jobs).jobs, cat);

// ---------- A. saving a build ----------

test("a valid new-style build saves, with contract and jobs at the top of the spec beside the Board's work", () => {
  const bring = sent(), r = save(BOARD, bring);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.spec.contract, "teammate/1");
  assert.deepEqual(r.spec.jobs, bring.jobs);
  assert.deepEqual(r.spec.board, BOARD.board, "the Board's own keys are untouched");
  assert.deepEqual(r.spec.redteam, BOARD.redteam, "nothing else on the record is dropped");
  assert.deepEqual(checkSpec(r.spec).errors, [], "what was saved is what pip-turn will accept");
  assert.equal(r.spec.forge_check.declared, true);
  assert.equal(r.spec.forge_check.ok, true);
  assert.equal(r.spec.forge_check.contract, "teammate/1");
  assert.equal(r.spec.forge_check.at, AT);
  assert.deepEqual(r.spec.forge_check.blocks_golive, []);
});

test("every worked example of the contract saves", () => {
  const files = readdirSync(new URL("docs/contracts/examples/", ROOT)).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 4);
  for (const f of files) { const r = save(BOARD, example(f)); assert.equal(r.ok, true, f); }
});

test("a broken build is refused with readable errors, and there is nothing to write", () => {
  const broken: [string, J, RegExp][] = [
    ["a level that does not exist", sent((j) => { j.tools[1].can = ["read", "delete"]; }), /never allowed.*never delete/],
    ["a made-up kind of record", sent((j) => { j.tools[1].records = "*"; }), /records must be one kind from the contract's list/],
    ["update with no field list", sent((j) => { j.tools.push({ tool: "crm", records: "lead", can: ["update"] }); }), /update needs fields\.update/],
    ["money with no policy that opens it", sent((j) => { j.tools.push({ tool: "kit:stripe", records: "payment", can: ["add"] }); }), /money record/],
    ["a key the contract does not have", sent((j) => { j.superpowers = true; }), /"superpowers" is not part of the contract/],
    ["nothing that starts the job", sent((j) => { j.triggers = []; }), /triggers must list 1 to 4/],
    ["jobs with no contract name", { jobs: sent().jobs }, /contract must be "teammate\/1"/],
    ["a contract name with no jobs", { contract: "teammate/1" }, /jobs must list 1 to 12 jobs/],
    ["another contract's name", { ...sent(), contract: "teammate/2" }, /contract must be "teammate\/1"/],
    ["jobs that are not a list", { contract: "teammate/1", jobs: "front desk" }, /jobs must list 1 to 12 jobs/],
    ["jobs sent as nothing at all", { contract: "teammate/1", jobs: null }, /jobs must list 1 to 12 jobs/],
    ["too many jobs", { contract: "teammate/1", jobs: Array.from({ length: 13 }, (_, i) => ({ ...sent().jobs[0], id: `job_${i}` })) }, /jobs must list 1 to 12 jobs/],
  ];
  for (const [what, bring, re] of broken) for (const ready of [true, false]) {
    const r = save(BOARD, bring, ready);
    assert.equal(r.ok, false, `${what} must be refused`);
    if (r.ok) continue;
    assert.equal("spec" in r, false, `${what}: a refusal carries no spec to write`);
    assert.ok(r.errors.length > 0 && r.errors.every((e) => typeof e === "string" && e.length > 10), what);
    assert.ok(r.errors.some((e) => re.test(e)), `${what}: no error matched ${re}: ${r.errors.join(" | ")}`);
    assert.match(r.say, /^Not saved\./);
  }
});

test("a long list of problems is cut to a readable length, and says how many more there are", () => {
  const r = save(BOARD, sent((j) => { for (let i = 0; i < 100; i++) j[`extra_${i}`] = 1; }));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors.length, 41);
  assert.match(r.errors[40], /and 60 more/);
});

test("an older-shape build still saves, unchanged, and the record says it has no declared jobs", () => {
  for (const stored of [BOARD, CLASSIC, {}]) for (const ready of [true, false]) {
    const r = save(stored, {}, ready);
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    const { forge_check, ...rest } = r.spec;
    assert.deepEqual(rest, stored, "nothing but the note is added");
    assert.deepEqual(forge_check, { declared: false, at: AT });
    assert.equal(r.check.declared, false);
    assert.deepEqual(r.check.lines, [OLDER_SHAPE]);
    assert.equal("contract" in r.spec || "jobs" in r.spec, false, "an older-shape save never gains jobs");
  }
});

test("a save does not change what it was given", () => {
  const stored = structuredClone(BOARD), bring = sent(), a = JSON.stringify(stored), b = JSON.stringify(bring);
  save(stored, bring); save(stored, {}); save(stored, { jobs: [] });
  assert.equal(JSON.stringify(stored), a);
  assert.equal(JSON.stringify(bring), b);
});

test("jobs already on the record are kept and checked again when a later save brings none", () => {
  const first = save(BOARD, sent());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const again = save(first.spec, {}, true);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.spec.jobs, first.spec.jobs);
  assert.equal(again.spec.forge_check.declared, true);
});

test("jobs on the record that no longer pass: the teammate cannot be marked ready, but other saves go through and say so", () => {
  const stale = { ...BOARD, contract: "teammate/1", jobs: sent((j) => { j.tools[1].can = ["read", "delete"]; }).jobs, forge_check: { declared: true, ok: true, at: "2026-01-01" } };
  const ready = save(stale, {}, true);
  assert.equal(ready.ok, false);
  if (!ready.ok) { assert.match(ready.say, /no longer pass.*cannot be marked ready/); assert.ok(ready.errors.some((e) => /never delete/.test(e))); }
  const building = save(stale, {}, false);
  assert.equal(building.ok, true);
  if (building.ok) {
    assert.equal(building.spec.forge_check.ok, false, "the old note saying ok is replaced");
    assert.ok(building.spec.forge_check.errors.some((e: string) => /never delete/.test(e)));
    assert.equal(building.spec.forge_check.at, AT);
  }
  const fixed = save(stale, sent(), true);
  assert.equal(fixed.ok, true, "sending corrected jobs clears it");
});

test("gaps never refuse a save: they come back as plain lines, and the required ones are marked", () => {
  const r = save(BOARD, example("stock-reorder.json"));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.check.lines.some((l) => /Point of sale: Pip cannot act there yet/.test(l)));
  assert.ok(r.check.blocked.length >= 3);
  assert.deepEqual(r.spec.forge_check.blocks_golive, r.check.blocked);
  assert.deepEqual(r.spec.forge_check.lines, r.check.lines);
});

test("a save never throws, whatever it is handed", () => {
  const junk: J[] = [undefined, null, 0, "x", [], [1], true, { jobs: 1 }, { contract: {} }, { jobs: [null, 1, "a", []] }, { jobs: [{ tools: "x", triggers: 3 }] }, sent(), example("stock-reorder.json")];
  for (const stored of junk) for (const bring of junk) for (const cat of [NO_CATALOG, { steps: null, tools: "x" } as J, { steps: [1, null, { slot: 1 }], tools: [null, { block: 1 }] } as J, undefined as J]) {
    const r = saveBuild(stored, (bring ?? {}) as J, { ready: true, at: AT }, cat);
    assert.equal(typeof r.ok, "boolean");
    assert.equal(typeof goLive(stored, cat).ok, "boolean");
  }
});

// ---------- B. go-live ----------

test("go-live works for a valid new-style teammate", () => {
  for (const f of ["daily-sheet-line.json", "front-desk.json"]) {
    const g = goLive({ ...BOARD, ...example(f) }, TODAY);
    assert.equal(g.ok, true, `${f}: ${g.ok ? "" : g.why.join(" ")}`);
    assert.equal(g.check.declared, true);
  }
});

test("go-live works for an older-shape teammate, as it does today", () => {
  for (const spec of [BOARD, CLASSIC, {}, null, undefined, { forge_check: { declared: false } }]) for (const cat of [TODAY, NO_CATALOG]) {
    const g = goLive(spec, cat);
    assert.equal(g.ok, true);
    assert.equal(g.check.declared, false);
  }
});

test("go-live is refused when the contract check fails at that moment", () => {
  // Saved when it passed (or written by another door); the contract is what the code says today.
  const stale = { ...BOARD, contract: "teammate/1", jobs: sent((j) => { j.tools[1].can = ["read", "delete"]; }).jobs, forge_check: { declared: true, ok: true, lines: [], blocks_golive: [] } };
  const g = goLive(stale, TODAY);
  assert.equal(g.ok, false);
  if (g.ok) return;
  assert.match(g.why[0], /do not pass the teammate contract as it stands today/);
  assert.ok(g.why.some((w) => /never delete/.test(w)), "the reason is the checker's own plain words");
  for (const half of [{ ...BOARD, contract: "teammate/1" }, { ...BOARD, jobs: sent().jobs }, { ...BOARD, jobs: null }, { ...BOARD, contract: "teammate/2", jobs: sent().jobs }]) assert.equal(goLive(half, TODAY).ok, false);
});

test("go-live never trusts the note on the record", () => {
  const lying = { ...BOARD, ...example("stock-reorder.json"), forge_check: { declared: false, at: AT } };
  assert.equal(goLive(lying, TODAY).ok, false, "a note saying 'no jobs' does not hide the jobs");
  const flattering = { ...BOARD, ...example("stock-reorder.json"), forge_check: { declared: true, ok: true, lines: [], blocks_golive: [] } };
  assert.equal(goLive(flattering, TODAY).ok, false, "a note saying 'nothing blocks' does not unblock");
});

test("go-live is refused when a job's required tool has nothing behind it", () => {
  const cases: [string, (j: J) => void, RegExp][] = [
    ["a setup step with no reviewed tool", (j) => { j.tools.push({ tool: "booking_app", records: "appointment", can: ["read"] }); }, /Booking software: Pip cannot act there yet/],
    ["point of sale", (j) => { j.tools.push({ tool: "pos", records: "item", can: ["read"] }); }, /Point of sale: Pip cannot act there yet/],
    ["accounting", (j) => { j.tools.push({ tool: "accounting", records: "contact", can: ["read"] }); }, /Accounting: Pip cannot act there yet/],
    ["a tool Pip has never heard of", (j) => { j.tools.push({ tool: "fax_machine", records: "file", can: ["add"] }); }, /"fax_machine": Pip does not know this tool/],
    ["an extra product, read", (j) => { j.tools.push({ tool: "kit:airtable", records: "row", can: ["read"] }); }, /Airtable: an extra product the owner connects\. Pip cannot see rows there yet/],
    ["a reviewed step, but not for this", (j) => { j.tools.push({ tool: "calendar", records: "appointment", can: ["add", "update"], fields: { update: ["start"] } }); }, /Calendar: Pip can add appointments there\. Pip cannot change appointments there yet/],
    ["a reviewed step, another kind of record", (j) => { j.tools.push({ tool: "email", records: "contact", can: ["read"] }); }, /Email: Pip cannot see contacts there yet/],
    ["money, even with its policy named", (j) => { j.tools.push({ tool: "kit:restaurant_depot", records: "order", can: ["add"], policy: "buying" }); }, /Restaurant depot: Pip cannot add orders there yet\. Nothing that touches money is open/],
  ];
  for (const [what, edit, re] of cases) {
    const spec = { ...BOARD, ...sent(edit) };
    assert.deepEqual(checkSpec(spec).errors, [], `${what}: the spec itself is valid`);
    const g = goLive(spec, TODAY);
    assert.equal(g.ok, false, `${what} must stop go-live`);
    if (g.ok) continue;
    assert.match(g.why[0], /needs a tool that has nothing behind it yet/);
    assert.ok(g.why.some((w) => re.test(w)), `${what}: ${g.why.join(" | ")}`);
    assert.ok(g.why.slice(1).every((w) => /blocks go-live\.$/.test(w)));
    // The same tool, marked as one the job can do without, is a line for the founder and no longer a stop.
    const soft = { ...BOARD, ...sent((j) => { edit(j); j.tools[j.tools.length - 1].required = false; }) };
    const s = goLive(soft, TODAY);
    assert.equal(s.ok, true, `${what}, not required, must not stop go-live`);
    assert.ok(s.check.lines.some((l) => re.test(l) && /carries on without it\.$/.test(l)));
  }
});

test("go-live is refused for a job that starts on its own and needs something the runner does not open yet", () => {
  const alone = (edit: (j: J) => void) => ({ ...BOARD, ...sent((j) => { j.triggers = [{ type: "owner", on: "run_now" }]; j.tools = []; edit(j); }) });
  const send = goLive(alone((j) => { j.tools.push({ tool: "email", records: "message", can: ["add"], purpose: "transactional" }); }), TODAY);
  assert.equal(send.ok, false);
  if (!send.ok) assert.ok(send.why.some((w) => /Email: A job that starts on its own cannot send messages there yet/.test(w)));
  const narrow = goLive(alone((j) => { j.tools.push({ tool: "calendar", records: "busy_time", can: ["read"], fields: { read: ["start"] } }); }), TODAY);
  assert.equal(narrow.ok, false, "a read with a field list is not offered to a job that starts on its own");
  const extra = goLive(alone((j) => { j.tools.push({ tool: "kit:airtable", records: "row", can: ["add"] }); }), TODAY);
  assert.equal(extra.ok, false, "a job that starts on its own cannot use an extra product at all");
  // The same three while answering a customer are what pip-turn already does today.
  for (const g of [{ tool: "email", records: "message", can: ["add"], purpose: "reply" }, { tool: "calendar", records: "busy_time", can: ["read"], fields: { read: ["start"] } }, { tool: "kit:airtable", records: "row", can: ["add"] }])
    assert.equal(goLive({ ...BOARD, ...sent((j) => { j.tools = [g]; }) }, TODAY).ok, true, JSON.stringify(g));
  assert.equal(goLive(alone((j) => { j.tools.push({ tool: "sheets", records: "row", can: ["add"] }, { tool: "calendar", records: "appointment", can: ["add"] }); }), TODAY).ok, true);
});

test("go-live goes by what exists at that moment, and fails closed when nothing is known", () => {
  const spec = { ...BOARD, ...example("daily-sheet-line.json") };
  assert.equal(goLive(spec, TODAY).ok, true);
  assert.equal(goLive(spec, NO_CATALOG).ok, false, "no catalog, no go-live for a job with a required tool");
  assert.equal(goLive(spec, { ...TODAY, tools: TODAY.tools.filter((t) => t.block !== "data_sink") }).ok, false, "the tool was taken away since the build");
  assert.equal(goLive(spec, { ...TODAY, tools: TODAY.tools.map((t) => (t.block === "data_sink" ? { block: "data_sink" } : t)) }).ok, false, "a row that does not say what it touches is not reviewed");
  assert.equal(goLive(spec, { ...TODAY, steps: TODAY.steps.map((s) => (s.slot === "sheet" ? { ...s, blocks: ["data_sink"] } : s)) }).ok, false, "the step must list the name the job uses, as pip-turn's runner requires");
  assert.equal(goLive({ ...BOARD, ...sent((j) => { j.tools = [{ tool: "pip", records: "lead", can: ["add"] }]; }) }, NO_CATALOG).ok, true, "Pip's own actions need no catalog");
});

// ---------- D. what is behind each tool ----------

test("each tool is sorted into what is behind it today", () => {
  const got = lines(sent((j) => {
    j.tools = [
      { tool: "pip", records: "lead", can: ["add"] },
      { tool: "calendar", records: "busy_time", can: ["read"] },
      { tool: "sheet", records: "row", can: ["add"] }, // the setup step's own name
      { tool: "sheets", records: "row", can: ["add"], required: false }, // one of the names that step answers to
      { tool: "booking_app", records: "appointment", can: ["read", "add"], required: false },
      { tool: "kit:airtable", records: "lead", can: ["add"], required: false },
      { tool: "kit:airtable", records: "file", can: ["add"], required: false },
      { tool: "telepathy", records: "note", can: ["read"], required: false },
      { tool: "calendar", records: "appointment", can: ["read", "add"], required: false },
    ];
  }));
  assert.deepEqual(got.map((t) => [t.tool, t.records, t.reach, t.missing]), [
    ["pip", "lead", "pip", []],
    ["calendar", "busy_time", "ready", []],
    ["sheet", "row", "ready", []],
    ["sheets", "row", "ready", []],
    ["booking_app", "appointment", "nothing", ["read", "add"]],
    ["kit:airtable", "lead", "kit", []],
    ["kit:airtable", "file", "kit", ["add"]],
    ["telepathy", "note", "unknown", ["read"]],
    ["calendar", "appointment", "part", ["read"]],
  ]);
  assert.ok(got.every((t) => t.say.startsWith("Front desk: ")), "every line names the job");
  assert.equal(got[2].say, "Front desk: Spreadsheet: ready. Pip can add rows there once the owner has connected it.");
  assert.equal(got[4].say, "Front desk: Booking software: Pip cannot act there yet (the job wants to see and add appointments). The job carries on without it.");
  assert.equal(got[5].say, "Front desk: Airtable: an extra product the owner connects. While answering a customer, Pip can add one new lead there and nothing else.");
});

test("the lines an owner-facing gap is written from are plain words, never codes", () => {
  for (const f of readdirSync(new URL("docs/contracts/examples/", ROOT)).filter((x) => x.endsWith(".json"))) for (const t of canRun(checkSpec(example(f)).jobs, TODAY)) {
    assert.match(t.say, /^[A-Z].*\.$/, t.say);
    assert.doesNotMatch(t.say, /undefined|null|\[object|kit:|_/, t.say);
  }
});

test("a tool row found automatically, switched off, or without a kind of record never counts as something behind a job", () => {
  const cat: Catalog = { steps: TODAY.steps, tools: [{ block: "any_tool" }, { block: "pos" }, { block: "pos", record: "item" }, { block: "pos", level: "read" }, { block: "pos", record: null, level: null }] };
  const [t] = lines(sent((j) => { j.tools = [{ tool: "pos", records: "item", can: ["read"] }]; }), cat);
  assert.equal(t.reach, "nothing");
});

test("the rules for a job that starts on its own match the lines in pip-turn's runner", () => {
  // forge-check.ts repeats two rules from pip-turn's POST /job. If those lines change, change canRun with them.
  const turn = readFileSync(new URL("supabase/functions/pip-turn/index.ts", ROOT), "utf8");
  for (const line of [
    'if (["message", "call"].includes(row.record) || row.level === "update") continue;',
    'if (row.level === "read" && g.fields?.read) continue;',
    'const names = [row.block, slot.slot, ...(slot.blocks ?? [])];',
    'db.from("tool_catalog").select("*").eq("enabled", true).not("record", "is", null).not("level", "is", null)',
  ]) assert.ok(turn.includes(line), `STALE: pip-turn no longer has this line, so canRun in forge-check.ts may be out of step:\n  ${line}`);
});

// ---------- the pieces around them ----------

test("declares: either key means the spec must pass the check, the same as the contract's own rule", () => {
  for (const s of [{ contract: "teammate/1" }, { jobs: [] }, { jobs: null }, { contract: 0 }]) assert.equal(declares(s), true);
  for (const s of [{}, BOARD, CLASSIC, null, undefined, "x", [], { board: { jobs: [1], contract: "teammate/1" } }]) assert.equal(declares(s), false);
});

test("checkBuild reports contract errors before anything else, and no tool lines for a spec that fails", () => {
  const c = checkBuild(sent((j) => { j.id = "Not An Id"; }), TODAY);
  assert.deepEqual([c.declared, c.ok, c.lines, c.blocked], [true, false, [], []]);
  assert.ok(c.errors.some((e) => /id must be lower-case/.test(e)));
});

test("stamp replaces an older note and keeps everything else", () => {
  const s = stamp({ ...BOARD, forge_check: { declared: true, ok: true, at: "old" } }, TODAY, AT);
  assert.deepEqual(s.forge_check, { declared: false, at: AT });
  assert.deepEqual(s.board, BOARD.board);
  assert.deepEqual(stamp(null, TODAY, AT), { forge_check: { declared: false, at: AT } });
});

test("loadCatalog reads both catalogs through the caller's reader, and only rows that are switched on", async () => {
  const asked: string[] = [];
  const cat = await loadCatalog((path) => { asked.push(path); return Promise.resolve(path.startsWith("connection_catalog") ? TODAY.steps : TODAY.tools); });
  assert.deepEqual(cat, TODAY);
  assert.deepEqual(asked.sort(), ["connection_catalog?select=slot,label,blocks", "tool_catalog?enabled=is.true&select=*"]);
  assert.deepEqual(await loadCatalog(() => Promise.resolve(null)), NO_CATALOG);
  await assert.rejects(loadCatalog(() => Promise.reject(new Error("database down"))), /database down/, "a catalog that cannot be read is an error, never an empty yes");
});

// ---------- C. what the builder is told ----------

test("the builder's note states the rule and points at the contract and its examples, which exist", () => {
  assert.equal(BUILDER_NOTE.contract, "teammate/1");
  for (const must of [/Every thing the owner asked for becomes a job/, /what starts it/, /tools it needs with a level/, /never delete/, /limits/, /pause/, /plain line for the owner, never a pretend ability/]) assert.match(BUILDER_NOTE.rule, must);
  assert.match(BUILDER_NOTE.how, /refused/);
  for (const url of BUILDER_NOTE.read) {
    const m = url.match(/^https:\/\/github\.com\/braydenscuffham2-coder\/pip-ai\/(?:blob|tree)\/main\/(.+)$/);
    assert.ok(m, url);
    assert.ok(existsSync(new URL(m![1], ROOT)), `${m![1]} is not in the repo`);
  }
});
