// The owner's approval of an operator, through the real pip-portal with the database faked. No network, no keys.
//   node --experimental-strip-types --test supabase/functions/pip-portal/operate-approval.test.mjs
// The approval rows and their rules are tested against a real Postgres in tests/db/operate.test.mjs. Here the question
// is who may do what, and that nothing is reachable while the lane is off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { compileOperator } from "../_shared/operate.ts";
import { CONTRACT } from "../_shared/teammate-spec.ts";

const SRC = fileURLToPath(new URL("./index.ts", import.meta.url));
const SHARED = fileURLToPath(new URL("../_shared", import.meta.url));
const IMPORT_LINE = 'import { createClient } from "jsr:@supabase/supabase-js@2";';
const BIZ = "11111111-1111-4111-8111-111111111111", OTHER = "99999999-9999-4999-8999-999999999999", ORDER = "33333333-3333-4333-8333-333333333333";
const SPEC = "22222222-2222-4222-8222-222222222222", SPEC2 = "22222222-2222-4222-8222-222222222223";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOW = Math.floor(Date.now() / 1000); // pinned: a token built in world() must equal the one built at import, even if a second ticks between
const token = (email, fresh = true) => `h.${b64({ email, amr: [{ method: "otp", timestamp: NOW - (fresh ? 10 : 7200) }] })}.s`;

const posts = compileOperator("content_social", { business: "TEST Fork", teammate: "Hallie", accounts: ["facebook_page"], channels: ["facebook"] });
const spec = { contract: CONTRACT, jobs: posts.jobs, operate: posts.operate };

