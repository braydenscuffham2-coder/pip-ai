#!/usr/bin/env node
// Proves the suite is not asleep. For each hard limit, this makes a copy of pip-turn with that one limit taken out
// and checks that the tests then FAIL. If a broken copy passes, the tests have a hole and this script exits 1.
// Nothing in the repo is changed; the copies live in a temp folder.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("../../supabase/functions/pip-turn/index.ts", import.meta.url)), "utf8");
const suite = fileURLToPath(new URL("./limits.test.mjs", import.meta.url));

// The one permission check on a turn, and the same line with the check taken out.
const ASK = "const v = allows(job!, ask, PASSED);", NO_ASK = "const v: Verdict = { ok: true };";

// Each entry: what is broken, then either one line and its replacement, or a list of [line, replacement] pairs when
// two separate things each hold the limit and both have to go before it is really gone.
const BREAKS = [
  ["anyone may call", "if (!who) return", "if (false) return"],
  ["the website may use /diag", 'path === "/diag" && who !== "site"', 'path === "/diag"'],
  ["any email address may be written", "if (bad.length) {", "if (false) {"],
  ["not-live teammates act for real", "if (!real) {", "if (false) {"],
  ["no cap on tool calls", "++calls > 6", "++calls > 600"],
  ["no cap on rounds", "round < 5 &&", "round < 500 &&"],
  ["calendar details reach the model", 'meta.row.shape === "busy_only"', "false"],
  ["the model can override fixed values", "args = { ...args, ...(meta.row.fixed ?? {}) };", "args = { ...(meta.row.fixed ?? {}), ...args };"],
  ["hidden fields are sent", ".filter(([k]) => !(meta.row.hide ?? []).includes(k))", ""],
  ["hidden fields are shown to the model", ".filter(([k]) => !hide.includes(k))), required", ".filter(() => true)), required"],
  ["the founder's preview of an extra tool lists money tools", "if (MONEY.test(toolkit)) return false;", ""],
  ["the founder's preview lists update and delete actions", "const ADD_ONE = /^(CREATE|ADD|INSERT)_", "const ADD_ONE = /^(CREATE|ADD|INSERT|UPDATE|DELETE|LIST)_"],
  ["the founder's preview lists tagged destructive actions", "/readonly|destructive|update|deprecated/.test(x)", "false"],
  ["the founder's preview lists actions with an unknown hint tag", "tags.some((x: string) => /hint$/.test(x)) && !tags.includes(\"createhint\")", "false"],
  ["expired access pauses nothing", '"portal_job_pause"', '"nothing"'],
  ["a paused job keeps its tools", "|| paused.has(slot.label)", ""],
  ["inactive connections are used", 'conn.status !== "active" ||', ""],
  ["tools not given to the teammate can run", 'if (!meta) return { text: "That tool is not available.", error: true };', 'if (!meta) { actions.push({ tool: name, status: "done" }); return { text: "Done." }; }'],
  ["no AI disclosure on the first reply", "if (first && !AI_RE.test(reply))", "if (false)"],
  ["a claim to be a person reaches the customer, and a question about it goes unanswered", "reply = honest(reply, message,", "reply = ((r) => r)(reply, message,"],
  ["no AI line on outgoing email", 'if (meta.row.guard === "email") {', "if (false) {"],
  ["a draft teammate answers", '!["live", "approved", "sandbox"].includes(c.s.status)', "false"],
  ["a disconnected business is served", '["disconnected", "cancelled"].includes(c.biz.status)', "false"],
  ["the spend guard is ignored", "&& body?.limited !== true", ""],
  ["a failed tool is called done", "const failed = !r.ok || r.j?.successful === false;", "const failed = false;"],
  ["an unreadable calendar means free", "if (!busy) { await log(", "if (false) { await log("],
  ["a session is opened for the whole toolkit", "tools: { [toolkit]: { enable: allow } } });\n  if (!r.ok) r = await open({ ...pin, tools:", "});\n  if (!r.ok) r = await open({ ...pin, tools:"],
  ["tools outside the catalog can be sent to Composio", "if (!only && !kitTools.get(toolkit)?.has(slug)) {", "if (false) {"],
  // ---- a turn is held to the job that answers it (teammate contract) ----
  ["a teammate with no job to answer with is run anyway", "body?.limited !== true && job; round++", "body?.limited !== true; round++"],
  ["a job's permissions are never asked on a turn", ASK, NO_ASK],
  ["an action the job's permissions refuse is run anyway", 'if (!v.ok) {\n      actions.push({ tool: name, status: "blocked" });', 'if (false) {\n      actions.push({ tool: name, status: "blocked" });'],
  // Two things each stop these, so both are taken out: how a tool is matched to a permission, and the check itself.
  ["a catalog tool the job does not list is offered and run", [
    ["const g = grantFor(job, names, row);\n      if (!g || notYet(g, row, true)) continue;", 'const g = grantFor(job, names, row) ?? ({ tool: row.block, records: row.record, can: [row.level], required: false, purpose: "reply" } as Grant);\n      if (notYet(g, row, true)) continue;'],
    [ASK, NO_ASK]]],
  ["a level the job was not given is opened", [["x.records === row.record && (x.can as string[]).includes(row.level));", "x.records === row.record);"], [ASK, NO_ASK]]],
  ["a kind of record the job was not given is opened", [["names.includes(x.tool) && x.records === row.record &&", "names.includes(x.tool) &&"], [ASK, NO_ASK]]],
  ["extra connected tools are opened for a job that does not list them", [
    ["if (kits.size) {", "{"],
    ["if (!kits.has(x.toolkit) || seenKit.has(x.toolkit)", "if (seenKit.has(x.toolkit)"],
    ["const g = grantFor(job, [`kit:${x.toolkit}`], row);\n          if (!g || notYet(g, row, true) ||", "const g = grantFor(job, [`kit:${x.toolkit}`], row) ?? ({ tool: `kit:${x.toolkit}`, records: row.record, can: [row.level], required: false } as Grant);\n          if (notYet(g, row, true) ||"],
    [ASK, NO_ASK]]],
  // notYet() itself lives in the contract file (its own cases are in teammate-spec.test.ts). Here: pip-turn stops asking it.
  ["texts, calls, updates and emails that are not a reply are opened before the checks they need exist", [
    ["if (!g || notYet(g, row, true)) continue;", "if (!g) continue;"],
    ["if (!g || notYet(g, row, true) || tools.length >= 24) continue;", "if (!g || tools.length >= 24) continue;"]]],
  ["a row that adds, filed as a read, skips the email-address limit", ' || meta.row.level !== "read";', ";"],
  ["a card number or password a customer types is stored and sent to the model", "const { text: message, kinds: redacted } = redact(", "const { text: message, kinds: redacted } = ((t: string) => ({ text: t, kinds: [] as string[] }))("],
  ["a card number in an earlier message reaches the model again", "content: clean(String(m.content)) }));", "content: String(m.content) }));"],
  ["a money product behind a building block is opened on a turn", "return v.ok ? allowsProduct(job!, ask, products, PASSED) : v;", "return v;"],
  ["a money product behind a building block is opened in a job that started on its own", "[row.toolkit, conn.choice], PASSED).ok) { shut.add(kind); continue; }", "[], PASSED).ok) { shut.add(kind); continue; }"],
];

const dir = mkdtempSync(join(tmpdir(), "pip-turn-prove-"));
let holes = 0;
for (const [what, from, to] of BREAKS) {
  const edits = Array.isArray(from) ? from : [[from, to]];
  if (edits.some(([a]) => !src.includes(a))) { console.log(`STALE  ${what}: that line is no longer in pip-turn. Update tests/pip-turn/prove.mjs.`); holes++; continue; }
  const file = join(dir, `broken-${BREAKS.findIndex((b) => b[0] === what)}.ts`);
  writeFileSync(file, edits.reduce((code, [a, b]) => code.replace(a, b), src));
  const r = spawnSync(process.execPath, ["--test", suite], { env: { ...process.env, PIP_TURN_SRC: file }, encoding: "utf8" });
  if (r.status === 0) { console.log(`HOLE   ${what}: the tests still passed`); holes++; } else console.log(`caught ${what}`);
}
console.log(holes ? `\n${holes} problem(s). The suite would miss these.` : `\nAll ${BREAKS.length} planted breaks were caught.`);
process.exit(holes ? 1 : 0);
