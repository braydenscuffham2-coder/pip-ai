// Runs the real pip-forge-mcp/index.ts and pip-forge/index.ts with the database, the model and every vendor faked.
// No network, no keys, no cost. The functions' code is not copied or changed: they talk to the database through
// fetch, so a fake fetch that answers like the database's REST door is all that stands in.
//   const f = await bootConnector(); f.world.tables = tables(); await f.tool("forge_save", {...}); f.writes("skill_specs")
import { createHash, randomUUID } from "node:crypto";

// Made-up values. They only have to match between the fake caller and the fake function.
export const KEY = "test_founder_key_0123456789abcdefghij";
export const FOUNDER = "test-founder-token";
export const IDS = { order: "33333333-3333-4333-8333-333333333333", spec: "22222222-2222-4222-8222-222222222222", spec2: "55555555-5555-4555-8555-555555555555" };

/** What exists today in the test world: three setup steps with reviewed tools, three with nothing behind them. */
export const catalog = () => ({
  connection_catalog: [
    { slot: "calendar", label: "Calendar", blocks: ["calendar"] },
    { slot: "email", label: "Email", blocks: ["email"] },
    { slot: "sheet", label: "Spreadsheet", blocks: ["data_sink", "sheets"] },
    { slot: "booking", label: "Booking software", blocks: ["booking_app"] },
    { slot: "pos", label: "Point of sale", blocks: ["pos"] },
    { slot: "crm", label: "Customer list", blocks: ["crm"] },
  ],
  tool_catalog: [
    { slug: "GOOGLECALENDAR_EVENTS_LIST", block: "calendar", toolkit: "googlecalendar", enabled: true, record: "busy_time", level: "read" },
    { slug: "GOOGLECALENDAR_CREATE_EVENT", block: "calendar", toolkit: "googlecalendar", enabled: true, record: "appointment", level: "add" },
    { slug: "GMAIL_SEND_EMAIL", block: "email", toolkit: "gmail", enabled: true, record: "message", level: "add" },
    { slug: "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", block: "data_sink", toolkit: "googlesheets", enabled: true, record: "row", level: "add" },
    // Found automatically for an extra product: not reviewed for jobs, so it must never count.
    { slug: "AIRTABLE_CREATE_RECORD", block: "any_tool", toolkit: "airtable", enabled: true, record: null, level: null },
    // Reviewed but switched off: must never count either.
    { slug: "POS_LIST_ITEMS", block: "pos", toolkit: "square", enabled: false, record: "item", level: "read" },
  ],
});

/** One order with one Board-built teammate that has no declared jobs yet. Tests change what they need. */
export const tables = () => ({
  founder_keys: [{ id: 1, key_hash: createHash("sha256").update(KEY).digest("hex"), revoked_at: null, last_used_at: new Date().toISOString() }],
  build_orders: [{ id: IDS.order, code: "PIP-TEST", status: "building", engine: "board", brief: { business: "TEST Fork", agents: [{ id: "front-desk", name: "Front desk", uses: ["calendar"] }] }, board: null }],
  skill_specs: [{ id: IDS.spec, order_id: IDS.order, skill_id: "front-desk", status: "testing", forge_stage: "board:building", domain: "testfork.example", spec: { board: { seats: { gate: { system_prompt: "You are Hallie, the front desk for TEST Fork." } } } }, brain: { facts: [] } }],
  build_jobs: [], events: [], forge_settings: [], notifications: [], leads: [], agent_library: [], api_funds: [],
  ...catalog(),
});

const clone = (v) => (v === undefined ? v : structuredClone(v));
const world = { tables: {}, log: [], reads: [], rpc: {}, model: null, funds: null, outside: [], pending: [], refuse: {}, env: {} };

function matcher(params) {
  const tests = [];
  for (const [col, raw] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(col)) continue;
    const i = raw.indexOf("."), op = raw.slice(0, i), val = raw.slice(i + 1);
    const get = (r) => r[col];
    if (op === "eq") tests.push((r) => String(get(r)) === val);
    else if (op === "neq") tests.push((r) => String(get(r)) !== val);
    else if (op === "in") { const set = val.slice(1, -1).split(","); tests.push((r) => set.includes(String(get(r)))); }
    else if (op === "is") tests.push((r) => (val === "null" ? (get(r) ?? null) === null : get(r) === (val === "true")));
    else throw new Error(`fake database: filter ${col}=${raw} is not supported`);
  }
  return (r) => tests.every((t) => t(r));
}
/** `spec->board` style picks, as the database returns them: under the last name. Whole rows otherwise. */
function pick(row, select) {
  const out = clone(row);
  for (const part of (select || "").split(",")) if (part.includes("->")) {
    const path = part.split(/->>?/), last = path[path.length - 1];
    out[last] = path.reduce((v, k) => (v == null ? undefined : v[k]), row) ?? null;
  }
  return out;
}