function world({ lane = true } = {}) {
  const w = {
    flag: lane, rpcs: [],
    tables: {
      skill_specs: [{ id: SPEC, skill_id: "social", status: "sandbox", order_id: ORDER, spec }, { id: SPEC2, skill_id: "other", status: "sandbox", order_id: "x", spec }],
      build_orders: [{ id: ORDER, business_id: BIZ }, { id: "x", business_id: OTHER }],
      members: [
        { id: "m1", business_id: BIZ, email: "owner@example.test", role: "owner", status: "active", user_id: "u-owner" },
        { id: "m2", business_id: BIZ, email: "staff@example.test", role: "staff", status: "active", user_id: "u-staff" },
        { id: "m3", business_id: BIZ, email: "founder@example.test", role: "owner", status: "active", user_id: "u-founder" },
      ],
      platform_admins: [{ email: "founder@example.test" }],
      operator_approvals: [{ id: 1, spec_id: SPEC, business_id: BIZ, kind: "brand_voice", subject: "", status: "requested", version: 1 }, { id: 2, spec_id: SPEC2, business_id: OTHER, kind: "brand_voice", subject: "", status: "requested", version: 1 }],
      activity_log: [],
    },
    users: { [token("owner@example.test")]: { id: "u-owner", email: "owner@example.test" }, [token("staff@example.test")]: { id: "u-staff", email: "staff@example.test" }, [token("founder@example.test")]: { id: "u-founder", email: "founder@example.test" } },
  };
  w.handlers = {
    portal_flag: () => w.flag,
    operator_approval_request: () => 77,
    operator_approval_approve: ({ p_id }) => { const r = w.tables.operator_approvals.find((x) => x.id === p_id); if (r?.status !== "requested") return false; r.status = "approved"; return true; },
    operator_approval_revoke: ({ p_id }) => { const r = w.tables.operator_approvals.find((x) => x.id === p_id); if (!r || r.status === "revoked") return false; r.status = "revoked"; return true; },
    operator_approved_current: () => false,
  };
  return w;
}
function fakeClient(w) {
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = "select"; }
    select() { return this; }
    insert(rows) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    update(p) { this.op = "update"; this.p = p; return this; }
    eq(c, v) { if (c.includes(".")) { const [rel, col] = c.split("."); this.f.push((r) => (w.tables[rel] ?? []).some((x) => x.id === r.order_id && x[col] === v)); } else this.f.push((r) => r[c] === v); return this; }
    neq(c, v) { this.f.push((r) => r[c] !== v); return this; }
    gte(c, v) { this.f.push((r) => r[c] != null && r[c] >= v); return this; }
    not() { return this; } or() { return this; } lte() { return this; } lt() { return this; } gt() { return this; } ilike() { return this; } contains() { return this; }
    is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
    in(c, vs) { this.f.push((r) => vs.includes(r[c])); return this; }
    order() { return this; } limit() { return this; }
    maybeSingle() { this.one = true; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
    run() {
      const all = (w.tables[this.t] ??= []);
      if (this.op === "insert") { all.push(...this.rows.map((r) => structuredClone(r))); return { data: null, error: null }; }
      const hit = all.filter((r) => this.f.every((f) => f(r)));
      if (this.op === "update") { for (const r of hit) Object.assign(r, this.p); return { data: null, error: null }; }
      return this.one ? { data: hit[0] ? structuredClone(hit[0]) : null, error: null } : { data: structuredClone(hit), error: null };
    }
  }
  return {
    from: (t) => new Q(t),
    rpc: async (name, args) => { w.rpcs.push({ name, args }); const h = w.handlers[name]; return { data: h ? h(args) : null, error: null }; },
    auth: { getUser: async (tok) => (w.users[tok] ? { data: { user: w.users[tok] }, error: null } : { data: null, error: { message: "bad" } }) },
  };
}
async function boot(w) {
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] }, serve: (h) => { handler = h; } };
  globalThis.__portalMock = { createClient: () => fakeClient(w) };
  const root = mkdtempSync(join(tmpdir(), "portal-")); const dir = join(root, "pip-portal"); mkdirSync(dir); symlinkSync(SHARED, join(root, "_shared"), "dir");
  const src = readFileSync(SRC, "utf8"); assert.ok(src.includes(IMPORT_LINE), "pip-portal's import line changed");
  const file = join(dir, `index.${Math.random().toString(36).slice(2)}.ts`);
  // node's strip-only TypeScript has no parameter properties; Deno does. Rewrite that one constructor for the test copy only.
  const PARAM_PROPS = "constructor(public status: number, public code: string, msg?: string) { super(msg || code); }";
  assert.ok(src.includes(PARAM_PROPS), "pip-portal's error class changed");
  writeFileSync(file, src.replace(IMPORT_LINE, "const { createClient } = globalThis.__portalMock;")
    .replace(PARAM_PROPS, "status: number; code: string; constructor(status: number, code: string, msg?: string) { super(msg || code); this.status = status; this.code = code; }"));
  const quiet = console.error; console.error = () => {};
  try { await import(pathToFileURL(file).href); } finally { console.error = quiet; }
  return async (method, path, who, body) => {
    const res = await handler(new Request(`https://test.invalid/functions/v1/pip-portal${path}`, { method, headers: { "content-type": "application/json", ...(who ? { authorization: `Bearer ${who}` } : {}) }, ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}) }));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const OWNER = token("owner@example.test"), STAFF = token("staff@example.test"), FOUNDER = token("founder@example.test");
const P = (id = SPEC) => `/business/${BIZ}/agents/${id}`;

