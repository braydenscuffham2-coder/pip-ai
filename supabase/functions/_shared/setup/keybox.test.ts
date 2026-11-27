// vault-writer's route (keybox.ts) with the database, 1Password and the browser faked.
//   node --test supabase/functions/_shared/setup/keybox.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticatorOf, hint, keybox, type KeyboxDeps } from "./keybox.ts";

const TICKET = "t".repeat(43), USER = "owner@testfork.example", PASS = "Tr0ub4dor&3-correct-horse";
async function sha(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

async function world(over: Partial<KeyboxDeps> = {}, ticket: any = {}) {
  const h = await sha(TICKET), log: any[] = [], order: string[] = [], refs: any[] = [], vaultItems: any[] = [];
  const t: any = { setup_id: "s1", expires_at: new Date(Date.now() + 60_000).toISOString(), used_at: null, ...ticket };
  const deps: KeyboxDeps = {
    ticket: async (x) => (x === h ? t : null),
    useTicket: async () => { if (t.used_at) return false; t.used_at = "now"; return true; },
    setup: async () => ({ id: "s1", business_id: "b1", tool: "Supplier portal", tool_key: "supplier-portal", login_url: "https://app.example.com/login", state: "owner_control", browser_session_id: "bb_1", plan: { keybox: true } }),
    vault: async () => ({
      vaultFor: async (bid) => { order.push("vault"); return `vault-${bid}`; },
      putLogin: async (vid, it) => { order.push("put"); vaultItems.push({ vid, ...it }); return { itemId: "item1", ref: `op://${vid}/item1` }; },
    }),
    page: async () => ({ evaluate: async () => "https://app.example.com/login" } as any),
    fill: async (_p, u, p) => { order.push("fill"); return { user: u === USER, pass: p === PASS, submitted: true }; },
    saveRef: async (r) => { refs.push(r); return "vi1"; },
    note: async (_id, what) => { log.push(what); },
    ...over,
  };
  return { deps, log, order, refs, vaultItems, t };
}
const send = (deps: KeyboxDeps, body: any = { ticket: TICKET, username: USER, password: PASS }) => keybox(body, deps);

test("a good ticket saves the login to the client's vault first, then types it into the form, and answers with a code only", async () => {
  const w = await world();
  const r = await send(w.deps);
  assert.deepEqual(r, { status: 200, code: "submitted" });
  assert.deepEqual(w.order, ["vault", "put", "fill"], "vault before the form: if the vault fails, nothing is typed");
  assert.deepEqual(w.vaultItems, [{ vid: "vault-b1", title: "Supplier portal", url: "https://app.example.com/login", username: USER, password: PASS }]);
});

test("Pip's database and log get a reference and a masked hint, never the login", async () => {
  const w = await world();
  await send(w.deps);
  const kept = JSON.stringify({ refs: w.refs, log: w.log });
  assert.equal(kept.includes(PASS), false);
  assert.equal(kept.includes(USER), false);
  assert.equal(w.refs[0].vault_ref, "op://vault-b1/item1");
  assert.equal(w.refs[0].username_hint, "o••••@testfo");
  assert.ok(w.refs[0].username_hint.length <= 12, "fits vault_items.username_hint");
});

test("a ticket works once, and an expired, unknown or malformed ticket is refused before anything is touched", async () => {
  const w = await world();
  assert.equal((await send(w.deps)).code, "submitted");
  assert.deepEqual(await send(w.deps), { status: 403, code: "ticket_expired" });
  const old = await world({}, { expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await send(old.deps)).code, "ticket_expired");
  assert.equal(old.order.length, 0);
  assert.equal((await send(w.deps, { ticket: "u".repeat(43), username: USER, password: PASS })).code, "ticket_expired");
  assert.equal((await send(w.deps, { ticket: "short", username: USER, password: PASS })).code, "bad_ticket");
});

test("only while the owner is signing in, and only with a username and password", async () => {
  const w = await world({ setup: async () => ({ id: "s1", business_id: "b1", tool: "x", tool_key: "x", login_url: null, state: "configuring", browser_session_id: "bb_1", plan: {} }) });
  assert.equal((await send(w.deps)).code, "not_waiting_for_sign_in");
  assert.equal((await send(w.deps, { ticket: TICKET, username: "", password: PASS })).code, "bad_input");
  assert.equal((await send(w.deps, { ticket: TICKET, username: USER })).code, "bad_input");
});

test("if the vault fails, nothing is typed into the page and the owner is told", async () => {
  const w = await world({ vault: async () => ({ vaultFor: async () => { throw new Error("1password down"); }, putLogin: async () => ({ itemId: "", ref: "" }) }) });
  assert.deepEqual(await send(w.deps), { status: 502, code: "vault_failed" });
  assert.equal(w.order.includes("fill"), false);
});

test("with no 1Password token set, it says so instead of guessing", async () => {
  const w = await world({ vault: async () => null });
  assert.deepEqual(await send(w.deps), { status: 503, code: "vault_not_configured" });
});

test("username hints never carry more than the first letter and part of the domain", () => {
  assert.equal(hint("brayden@gmail.com"), "b••••@gmail.");
  assert.equal(hint("frontdesk42"), "f••••");
});

test("the key box refuses when the browser is not on the tool's own site: nothing reaches the vault or the page", async () => {
  for (const href of ["https://app.example.com.evil.test/login", "http://app.example.com/login", ""]) {
    const w = await world({ page: async () => ({ evaluate: async () => href } as any) });
    assert.deepEqual(await send(w.deps), { status: 409, code: "wrong_site" }, href);
    assert.deepEqual(w.order, [], "no vault write, no typing");
    assert.equal(w.refs.length, 0);
  }
});

test("an authenticator key is kept only for a tool whose terms Pip has checked, and the ticket is not spent on a refusal", async () => {
  const KEY = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const no = await world({ terms: async () => "unknown" });
  assert.deepEqual(await send(no.deps, { ticket: TICKET, username: USER, password: PASS, authenticator: KEY }), { status: 409, code: "authenticator_not_allowed" });
  assert.equal(no.t.used_at, null);
  assert.deepEqual(no.order, []);
  const yes = await world({ terms: async () => "allowed" });
  assert.equal((await send(yes.deps, { ticket: TICKET, username: USER, password: PASS, authenticator: "jbsw y3dp-ehpk 3pxp jbsw y3dp ehpk 3pxp" })).status, 200);
  assert.equal(yes.vaultItems[0].authenticator, `otpauth://totp/Pip?secret=${KEY}`);
  assert.equal(yes.refs[0].has_authenticator, true);
  assert.ok(!JSON.stringify(yes.log).includes(KEY), "the key is not in the step log");
  const bad = await world({ terms: async () => "allowed" });
  assert.deepEqual(await send(bad.deps, { ticket: TICKET, username: USER, password: PASS, authenticator: "123456" }), { status: 400, code: "bad_authenticator" });
});

test("an authenticator key is read as a bare key or an otpauth link, and nothing else", () => {
  assert.equal(authenticatorOf("JBSWY3DPEHPK3PXP"), "otpauth://totp/Pip?secret=JBSWY3DPEHPK3PXP");
  assert.equal(authenticatorOf("otpauth://totp/Tool:pip?secret=JBSWY3DPEHPK3PXP&issuer=Tool"), "otpauth://totp/Tool:pip?secret=JBSWY3DPEHPK3PXP&issuer=Tool");
  for (const bad of ["123456", "otpauth://totp/Tool", "https://example.com", "not a key!"]) assert.equal(authenticatorOf(bad), null, bad);
});

test("the host the owner signed in on is remembered, so a later silent sign-in may use that host and no other", async () => {
  const seen: string[] = [];
  const w = await world({ page: async () => ({ evaluate: async () => "https://login.example.com/start" } as any), signedInOn: async (_id, host) => { seen.push(host); } });
  assert.equal((await send(w.deps)).status, 200);
  assert.deepEqual(seen, ["login.example.com"]);
});
