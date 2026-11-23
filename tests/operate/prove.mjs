#!/usr/bin/env node
// Proves the operator's send tests are not asleep. For each safety step in operate-run.ts, this makes a copy of the
// _shared folder with that one step taken out and checks that operate-run.test.ts then FAILS. A broken copy that passes
// means a hole in the tests, and the script exits 1. Nothing in the repo is changed.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../../supabase/functions/_shared", import.meta.url));
const src = readFileSync(join(shared, "operate-run.ts"), "utf8");
const BREAKS = [
  ["the touch is not reserved before sending", 'if (held?.ok !== true) return blocked(String(held?.why ?? "unconfirmed"));', ""],
  ["the database check is skipped", 'if (chk?.ok !== true || typeof chk.purpose !== "string") return blocked(String(chk?.why ?? "unconfirmed"));', 'const chk = { purpose: "transactional" } as J;'],
  ["the consent gate is skipped", 'if (gate?.allowed !== true) return blocked(gate?.reason === "opted_out" ? "opted_out" : "unconfirmed");', ""],
  ["a text is allowed", 'if (o.channel !== "email") return blocked("channel_not_allowed");', ""],
  ["a missing address is filled in", 'const to = [args.recipient_email, args.to].find(', 'const to = [args.recipient_email, args.to, "x@example.test"].find('],
  ["the AI line is not added", 'if (!AI_RE.test(body)) body = `${body}\\n\\nSent by ${o.teammate}, an AI assistant for ${o.business}.`;', ""],
  ["the opt-out line is not added", 'if (!/reply stop/i.test(body)) body = `${body}\\n${EMAIL_OPT_OUT_LINE}`;', ""],
  ["an error is read as yes", "  } catch {\n    return blocked(\"unconfirmed\");", "  } catch {\n    return { ok: true, args: o.args, to: \"x@example.test\", purpose: \"transactional\" } as J;"],
  ["a run with no case may send", 'const op = operatorInput(o.input);\n    if (!op) return blocked("no_case");', 'const op = operatorInput(o.input) ?? { case_key: "x", touch: 1 };'],
  ["any touch number is accepted", "return touch >= 1 && touch <= CEIL.touches ?", "return touch >= 1 ?"],
  ["calling hours are ignored", "return t >= CALLING_HOURS.from && t < CALLING_HOURS.to;", "return true;"],
  ["an amount is carried into the context", 'pick("service", d.service, d.service_type, d.job_type);', 'pick("service", d.service, d.service_type, d.job_type); pick("amount", d.amount);'],
  ["a quote that leaves quote-sent does not close the case", 'if (!passes(t.if, b.data)) return { kind: "finish", case_key: key };', ""],
  ["a run key ignores the touch number", "key: `o:${c.case_key}:${c.touches + 1}`.slice(0, 200),", "key: `o:${c.case_key}`.slice(0, 200),"],
];
let missed = 0;
for (const [name, from, to] of BREAKS) {
  if (!src.includes(from)) { console.log(`STALE  ${name}: the line to break was not found`); missed++; continue; }
  const dir = mkdtempSync(join(tmpdir(), "operate-prove-"));
  cpSync(shared, join(dir, "_shared"), { recursive: true });
  writeFileSync(join(dir, "_shared", "operate-run.ts"), src.replace(from, to));
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--test", join(dir, "_shared", "operate-run.test.ts")], { encoding: "utf8" });
  if (r.status === 0) { console.log(`MISSED ${name}: the tests still pass with this broken`); missed++; } else console.log(`caught ${name}`);
}
console.log(missed ? `\n${missed} break(s) not caught.` : `\nAll ${BREAKS.length} planted breaks were caught.`);
process.exit(missed ? 1 : 0);
