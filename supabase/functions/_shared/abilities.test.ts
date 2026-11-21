// What the Portal tells an owner a teammate can and cannot do must match what the runtime would really allow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { abilitiesOf, OTHER_CHANNELS } from "./abilities.ts";
import { canRun, type Catalog } from "./forge-check.ts";
import { CHANNELS, checkSpec, NO_DIRECT_BOOKING } from "./teammate-spec.ts";

const example = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../docs/contracts/examples/${name}.json`, import.meta.url)), "utf8"));
// The live catalog on November 19, 2026: calendar (see busy times, add), email (send), the Pip sheet (add a row).
// Booking software is a setup step with nothing behind it.
const LIVE: Catalog = {
  steps: [
    { slot: "calendar", label: "Calendar", blocks: ["calendar"] }, { slot: "email", label: "Email from your address", blocks: ["email"] },
    { slot: "sheets", label: "A spreadsheet", blocks: ["sheets", "data_sink"] }, { slot: "booking", label: "Booking software", blocks: ["booking_app"] },
  ],
  tools: [
    { block: "calendar", toolkit: "googlecalendar", record: "appointment", level: "add" }, { block: "calendar", toolkit: "googlecalendar", record: "busy_time", level: "read" },
    { block: "email", toolkit: "gmail", record: "message", level: "add", guard: "email" }, { block: "data_sink", toolkit: "googlesheets", record: "row", level: "add" },
  ] as Catalog["tools"],
};
const OLDER = { spec: { name: "Front desk", board: { seats: { gate: { system_prompt: "You are Hallie." } } } }, man: { manifest: { teammate: "Hallie", uses: ["notify_owner", "capture_lead", "request_booking", "calendar", "email", "data_sink"] } } };

test("an older teammate is described by the one job the runtime gives it", () => {
  const a = abilitiesOf(OLDER.spec, OLDER.man, {}, LIVE);
  assert.equal(a.declared, false);
  assert.equal(a.ok, true);
  assert.equal(a.jobs.length, 1);
  const j = a.jobs[0];
  for (const line of ["Save a lead for you.", "See busy times in your calendar.", "Add new rows in your Pip sheet."]) assert.ok(j.can.includes(line), line);
  assert.ok(j.can.some((l) => /only to the customer it is talking with/.test(l)), "email is limited to the customer in the conversation");
  assert.ok(j.cannot.includes("Delete anything, anywhere."));
  assert.ok(j.cannot.includes("Move money, place orders, or change prices."));
  assert.ok(j.cannot.includes("Use any tool or any kind of record not listed here."));
  assert.deepEqual(j.notYet, []);
});

test("what has nothing behind it is never listed under 'can'; it is listed under 'not yet' with the reason", () => {
  const spec = example("daily-sheet-line");
  spec.jobs[0].tools.push({ tool: "booking_app", records: "appointment", can: ["add"], required: false });
  assert.deepEqual(checkSpec(spec).errors, []);
  const j = abilitiesOf(spec, null, {}, LIVE).jobs[0];
  assert.ok(j.can.some((l) => /rows in your Pip sheet/.test(l)));
  assert.ok(!j.can.some((l) => /appointment|booking/i.test(l)), "booking software is not claimed");
  assert.equal(j.notYet.length, 1);
  assert.match(j.notYet[0], /^Booking software: Pip cannot act there yet/);
  assert.ok(!/blocks go-live|carries on without it/.test(j.notYet[0]), "the founder's go-live wording is not shown to an owner");
});

test("with no tool catalog at all, nothing outside Pip's own actions is claimed", () => {
  const j = abilitiesOf(example("front-desk"), null, {}, { steps: [], tools: [] }).jobs[0];
  assert.ok(j.can.length > 0 && j.can.every((l) => !/calendar|sheet|email/i.test(l)), JSON.stringify(j.can));
  assert.ok(j.notYet.length >= 2);
});

test("every 'can' line is something the runtime's own check says is open, for every example teammate", () => {
  for (const name of ["front-desk", "daily-sheet-line", "lead-chaser", "stock-reorder"]) {
    const spec = example(name), a = abilitiesOf(spec, null, {}, LIVE);
    assert.equal(a.declared, true, name);
    const lines = canRun(checkSpec(spec).jobs, LIVE);
    for (const j of a.jobs) {
      const gaps = lines.filter((l) => l.job === j.id && l.missing.length);
      assert.equal(j.notYet.length, gaps.length, `${name}/${j.id}: one 'not yet' line per gap`);
      // A tool whose every level is missing must not appear in 'can' at all.
      for (const g of gaps.filter((l) => l.reach === "nothing" || l.reach === "unknown")) {
        const word = g.tool.replace(/_/g, " ");
        assert.ok(!j.can.some((l) => l.includes(`your ${word}`)), `${name}/${j.id}: ${g.tool} is claimed but has nothing behind it`);
      }
      assert.ok(j.starts.length > 0 && j.cannot.length >= 2 && j.limits.length > 0 && j.pauses.length > 0);
    }
  }
});

test("a broken job list is shown as doing nothing, never as the older behaviour", () => {
  const a = abilitiesOf({ contract: "teammate/1", jobs: [{ id: "x" }] }, OLDER.man, {}, LIVE);
  assert.deepEqual({ declared: a.declared, ok: a.ok, jobs: a.jobs }, { declared: true, ok: false, jobs: [] });
  assert.match(a.notes[0], /does nothing until Pip fixes it/);
});

// ---------- asking the owner first means no direct add ----------
const HOLDS = "Add new appointments in your calendar.", ASKS = "Ask you to confirm a booking. It does not confirm one itself.";
const older = (uses: string[]) => abilitiesOf(OLDER.spec, { manifest: { teammate: "Hallie", uses } }, {}, LIVE).jobs[0];

test("an older teammate that asks you to confirm a booking is not said to add appointments; the card says it cannot", () => {
  const j = older(OLDER.man.manifest.uses);
  assert.ok(!j.can.includes(HOLDS), j.can.join(" | "));
  assert.ok(!j.can.some((l) => /appointment/i.test(l)), "nothing under 'can' mentions appointments");
  assert.ok(j.can.includes("See busy times in your calendar."));
  assert.ok(j.can.includes(ASKS), "it still says it asks you to confirm a booking");
  assert.ok(j.cannot.includes(NO_DIRECT_BOOKING));
  assert.deepEqual(j.notYet, [], "this is not a gap waiting on Pip; it is how the teammate is meant to work");
});

test("an older teammate that does not ask you first is still said to add appointments", () => {
  const j = older(["notify_owner", "capture_lead", "calendar", "email"]);
  assert.ok(j.can.includes(HOLDS) && j.can.includes("See busy times in your calendar."));
  assert.ok(!j.can.includes(ASKS) && !j.cannot.includes(NO_DIRECT_BOOKING));
  // And when nothing is behind the calendar's add, it is not claimed either way.
  const none = abilitiesOf(OLDER.spec, { manifest: { uses: ["calendar"] } }, {}, { ...LIVE, tools: LIVE.tools.filter((t) => t.record !== "appointment") }).jobs[0];
  assert.ok(!none.can.includes(HOLDS));
});

test("a teammate with a job list that includes adding appointments is described as before", () => {
  const spec = example("front-desk");
  const chat = spec.jobs.find((j: any) => j.triggers.some((t: any) => t.type === "message"));
  chat.tools.push({ tool: "calendar", records: "appointment", can: ["add"], required: false });
  assert.deepEqual(checkSpec(spec).errors, []);
  const j = abilitiesOf(spec, null, {}, LIVE).jobs.find((x) => x.id === chat.id)!;
  assert.ok(j.can.includes(HOLDS) && j.can.includes(ASKS), j.can.join(" | "));
  assert.ok(!j.cannot.includes(NO_DIRECT_BOOKING));
  // The same job as the example ships it (it asks you, and lists no calendar add) says it cannot.
  const asIs = abilitiesOf(example("front-desk"), null, {}, LIVE).jobs.find((x) => x.id === chat.id)!;
  assert.ok(!asIs.can.includes(HOLDS) && asIs.cannot.includes(NO_DIRECT_BOOKING));
});

// ---------- what starts an older teammate ----------
test("an older teammate's card claims website chat only, and says the other channels wait on being switched on", () => {
  for (const uses of [OLDER.man.manifest.uses, ["calendar"], []]) {
    const j = older(uses);
    assert.deepEqual(j.starts, ["When a customer reaches out by website chat.", OTHER_CHANNELS]);
    assert.ok(!/text|phone|email/i.test(j.starts[0]), "the line that says what starts it names no channel that may be off");
  }
  // The second line names every channel the first leaves out, and promises none of them.
  assert.equal(CHANNELS.length, 4, "a channel was added to the contract: say where it stands in OTHER_CHANNELS");
  for (const word of ["text", "the phone", "email"]) assert.ok(OTHER_CHANNELS.includes(word), word);
  assert.match(OTHER_CHANNELS, /only once Pip has switched that on/);
  // An older Skill Spec teammate is described the same way.
  const classic = abilitiesOf({ name: "Front desk", agent: { persona: "You are the front desk.", tools: ["capture_lead"] } }, null, {}, LIVE).jobs[0];
  assert.deepEqual(classic.starts, ["When a customer reaches out by website chat.", OTHER_CHANNELS]);
  // Limits still read as a job that answers customers.
  assert.ok(older(["calendar"]).pauses.every((l) => !/failed tr/.test(l)));
});

test("a teammate with a job list is said to start from exactly the channels its job lists", () => {
  const a = abilitiesOf(example("front-desk"), null, {}, LIVE);
  const declared = checkSpec(example("front-desk")).jobs;
  for (const j of a.jobs) {
    assert.ok(!j.starts.includes(OTHER_CHANNELS), j.id);
    assert.equal(j.starts.length, declared.find((d) => d.id === j.id)!.triggers.length);
  }
});
