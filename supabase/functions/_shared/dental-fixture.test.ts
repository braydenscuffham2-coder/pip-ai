// The made-up dental practice behind the test phone number: its teammate is written with a real job, and the
// migration carries exactly the spec that passed the checker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSpec, jobForMessage, jobsOf } from "./teammate-spec.ts";

const spec = JSON.parse(readFileSync(new URL("../../../tests/db/fixtures/dental-front-desk.spec.json", import.meta.url), "utf8"));
const migration = readFileSync(new URL("../../migrations/20261127_25_test_dental_practice.sql", import.meta.url), "utf8");

test("the dental front desk passes the teammate contract with one job that answers a call", () => {
  const c = checkSpec(spec);
  assert.deepEqual(c.errors, []);
  const found = jobsOf(spec);
  assert.equal(found.legacy, false, "it is written with jobs, not given the implied one");
  for (const ch of ["voice", "web_chat", "sms", "email"]) assert.equal(jobForMessage(found.jobs, ch)?.id, "front_desk");
});

test("its tools are read or add only, and it can put an appointment on the calendar", () => {
  const tools = spec.jobs[0].tools;
  assert.ok(tools.every((t: { can: string[] }) => t.can.every((c) => c === "read" || c === "add")));
  assert.ok(tools.some((t: { tool: string; records: string; can: string[] }) => t.tool === "calendar" && t.records === "appointment" && t.can.includes("add")));
  assert.ok(tools.some((t: { tool: string; records: string }) => t.tool === "calendar" && t.records === "busy_time"));
  assert.ok(!tools.some((t: { records: string }) => t.records === "outbound_text"), "it cannot text first: the number is not registered for texting");
});

test("the prompt holds the safety and honesty lines a dental front desk needs", () => {
  const p = spec.board.seats.gate.system_prompt;
  for (const line of ["never give medical or dental advice", "call 911", "Never say an appointment is booked unless the calendar tool said it was added", "You cannot send text messages yet", "made-up practice"]) assert.ok(p.includes(line), line);
});

test("the migration carries this exact spec and says it is a test", () => {
  const inside = migration.split("$spec$")[1];
  assert.deepEqual(JSON.parse(inside), spec, "the spec in the migration is the checked fixture");
  assert.match(migration, /TEST Maple Street Dental \(made-up practice\)/);
  assert.match(migration, /-- undo \(by hand\)/);
});
