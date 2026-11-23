// pip-reader's email gate: a visitor's email gets a pass at once and a code by email, and only the code's hash is kept.
// Runs the real supabase/functions/pip-reader/index.ts with the database and Resend faked. No emails are sent.
//   node --test tests/pass/reader.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const env = { SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-service-role", RESEND_API_KEY: "test-resend" };
const world = { mails: [], codes: [], leads: [] };
let handler = null;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
  const reply = (status, j) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
  if (u.hostname === "api.resend.com") { world.mails.push(body); return reply(200, { id: "m1" }); }
  if (u.pathname === "/rest/v1/rpc/pip_take") return reply(200, null);
  if (u.pathname === "/rest/v1/leads") { if (method === "POST") world.leads.push(body); return reply(200, []); }
  if (u.pathname === "/rest/v1/email_codes") { if (method === "POST") { world.codes.push(body); return reply(201, null); } return reply(200, []); }
  return reply(599, {});
};
await import(pathToFileURL(fileURLToPath(new URL("../../supabase/functions/pip-reader/index.ts", import.meta.url))).href);
const P = await import(pathToFileURL(fileURLToPath(new URL("../../supabase/functions/_shared/pass.ts", import.meta.url))).href);
const ask = async (email) => {
  const res = await handler(new Request("https://test.invalid/functions/v1/pip-reader", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "pip_read", arguments: { url: `https://test.invalid/functions/v1/pip-pass?email=${encodeURIComponent(email)}&d=testfork.example` } } }) }));
  return JSON.parse((await res.json()).result.content[0].text);
};

test("an email gets a level-1 pass at once and a six-digit code by email; only the code's hash is stored", async () => {
  world.mails = []; world.codes = [];
  const r = await ask("Owner@TestFork.example");
  assert.equal(r.ok, true);
  assert.equal((await P.checkPass(r.pass)).level, 1, "the reveal never waits on the code");
  assert.equal(r.code_sent, true);
  const [mail] = world.mails, code = mail.text.match(/\b(\d{6})\b/)[1];
  assert.deepEqual(mail.to, ["owner@testfork.example"]);
  assert.match(mail.text, /never asks for a password/);
  const [row] = world.codes, id = await P.passId("owner@testfork.example");
  assert.equal(row.pass_id, id);
  assert.equal(row.code_hash, await P.codeHash(id, code));
  assert.equal(JSON.stringify(world.codes).includes(code), false, "the code itself is not stored");
});

test("a throwaway inbox gets no pass and no email", async () => {
  world.mails = [];
  const r = await ask("someone@mailinator.com");
  assert.deepEqual(r, { ok: false, error: "invalid_email" });
  assert.equal(world.mails.length, 0);
});
