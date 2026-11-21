// pip-shelf's routes, through the real index.ts with the database, the providers and the email service faked.
//   node --experimental-strip-types --test supabase/functions/pip-shelf/routes.test.mjs
// No network, no keys. It pins what the function answers to (POST /notify and POST /funds, nothing else), who may call
// it, and that no key value ever comes back or goes anywhere but the provider it belongs to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALERT, bootShelf, IDS, SERVICE, tables } from "../pip-forge-mcp/harness.mjs";

// Made-up key values. If one of these ever shows up in an answer, an email or a call to the wrong place, a test fails.
const KEYS = { TWILIO_ACCOUNT_SID: "ACtest0000000000", TWILIO_AUTH_TOKEN: "test-twilio-token-value", RESEND_API_KEY: "test-resend-key" };
const f = await bootShelf(KEYS);
const INTERNAL = { "x-pip-internal": SERVICE };
const noKeys = (text, what) => { for (const v of [SERVICE, ALERT, ...Object.values(KEYS)]) assert.equal(String(text).includes(v), false, `${what} carries a key value`); };

/** Three tracked providers: one read live and low, one with no key in place, one Brayden reads off a billing page. */
function world() {
  const t = tables();
  t.api_funds = [
    { provider: "twilio", label: "Twilio", pays_for: "texts and calls", secret_name: "TWILIO_AUTH_TOKEN", reader: "twilio", topup_url: "https://console.twilio.com/billing", topup_label: "Add funds", low_usd: 5, low_pct: 20, balance_usd: null, balance_at: null, last_reading: null, last_read_at: null, alert_at: null, sort: 1, active: true },
    { provider: "elevenlabs", label: "ElevenLabs", pays_for: "voices", secret_name: "ELEVENLABS_API_KEY", reader: "elevenlabs", low_usd: 5, low_pct: 20, last_reading: null, last_read_at: null, alert_at: null, sort: 2, active: true },
    { provider: "resend", label: "Resend", pays_for: "email", secret_name: null, reader: "none", low_usd: 5, low_pct: 20, balance_usd: 20, balance_at: "2026-11-17T12:00:00Z", last_reading: null, last_read_at: null, alert_at: null, sort: 3, active: true },
    { provider: "old", label: "Old", secret_name: null, reader: "none", low_usd: 5, low_pct: 20, balance_usd: 1, balance_at: "2026-11-17T12:00:00Z", sort: 9, active: false },
  ];
  t.api_fund_snaps = [];
  t.api_shelf = [{ provider: "twilio", label: "Twilio", kind: "buy", status: "not_owned", secret_name: "TWILIO_AUTH_TOKEN", rank: 1, pricing_url: null, signup_url: "https://www.twilio.com/try-twilio", monthly_cap_usd: null }];
  t.api_needs = [{ id: 1, provider: "twilio", primitive: "sms", options: ["twilio"], order_id: IDS.order, agent_id: "front-desk", status: "open", notified_at: null, created_at: "2026-11-18T10:00:00Z" }];
  t.primitives = [{ id: "sms", label: "Text messages" }];
  return t;
}
/** Stands in for the providers: Twilio's balance and Resend's send. Anything else is a stray call. */
const vendors = (balance = "3.20") => (call) => {
  if (call.host === "api.twilio.com" && /\/Accounts\/ACtest0000000000\/Balance\.json$/.test(call.url)) return { json: { balance, currency: "USD" } };
  if (call.host === "api.resend.com" && call.url.endsWith("/emails")) return { json: { id: "email_1" } };
  return null;
};
const start = (balance) => { f.reset(world()); f.world.vendor = vendors(balance); f.world.rpc.fund_burn = () => []; f.world.rpc.shelf_refresh_needs = () => 0; };