test("with the lane off the whole surface is dark: it answers not_found and records nothing", async () => {
  const w = world({ lane: false }), call = await boot(w);
  for (const [m, path, body] of [["GET", `${P()}/operator`], ["POST", `${P()}/operator-approval`, { do: "approve", id: 1 }], ["POST", `${P()}/operator-approval`, { do: "request", kind: "brand_voice", voice: { text: "A friendly, plain voice that says it like it is." } }]]) {
    const r = await call(m, path, OWNER, body);
    assert.equal(r.status, 404, `${m} ${path}`);
  }
  assert.equal(w.tables.operator_approvals[0].status, "requested");
  assert.ok(!w.rpcs.some((x) => x.name.startsWith("operator_approval")));
});
test("the owner sees what the operator does in plain words, and the approvals waiting", async () => {
  const call = await boot(world());
  const r = await call("GET", `${P()}/operator`, OWNER);
  assert.equal(r.status, 200);
  assert.equal(r.json.process, "content_social");
  assert.ok(r.json.words.needsYou.some((x) => /Approve the brand voice/.test(x)));
  assert.equal(r.json.approvals.length, 1);
  assert.equal(r.json.approved, false);
  // the review screen builds its "approve once" list from this, so it must name every approval the operator needs
  assert.equal(r.json.asks.brand_voice, true);
  assert.ok(Array.isArray(r.json.asks.accounts) && r.json.asks.accounts.length >= 1);
});
test("the owner approves with a fresh sign-in; the approval is recorded", async () => {
  const w = world(), call = await boot(w);
  const r = await call("POST", `${P()}/operator-approval`, OWNER, { do: "approve", id: 1 });
  assert.deepEqual([r.status, r.json], [200, { ok: true }]);
  assert.equal(w.tables.operator_approvals[0].status, "approved");
  assert.ok(w.tables.activity_log.some((x) => /approved the brand voice/.test(x.summary)));
});
test("an old sign-in cannot approve", async () => {
  const w = world(); w.users[token("owner@example.test", false)] = { id: "u-owner", email: "owner@example.test" };
  const call = await boot(w);
  const r = await call("POST", `${P()}/operator-approval`, token("owner@example.test", false), { do: "approve", id: 1 });
  assert.equal(r.status, 401); assert.equal(w.tables.operator_approvals[0].status, "requested");
});
test("the founder cannot approve for the owner, even as a member of the business", async () => {
  const w = world(), call = await boot(w);
  const r = await call("POST", `${P()}/operator-approval`, FOUNDER, { do: "approve", id: 1 });
  assert.equal(r.status, 403); assert.equal(r.json.error, "owner_only");
  assert.equal(w.tables.operator_approvals[0].status, "requested");
});
test("staff cannot approve and cannot request one", async () => {
  const w = world(), call = await boot(w);
  assert.equal((await call("POST", `${P()}/operator-approval`, STAFF, { do: "approve", id: 1 })).status, 403);
  assert.equal((await call("POST", `${P()}/operator-approval`, STAFF, { do: "request", kind: "account", subject: "facebook_page" })).status, 403);
  assert.equal(w.tables.operator_approvals[0].status, "requested");
});
test("the founder may ask the owner to approve, and the ask must be for something the operator was built for", async () => {
  const call = await boot(world());
  assert.equal((await call("POST", `${P()}/operator-approval`, FOUNDER, { do: "request", kind: "account", subject: "facebook_page" })).status, 200);
  const bad = await call("POST", `${P()}/operator-approval`, FOUNDER, { do: "request", kind: "account", subject: "tiktok" });
  assert.equal(bad.status, 400);
});
test("an approval that belongs to another teammate or another business cannot be touched", async () => {
  const w = world(), call = await boot(w);
  assert.equal((await call("POST", `${P()}/operator-approval`, OWNER, { do: "approve", id: 2 })).status, 404);
  assert.equal((await call("POST", `${P(SPEC2)}/operator-approval`, OWNER, { do: "approve", id: 2 })).status, 404, "another business's teammate is not found");
  assert.equal(w.tables.operator_approvals[1].status, "requested");
});
test("taking an approval back is open to staff, and says posting stops", async () => {
  const w = world(); w.tables.operator_approvals[0].status = "approved";
  const call = await boot(w);
  const r = await call("POST", `${P()}/operator-approval`, STAFF, { do: "revoke", id: 1 });
  assert.equal(r.status, 200); assert.equal(w.tables.operator_approvals[0].status, "revoked");
  assert.ok(w.tables.activity_log.some((x) => /stops posting/.test(x.summary)));
  assert.equal((await call("POST", `${P()}/operator-approval`, STAFF, { do: "revoke", id: 1 })).status, 409, "already taken back");
});
test("no sign-in, or a bad one, is refused before anything is read", async () => {
  const call = await boot(world());
  assert.equal((await call("GET", `${P()}/operator`, null)).status, 401);
  assert.equal((await call("POST", `${P()}/operator-approval`, "not.a.jwt", { do: "approve", id: 1 })).status, 401);
});

