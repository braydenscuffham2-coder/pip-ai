// The two go-live refusals, through the real founder connector (index.ts) with the database faked:
//   1. an open API Shelf need (the database's own refusal; it must keep coming through exactly as before)
//   2. a connection the teammate's manifest marks required that is not connected and tested for the business
//   node --experimental-strip-types --test supabase/functions/pip-forge-mcp/golive-connections.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootConnector, IDS, tables } from "./harness.mjs";

const f = await bootConnector();
const BIZ = "11111111-1111-4111-8111-111111111111", OTHER = "99999999-9999-4999-8999-999999999999";
const BOARD = { seats: { gate: { system_prompt: "You are Hallie, the front desk for Boise River Dental." } } };
const tested = "2026-11-22T10:00:00Z";
const booking = { slot: "booking", label: "Booking software", required: true };
const profile = { slot: "google_profile", label: "Google Business Profile", required: false };
const manifest = (...connections) => ({ version: "manifest/1", skill_id: "weekend-call-desk", teammate: "Weekend Call Desk", connections });
const spec = () => f.row("skill_specs", IDS.spec);
const golive = (more = {}) => f.tool("forge_golive", { order_id: IDS.order, ...more });

/** One sandbox-ready teammate, its manifest, the business and that business's connections. */
function world({ conns = [], man = manifest(booking), extra = {} } = {}) {
  const t = tables();
  t.skill_specs[0].spec = { board: BOARD }; t.skill_specs[0].status = "sandbox"; t.skill_specs[0].skill_id = "weekend-call-desk";
  t.agent_manifests = man ? [{ spec_id: IDS.spec, business_id: BIZ, skill_id: "weekend-call-desk", manifest: man }] : [];
  t.businesses = [{ id: BIZ, name: "Boise River Dental" }, { id: OTHER, name: "Someone Else" }];
  t.business_connections = conns;
  Object.assign(t, extra);
  f.reset(t);
}
const conn = (slot, status, checked_at = null, business_id = BIZ) => ({ business_id, slot, status, checked_at });
const refused = (r, rx) => {
  assert.equal(r.out.ok, false);
  assert.equal(r.out.agents[0].live, false);
  assert.match(r.out.agents[0].why, rx);
  assert.equal(spec().status, "sandbox", "nothing is switched on");
  assert.deepEqual(f.writes("skill_specs"), [], "and nothing is written");
  assert.notEqual(f.row("build_orders", IDS.order).status, "live");
};

test("refused: the business never connected a required connection, and the message names it in plain words", async () => {
  world();
  const r = await golive();
  refused(r, /^Boise River Dental still needs to connect Booking software \(it has not been asked for yet\), which Weekend Call Desk needs before it can go live\.$/);
  assert.deepEqual(r.out.agents[0].missing_connections, ["Booking software"]);
});

test("refused in every state short of connected and tested", async () => {
  for (const c of [conn("booking", "needed"), conn("booking", "submitted"), conn("booking", "link_made"), conn("booking", "expired", tested), conn("booking", "revoked", tested), conn("booking", "active", null)]) {
    world({ conns: [c] });
    refused(await golive(), /Boise River Dental still needs to connect Booking software/);
  }
});

test("refused the same way when one agent is asked for by name", async () => {
  world();
  refused(await golive({ agent_id: "weekend-call-desk" }), /still needs to connect Booking software/);
});

test("goes live when the required connection is connected and tested", async () => {
  world({ conns: [conn("booking", "active", tested)] });
  const r = await golive();
  assert.deepEqual(r.out, { ok: true, agents: [{ id: "weekend-call-desk", live: true, declared_jobs: false }] });
  assert.equal(spec().status, "live");
});

test("a connection that belongs to another business does not count", async () => {
  world({ conns: [conn("booking", "active", tested, OTHER)] });
  refused(await golive(), /Boise River Dental still needs to connect Booking software/);
});

test("an optional connection that is missing does not hold the teammate back", async () => {
  world({ man: manifest(profile), conns: [] });
  assert.equal((await golive()).out.ok, true);
  assert.equal(spec().status, "live");
  world({ man: manifest(booking, profile), conns: [conn("booking", "active", tested), conn("google_profile", "revoked", tested)] });
  assert.equal((await golive()).out.ok, true);
});

