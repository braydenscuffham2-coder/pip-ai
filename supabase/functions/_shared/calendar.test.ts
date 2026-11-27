// Calendar rules that hold for Google and Outlook alike: busy times only, and a hold never invites anyone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addsToCalendar, busyTimes, eventsIn, inviteKeys, withoutInvites } from "./calendar.ts";

test("Google's answer: busy times only, cancelled and free events left out, no titles or people", () => {
  const data = { response_data: { items: [
    { summary: "Dana root canal", attendees: [{ email: "dana@example.test" }], start: { dateTime: "2026-12-01T10:00:00-07:00" }, end: { dateTime: "2026-12-01T11:00:00-07:00" } },
    { summary: "Cancelled", status: "cancelled", start: { dateTime: "2026-12-01T12:00:00-07:00" }, end: { dateTime: "2026-12-01T13:00:00-07:00" } },
    { summary: "FYI", transparency: "transparent", start: { dateTime: "2026-12-01T14:00:00-07:00" }, end: { dateTime: "2026-12-01T15:00:00-07:00" } },
    { summary: "Closed", start: { date: "2026-12-02" }, end: { date: "2026-12-03" } } ] } };
  const busy = busyTimes(data)!;
  assert.deepEqual(busy, [{ start: "2026-12-01T10:00:00-07:00", end: "2026-12-01T11:00:00-07:00" }, { start: "2026-12-02", end: "2026-12-03" }]);
  assert.doesNotMatch(JSON.stringify(busy), /Dana|example\.test|root canal/);
});

test("Outlook's answer: the list is under value, times carry a zone, cancelled and free are left out", () => {
  const data = { data: { value: [
    { subject: "Sam hearing test", organizer: { emailAddress: { address: "sam@example.test" } }, showAs: "busy", start: { dateTime: "2026-12-01T17:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-12-01T18:00:00.0000000", timeZone: "UTC" } },
    { subject: "Gone", isCancelled: true, start: { dateTime: "2026-12-01T19:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-12-01T20:00:00.0000000", timeZone: "UTC" } },
    { subject: "Lunch, free", showAs: "free", start: { dateTime: "2026-12-01T21:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-12-01T22:00:00.0000000", timeZone: "UTC" } },
    { subject: "Maybe", showAs: "tentative", start: { dateTime: "2026-12-02T17:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-12-02T18:00:00.0000000", timeZone: "UTC" } } ] } };
  const busy = busyTimes(data)!;
  assert.deepEqual(busy.map((b) => b.start), ["2026-12-01T17:00:00.0000000", "2026-12-02T17:00:00.0000000"], "tentative still counts as busy");
  assert.equal(busy[0].tz, "UTC"); assert.doesNotMatch(JSON.stringify(busy), /Sam|example\.test|hearing/);
});

test("no list at all is not the same as a free calendar", () => {
  assert.equal(busyTimes({ data: { error: "x" } }), null); assert.equal(busyTimes(null), null); assert.equal(eventsIn({ items: "nope" }), null);
  assert.deepEqual(busyTimes({ items: [] }), []); assert.deepEqual(busyTimes({ data: { value: [] } }), []);
});

test("a hold never invites anyone: inviting inputs are found by name and dropped from a call", () => {
  const google = ["summary", "start_datetime", "attendees", "send_updates", "guestsCanInviteOthers", "create_meeting_room", "location"];
  const outlook = ["subject", "start_datetime", "end_datetime", "attendees_info", "is_online_meeting", "online_meeting_provider", "body", "location", "time_zone"];
  assert.deepEqual(inviteKeys(google), ["attendees", "send_updates", "guestsCanInviteOthers", "create_meeting_room"]);
  assert.deepEqual(inviteKeys(outlook), ["attendees_info", "is_online_meeting", "online_meeting_provider"]);
  const row = { block: "calendar", access: "write" };
  assert.equal(addsToCalendar(row), true); assert.equal(addsToCalendar({ block: "calendar", access: "read" }), false); assert.equal(addsToCalendar({ block: "email", access: "write" }), false);
  assert.deepEqual(withoutInvites(row, { subject: "Hold: Dana", attendees_info: [{ email: "dana@example.test" }], is_online_meeting: true, start_datetime: "2026-12-01T10:00:00" }), { subject: "Hold: Dana", start_datetime: "2026-12-01T10:00:00" });
  const mail = { block: "email", access: "write" }, args = { recipient_email: "dana@example.test" };
  assert.equal(withoutInvites(mail, args), args, "other tools are untouched");
});
