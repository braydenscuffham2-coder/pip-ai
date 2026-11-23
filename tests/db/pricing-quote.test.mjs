// supabase/migrations/20261123_06_pricing_quote.sql on an in-memory Postgres: the price book, the rules and quote().
// Skips itself when PGlite is not installed (npm i --no-save @electric-sql/pglite to run it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261123_06_pricing_quote.sql", import.meta.url)), "utf8");

let shared = null;
async function db() {
  if (shared) return shared;
  shared = new PGlite();
  await shared.exec("create role anon; create role authenticated; create role service_role;");
  await shared.exec(sql);
  return shared;
}
const q = async (agents, connections = [], opts = {}) => (await (await db()).query("select public.quote($1::jsonb, $2::jsonb, $3::jsonb) as r", [JSON.stringify(agents), JSON.stringify(connections), JSON.stringify(opts)])).rows[0].r;
const near = (a, b, msg) => assert.ok(Math.abs(Number(a) - b) < 0.011, `${msg}: ${a} vs ${b}`);
const F = 40 / 10; // fixed platform total over the active-agent floor (placeholders)

test("it runs twice without error", { skip: !PGlite }, async () => {
  await (await db()).exec(sql);
});

// One test per tier: the cost parts add up, and the price is max(floor, cost x tier multiplier).
const TIERS = [
  ["light", "web_chat", { L: 300 * (3000 * 1 + 300 * 5) / 1e6 }, 4.0, 29],
  ["standard", "text_followup", { L: 200 * (3000 * 1 + 300 * 5) / 1e6, T: 400 * 0.0083 + 10 }, 3.5, 49],
  ["heavy", "phone_agent", { L: 150 * (8000 * 1 + 800 * 5) / 1e6, V: 450 * (0.0085 + 0.0048 + 0.08) }, 3.0, 99],
  ["onsite", "camera_count", {}, 2.5, 79],
  ["operator", "content_posting", { L: 30 * (12000 * 2 + 2500 * 10) / 1e6, S: 30 * 0.01 }, 3.0, 79],
];
for (const [tier, key, parts, m, floor] of TIERS) {
  test(`${tier}: cost is L+V+T+S+F and the price is max(${floor}, cost x ${m})`, { skip: !PGlite }, async () => {
    const r = await q([{ key }]);
    const [line] = r.agents;
    const cost = (parts.L ?? 0) + (parts.V ?? 0) + (parts.T ?? 0) + (parts.S ?? 0) + F;
    near(line.cost.total, cost, "cost");
    assert.equal(line.tier, tier);
    assert.equal(Number(line.multiplier), m);
    near(line.price, Math.max(floor, Math.round(cost * m * 100) / 100), "price");
  });
}

test("a busy agent's price follows its cost times the multiplier, above the floor", { skip: !PGlite }, async () => {
  const r = await q([{ key: "calendar_booking", overrides: { runs_per_month: 20000 } }]);
  const cost = 20000 * (5000 * 1 + 400 * 5) / 1e6 + F;
  near(r.agents[0].price, Math.round(cost * 3.5 * 100) / 100, "standard x 3.5");
  assert.equal(r.agents[0].floor_applied, false);
});

test("the bundle discount grows 5% an agent and stops at 15%", { skip: !PGlite }, async () => {
  for (const [n, d] of [[1, 0], [2, 0.05], [3, 0.10], [4, 0.15], [8, 0.15]]) {
    const r = await q(Array.from({ length: n }, () => ({ key: "web_chat" })));
    near(r.discount, d, `${n} agents`);
    near(r.monthly_usd, Math.ceil(29 * n * (1 - d) + 49), `${n} agents monthly`);
  }
});

test("a package is never priced under 1.3 times its cost: it is raised and flagged", { skip: !PGlite }, async () => {
  const d = await db();
  await d.query(`insert into public.price_settings (version, tier_multiplier, tier_floor, base_fee, setup_base, setup_multiplier)
    values (90, '{"light":1.2,"standard":1.2,"heavy":1.2,"onsite":1.2,"operator":1.2}', '{"light":0,"standard":0,"heavy":0,"onsite":0,"operator":0}', 0, 40, '{"oauth":1}')`);
  const r = await q([{ key: "phone_agent" }], [], { settings_version: 90 });
  near(r.monthly_usd, Math.ceil(1.3 * Number(r.expected_cost_usd) * 100 / 100), "raised to 1.3x cost");
  assert.ok(r.flags.includes("raised_to_cost_floor"));
  await d.query("delete from public.price_settings where version = 90");
});

test("setup: base x 1.0 / 1.5 / 2.0 / 2.5 by connection kind, plus registration work", { skip: !PGlite }, async () => {
  const r = await q([{ key: "web_chat" }], [
    { tool: "Google Calendar", kind: "oauth" }, { tool: "Supplier portal", kind: "password" },
    { tool: "Bank portal", kind: "mfa" }, { tool: "Social site", kind: "forbidden" }], { registrations: ["10dlc"] });
  assert.deepEqual(r.connections.map((c) => Number(c.fee)), [40, 60, 80, 100]);
  assert.equal(Number(r.setup_usd), 40 + 60 + 80 + 100 + 60);
});

