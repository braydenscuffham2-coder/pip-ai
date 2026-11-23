// The pure part of the second go-live refusal: which required connections are not ready, and the plain sentence.
//   node --experimental-strip-types --test supabase/functions/_shared/golive-connections.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionGate, missingConnections, requiredConnections } from "./golive-connections.ts";

const manifest = (...conns: Record<string, unknown>[]) => ({ version: "manifest/1", teammate: "Weekend Call Desk", connections: conns });
const booking = { slot: "booking", label: "Booking software", required: true };
const calendar = { slot: "calendar", label: "Calendar", required: true };
const profile = { slot: "google_profile", label: "Google Business Profile", required: false };
const names = { business: "Boise River Dental", teammate: "Weekend Call Desk" };
const tested = "2026-11-22T10:00:00Z";

test("only a connection marked exactly required counts as required", () => {
  assert.deepEqual(requiredConnections(manifest(booking, profile, { slot: "x", label: "X" }, { slot: "y", required: "yes" }, { label: "no slot", required: true })), [{ slot: "booking", label: "Booking software" }]);
  for (const bad of [null, undefined, "x", [], {}, { connections: "x" }, { connections: [null, 3] }]) assert.deepEqual(requiredConnections(bad), []);
});

test("a connection the catalog says does not block go-live never blocks, even though the manifest writes required: true on everything", () => {
  const soft = { slot: "google_profile", label: "Google Business Profile", required: true, blocks_golive: false };
  assert.deepEqual(requiredConnections(manifest(soft, { ...booking, blocks_golive: true })), [{ slot: "booking", label: "Booking software" }]);
  assert.deepEqual(missingConnections(manifest(soft), [], names), { ok: true });
});

test("a required connection that is active and tested passes", () => {
  assert.deepEqual(missingConnections(manifest(booking), [{ slot: "booking", status: "active", checked_at: tested }], names), { ok: true });
});

test("each way a required connection can be not ready is named in plain words", () => {
  const cases: [Record<string, unknown> | null, RegExp][] = [
    [null, /Booking software \(it has not been asked for yet\)/],
    [{ status: "needed" }, /Booking software \(it has not been set up yet\)/],
    [{ status: "submitted" }, /Booking software \(it was submitted but has not been confirmed yet\)/],
    [{ status: "link_made" }, /Booking software \(the sign-in link was sent but not finished\)/],
    [{ status: "expired", checked_at: tested }, /Booking software \(the sign-in expired and needs to be done again\)/],
    [{ status: "revoked", checked_at: tested }, /Booking software \(access was removed and it needs to be connected again\)/],
    [{ status: "active", checked_at: null }, /Booking software \(it is connected but has not been tested yet\)/],
  ];
  for (const [row, want] of cases) {
    const r = missingConnections(manifest(booking), row ? [{ slot: "booking", checked_at: null, ...row }] : [], names);
    assert.equal(r.ok, false, JSON.stringify(row));
    if (!r.ok) {
      assert.match(r.why, want);
      assert.match(r.why, /^Boise River Dental still needs to connect Booking software/);
      assert.match(r.why, /which Weekend Call Desk needs before it can go live\.$/);
      assert.deepEqual(r.missing.map((m) => m.slot), ["booking"]);
    }
  }
});

test("a connection of another slot does not stand in for the required one", () => {
  const r = missingConnections(manifest(booking), [{ slot: "calendar", status: "active", checked_at: tested }], names);
  assert.equal(r.ok, false);
});

test("an optional connection never blocks, whatever its state", () => {
  assert.deepEqual(missingConnections(manifest(profile), [], names), { ok: true });
  assert.deepEqual(missingConnections(manifest(profile), [{ slot: "google_profile", status: "revoked" }], names), { ok: true });
});

test("every missing connection is named in one sentence, and the ready ones are left out", () => {
  const r = missingConnections(manifest(booking, calendar, { slot: "sheets", label: "A spreadsheet", required: true }), [{ slot: "calendar", status: "active", checked_at: tested }], names);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.why, /still needs to connect Booking software \(it has not been asked for yet\) and A spreadsheet \(it has not been asked for yet\), which/);
    assert.ok(!/Calendar/.test(r.why));
    assert.deepEqual(r.missing.map((m) => m.slot), ["booking", "sheets"]);
  }
});

test("a teammate and a business with no name still get a sentence that makes sense", () => {
  const r = missingConnections({ connections: [booking] }, [], {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.why, /^This business still needs to connect Booking software .*, which This teammate needs before it can go live\.$/);
});

test("odd rows are ignored, never trusted", () => {
  const r = missingConnections(manifest(booking), [null, "x", { slot: "booking" }, { slot: "booking", status: "active" }] as never, names);
  assert.equal(r.ok, false);
});

// ---- the reader ----
const BIZ = "11111111-1111-4111-8111-111111111111";
const reader = (tables: Record<string, unknown>, seen: string[] = []) => async (path: string) => { seen.push(path.split("?")[0]); const v = tables[path.split("?")[0]]; if (v instanceof Error) throw v; return v ?? []; };

test("no manifest row: nothing else is read and the teammate is not held back", async () => {
  const seen: string[] = [];
  assert.deepEqual(await connectionGate(reader({}, seen), "s1"), { ok: true });
  assert.deepEqual(seen, ["agent_manifests"]);
});

test("a manifest with no required connection: nothing else is read and the teammate is not held back", async () => {
  const seen: string[] = [];
  assert.deepEqual(await connectionGate(reader({ agent_manifests: [{ business_id: BIZ, manifest: manifest(profile) }] }, seen), "s1"), { ok: true });
  assert.deepEqual(seen, ["agent_manifests"]);
});

test("the reader names the business and the teammate from the database, and refuses a missing connection", async () => {
  const r = await connectionGate(reader({ agent_manifests: [{ business_id: BIZ, manifest: manifest(booking) }], business_connections: [{ slot: "booking", status: "needed", checked_at: null }], businesses: [{ name: "Boise River Dental" }] }), "s1");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.why, "Boise River Dental still needs to connect Booking software (it has not been set up yet), which Weekend Call Desk needs before it can go live.");
});

test("reads fail closed: an unreadable connection list is an error, never a pass", async () => {
  const base = { agent_manifests: [{ business_id: BIZ, manifest: manifest(booking) }], businesses: [{ name: "X" }] };
  await assert.rejects(() => connectionGate(reader({ ...base, business_connections: new Error("database down") }), "s1"), /database down/);
  await assert.rejects(() => connectionGate(reader({ agent_manifests: [{ business_id: "nope", manifest: manifest(booking) }] }), "s1"), /no business/);
  await assert.rejects(() => connectionGate(reader({ agent_manifests: new Error("down") }), "s1"), /down/);
});
