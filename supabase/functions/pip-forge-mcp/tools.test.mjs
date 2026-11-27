// The founder connector's whole tool list, and the two sets of tools that were live before their source was in the
// repo: the agent library and the funding tracker. The real index.ts, with the database, the model and pip-shelf faked.
//   node --experimental-strip-types --test supabase/functions/pip-forge-mcp/tools.test.mjs
// No network, no keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootConnector, IDS, tables } from "./harness.mjs";

const f = await bootConnector();

// Every tool the live connector offered on November 18, 2026 (read from the deployed function), by name.
// Taking one away takes it out of Brayden's Forge Board. If that is intended, change this list in the same pull request.
const TOOLS = [
  "forge_queue", "forge_take", "forge_heartbeat", "forge_save", "forge_release", "forge_golive", "forge_settings",
  "shelf_status", "shelf_funded", "shelf_funds", "shelf_mark", "funds_set",
  "library_list", "library_match", "library_file", "library_retire",
  "client_connect", "client_connections", "redteam_pack", "redteam_save",
  // Added November 23, 2026: the pricing email's numbers, from the same quote() the Portal uses.
  "pricing_quote",
  // Added November 23, 2026: the only way a Claude chat starts a Brain scan now that scan-run refuses plain web requests.
  "brain_scan",
  // Added November 27, 2026: Pip's doors (pip-edge) and the integration ladder's written decision.
  "door_make", "door_list", "ladder_pick",
];

test("every tool the live connector offers is still offered", async () => {
  const { tools } = await f.rpc("tools/list");
  const names = tools.map((t) => t.name);
  for (const name of TOOLS) assert.ok(names.includes(name), `${name} has disappeared from the connector`);
  assert.deepEqual([...names].sort(), [...TOOLS].sort(), "a tool was added: add it to TOOLS here so it cannot vanish unnoticed");
  for (const t of tools) {
    assert.ok(typeof t.description === "string" && t.description.length > 40, `${t.name} needs a description`);
    assert.equal(t.inputSchema.type, "object", t.name);
    assert.equal(t.inputSchema.additionalProperties, false, `${t.name} must refuse inputs it does not know`);
  }
  const init = await f.rpc("initialize", { protocolVersion: "2025-06-18" });
  for (const must of [/order queue/, /API Shelf/, /live funding tracker/, /agent library/, /go-live/, /write its jobs/]) assert.match(init.instructions, must);
});

// ---------- the agent library ----------
const PROMPT = "You are Hallie, the front desk for TEST Fork in Meridian. Jordan Reyes owns it. Call 208-555-0100, write hello@testfork.example, or visit 12 Main St. Never quote a price that is not on file. Our rival is Spoon House.";
/** One order whose teammate is ready to be saved at sandbox, with names a skeleton must not keep. */
function world() {
  const t = tables();
  t.build_orders[0].lead_id = "44444444-4444-4444-8444-444444444444";
  t.build_orders[0].domain = "testfork.example";
  t.build_orders[0].brief = { business: "TEST Fork", domain: "testfork.example", industry: "restaurant", rivals: ["Spoon House"], agents: [{ id: "front-desk", name: "Front desk for TEST Fork", power: "answers", lane: "spec", uses: ["web_chat", "calendar"], teammate: { name: "Hallie" } }] };
  t.leads = [{ id: t.build_orders[0].lead_id, name: "Jordan Reyes" }];
  t.skill_specs[0].business = "TEST Fork";
  t.skill_specs[0].brain = { facts: ["Open 9 to 5 at 12 Main St."], agent: { uses: ["web_chat", "calendar"] } };
  return t;
}
const BOARD = { seats: { gate: { system_prompt: PROMPT, critical: 0 }, voice: { never_says: ["cheap"] }, prompt: { tools: ["request_booking"] }, planner_2: { cases: [{ say: "Is TEST Fork open?" }] } }, tests: { passed: 5, total: 5 } };
const save = (more = {}) => f.tool("forge_save", { order_id: IDS.order, agent_id: "front-desk", status: "sandbox", result: BOARD, ...more });

test("a teammate saved at sandbox is filed in the library with names, phones, emails and addresses replaced", async () => {
  f.reset(world());
  const r = await save();
  assert.equal(r.ok, true, r.text);
  assert.equal(r.out.library, "filing a template in the background");
  assert.equal(r.out.jobs, "none declared", "the contract note and the library note come back together");
  const [lib] = f.world.tables.agent_library;
  assert.ok(lib, "a skeleton was filed");
  const text = JSON.stringify(lib);
  for (const leak of ["TEST Fork", "Hallie", "Jordan", "Reyes", "208-555-0100", "hello@testfork.example", "12 Main St", "Spoon House", "testfork"]) assert.equal(text.includes(leak), false, `${leak} is still in the skeleton`);
  for (const tag of ["{{business}}", "{{teammate}}", "{{owner}}", "{{phone}}", "{{email}}", "{{address}}", "{{rival}}"]) assert.ok(lib.skeleton.system_prompt.includes(tag), `${tag} is missing`);
  assert.match(lib.skeleton.system_prompt, /Never quote a price that is not on file\./, "the rules of the job are kept");
  assert.equal("facts" in lib.skeleton || text.includes("Open 9 to 5"), false, "business facts are never kept");
  assert.deepEqual([lib.industry, lib.power, lib.lane, lib.uses, lib.source_spec_id], ["restaurant", "answers", "spec", ["calendar", "web_chat"], IDS.spec]);
  assert.deepEqual(lib.quality.tests, BOARD.tests);
});

