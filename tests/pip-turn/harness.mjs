// Runs the real supabase/functions/pip-turn/index.ts with everything outside it faked:
// the database, the model and Composio. No network, no keys, no cost.
// The function's code is not copied or rewritten. Only its one import line is swapped for the fake database.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const SRC = process.env.PIP_TURN_SRC || fileURLToPath(new URL("../../supabase/functions/pip-turn/index.ts", import.meta.url));
const SHARED = fileURLToPath(new URL("../../supabase/functions/_shared", import.meta.url));
const IMPORT_LINE = 'import { createClient } from "jsr:@supabase/supabase-js@2";';
// Made-up values. They only have to match between the fake caller and the fake function.
export const SERVICE = "test-service-role";
export const SITE_SECRET = "test-site-secret";

export const IDS = {
  business: "11111111-1111-4111-8111-111111111111",
  spec: "22222222-2222-4222-8222-222222222222",
  order: "33333333-3333-4333-8333-333333333333",
};

const clone = (v) => (v === undefined ? v : structuredClone(v));

/** An in-memory stand-in for the Supabase client, covering the calls pip-turn makes. */
function fakeDb(world) {
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.op = "select"; }
    select(_cols, o) { if (o?.head) this.head = true; if (o?.count) this.count = true; return this; }
    insert(rows) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    update(patch) { this.op = "update"; this.patch = patch; return this; }
    upsert(rows, o) { this.op = "upsert"; this.rows = Array.isArray(rows) ? rows : [rows]; this.opts = o || {}; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    not(c, op, v) { if (op !== "is") throw new Error("fake db: not() only supports is"); this.filters.push((r) => (r[c] ?? null) !== v); return this; }
    gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
    lt(c, v) { this.filters.push((r) => r[c] < v); return this; }
    order(c, o) { this.ord = [c, o?.ascending !== false]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    single() { this.one = "single"; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
    run() {
      const all = (world.tables[this.table] ??= []);
      const match = () => all.filter((r) => this.filters.every((f) => f(r)));
      const shape = (rows) => {
        if (this.one) return rows.length ? { data: clone(rows[0]), error: null } : { data: null, error: this.one === "single" ? { message: "no rows" } : null };
        return { data: clone(rows), error: null };
      };
      if (this.op === "select") {
        let rows = match();
        if (this.ord) { const [c, asc] = this.ord; rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
        if (this.head) return { data: null, count: rows.length, error: null };
        if (this.lim != null) rows = rows.slice(0, this.lim);
        return shape(rows);
      }
      if (this.op === "insert") {
        const fail = world.insertErrors[this.table];
        if (fail) return { data: null, error: { message: fail } };
        const made = this.rows.map((r) => ({ id: this.table === "messages" ? ++world.seq : randomUUID(), created_at: new Date().toISOString(), ...clone(r) }));
        all.push(...made);
        world.writes.push({ op: "insert", table: this.table, rows: clone(made) });
        return shape(made);
      }
      if (this.op === "update") {
        const rows = match();
        for (const r of rows) Object.assign(r, clone(this.patch));
        world.writes.push({ op: "update", table: this.table, patch: clone(this.patch), count: rows.length });
        return shape(rows);
      }
      // upsert
      const key = this.opts.onConflict || (this.table === "forge_settings" ? "key" : "id");
      for (const r of this.rows) {
        const hit = all.find((x) => x[key] === r[key]);
        if (hit) { if (!this.opts.ignoreDuplicates) Object.assign(hit, clone(r)); } else all.push({ enabled: true, ...clone(r) });
      }
      world.writes.push({ op: "upsert", table: this.table, rows: clone(this.rows) });
      return { data: null, error: null };
    }
  }
  return {
    from: (t) => new Query(t),
    rpc: async (name, args) => {
      world.writes.push({ op: "rpc", name, args: clone(args) });
      if (name === "pip_ok") return { data: args.p_secret === SITE_SECRET, error: null };
      // The one outbound gate, as the database does it: email goes on to the email gate, with the same arguments.
      if (name === "outbound_gate" && !world.rpc.outbound_gate) {
        if (world.rpc.outbound_paused) return { data: { allowed: false, reason: "paused" }, error: null };
        if (args.p_channel !== "email") return { data: world.rpc.outbound_other ? world.rpc.outbound_other(args, world) : { allowed: true }, error: null };
        const inner = { p_business: args.p_business, p_spec: args.p_spec, p_to: args.p_to, p_given_in_chat: args.p_given_in_chat };
        world.writes.push({ op: "rpc", name: "portal_email_gate", args: clone(inner) });
        return { data: world.rpc.portal_email_gate(inner, world), error: null };
      }
      if (world.rpc[name]) return { data: world.rpc[name](args, world), error: null };
      return { data: null, error: null };
    },
  };
}

const fresh = () => new Date().toISOString();

/** A TEST business with one Board-built teammate, a calendar and an email connection. Tests change what they need. */
export function baseTables() {
  return {
    skill_specs: [{ id: IDS.spec, status: "live", skill_id: "front-desk", order_id: IDS.order, business: "TEST Fork",
      spec: { name: "Front desk", board: { seats: { gate: { system_prompt: "You are Hallie, the front desk for TEST Fork." } } } },
      brain: { facts: ["Open 9 to 5, Monday to Friday."] } }],
    build_orders: [{ id: IDS.order, business_id: IDS.business }],
    businesses: [{ id: IDS.business, name: "TEST Fork", status: "active", timezone: "America/Boise", composio_user_id: "pip_test_fork", owner_email: "owner@testfork.example" }],
    agent_manifests: [{ spec_id: IDS.spec, manifest: { teammate: "Hallie", uses: ["notify_owner", "capture_lead", "request_booking", "calendar", "email"] } }],
    forge_settings: [],
    connection_catalog: [
      { slot: "calendar", label: "Calendar", blocks: ["calendar"] },
      { slot: "email", label: "Email", blocks: ["email"] },
      { slot: "sheet", label: "Sheet", blocks: ["data_sink"] },
    ],
    business_connections: [
      { id: "c-cal", business_id: IDS.business, slot: "calendar", status: "active", choice: "googlecalendar", connected_account_id: "ca_cal", detail: {} },
      { id: "c-mail", business_id: IDS.business, slot: "email", status: "active", choice: "gmail", connected_account_id: "ca_mail", detail: {} },
    ],
    client_connections: [],
    agent_pauses: [],
    tool_catalog: [
      // record and level say what a row touches and how (supabase/migrations/20261117_01_job_runner.sql). A row
      // without them is covered by no permission, so no teammate is offered it.
      { slug: "GOOGLECALENDAR_EVENTS_LIST", block: "calendar", toolkit: "googlecalendar", access: "read", label: "checked the calendar", enabled: true, record: "busy_time", level: "read",
        shape: "busy_only", hide: ["q"], fixed: { calendarId: "primary" }, schema_at: fresh(),
        schema: { description: "List events.", input: { type: "object", properties: { timeMin: { type: "string" }, timeMax: { type: "string" }, q: { type: "string" }, calendarId: { type: "string" } }, required: ["timeMin", "calendarId"] } } },
      { slug: "GMAIL_SEND_EMAIL", block: "email", toolkit: "gmail", access: "write", label: "sent an email", enabled: true, record: "message", level: "add",
        guard: "email", hide: ["bcc", "from_email", "include_signature"], fixed: {}, schema_at: fresh(),
        schema: { description: "Send an email.", input: { type: "object", properties: { recipient_email: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, bcc: { type: "string" } }, required: ["recipient_email", "body"] } } },
    ],
    conversations: [], messages: [], notifications: [], usage_events: [], portal_notices: [],
  };
}

// ---- what the fake model can say ----
let n = 0;
export const use = (name, input = {}) => ({ type: "tool_use", id: "tu_" + ++n, name, input });
export const says = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 20 } });
export const acts = (...uses) => ({ content: uses, stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 20 } });

