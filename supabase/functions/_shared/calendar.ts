// Calendars, whichever one the owner uses (Nov 27, 2026). Two rules live here so they hold for every calendar tool:
//   1. A teammate sees busy times only: when something starts and ends, never what it is or who is in it.
//   2. A hold a teammate adds never invites anyone. An invitation is a message to a person, and messages to people
//      go through the outbound gate, not through a calendar's side door.
// Google answers with "items"; Outlook (Microsoft Graph) answers with "value". Both nest times as start.dateTime.
// deno-lint-ignore no-explicit-any
type J = any;

function find(o: J, key: string, depth = 0): J {
  if (!o || typeof o !== "object" || depth > 6) return undefined;
  if (!Array.isArray(o) && Array.isArray(o[key])) return o[key];
  for (const v of Array.isArray(o) ? o : Object.values(o)) { const hit = find(v, key, depth + 1); if (hit !== undefined) return hit; }
  return undefined;
}
/** The events in a calendar tool's answer, or null when there is no list at all (which is never read as "free"). */
export function eventsIn(data: J): J[] | null {
  const items = find(data, "items") ?? find(data, "value");
  return Array.isArray(items) ? items : null;
}
/** Busy times only. Cancelled events and ones marked free are left out. Outlook's times carry their time zone. */
export function busyTimes(data: J, max = 80): { start: string; end: string | null; tz?: string }[] | null {
  const items = eventsIn(data);
  if (!items) return null;
  return items
    .filter((e: J) => e && e.status !== "cancelled" && e.isCancelled !== true && e.transparency !== "transparent" && !["free", "workingElsewhere"].includes(String(e.showAs ?? "")))
    .map((e: J) => ({ start: e?.start?.dateTime ?? e?.start?.date, end: e?.end?.dateTime ?? e?.end?.date ?? null, ...(typeof e?.start?.timeZone === "string" && e.start.timeZone ? { tz: e.start.timeZone } : {}) }))
    .filter((e) => typeof e.start === "string" && e.start).slice(0, max);
}

const INVITES = /attendee|invite|guest|recipient|online_?meeting|teams|skype|conference|meeting_?room|send_?(updates|notifications)/i;
/** The inputs of a calendar tool that would invite or notify someone. They are hidden from the model and dropped from a call. */
export function inviteKeys(names: Iterable<string>): string[] { return [...names].filter((k) => INVITES.test(k)); }
/** A catalog row that adds to a calendar. */
export const addsToCalendar = (row: J): boolean => row?.block === "calendar" && row?.access === "write";
/** Arguments for a calendar hold with every inviting input removed. */
export function withoutInvites(row: J, args: J): J {
  if (!addsToCalendar(row) || !args || typeof args !== "object") return args;
  return Object.fromEntries(Object.entries(args).filter(([k]) => !INVITES.test(k)));
}