function install(env) {
  world.env = env;
  globalThis.Deno = { env: { get: (k) => world.env[k] }, serve: (h) => { globalThis.__handler = h; } };
  globalThis.EdgeRuntime = { waitUntil: (p) => { world.pending.push(Promise.resolve(p).catch(() => {})); } };
  const reply = (status, body) => new Response(body === null ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    if (u.hostname === "api.anthropic.com") { world.asked.push(body); const text = world.model?.(body) ?? "{}"; return reply(200, { content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }); }
    if (u.hostname !== "test.invalid") { world.outside.push(String(url)); return reply(599, {}); }
    if (u.pathname === "/functions/v1/pip-shelf/funds") { // the funding tracker's numbers live in pip-shelf
      world.fundCalls.push({ body, internal: init.headers?.["x-pip-internal"] === world.env.SUPABASE_SERVICE_ROLE_KEY });
      return world.funds ? reply(200, world.funds(body)) : reply(500, { error: "not mocked" });
    }
    if (u.pathname.startsWith("/functions/v1/")) return reply(200, { ok: true }); // the Forge kicking its own queue
    const path = u.pathname.replace("/rest/v1/", "");
    if (path.startsWith("rpc/")) {
      const name = path.slice(4);
      world.log.push({ op: "rpc", name, args: clone(body) });
      return reply(200, world.rpc[name] ? world.rpc[name](body) : null);
    }
    const all = (world.tables[path] ??= []), hit = matcher(u.searchParams);
    if (method === "GET") { world.reads.push(path); return reply(200, all.filter(hit).map((r) => pick(r, u.searchParams.get("select")))); }
    if (method === "PATCH") {
      const rows = all.filter(hit);
      if (world.refuse?.[path]) return reply(400, { message: world.refuse[path] });
      for (const r of rows) Object.assign(r, clone(body));
      world.log.push({ op: "patch", table: path, body: clone(body), count: rows.length });
      return reply(200, clone(rows));
    }
    if (method === "POST") {
      const made = (Array.isArray(body) ? body : [body]).map((r) => ({ ...clone(r) }));
      const key = u.searchParams.get("on_conflict"); // "insert, or update the row that has the same value here"
      for (const r of made) {
        const had = key ? all.find((x) => x[key] === r[key]) : null;
        if (had) Object.assign(had, r); else all.push(path === "agent_library" ? Object.assign(r, { id: randomUUID(), reuse_count: 0, created_at: new Date().toISOString(), ...r }) : r);
      }
      world.log.push({ op: "insert", table: path, rows: clone(made) });
      return reply(201, clone(made));
    }
    throw new Error(`fake database: ${method} is not supported`);
  };
}

function common() {
  const reset = (t = tables()) => { world.tables = t; world.log = []; world.reads = []; world.rpc = {}; world.model = null; world.asked = []; world.funds = null; world.fundCalls = []; world.pending = []; world.refuse = {}; };
  reset();
  return {
    world,
    /** Every change made to this table since the last reset (the sign-in's own bookkeeping aside). */
    writes: (table) => world.log.filter((w) => w.table === table),
    changes: () => world.log.filter((w) => w.table !== "founder_keys"),
    row: (table, id) => world.tables[table].find((r) => r.id === id),
    reset,
    settle: async () => { while (world.pending.length) await world.pending.shift(); },
  };
}

/** Starts the founder connector. `tool(name, args)` calls one of its tools the way Claude does. */
export async function bootConnector() {
  install({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" });
  await import("./index.ts");
  const handler = globalThis.__handler;
  if (!handler) throw new Error("pip-forge-mcp did not call Deno.serve");
  let n = 0;
  const rpc = async (method, params) => {
    const res = await handler(new Request(`https://test.invalid/functions/v1/pip-forge-mcp/${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) }));
    return (await res.json()).result;
  };
  return {
    ...common(), rpc,
    /** { ok, out } for an answer, { ok: false, text } for a refusal or an error. */
    tool: async (name, args) => {
      const r = await rpc("tools/call", { name, arguments: args });
      while (world.pending.length) await world.pending.shift(); // work the connector leaves running after it answers
      return r.isError ? { ok: false, text: r.content[0].text } : { ok: true, out: r.structuredContent };
    },
  };
}

/** Starts pip-forge (the API-key engine and the founder console). `console(action, spec)` taps a console button. */
export async function bootForge() {
  install({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-service-role", FOUNDER_TOKEN: FOUNDER, ANTHROPIC_API_KEY: "test-model-key" });
  await import("../pip-forge/index.ts");
  const handler = globalThis.__handler;
  if (!handler) throw new Error("pip-forge did not call Deno.serve");
  const post = async (path, body = {}) => {
    const res = await handler(new Request(`https://test.invalid/pip-forge${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, json: await res.json() };
  };
  return { ...common(), post, console: (action, spec) => post(`/console?token=${FOUNDER}&action=${action}&order=${IDS.order}&spec=${spec}`) };
}
