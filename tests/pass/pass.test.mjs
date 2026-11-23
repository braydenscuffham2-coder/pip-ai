// The visitor pass and the emailed code: pip-reader hands them out, voice-token asks for them before a demo call.
// Runs the real supabase/functions/_shared/pass.ts and voice-token/index.ts with the database, ElevenLabs and Resend
// faked. No network, no keys, no emails.
//   node --test tests/pass/pass.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const env = { SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-service-role", ELEVENLABS_API_KEY: "test-el-key", ELEVENLABS_AGENT_ID: "agent_test" };
const world = { codes: [], patches: [], eleven: 0 };
let handler = null;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET";
  const reply = (status, j) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
  if (u.hostname === "api.elevenlabs.io") {
    if (u.pathname.includes("/conversations")) return reply(200, { conversations: [], has_more: false });
    world.eleven++; return reply(200, { token: "el-token" });
  }
  if (u.pathname === "/rest/v1/email_codes") {
    const id = (u.searchParams.get("pass_id") || "").replace(/^eq\./, "");
    if (method === "GET") return reply(200, world.codes.filter((c) => c.pass_id === id));
    if (method === "PATCH") { const patch = JSON.parse(init.body); world.patches.push(patch); for (const c of world.codes) if (c.pass_id === id) Object.assign(c, patch); return reply(204, null); }
  }
  return reply(599, {});
};
const P = await import(pathToFileURL(fileURLToPath(new URL("../../supabase/functions/_shared/pass.ts", import.meta.url))).href);
await import(pathToFileURL(fileURLToPath(new URL("../../supabase/functions/voice-token/index.ts", import.meta.url))).href);
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const call = async (body) => {
  const res = await handler(new Request("https://test.invalid/functions/v1/voice-token", { method: "POST", headers: { "content-type": "application/json", origin: "https://pip-ai-drab.vercel.app" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
};
const withCode = async (id, code, over = {}) => { world.codes = [{ pass_id: id, code_hash: await P.codeHash(id, code), expires_at: new Date(Date.now() + 600_000).toISOString(), tries: 0, verified_at: null, ...over }]; };

test("a pass signed before PIP_PASS_SECRET existed still checks after it is set", async () => {
  const id = await P.passId("owner@testfork.example");
  const old = await P.mintPass(1, id, exp());
  env.PIP_PASS_SECRET = "a-dedicated-pass-secret";
  try {
    assert.deepEqual(await P.checkPass(old), { level: 1, exp: Number(old.split(".")[1]), id });
    const fresh = await P.mintPass(1, id, exp());
    assert.notEqual(fresh.split(".")[3], old.split(".")[3], "new passes are signed with the new secret");
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(await P.checkPass(fresh), "a new pass needs only the new secret");
  } finally { env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"; delete env.PIP_PASS_SECRET; }
});

test("a forged, edited or expired pass is refused, and a level-1 pass cannot be relabelled level 2", async () => {
  const id = await P.passId("owner@testfork.example");
  const good = await P.mintPass(1, id, exp());
  const [, e, i, sig] = good.split(".");
  assert.equal(await P.checkPass(`p2.${e}.${i}.${sig}`), null);
  assert.equal(await P.checkPass(`p1.${Number(e) + 1}.${i}.${sig}`), null);
  assert.equal(await P.checkPass(await P.mintPass(1, id, Math.floor(Date.now() / 1000) - 10)), null);
  assert.equal(await P.checkPass("p1.123.abc.def"), null);
});

test("throwaway inboxes are refused, ordinary ones are not", () => {
  for (const e of ["a@mailinator.com", "b@yopmail.com", "c@10minutemail.com", "d@guerrillamail.com"]) assert.equal(P.throwaway(e), true, e);
  for (const e of ["owner@gmail.com", "frontdesk@boiseriverdental.com", "x@icloud.com"]) assert.equal(P.throwaway(e), false, e);
});

test("a demo call with a level-1 pass and no code asks for the code, and no minutes are spent", async () => {
  const id = await P.passId("owner@testfork.example"); world.eleven = 0;
  await withCode(id, "482913");
  const r = await call({ pass: await P.mintPass(1, id, exp()) });
  assert.deepEqual([r.status, r.json.error], [401, "needs_code"]);
  assert.equal(world.eleven, 0);
});

test("the right code opens the call once and hands back a level-2 pass for the rest of the visit", async () => {
  const id = await P.passId("owner@testfork.example"); world.eleven = 0;
  await withCode(id, "482913");
  const r = await call({ pass: await P.mintPass(1, id, exp()), code: "482913" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.token, "el-token");
  assert.equal((await P.checkPass(r.json.pass)).level, 2);
  const again = await call({ pass: r.json.pass });
  assert.equal(again.status, 200, "a level-2 pass needs no code");
});

test("a wrong code counts a try; five wrong tries or an expired code end it", async () => {
  const id = await P.passId("owner@testfork.example");
  await withCode(id, "482913");
  const pass = await P.mintPass(1, id, exp());
  const r = await call({ pass, code: "000000" });
  assert.deepEqual([r.status, r.json.error], [401, "wrong_code"]);
  assert.equal(world.codes[0].tries, 1);
  await withCode(id, "482913", { tries: 5 });
  assert.equal((await call({ pass, code: "482913" })).json.error, "code_expired", "even the right code, after five misses");
  await withCode(id, "482913", { expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await call({ pass, code: "482913" })).json.error, "code_expired");
});

test("no pass at all is still told to give an email first", async () => {
  assert.deepEqual((await call({})).json, { error: "needs_email" });
});