// This test comes first on purpose: the function saves a reading to history at most once a minute, counted from when it
// started, so only the first read in this file is certain to be saved.
test("/funds reads each provider with its own key, says what is low, keeps a reading, and never returns a key", async () => {
  start();
  const r = await f.post("/funds", { view: "providers" }, INTERNAL);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.rows.map((x) => [x.provider, x.status, x.reading, x.balance_usd]), [
    ["twilio", "low", "live", 3.2],
    ["elevenlabs", "not_set_up", "none", null],
    ["resend", "ok", "manual", 20],
  ], "one row per active provider, in order; the inactive one is left out");
  assert.match(r.json.rows[1].note, /Not set up: no ELEVENLABS_API_KEY in Supabase secrets/, "a missing key is named, never guessed");
  assert.equal("alert_at" in r.json.rows[0], false);
  noKeys(r.text, "the answer");
  // Twilio's key went to Twilio and nowhere else; Pip's own keys went nowhere.
  assert.deepEqual(f.world.vendorCalls.map((c) => c.host), ["api.twilio.com"]);
  assert.equal(f.world.vendorCalls[0].headers.authorization, `Basic ${btoa(`${KEYS.TWILIO_ACCOUNT_SID}:${KEYS.TWILIO_AUTH_TOKEN}`)}`);
  assert.equal(JSON.stringify(f.world.vendorCalls).includes(SERVICE), false, "the project's service key never leaves the project");
  assert.deepEqual(f.world.outside, []);
  // The reading is kept on the row and in the history; nothing else is written.
  assert.equal(f.world.tables.api_funds[0].last_reading.balance_usd, 3.2);
  assert.deepEqual(f.world.tables.api_fund_snaps.map((s) => [s.provider, s.source, s.balance_usd]), [["twilio", "live", 3.2], ["resend", "manual", 20]]);
  noKeys(JSON.stringify(f.world.tables), "the database");

  // Within a minute the saved reading is used again; `fresh` reads the provider again.
  f.world.vendorCalls = [];
  await f.post("/funds", {}, INTERNAL);
  assert.deepEqual(f.world.vendorCalls, [], "the provider is not asked twice in a minute");
  f.world.vendor = vendors("40.00");
  const fresh = await f.post("/funds", { fresh: true }, INTERNAL);
  assert.deepEqual([fresh.json.rows[0].balance_usd, fresh.json.rows[0].status], [40, "ok"]);
});

test("/funds has three views, and anything else gets the first", async () => {
  start();
  const budget = await f.post("/funds", { view: "budget", fresh: true }, INTERNAL);
  assert.equal(budget.json.rows.length, 1);
  assert.deepEqual([budget.json.rows[0].prepaid_usd, budget.json.rows[0].apis_funded, budget.json.rows[0].apis_low, budget.json.rows[0].budget_total_usd], [23.2, 2, 1, 1000]);
  f.world.rpc.fund_history = (a) => (a.p_days === 30 ? [{ provider: "twilio", day: "2026-11-17", balance_usd: "9.999", credits_left: null, credits_limit: null }] : []);
  const history = await f.post("/funds", { view: "history" }, INTERNAL);
  assert.deepEqual(history.json.rows, [{ provider: "twilio", label: "Twilio", day: "2026-11-17", balance_usd: 10, credits_left: null, credits_limit: null }]);
  for (const body of [{ view: "everything" }, { view: 7 }, {}, null]) assert.equal((await f.post("/funds", body, INTERNAL)).json.rows.length, 3);
});

test("a provider that fails to answer shows as an error with the reason, and the rest still come back", async () => {
  start();
  f.world.vendor = (call) => (call.host === "api.twilio.com" ? { status: 401, json: { message: "Authenticate" } } : null);
  const r = await f.post("/funds", { fresh: true }, INTERNAL);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.rows.map((x) => x.status), ["error", "not_set_up", "ok"]);
  assert.match(r.json.rows[0].error, /api\.twilio\.com answered 401: Authenticate/);
  noKeys(r.text, "the answer");
});