test("hardware: at cost for the first three test customers, cost plus margin after; a missing box cost is flagged, not guessed", { skip: !PGlite }, async () => {
  const d = await db();
  const missing = await q([{ key: "camera_count" }]);
  assert.equal(missing.hardware_usd, null);
  assert.ok(missing.flags.includes("box_cost_missing"));
  await d.query(`insert into public.price_settings (version, tier_multiplier, tier_floor, base_fee, setup_base, setup_multiplier, box_cost, box_shipping, hardware_margin)
    select 91, tier_multiplier, tier_floor, base_fee, setup_base, setup_multiplier, 400, 20, 0.30 from public.price_settings where version = 1`);
  assert.equal(Number((await q([{ key: "camera_count" }], [], { settings_version: 91, customer_rank: 2 })).hardware_usd), 420);
  assert.equal(Number((await q([{ key: "camera_count" }], [], { settings_version: 91, customer_rank: 4 })).hardware_usd), Math.ceil(420 * 1.3));
  await d.query("delete from public.price_settings where version = 91");
});

test("included usage is 1.5 times expected cost; nothing in a quote can cut a customer off", { skip: !PGlite }, async () => {
  const r = await q([{ key: "phone_agent" }, { key: "web_chat" }]);
  near(r.included_usd, 1.5 * Number(r.expected_cost_usd), "included");
  assert.deepEqual(Object.keys(r.rates).sort(), ["conversation", "sms", "voice_minute"], "usage above it is billed at the rates, never stopped");
  assert.equal(JSON.stringify(r).includes("cutoff"), false);
});

test("the loading-game discount is a first-month line, outside the 15% cap, at most 5%", { skip: !PGlite }, async () => {
  const r = await q([{ key: "web_chat" }], [], { promo_pct: 9 });
  assert.equal(Number(r.promo_pct), 5);
  near(r.first_month_usd, Number(r.monthly_usd) * 0.95, "first month");
});

test("the same inputs give the same hash, and every quote is stored with what went in", { skip: !PGlite }, async () => {
  const d = await db();
  const before = (await d.query("select count(*)::int n from public.quotes")).rows[0].n;
  const a = await q([{ key: "web_chat" }], [{ tool: "Calendar", kind: "oauth" }], { caller: "portal", business_id: "11111111-1111-4111-8111-111111111111" });
  const b = await q([{ key: "web_chat" }], [{ tool: "Calendar", kind: "oauth" }], { caller: "email" });
  assert.equal(a.sha256, b.sha256, "who asked does not change the price");
  assert.notEqual(a.quote_id, b.quote_id);
  const rows = (await d.query("select caller, inputs, outputs from public.quotes where id in ($1, $2) order by caller", [a.quote_id, b.quote_id])).rows;
  assert.deepEqual(rows.map((x) => x.caller), ["email", "portal"]);
  assert.equal(rows[0].outputs.monthly_usd, a.monthly_usd);
  assert.equal((await d.query("select count(*)::int n from public.quotes")).rows[0].n, before + 2);
});

test("the margin check counts the base fee's own cost, and flags a package under 70%", { skip: !PGlite }, async () => {
  const r = await q([{ key: "phone_agent", overrides: { voice_minutes: 3000 } }]);
  near(r.gross_margin, 1 - (Number(r.expected_cost_usd) + 8) / Number(r.monthly_usd), "margin");
  assert.equal(r.flags.includes("below_target_margin"), Number(r.gross_margin) < 0.7);
});

test("bad inputs are refused, not guessed", { skip: !PGlite }, async () => {
  await assert.rejects(q([]), /at least one agent/);
  await assert.rejects(q([{ key: "no_such_agent" }]), /unknown agent/);
  await assert.rejects(q([{ key: "web_chat" }], [{ tool: "x", kind: "magic" }]), /connection kind/);
  await assert.rejects(q([{ key: "web_chat" }], [], { registrations: ["fax"] }), /unknown registration/);
  await assert.rejects(q([{ key: "web_chat" }], [], { caller: "stranger" }), /unknown caller/);
});

test("only the service role can run quote() or read the book", { skip: !PGlite }, async () => {
  const d = await db();
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await d.query("select has_function_privilege($1, 'public.quote(jsonb, jsonb, jsonb)', 'execute') ok", [role])).rows[0].ok, false, role);
    for (const t of ["public.price_book", "public.price_settings", "public.quotes"]) assert.equal((await d.query("select has_table_privilege($1, $2, 'select') ok", [role, t])).rows[0].ok, false, `${role} ${t}`);
  }
  assert.equal((await d.query("select has_function_privilege('service_role', 'public.quote(jsonb, jsonb, jsonb)', 'execute') ok")).rows[0].ok, true);
});