let dir = null, loads = 0;

/**
 * Starts one isolated copy of pip-turn.
 * opts.tables: starting rows. opts.model: a list of answers (or functions of the request) the fake model gives in order.
 * opts.composio(path, body, method): returns { status, json } for a Composio call.
 * opts.rpc: { name: (args, world) => data } stands in for database functions the fake does not know.
 */
export async function boot(opts = {}) {
  const world = {
    tables: opts.tables || baseTables(), writes: [], insertErrors: {}, seq: 0,
    // The database's email permission functions say yes by default, as they do for a customer who has not opted out.
    rpc: { portal_email_gate: () => ({ allowed: true }), portal_email_in: () => ({ allowed: true }), portal_outbound_sent: () => ({ recorded: true }), ...(opts.rpc || {}) },
    model: { script: [...(opts.model || [])], calls: [] },
    composio: { calls: [], handler: opts.composio || (() => ({ status: 404, json: { error: "not mocked" } })) },
    outside: [],
  };
  const env = { SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: SERVICE, ANTHROPIC_API_KEY: "test-model-key", COMPOSIO_API_KEY: "test-composio-key", ...(opts.env || {}) };
  let handler = null;
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
  globalThis.__pipTurnMock = { createClient: () => fakeDb(world) };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : null;
    const reply = (status, json) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    if (u === "https://api.anthropic.com/v1/messages") {
      world.model.calls.push(body);
      const next = world.model.script.shift();
      const out = typeof next === "function" ? next(body) : next;
      if (out === null) return reply(500, { error: "model down" });
      return reply(200, out || says("Okay."));
    }
    if (u.startsWith("https://backend.composio.dev/api/v3.1")) {
      const path = u.slice("https://backend.composio.dev/api/v3.1".length);
      world.composio.calls.push({ path, method: init.method || "GET", body });
      const r = world.composio.handler(path, body, init.method || "GET");
      return reply(r.status, r.json);
    }
    world.outside.push(u); // pip-turn should talk to nobody else
    return reply(599, {});
  };

  const src = readFileSync(SRC, "utf8");
  if (!src.includes(IMPORT_LINE)) throw new Error("pip-turn's import line changed. Update IMPORT_LINE in tests/pip-turn/harness.mjs.");
  if (!dir) {
    // The copy sits in a folder laid out like supabase/functions/, so "../_shared/..." imports find the real shared code.
    const root = mkdtempSync(join(tmpdir(), "pip-turn-"));
    dir = join(root, "pip-turn"); mkdirSync(dir);
    if (existsSync(SHARED)) symlinkSync(SHARED, join(root, "_shared"), "dir");
  }
  const file = join(dir, `index.${++loads}.ts`);
  writeFileSync(file, src.replace(IMPORT_LINE, "const { createClient } = globalThis.__pipTurnMock;"));
  const quiet = console.error; console.error = () => {};
  await import(pathToFileURL(file).href);
  if (!handler) throw new Error("pip-turn did not call Deno.serve");

  const call = async (path, body, headers = { authorization: "Bearer " + SERVICE }, method = "POST") => {
    const res = await handler(new Request("https://test.invalid/functions/v1/pip-turn" + path, { method, headers: { "content-type": "application/json", ...headers }, ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}) }));
    return { status: res.status, json: await res.json() };
  };
  return {
    world, call,
    turn: (message, extra = {}, headers) => call("/turn", { skill: IDS.spec, message, ...extra }, headers),
    /** Tool calls that really reached Composio (not schema lookups or session set-up). */
    executed: () => world.composio.calls.filter((c) => /\/execute/.test(c.path)),
    /** What the model was told came back from its tools, as one string per result. */
    toolResults: () => world.model.calls.flatMap((c) => c.messages).filter((m) => m.role === "user" && Array.isArray(m.content)).flatMap((m) => m.content).filter((x) => x.type === "tool_result"),
    rpcs: (name) => world.writes.filter((w) => w.op === "rpc" && w.name === name),
    inserts: (table) => world.writes.filter((w) => w.op === "insert" && w.table === table).flatMap((w) => w.rows),
    restore: () => { console.error = quiet; },
  };
}