// ---------- the review screen's reads ----------
const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const cases = () => [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", business_id: BIZ, spec_id: SPEC, process: "content_social", case_key: "week-48", contact_hash: "hash-1", stage: "sent", touches: 1, next_at: day(-2), status: "open", opened_at: day(1), context: { first_name: "Dana" }, rules: {} },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", business_id: BIZ, spec_id: SPEC, process: "content_social", case_key: "week-47", contact_hash: "hash-2", stage: null, touches: 2, next_at: day(3), status: "done", closed_reason: "replied", opened_at: day(9), closed_at: day(2), last_touch_at: day(3), context: {}, rules: {} },
  { id: "cccccccc-0000-4000-8000-000000000003", business_id: BIZ, spec_id: SPEC, process: "content_social", case_key: "old", contact_hash: "hash-3", touches: 3, next_at: day(30), status: "stopped", closed_reason: "stop", opened_at: day(40), closed_at: day(20), context: {}, rules: {} },
  { id: "dddddddd-0000-4000-8000-000000000004", business_id: OTHER, spec_id: SPEC2, process: "content_social", case_key: "theirs", contact_hash: "hash-4", touches: 1, next_at: day(-1), status: "open", opened_at: day(1), context: { first_name: "Sam" }, rules: {} },
];
test("the review screen's case list is dark while the lane is off", async () => {
  const w = world({ lane: false }); w.tables.operator_cases = cases();
  const r = await (await boot(w))("GET", `${P()}/operator-cases`, OWNER);
  assert.equal(r.status, 404);
});
test("owner and staff see what is open and what closed this week: stages, counts and times, never who the customer is", async () => {
  const w = world(); w.tables.operator_cases = cases();
  const call = await boot(w);
  for (const who of [OWNER, STAFF]) {
    const r = await call("GET", `${P()}/operator-cases`, who);
    assert.equal(r.status, 200);
    assert.equal(r.json.process, "content_social");
    assert.deepEqual(r.json.open.map((x) => x.ref), ["aaaaaaaa"]);
    assert.deepEqual(r.json.closed.map((x) => [x.ref, x.closed_reason]), [["bbbbbbbb", "replied"]], "a case closed 20 days ago is not this week's");
    assert.deepEqual(Object.keys(r.json.open[0]).sort(), ["closed_at", "closed_reason", "last_touch_at", "next_at", "opened_at", "ref", "stage", "status", "touches"]);
    const text = JSON.stringify(r.json);
    for (const secret of ["hash-1", "hash-2", "Dana", "week-48", "week-47", "context", "contact_hash", "case_key"]) assert.ok(!text.includes(secret), `${secret} must not leave the server`);
    assert.ok(!text.includes("dddddddd"), "another business's case never shows");
  }
});
test("a case list for a teammate of another business is refused", async () => {
  const w = world(); w.tables.operator_cases = cases();
  const r = await (await boot(w))("GET", `${P(SPEC2)}/operator-cases`, OWNER);
  assert.ok([403, 404].includes(r.status), String(r.status));
});
test("someone who is not signed in gets nothing", async () => {
  const w = world(); w.tables.operator_cases = cases();
  const r = await (await boot(w))("GET", `${P()}/operator-cases`, null);
  assert.equal(r.status, 401);
});
test("the Portal's home data marks an operator teammate only while the lane is on", async () => {
  for (const lane of [true, false]) {
    const w = world({ lane });
    w.tables.businesses = [{ id: BIZ, name: "TEST Fork", status: "active" }];
    w.handlers.portal_agents = () => [{ spec_id: SPEC, name: "social", status: "sandbox", needs: [], pauses: [] }];
    const r = await (await boot(w))("GET", `/business/${BIZ}`, OWNER);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.operate_on, lane);
    assert.equal(r.json.agents[0].operator, lane ? "content_social" : undefined);
  }
});