test("with no model to turn it into a template, a skeleton is kept but never offered for reuse", async () => {
  f.reset(world());
  await save();
  const [lib] = f.world.tables.agent_library;
  assert.deepEqual([lib.templated, lib.status], [false, "retired"]);
  assert.deepEqual(f.world.asked, [], "no model was called without a key");
  const other = structuredClone(f.world.tables.build_orders[0]); other.id = IDS.spec2; f.world.tables.build_orders.push(other);
  const m = await f.tool("forge_take", { order_id: IDS.spec2 }).then(() => f.tool("library_match", { order_id: IDS.spec2, min_score: 0 }));
  assert.deepEqual(m.out.matches, { "front-desk": [] });
  assert.equal(m.out.library_size, 0);
  const back = await f.tool("library_retire", { library_id: lib.id, retire: false });
  assert.equal(back.ok, false, "one that was never made into a template cannot be put back on offer");
  assert.match(back.text, /no such templated skeleton/);
});

test("with a model, the template is offered to another order, never to its own, and can be retired", async () => {
  f.reset(world());
  f.world.env.ANTHROPIC_API_KEY = "test-model-key";
  f.world.model = (body) => { const m = body.messages[0].content.match(/<skeleton>\n([\s\S]*)\n<\/skeleton>/); return m[1].replace("Meridian", "{{city}}"); };
  try {
    await save();
    const [lib] = f.world.tables.agent_library;
    assert.deepEqual([lib.templated, lib.status], [true, "ready"]);
    assert.equal(f.world.asked.length, 1);
    assert.equal(JSON.stringify(f.world.asked[0]).includes("TEST Fork"), false, "names are replaced before the model sees the skeleton");
    assert.match(lib.skeleton.system_prompt, /\{\{city\}\}/);
    assert.deepEqual((await f.tool("library_match", { order_id: IDS.order, min_score: 0 })).out.matches, { "front-desk": [] }, "an order is never matched with its own teammate");
    const other = structuredClone(f.world.tables.build_orders[0]); other.id = IDS.spec2; f.world.tables.build_orders.push(other);
    const m = await f.tool("library_match", { order_id: IDS.spec2 });
    assert.equal(m.out.matches["front-desk"].length, 1);
    assert.deepEqual([m.out.matches["front-desk"][0].library_id, m.out.matches["front-desk"][0].score], [lib.id, 1]);
    const list = await f.tool("library_list", {});
    assert.deepEqual([list.out.size, list.out.ready], [1, 1]);
    // A build that says which skeleton it started from is counted.
    let counted = null; f.world.rpc.agent_library_reused = (a) => { counted = a; return null; };
    await save({ status: "building", result: { ...BOARD, from_library: lib.id } });
    assert.deepEqual(counted, { lib: lib.id });
    assert.equal((await f.tool("library_retire", { library_id: lib.id })).out.status, "retired");
    assert.equal((await f.tool("library_match", { order_id: IDS.spec2 })).out.matches["front-desk"].length, 0);
    assert.equal((await f.tool("library_retire", { library_id: lib.id, retire: false })).out.status, "ready");
  } finally { delete f.world.env.ANTHROPIC_API_KEY; }
});

test("a save that is refused, or that is not at sandbox, files nothing in the library", async () => {
  f.reset(world());
  assert.equal((await save({ contract: "teammate/1", jobs: [{ id: "x" }] })).ok, false);
  assert.equal((await save({ status: "needs_you" })).ok, true);
  assert.deepEqual(f.world.tables.agent_library, []);
  const r = await f.tool("library_file", { order_id: IDS.order });
  assert.deepEqual(r.out.filing, [], "library_file only takes teammates that reached sandbox");
});

// ---------- the funding tracker ----------
test("shelf_funds reads its numbers from pip-shelf on this project, signed, and from nowhere else", async () => {
  f.reset();
  f.world.funds = (body) => ({ rows: [{ provider: "twilio", balance_usd: 12.5, view: body.view, fresh: body.fresh }] });
  const r = await f.tool("shelf_funds", { view: "budget", fresh: true });
  assert.deepEqual(r.out, { rows: [{ provider: "twilio", balance_usd: 12.5, view: "budget", fresh: true }] });
  assert.deepEqual((await f.tool("shelf_funds", {})).out.rows[0].view, "providers");
  assert.deepEqual(f.world.fundCalls.map((c) => c.internal), [true, true]);
  assert.equal(JSON.stringify(r).includes("test-service-role"), false, "the signing key never comes back to the caller");
  f.world.funds = null;
  const down = await f.tool("shelf_funds", {});
  assert.equal(down.ok, false);
  assert.match(down.text, /funds check failed/);
});