test("a connection the catalog says does not block go-live does not hold the teammate back, though the manifest marks it required", async () => {
  world({ man: manifest({ ...booking, blocks_golive: true }, { slot: "google_profile", label: "Google Business Profile", required: true, blocks_golive: false }), conns: [conn("booking", "active", tested)] });
  assert.equal((await golive()).out.ok, true);
  world({ man: manifest({ ...booking, blocks_golive: true }, { slot: "google_profile", label: "Google Business Profile", required: true, blocks_golive: false }), conns: [] });
  refused(await golive(), /still needs to connect Booking software/);
});

test("a teammate with no manifest goes live as before", async () => {
  world({ man: null });
  assert.equal((await golive()).out.ok, true);
  assert.equal(spec().status, "live");
  assert.equal(f.world.reads.includes("business_connections"), false, "nothing else was read");
});

test("two missing connections are both named", async () => {
  world({ man: manifest(booking, { slot: "calendar", label: "Calendar", required: true }), conns: [conn("calendar", "needed")] });
  refused(await golive(), /still needs to connect Booking software \(it has not been asked for yet\) and Calendar \(it has not been set up yet\), which Weekend Call Desk/);
});

test("the Shelf refusal still comes through exactly as before when the connections are fine", async () => {
  world({ conns: [conn("booking", "active", tested)] });
  f.world.refuse = { skill_specs: "shelf: Twilio is not funded yet" };
  const r = await golive();
  assert.deepEqual(r.out.agents, [{ id: "weekend-call-desk", live: false, why: "Twilio is not funded yet" }]);
});

test("when both are wrong, the connection is named first, and the Shelf one shows once it is fixed", async () => {
  world();
  f.world.refuse = { skill_specs: "shelf: Twilio is not funded yet" };
  refused(await golive(), /still needs to connect Booking software/);
  world({ conns: [conn("booking", "active", tested)] });
  f.world.refuse = { skill_specs: "shelf: Twilio is not funded yet" };
  assert.match((await golive()).out.agents[0].why, /Twilio is not funded yet/);
});

test("fails closed: if the connections cannot be read, nothing goes live", async () => {
  world();
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).includes("business_connections") ? Promise.resolve(new Response(JSON.stringify({ message: "database down" }), { status: 500 })) : real(url, init));
  try {
    const r = await golive();
    assert.equal(r.out.ok, false);
    assert.match(r.out.agents[0].why, /database down/);
    assert.equal(spec().status, "sandbox");
    assert.deepEqual(f.writes("skill_specs"), []);
  } finally { globalThis.fetch = real; }
});

test("on one order, a teammate whose connections are ready goes live and one that is not stays off", async () => {
  world({ conns: [conn("booking", "active", tested)] });
  const t = f.world.tables;
  t.skill_specs.push({ ...structuredClone(t.skill_specs[0]), id: IDS.spec2, skill_id: "weekend-sheet" });
  t.agent_manifests.push({ spec_id: IDS.spec2, business_id: BIZ, skill_id: "weekend-sheet", manifest: { teammate: "Sheet Keeper", connections: [{ slot: "sheets", label: "A spreadsheet", required: true }] } });
  const r = await golive();
  assert.deepEqual(r.out.agents.map((a) => [a.id, a.live]), [["weekend-call-desk", true], ["weekend-sheet", false]]);
  assert.match(r.out.agents[1].why, /Boise River Dental still needs to connect A spreadsheet .*which Sheet Keeper needs/);
  assert.equal(f.row("build_orders", IDS.order).status, "building", "the order is not live while one teammate is held back");
});

test("the tool's description tells the founder about the second refusal", async () => {
  const { tools } = await f.rpc("tools/list");
  assert.match(tools.find((t) => t.name === "forge_golive").description, /connection its manifest marks required is not connected and tested/);
});

test("the connector talks to nobody but its own database in these flows", () => assert.deepEqual(f.world.outside, []));
