// site-kit's ways in, its daily spending cap and its check code, through the real index.ts with the database and
// every outside service faked.
//   node --experimental-strip-types --test supabase/functions/site-kit/routes.test.mjs
// No network, no keys, no cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
// Made-up values. If one ever shows up in an answer, a test fails.
const KEYS = { SUPABASE_SERVICE_ROLE_KEY: "test-service-role", GOOGLE_PLACES_API_KEY: "test-places-key", FIRECRAWL_API_KEY: "test-firecrawl-key", DATAFORSEO_LOGIN: "test-dfs-login", DATAFORSEO_PASSWORD: "test-dfs-password" };
const CODE = "test-check-code";
const D = "testfork.example";

// ---- everything outside the function, faked ----
const world = { env: {}, builds: {}, spent: [], take: () => true, takeStatus: 200, puts: [], db: [], outside: [], vendor: null, pending: [] };
const reset = () => Object.assign(world, { builds: {}, spent: [], take: () => true, takeStatus: 200, puts: [], db: [], outside: [], vendor: null, pending: [] });
const reply = (status, body) => new Response(body === null ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.EdgeRuntime = { waitUntil: (p) => { world.pending.push(Promise.resolve(p).catch(() => {})); } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  if (u.hostname !== "test.invalid") {
    const call = { host: u.hostname, path: u.pathname, method, body, headers: { ...(init.headers || {}) } };
    world.outside.push(call);
    const made = world.vendor?.(call);
    return made ? reply(made.status ?? 200, made.json ?? {}) : reply(404, {});
  }
  const path = u.pathname.replace("/rest/v1/", "");
  world.db.push({ method, path, body });
  if (path === "rpc/spend_take") { world.spent.push(body); return world.takeStatus === 200 ? reply(200, world.take(body)) : reply(world.takeStatus, { message: "down" }); }
  if (path === "rpc/site_build_put") { world.puts.push(body); const b = world.builds[body.d]; if (b) { if (body.v === null) delete b.parts[body.k]; else b.parts[body.k] = body.v; } return reply(200, null); }
  if (path === "spend_daily") return reply(200, [{ kind: "dfs_usd", units: 1.25 }, { kind: "scans", units: 7 }]);
  if (path === "site_builds") {
    const d = (u.searchParams.get("domain") || "").replace("eq.", "");
    if (method === "GET") return reply(200, world.builds[d] ? [structuredClone(world.builds[d])] : []);
    if (method === "POST") { world.builds[body.domain] = { status: body.status, parts: body.parts, created_at: body.created_at, updated_at: body.updated_at }; return reply(201, null); }
    if (method === "PATCH" && world.builds[d]) Object.assign(world.builds[d], body);
    return reply(200, null);
  }
  throw new Error(`fake database: ${method} ${path} is not supported`);
};
let loads = 0;
/** Starts one copy of site-kit with these secrets. Limits and the check code are read once, when it starts. */
async function boot(env = {}) {
  world.env = { SUPABASE_URL: "https://test.invalid", ...KEYS, ...env };
  let handler = null;
  globalThis.Deno = { env: { get: (k) => world.env[k] }, serve: (h) => { handler = h; } };
  const quiet = [console.warn, console.error]; console.warn = () => {}; console.error = () => {};
  const mod = await import(`./index.ts?copy=${++loads}`);
  if (!handler) throw new Error("site-kit did not call Deno.serve");
  const get = async (query) => {
    const res = await handler(new Request(`https://test.invalid/functions/v1/site-kit?${query}`));
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) };
  };
  return { mod, get, settle: async () => { while (world.pending.length) await world.pending.shift(); }, loud: () => { [console.warn, console.error] = quiet; } };
}
const today = () => new Date().toISOString();
const saved = (parts = {}, more = {}) => { world.builds[D] = { status: "done", parts, created_at: today(), updated_at: today(), ...more }; };
const noKeys = (text, what) => { for (const v of [...Object.values(KEYS), CODE]) assert.equal(String(text).includes(v), false, `${what} carries a key value`); };
const dfsCalls = () => world.outside.filter((c) => c.host === "api.dataforseo.com");
const SELF = { id: "place_1", name: "TEST Fork", d: D, phones: new Set() };
const BOISE = { latitude: 43.6, longitude: -116.2 };