test("funds_set records a balance for a tracked provider and refuses one that is not tracked", async () => {
  f.reset();
  f.world.tables.api_funds = [{ provider: "anthropic", label: "Anthropic", balance_usd: 10, low_usd: 5, last_read_at: "2026-11-18T00:00:00Z" }];
  f.world.funds = () => ({ rows: f.world.tables.api_funds.map((r) => ({ provider: r.provider, balance_usd: r.balance_usd })) });
  const no = await f.tool("funds_set", { provider: "made-up", balance_usd: 5 });
  assert.equal(no.ok, false);
  assert.match(no.text, /not tracked/);
  assert.deepEqual(f.changes(), []);
  const set = await f.tool("funds_set", { provider: "anthropic", balance_usd: 40, low_usd: 8 });
  assert.deepEqual([set.out.ok, set.out.now], [true, { provider: "anthropic", balance_usd: 40 }]);
  const row = f.world.tables.api_funds[0];
  assert.deepEqual([row.balance_usd, row.low_usd, row.last_read_at], [40, 8, null]);
  const add = await f.tool("funds_set", { provider: "anthropic", added_usd: 2.5 });
  assert.equal(add.out.now.balance_usd, 42.5, "a top-up is added to what is there now");
});

test("none of this reaches anything outside Pip's own project and the model", () => {
  assert.deepEqual(f.world.outside, []);
});

// ---------- pricing ----------
const QUOTE = { monthly_usd: 152, first_month_usd: 147.44, promo_pct: 3, setup_usd: 100, hardware_usd: null, included_usd: 80.25,
  agents: [{ label: "Phone agent", after_discount: 136.19 }, { label: "Website chat", after_discount: 27.55 }], connections: [{ tool: "Google Calendar", fee: 40 }], flags: ["placeholder_costs"] };

test("pricing_quote asks the database's quote() as the email, and turns the answer into plain lines", async () => {
  f.reset(tables());
  let asked = null; f.world.rpc.quote = (body) => { asked = body; return QUOTE; };
  const r = await f.tool("pricing_quote", { agents: [{ key: "phone_agent" }, { key: "web_chat" }], connections: [{ tool: "Google Calendar", kind: "oauth" }], promo_pct: 3, order_id: IDS.order });
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(asked.p_opts, { caller: "email", promo_pct: 3, order_id: IDS.order });
  assert.deepEqual(asked.p_agents, [{ key: "phone_agent" }, { key: "web_chat" }]);
  assert.match(r.out.email_lines[0], /\$152 a month \(first month \$147\.44 with the 3% you earned\), including \$80\.25 of usage/);
  assert.match(r.out.email_lines[0], /nothing is ever switched off/);
  assert.ok(r.out.email_lines.includes("- Connecting Google Calendar: $40 setup"));
  assert.match(r.out.note, /placeholder_costs/);
});

test("pricing_quote passes a refusal from quote() back in plain words", async () => {
  f.reset(tables());
  f.world.rpc.quote = () => null;
  const r = await f.tool("pricing_quote", { agents: [{ key: "nope" }] });
  assert.equal(r.ok, false);
});

// ---------- the Brain ----------
test("brain_scan starts a scan the way only Pip may: the service key, and no visitor, so per-visitor limits skip the founder", async () => {
  f.reset(tables()); f.world.fnCalls = [];
  const r = await f.tool("brain_scan", { domain: "https://www.TestFork.example/menu", state: "id", says: "We run out of tables on Fridays." });
  assert.equal(r.ok, true, r.text);
  const [call] = f.world.fnCalls;
  assert.equal(call.path, "/functions/v1/scan-run");
  assert.deepEqual(call.query, { d: "testfork.example", start: "1", state: "ID", says: "We run out of tables on Fridays." });
  assert.equal(call.headers.authorization, "Bearer test-service-role");
  assert.equal(call.headers["x-pip-visitor"], "founder");
});

test("brain_scan reads a scan by id, and refuses an address that is not a website", async () => {
  f.reset(tables()); f.world.fnCalls = [];
  const r = await f.tool("brain_scan", { scan_id: "66666666-6666-4666-8666-666666666666" });
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(f.world.fnCalls[0].query, { scan: "66666666-6666-4666-8666-666666666666" });
  const bad = await f.tool("brain_scan", { domain: "not a site" });
  assert.equal(bad.ok, false);
  assert.match(bad.text, /website address/);
});
