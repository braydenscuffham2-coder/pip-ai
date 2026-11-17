// When is a scheduled job due? Pure functions, no imports, tested in schedule.test.ts.
// A schedule is written in the business's own time zone. Each start it describes is a "slot", named by its local wall
// time ("2026-11-18T07:30"). The name is the run's key, so a slot can start one run and never two, however many
// times the timer asks. Only the most recent slot is ever returned: after an outage a job runs once, not once per
// missed slot, and a slot older than the catch-up window is skipped.
import type { Trigger } from "./teammate-spec.ts";

type Schedule = Extract<Trigger, { type: "schedule" }>;
const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** The wall clock in a time zone at an instant. An unknown zone falls back to Boise, as pip-turn does. */
export function local(at: Date, tz: string): { y: number; m: number; d: number; hh: number; mm: number; dow: string } {
  let f: Intl.DateTimeFormat;
  const opt = { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" } as const;
  try { f = new Intl.DateTimeFormat("en-US", { ...opt, timeZone: tz || "America/Boise" }); } catch { f = new Intl.DateTimeFormat("en-US", { ...opt, timeZone: "America/Boise" }); }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour), mm: Number(p.minute), dow: String(p.weekday).toLowerCase().slice(0, 3) };
}
/** The business's calendar day at an instant, as YYYY-MM-DD. Daily limits are counted against this. */
export function localDay(at: Date, tz: string): string { const l = local(at, tz); return `${l.y}-${pad(l.m)}-${pad(l.d)}`; }

/** The instant a wall-clock time happens in a zone. A time skipped by a clock change lands just after the change. */
export function instant(y: number, m: number, d: number, minutes: number, tz: string): Date {
  const want = Date.UTC(y, m - 1, d, 0, minutes);
  let t = want;
  for (let i = 0; i < 3; i++) { const l = local(new Date(t), tz); t += want - Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mm); }
  return new Date(t);
}

/**
 * The most recent slot at or before `now`, if it is inside the catch-up window. Otherwise null.
 * The window is 12 hours for day, week and month schedules, and one interval for minutes and hours.
 */
export function dueSlot(t: Schedule, tz: string, now: Date): { key: string; at: Date } | null {
  const n = local(now, tz), nowMin = n.hh * 60 + n.mm;
  const key = (y: number, m: number, d: number, minutes: number) => `${y}-${pad(m)}-${pad(d)}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  if (t.every === "minutes" || t.every === "hours") {
    const step = t.every === "minutes" ? t.interval! : t.interval! * 60;
    const from = t.between ? mins(t.between[0]) : 0, to = t.between ? mins(t.between[1]) : 1439;
    if (nowMin < from) return null;
    const slot = from + Math.floor((Math.min(nowMin, to) - from) / step) * step;
    if (nowMin - slot >= step) return null; // past the last slot of the day by a whole interval
    return { key: key(n.y, n.m, n.d, slot), at: instant(n.y, n.m, n.d, slot, tz) };
  }
  const at = mins(t.at!);
  // Look at today and yesterday: with a 12 hour window nothing older can be due.
  for (const back of [0, 1]) {
    const day = new Date(Date.UTC(n.y, n.m - 1, n.d - back, 12));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (back === 0 && nowMin < at) continue;
    if (t.every === "week" && !(t.on as string[]).includes(DAY[day.getUTCDay()])) continue;
    if (t.every === "month") {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (!(t.on as (string | number)[]).some((x) => (x === "last" ? d === last : x === d))) continue;
    }
    const when = instant(y, m, d, at, tz);
    if (now.getTime() - when.getTime() > 12 * 3600000 || when.getTime() > now.getTime()) return null;
    return { key: key(y, m, d, at), at: when };
  }
  return null;
}