const off = await boot();              // no check code set: the checks are off
const on = await boot({ SITE_KIT_CHECK_CODE: CODE, SCANS_DAILY: "2", DFS_DAILY_USD: "1.5" });

test("the ways in are the ones pinned here, and a bad address is refused on every one", async () => {
  // site-kit has one address; what it does is chosen by these query words. A new one must be pinned here.
  const handler = SRC.slice(SRC.indexOf("Deno.serve(async (req) => {"));
  assert.deepEqual([...handler.matchAll(/^  if \(u\.searchParams\.get\("([a-z]+)"\) === "(?:1|check)"/gm)].map((m) => m[1]), ["rivals", "start", "insight", "speed", "poll"], "STALE: the ways in changed; update this test and supabase/README.md");
  assert.equal((handler.match(/^  if \(u\.searchParams\.has\("reviews"\)\)/gm) ?? []).length, 1);
  assert.equal((handler.match(/^  if \(CHECK_CODE && u\.searchParams\.get\("check"\) === CHECK_CODE\)/gm) ?? []).length, 1);
  assert.equal((SRC.match(/Deno\.serve\(/g) ?? []).length, 1);
  assert.equal((handler.match(/^  if \(/gm) ?? []).length, 9, "STALE: a top-level branch was added to or removed from the handler; pin it here");
  reset();
  for (const q of ["", "d=", "d=localhost", "d=10.0.0.1", "d=nodots", "start=1", "poll=1&d=bad_host", "insight=1&d=%00", "reviews=start&d=", "speed=1"]) {
    const r = await off.get(q);
    assert.deepEqual([r.status, r.json], [400, { ok: false, error: "invalid" }], q);
  }
  assert.deepEqual([world.db, world.outside], [[], []], "a refused address reads nothing and reaches nobody");
  assert.deepEqual((await off.get(`poll=1&d=${D}`)).json, { ok: false, error: "no_job" });
  assert.deepEqual((await off.get(`insight=1&d=${D}`)).json, { ok: false, error: "no_scan" });
  assert.deepEqual((await off.get(`speed=1&d=${D}`)).json, { ok: false, error: "no_scan" });
  assert.deepEqual((await off.get(`reviews=nonsense&d=${D}`)).json, { ok: false, error: "bad_mode" });
  saved({ kit: { ok: true, name: "TEST Fork" }, took: 9 }, { status: "done" });
  assert.deepEqual((await off.get(`poll=1&d=${D}&have=took`)).json, { ok: true, status: "done", parts: { kit: { ok: true, name: "TEST Fork" } }, more: false });
  assert.deepEqual(world.spent, [], "none of these spends anything");
});

test("a new scan over the day's limit is refused, and nothing is started or bought", async () => {
  reset(); world.take = () => false;
  const r = await off.get(`start=1&d=${D}`);
  assert.deepEqual([r.status, r.json], [200, { ok: false, error: "daily_limit" }]);
  assert.deepEqual(world.spent, [{ p_kind: "scans", p_units: 1, p_cap: 40 }], "one scan is asked of today's budget of 40");
  assert.equal(D in world.builds, false, "no scan was saved");
  assert.deepEqual([world.outside, world.pending], [[], []], "nothing was read or bought");
  // The limit comes from the SCANS_DAILY secret when it is set.
  reset(); world.take = () => false;
  assert.deepEqual((await on.get(`start=1&d=${D}`)).json, { ok: false, error: "daily_limit" });
  assert.deepEqual(world.spent, [{ p_kind: "scans", p_units: 1, p_cap: 2 }]);
});

test("when the budget cannot be checked, a new scan is refused too", async () => {
  for (const status of [500, 404, 401]) {
    reset(); world.takeStatus = status;
    assert.deepEqual((await off.get(`start=1&d=${D}`)).json, { ok: false, error: "daily_limit" }, `budget check answered ${status}`);
    assert.deepEqual([D in world.builds, world.outside], [false, []]);
  }
  // Anything but a plain yes is a no.
  for (const answer of [null, "true", 1, {}, "ok"]) { reset(); world.take = () => answer; assert.equal((await off.get(`start=1&d=${D}`)).json.error, "daily_limit", JSON.stringify(answer)); }
});

test("a new scan inside the limit starts, and one already done today is reused without spending", async () => {
  reset();
  const r = await off.get(`start=1&d=${D}`);
  assert.deepEqual(r.json, { ok: true, job: D });
  assert.deepEqual(world.spent.filter((s) => s.p_kind === "scans"), [{ p_kind: "scans", p_units: 1, p_cap: 40 }]);
  assert.equal(world.builds[D].status, "running");
  await off.settle(); // the scan itself, with every site and service answering "not found"
  noKeys(JSON.stringify(world.builds), "the saved scan");
  reset(); saved({ kit: { ok: true } });
  assert.deepEqual((await off.get(`start=1&d=${D}`)).json, { ok: true, job: D, cached: true });
  reset(); saved({}, { status: "running" });
  assert.deepEqual((await off.get(`start=1&d=${D}`)).json, { ok: true, job: D, running: true });
  assert.deepEqual(world.spent, [], "neither took from the budget");
});

test("market numbers over the day's limit are refused before anything is bought", async () => {
  reset(); saved({ gather: { pages: [] } }); world.take = () => false;
  const r = await off.get(`insight=1&d=${D}`);
  assert.deepEqual(r.json, { ok: false, error: "daily_limit" });
  assert.deepEqual(world.spent, [{ p_kind: "dfs_usd", p_units: 0, p_cap: 3 - 0.19 }], "it asks that $0.19 of the $3 day be left, and takes nothing yet");
  assert.deepEqual([dfsCalls(), world.puts], [[], []]);
  reset(); saved({ gather: { pages: [] } }); world.take = () => false;
  await on.get(`insight=1&d=${D}`);
  assert.equal(world.spent[0].p_cap, 1.5 - 0.19, "the limit comes from the DFS_DAILY_USD secret when it is set");
  // Numbers already worked out for this scan are given again for free.
  reset(); saved({ insight: { maps: [{ keyword: "x" }] } }); world.take = () => false;
  assert.equal((await off.get(`insight=1&d=${D}`)).json.cached, true);
  assert.deepEqual(world.spent, []);
});

test("every DataForSEO order takes its cost first, and a refused order is never sent", async () => {
  reset(); world.take = () => false;
  const bill = { capped: false };
  await off.mod.mapsRank("pizza boise", BOISE, SELF, [], bill);
  assert.equal(bill.capped, true, "the caller is told the cap turned it away");
  assert.deepEqual(world.spent, [{ p_kind: "dfs_usd", p_units: 0.004, p_cap: 3 }]);
  assert.deepEqual(dfsCalls(), []);
  reset(); world.take = () => false;
  const b2 = { capped: false };
  assert.equal(await off.mod.demandFor(["pizza"], "Boise", "ID", b2), null);
  assert.equal(b2.capped, true);
  assert.equal(world.spent[0].p_units, 0.09);
  assert.deepEqual(dfsCalls(), []);
  reset(); world.take = () => false;
  assert.equal(await off.mod.postReviews("place_1", ["place_2", "place_3"]), null, "deep reviews are not ordered either");
  assert.equal(world.spent[0].p_units, (300 + 200 + 200) / 10 * 0.0015);
  assert.deepEqual(dfsCalls(), []);
});

test("an order that fails gives its cost back, and one that works keeps it", async () => {
  reset(); world.vendor = (c) => (c.host === "api.dataforseo.com" ? { status: 500, json: {} } : null);
  await off.mod.mapsRank("pizza boise", BOISE, SELF, [], { capped: false });
  assert.deepEqual(world.spent.map((s) => s.p_units), [0.004, -0.004]);
  assert.equal(dfsCalls().length, 1);
  assert.equal(dfsCalls()[0].headers.authorization, `Basic ${btoa(`${KEYS.DATAFORSEO_LOGIN}:${KEYS.DATAFORSEO_PASSWORD}`)}`, "the DataForSEO key goes to DataForSEO");
  assert.equal(JSON.stringify(dfsCalls()).includes(KEYS.SUPABASE_SERVICE_ROLE_KEY), false, "and the project's own key does not");
  reset(); world.vendor = (c) => (c.host === "api.dataforseo.com" ? { json: { tasks: [{ status_code: 20000, result: [{ items: [] }] }] } } : null);
  await off.mod.mapsRank("pizza boise", BOISE, SELF, [], { capped: false });
  assert.deepEqual(world.spent.map((s) => s.p_units), [0.004]);
});

test("the check code is read from the environment and never written in the file", () => {
  assert.equal((SRC.match(/^const CHECK_CODE = .*$/gm) ?? []).join("|"), 'const CHECK_CODE = Deno.env.get("SITE_KIT_CHECK_CODE") ?? "";');
  const uses = SRC.split("\n").filter((l) => l.includes("=== CHECK_CODE"));
  assert.equal(uses.length, 3, "STALE: the places the check code is compared changed");
  for (const l of uses) assert.match(l, /CHECK_CODE && u\.searchParams\.get\("(check|code)"\) === CHECK_CODE/, "every comparison must be off when no code is set");
  assert.equal(SRC.split("CHECK_CODE").length - 1, 2 + 2 * uses.length, "the code is used nowhere else");
});

test("with no check code set, the checks are off, even for an empty code", async () => {
  for (const q of ["check=", "check", "check=undefined", "check=null", `check=${CODE}`]) {
    reset();
    const r = await off.get(q);
    assert.deepEqual([r.status, r.json], [400, { ok: false, error: "invalid" }], q);
    assert.deepEqual([world.outside, world.db], [[], []], "no key is tried and nothing is read");
  }
  // The competitor test run and the Maps re-look also need the code.
  reset(); saved({ gather: { pages: [{ text: "x" }], competitors: [] } });
  const r = await off.get(`d=${D}&rivals=check&code=&save=1`);
  assert.equal("ran" in r.json, false, "the test run did not happen");
  assert.deepEqual(world.puts, [], "and nothing was saved over the scan");
  reset(); saved({ insight: { maps: [{ keyword: "x" }], demand: null } });
  const again = await off.get(`insight=1&maps=1&code=&d=${D}`);
  assert.equal(again.json.cached, true, "the saved numbers come back; nothing is bought again");
  assert.deepEqual([world.spent, dfsCalls()], [[], []]);
});

test("with the check code set, only the right code opens the key check, and it shows no key", async () => {
  for (const q of ["check=", "check=wrong", `check=${CODE}x`, `check=${CODE.slice(0, -1)}`, `check=${CODE.toUpperCase()}`]) {
    reset();
    assert.equal((await on.get(q)).status, 400, q);
    assert.deepEqual(world.outside, []);
  }
  reset();
  const r = await on.get(`check=${CODE}`);
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.places_key, r.json.firecrawl_key, r.json.dataforseo_key], [true, true, true], "it says which keys are present, as yes or no");
  assert.deepEqual(r.json.today, { day: new Date().toISOString().slice(0, 10), dataforseo_usd: 1.25, dataforseo_cap_usd: 1.5, scans: 7, scans_cap: 2 }, "and today's spending against the limits");
  noKeys(r.text, "the key check's answer");
  assert.deepEqual(world.spent, [], "the key check takes nothing from the budget");
  assert.deepEqual([...new Set(world.outside.map((c) => c.host))].sort(), ["api.dataforseo.com", "api.firecrawl.dev", "places.googleapis.com", "www.googleapis.com"], "each key is tried only at its own provider");
});

test("the answers leave the logs quiet again", () => { off.loud(); on.loud(); });
