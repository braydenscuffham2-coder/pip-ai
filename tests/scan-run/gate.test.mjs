// Who may start a Brain scan. Runs the real supabase/functions/scan-run/index.ts with the database and every outside
// call faked. No network, no keys, no cost.
//   node --test tests/scan-run/gate.test.mjs
// Before November 23, 2026 any web request with ?start=1 started a scan on Pip's Anthropic key, and the per-visitor
// limit trusted an address the caller could write itself. These tests pin the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVICE = "test-service-role", SITE_SECRET = "test-site-secret";
const world = { inserts: [], reads: [], calls: [] };
let handler = null;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: SERVICE, ANTHROPIC_API_KEY: "test-model-key" })[k] }, serve: (h) => { handler = h; } };
globalThis.EdgeRuntime = { waitUntil: () => {} };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
  const reply = (status, j) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
  world.calls.push({ path: u.pathname, method });
  if (u.pathname === "/rest/v1/rpc/pip_ok") return reply(200, body?.p_secret === SITE_SECRET);
  if (u.pathname.startsWith("/rest/v1/")) {
    const table = u.pathname.slice("/rest/v1/".length);
    if (method === "POST") { world.inserts.push({ table, body }); return reply(201, []); }
    world.reads.push({ table, query: u.search });
    return reply(200, []);
  }
  return reply(200, { ok: true }); // the chain kicking itself
};
await import(pathToFileURL(fileURLToPath(new URL("../../supabase/functions/scan-run/index.ts", import.meta.url))).href);
if (!handler) throw new Error("scan-run did not call Deno.serve");

const start = async (headers = {}) => {
  world.inserts = []; world.reads = [];
  const res = await handler(new Request("https://test.invalid/functions/v1/scan-run?d=testfork.example&start=1", { headers }));
  return { status: res.status, json: await res.json() };
};
const jobRow = () => world.inserts.find((w) => w.table === "scan_jobs")?.body;

test("a plain web request cannot start a scan, and is told where to go instead", async () => {
  const r = await start();
  assert.equal(r.status, 403);
  assert.equal(r.json.error, "use_pip_forge");
  assert.match(r.json.message, /brain_scan/);
  assert.equal(jobRow(), undefined, "no job was made");
});

test("a wrong service key or a wrong site secret is refused the same way", async () => {
  assert.equal((await start({ authorization: "Bearer not-the-key" })).status, 403);
  assert.equal((await start({ "x-pip-secret": "nope" })).status, 403);
  assert.equal(jobRow(), undefined);
});

test("the Forge connector (the service key) starts a scan; the founder carries no visitor, so per-visitor limits skip it", async () => {
  const r = await start({ authorization: `Bearer ${SERVICE}`, "x-pip-visitor": "founder" });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(jobRow().ip, "", "the database trigger skips its per-visitor count for an empty visitor");
  assert.equal(world.reads.some((x) => x.table === "events" && /scan_run/.test(x.query)), false, "no per-visitor hour count for the founder");
});

test("Pip's own server (the site secret) starts a scan and names the visitor by a hash, never a raw address", async () => {
  const r = await start({ "x-pip-secret": SITE_SECRET, "x-pip-visitor": "a1b2c3d4e5f60718", "x-forwarded-for": "203.0.113.9" });
  assert.equal(r.status, 200);
  assert.equal(jobRow().ip, "a1b2c3d4e5f60718");
  const ev = world.inserts.find((w) => w.table === "events")?.body;
  assert.equal(ev.detail.ip, "a1b2c3d4e5f60718");
  assert.equal(JSON.stringify(world.inserts).includes("203.0.113.9"), false, "the raw address is stored nowhere");
});

test("a visitor value that is not a hash is not trusted as one", async () => {
  const r = await start({ "x-pip-secret": SITE_SECRET, "x-pip-visitor": "203.0.113.9" });
  assert.equal(r.status, 200);
  assert.equal(jobRow().ip, "unknown");
});

test("reading a scan's progress stays open: it costs nothing", async () => {
  const res = await handler(new Request("https://test.invalid/functions/v1/scan-run?scan=66666666-6666-4666-8666-666666666666"));
  assert.notEqual(res.status, 403);
});
