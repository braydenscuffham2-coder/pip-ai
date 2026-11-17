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
  ["money tools are opened automatically", "if (MONEY.test(toolkit)) return false;", ""],
  ["update and delete actions are opened automatically", "const ADD_ONE = /^(CREATE|ADD|INSERT)_", "const ADD_ONE = /^(CREATE|ADD|INSERT|UPDATE|DELETE|LIST)_"],
  ["tagged destructive actions are opened", "/readonly|destructive|update|deprecated/.test(x)", "false"],
  ["actions with an unknown hint tag are opened", "tags.some((x: string) => /hint$/.test(x)) && !tags.includes(\"createhint\")", "false"],
  ["expired access pauses nothing", '"portal_job_pause"', '"nothing"'],
  ["a paused job keeps its tools", "|| paused.has(slot.label)", ""],
  ["inactive connections are used", 'conn.status !== "active" ||', ""],
  ["tools not given to the teammate can run", 'if (!meta) return { text: "That tool is not available.", error: true };', 'if (!meta) { actions.push({ tool: name, status: "done" }); return { text: "Done." }; }'],
  ["no AI disclosure on the first reply", "if (first && !AI_RE.test(reply))", "if (false)"],
  ["no AI line on outgoing email", 'if (meta.row.guard === "email") {', "if (false) {"],
  ["a draft teammate answers", '!["live", "approved", "sandbox"].includes(c.s.status)', "false"],
  ["a disconnected business is served", '["disconnected", "cancelled"].includes(c.biz.status)', "false"],
  ["the spend guard is ignored", "&& body?.limited !== true", ""],
  ["a failed tool is called done", "const failed = !r.ok || r.j?.successful === false;", "const failed = false;"],
  ["an unreadable calendar means free", "if (!Array.isArray(items)) {", "if (false) {"],
];

const dir = mkdtempSync(join(tmpdir(), "pip-turn-prove-"));
let holes = 0;
for (const [what, from, to] of BREAKS) {
  if (!src.includes(from)) { console.log(`STALE  ${what}: that line is no longer in pip-turn. Update tests/pip-turn/prove.mjs.`); holes++; continue; }
  const file = join(dir, `broken-${BREAKS.findIndex((b) => b[0] === what)}.ts`);
  writeFileSync(file, src.replace(from, to));
  const r = spawnSync(process.execPath, ["--test", suite], { env: { ...process.env, PIP_TURN_SRC: file }, encoding: "utf8" });
  if (r.status === 0) { console.log(`HOLE   ${what}: the tests still passed`); holes++; } else console.log(`caught ${what}`);
}
console.log(holes ? `\n${holes} problem(s). The suite would miss these.` : `\nAll ${BREAKS.length} planted breaks were caught.`);
process.exit(holes ? 1 : 0);