test("the routes are POST /notify and POST /funds, and nothing else", async () => {
  start();
  const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.ok(src.includes("if (!['/notify', '/funds'].includes(path) || req.method !== 'POST') return json({ ok: false, error: 'not_found' }, 404);"), "STALE: the route list in pip-shelf changed; update this test and docs/forge.md with it");
  assert.equal((src.match(/path === '\//g) ?? []).length, 1, "a new route was added: pin it here");
  for (const path of ["/notify", "/funds"]) assert.equal((await f.post(path, {})).status, 200, path);
  const gone = { ok: false, error: "not_found" };
  for (const [method, path] of [["GET", "/notify"], ["GET", "/funds"], ["PUT", "/funds"], ["DELETE", "/notify"], ["POST", ""], ["POST", "/"], ["POST", "/fund"], ["POST", "/funds/"], ["POST", "/funds/history"], ["POST", "/notify/now"], ["POST", "/console"], ["POST", "/diag"]]) {
    const r = await f.call(method, path, {}, { "x-pip-alert": ALERT, ...INTERNAL });
    assert.deepEqual([r.status, r.json], [404, gone], `${method} ${path}`);
  }
});

test("only the database's token or the project's own service key opens either route", async () => {
  start();
  const before = JSON.stringify(f.world.tables);
  const wrong = [
    {}, { "x-pip-alert": "" }, { "x-pip-alert": "guess" }, { "x-pip-alert": SERVICE }, { "x-pip-internal": "" }, { "x-pip-internal": ALERT },
    { "x-pip-internal": SERVICE.slice(0, -1) }, { "x-pip-internal": `${SERVICE}x` }, { "x-pip-internal": SERVICE.replace(/.$/, "X") }, { "x-pip-internal": SERVICE.toUpperCase() },
    { authorization: `Bearer ${SERVICE}` }, { apikey: SERVICE },
  ];
  for (const path of ["/notify", "/funds"]) for (const headers of wrong) {
    const r = await f.post(path, {}, headers);
    assert.deepEqual([r.status, r.json], [404, { ok: false, error: "not_found" }], `${path} ${JSON.stringify(Object.keys(headers))}`);
  }
  assert.deepEqual(f.changes().filter((w) => w.name !== "lead_alert_token_ok"), [], "a refused call changes nothing (asking the database whether the token is right is the only thing it does)");
  assert.equal(JSON.stringify(f.world.tables), before);
  assert.deepEqual([...f.world.vendorCalls, ...f.world.outside], [], "and reaches no provider");
  // Both doors, each on both routes.
  for (const path of ["/notify", "/funds"]) for (const headers of [{ "x-pip-alert": ALERT }, INTERNAL]) assert.equal((await f.post(path, {}, headers)).status, 200);
});

test("the request the Forge connector sends is one pip-shelf accepts", async () => {
  // pip-forge-mcp's shelfFunds: POST /functions/v1/pip-shelf/funds, content-type and x-pip-internal, body { view, fresh }.
  const connector = readFileSync(new URL("../pip-forge-mcp/index.ts", import.meta.url), "utf8");
  assert.ok(connector.includes("fetch(`${SB_URL}/functions/v1/pip-shelf/funds`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pip-internal': SB_KEY }, body: JSON.stringify({ view, fresh })"), "STALE: the connector's call to pip-shelf changed; change both sides together");
  start();
  const r = await f.call("POST", "/funds", { view: "providers", fresh: true }, { "content-type": "application/json", "x-pip-internal": SERVICE });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.rows), "the connector needs `rows` to be a list");
});

test("/notify notes which keys exist by name, sends one digest and one low-funds email, and does not repeat them", async () => {
  start();
  let refreshed = 0; f.world.rpc.shelf_refresh_needs = () => { refreshed++; return 0; };
  const r = await f.post("/notify", {});
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.json.ok, r.json.synced, r.json.sent, r.json.needs, r.json.funds_alert], [true, 1, 1, 1, 1]);
  assert.deepEqual(r.json.providers, ["twilio"]);
  assert.equal(refreshed, 1);
  // 1. The Shelf learns the key is there, by its name alone.
  assert.equal(f.world.tables.api_shelf[0].status, "ready");
  // 2 and 3. One digest for the waiting order, and it is marked as sent.
  const mails = f.world.vendorCalls.filter((c) => c.host === "api.resend.com");
  assert.deepEqual(mails.map((m) => m.body.subject), ["Pip needs Twilio (1 order waiting)", "Pip's Twilio is running low"]);
  assert.deepEqual(mails.map((m) => m.body.to), [["founder@test.invalid"], ["founder@test.invalid"]]);
  assert.match(mails[0].body.text, /Waiting: 1 teammate\(s\) in PIP-TEST · TEST Fork/);
  assert.match(mails[0].body.text, /Key: paste into Supabase secrets as TWILIO_AUTH_TOKEN/);
  assert.ok(f.world.tables.api_needs[0].notified_at);
  // 4. The low-funds email, with the amount and where to top up.
  assert.match(mails[1].body.text, /Twilio: \$3\.20 left\./);
  assert.match(mails[1].body.text, /Add funds: https:\/\/console\.twilio\.com\/billing/);
  assert.ok(f.world.tables.api_funds[0].alert_at);
  for (const m of mails) { assert.equal(m.headers.authorization, `Bearer ${KEYS.RESEND_API_KEY}`); noKeys(JSON.stringify(m.body), "an email"); }
  noKeys(r.text, "the answer");
  assert.deepEqual(f.world.outside, []);

  // A second knock straight after: nothing new to say, so nothing is sent.
  f.world.vendorCalls = [];
  const again = await f.post("/notify", {});
  assert.deepEqual([again.json.ok, again.json.sent, again.json.funds_alert], [true, 0, 0]);
  assert.deepEqual(f.world.vendorCalls.filter((c) => c.host === "api.resend.com"), []);
});

test("/notify still answers when the email service is down, and says which part failed", async () => {
  start();
  f.world.vendor = (call) => (call.host === "api.twilio.com" ? { json: { balance: "3.20", currency: "USD" } } : call.host === "api.resend.com" ? { status: 500, json: { message: "down" } } : null);
  const r = await f.post("/notify", {});
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, false);
  assert.match(r.json.digest_error, /resend 500/);
  assert.match(r.json.funds_error, /resend 500/);
  assert.equal(f.world.tables.api_needs[0].notified_at, null, "an alert that was not sent is not marked as sent");
  assert.equal(f.world.tables.api_funds[0].alert_at, null);
});
