// node --experimental-strip-types --test supabase/functions/_shared/schedule.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueSlot, instant, local, localDay } from "./schedule.ts";

const TZ = "America/Boise"; // UTC-7 in winter, UTC-6 in summer
const at = (iso: string) => new Date(iso);
const daily = { type: "schedule", every: "day", at: "07:30" } as const;

test("wall clock and day in the business's zone", () => {
  assert.deepEqual(local(at("2026-11-18T14:30:00Z"), TZ), { y: 2026, m: 11, d: 18, hh: 7, mm: 30, dow: "wed" });
  assert.equal(localDay(at("2026-11-18T06:59:00Z"), TZ), "2026-11-17");
  assert.equal(instant(2026, 11, 18, 450, TZ).toISOString(), "2026-11-18T14:30:00.000Z");
  assert.equal(instant(2026, 7, 1, 450, TZ).toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(local(at("2026-11-18T14:30:00Z"), "Not/AZone").hh, 7);
});

test("a daily job: not before its time, once after it, same key all day, gone after 12 hours", () => {
  assert.equal(dueSlot(daily, TZ, at("2026-11-18T14:29:00Z")), null);
  const a = dueSlot(daily, TZ, at("2026-11-18T14:30:00Z")), b = dueSlot(daily, TZ, at("2026-11-18T14:35:00Z")), c = dueSlot(daily, TZ, at("2026-11-19T02:29:00Z"));
  assert.equal(a?.key, "2026-11-18T07:30"); assert.equal(b?.key, a?.key); assert.equal(c?.key, a?.key);
  assert.equal(dueSlot(daily, TZ, at("2026-11-19T02:31:00Z")), null, "more than 12 hours late is skipped, not run at night");
  assert.equal(dueSlot(daily, TZ, at("2026-11-19T14:30:00Z"))?.key, "2026-11-19T07:30", "the next day is a new slot");
});

test("a late-evening job is still caught after midnight", () => {
  const late = { type: "schedule", every: "day", at: "23:50" } as const;
  assert.equal(dueSlot(late, TZ, at("2026-11-19T07:05:00Z"))?.key, "2026-11-18T23:50"); // 00:05 local on the 19th
});

test("weekly and monthly", () => {
  const wk = { type: "schedule", every: "week", on: ["mon", "thu"], at: "07:30" } as const;
  assert.equal(dueSlot(wk, TZ, at("2026-11-18T15:00:00Z")), null); // Wednesday
  assert.equal(dueSlot(wk, TZ, at("2026-11-19T15:00:00Z"))?.key, "2026-11-19T07:30"); // Thursday
  const mo = { type: "schedule", every: "month", on: [1, "last"], at: "09:00" } as const;
  assert.equal(dueSlot(mo, TZ, at("2026-11-30T17:00:00Z"))?.key, "2026-11-30T09:00");
  assert.equal(dueSlot(mo, TZ, at("2026-12-01T17:00:00Z"))?.key, "2026-12-01T09:00");
  assert.equal(dueSlot(mo, TZ, at("2026-11-29T17:00:00Z")), null);
  assert.equal(dueSlot(mo, TZ, at("2028-02-29T17:00:00Z"))?.key, "2028-02-29T09:00", "leap day is the last day");
});

test("every N minutes or hours, inside opening hours", () => {
  const m = { type: "schedule", every: "minutes", interval: 30 } as const;
  assert.equal(dueSlot(m, TZ, at("2026-11-18T14:44:00Z"))?.key, "2026-11-18T07:30");
  assert.equal(dueSlot(m, TZ, at("2026-11-18T15:00:00Z"))?.key, "2026-11-18T08:00");
  const h = { type: "schedule", every: "hours", interval: 4, between: ["08:00", "18:00"] } as any;
  assert.equal(dueSlot(h, TZ, at("2026-11-18T14:59:00Z")), null); // 07:59
  assert.equal(dueSlot(h, TZ, at("2026-11-18T15:00:00Z"))?.key, "2026-11-18T08:00");
  assert.equal(dueSlot(h, TZ, at("2026-11-18T22:10:00Z"))?.key, "2026-11-18T12:00"); // 15:10
  assert.equal(dueSlot(h, TZ, at("2026-11-19T00:30:00Z"))?.key, "2026-11-18T16:00"); // 17:30
  assert.equal(dueSlot(h, TZ, at("2026-11-19T04:30:00Z")), null, "21:30: the 16:00 slot is more than one interval old");
  const keys = new Set<string>();
  for (let t = Date.parse("2026-11-18T07:00:00Z"); t < Date.parse("2026-11-19T07:00:00Z"); t += 5 * 60000) { const s = dueSlot(h, TZ, new Date(t)); if (s) keys.add(s.key); }
  assert.deepEqual([...keys], ["2026-11-18T08:00", "2026-11-18T12:00", "2026-11-18T16:00"], "a 5-minute timer over one day finds exactly three slots");
});

test("clock changes: one run a day, never zero and never two", () => {
  // US clocks go back on 2026-11-01 and forward on 2027-03-14. Tick every 5 minutes across both weeks.
  for (const [from, to, t] of [["2026-10-30T00:00:00Z", "2026-11-04T00:00:00Z", { type: "schedule", every: "day", at: "01:30" }], ["2027-03-12T00:00:00Z", "2027-03-17T00:00:00Z", { type: "schedule", every: "day", at: "02:30" }]] as const) {
    const keys = new Set<string>();
    for (let x = Date.parse(from); x < Date.parse(to); x += 5 * 60000) { const s = dueSlot(t as any, TZ, new Date(x)); if (s) keys.add(s.key); }
    assert.equal(keys.size, 5, [...keys].join(" "));
  }
});
