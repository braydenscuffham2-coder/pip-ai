// vault-writer's saved-login fill (keyfill.ts) with the database, the vault and the browser faked.
//   node --test supabase/functions/_shared/setup/keyfill.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillSaved, type KeyfillDeps } from "./keyfill.ts";
import { parseRef } from "./vendors.ts";

const ID = "11111111-2222-4333-8444-555555555555", SESSION = "bb-session-0001", REF = "op://vaultabcdefghij/itemabcdefghijk";
const USER = "pip@testfork.example", PASS = "Tr0ub4dor&3-correct-horse", CODE = "492817";

function world(o: { href?: string; tags?: any[]; totp?: boolean; vaultItem?: string | null; vaultThrows?: boolean; code?: string | null } = {}) {
  const calls: string[] = [], typed: string[] = [];
  let t = 0;
  const tags = o.tags ?? [{ user: true, pass: true, submit: true, twoStep: false }];
  let href = o.href ?? "https://app.practicetool.com/login";
  const page: any = {
    evaluate: async (js: string) => js === "location.href" ? href : tags[Math.min(t++, tags.length - 1)],
    setHref: (h: string) => { href = h; },
  };
  const deps: KeyfillDeps = {
    identity: async (id) => id === ID ? { id: ID, login_url: "https://app.practicetool.com/login", signin_hosts: [], vault_item_id: o.vaultItem === undefined ? "vi-1" : o.vaultItem, totp: !!o.totp } : null,
    vaultRef: async () => REF,
    vault: async () => ({
      vaultFor: async () => "v", putLogin: async () => ({ itemId: "i", ref: REF }),
      getLogin: async (ref) => { calls.push("vault"); assert.equal(ref, REF); if (o.vaultThrows) throw new Error("nope"); return { username: USER, password: PASS, code: o.code === undefined ? CODE : o.code }; },
    }),
    page: async (s) => (s === SESSION ? page : null),
    fill: async (_p, u, p) => { calls.push("fill"); typed.push(u, p); return { user: !!u, pass: !!p, submitted: true }; },
    fillCode: async (_p, c) => { calls.push("code"); typed.push(c); return { field: true, submitted: true }; },
    used: async () => { calls.push("used"); },
    wait: async () => {},
  };
  return { deps, calls, typed, page };
}
const body = { identity_id: ID, session_id: SESSION };

test("a saved login is typed into the tool's own sign-in page and only a code comes back", async () => {
  const w = world();
  const r = await fillSaved(body, "login", w.deps);
  assert.deepEqual(r, { status: 200, code: "submitted" });
  assert.deepEqual(w.typed, [USER, PASS]);
  assert.ok(!JSON.stringify(r).includes(PASS) && !JSON.stringify(r).includes(USER));
});

test("a page on another site is refused before the vault is even opened", async () => {
  for (const href of ["https://practicetool.com.evil.test/login", "https://practicetool-login.com/login", "https://someone-else.practicetool.com/login", "http://app.practicetool.com/login", "about:blank", ""]) {
    const w = world({ href });
    const r = await fillSaved(body, "login", w.deps);
    assert.deepEqual(r, { status: 409, code: "wrong_site" }, href);
    assert.deepEqual(w.calls, [], `nothing was read or typed for ${href}`);
  }
});

test("a username-first sign-in: the password is typed only after the site is checked again", async () => {
  const twoStep = [{ user: true, pass: false, submit: true, twoStep: true }, { user: false, pass: true, submit: true, twoStep: false }];
  const ok = world({ tags: twoStep });
  assert.deepEqual(await fillSaved(body, "login", ok.deps), { status: 200, code: "submitted" });
  assert.deepEqual(ok.typed, [USER, "", "", PASS]);
  // The first screen sends the browser somewhere else before the password screen.
  const moved = world({ tags: twoStep });
  const fill = moved.deps.fill;
  moved.deps.fill = async (p, u, pw) => { const r = await fill(p, u, pw); moved.page.setHref("https://collect.evil.test/password"); return r; };
  assert.deepEqual(await fillSaved(body, "login", moved.deps), { status: 409, code: "wrong_site" });
  assert.ok(!moved.typed.includes(PASS), "the password never left the vault service");
});

test("no sign-in form, no saved login, a closed browser and a vault error each answer plainly and type nothing", async () => {
  let w = world({ tags: [{ user: false, pass: false, submit: false, twoStep: false }] });
  assert.equal((await fillSaved(body, "login", w.deps)).code, "no_form"); assert.ok(!w.calls.includes("fill"));
  w = world({ vaultItem: null });
  assert.equal((await fillSaved(body, "login", w.deps)).code, "no_login");
  w = world();
  assert.equal((await fillSaved({ ...body, session_id: "another-session" }, "login", w.deps)).code, "browser_closed");
  w = world({ vaultThrows: true });
  assert.equal((await fillSaved(body, "login", w.deps)).code, "vault_failed"); assert.ok(!w.calls.includes("fill"));
  assert.equal((await fillSaved({ identity_id: "x", session_id: SESSION }, "login", world().deps)).code, "bad_request");
});

test("an authenticator code is entered only when the owner set one up for Pip, and only on the tool's own site", async () => {
  let w = world({ totp: true });
  assert.deepEqual(await fillSaved(body, "code", w.deps), { status: 200, code: "submitted" });
  assert.deepEqual(w.typed, [CODE]);
  w = world({ totp: false });
  assert.equal((await fillSaved(body, "code", w.deps)).code, "no_code"); assert.deepEqual(w.calls, []);
  w = world({ totp: true, href: "https://verify.evil.test/code" });
  assert.equal((await fillSaved(body, "code", w.deps)).code, "wrong_site"); assert.deepEqual(w.calls, []);
  w = world({ totp: true, code: null });
  assert.equal((await fillSaved(body, "code", w.deps)).code, "no_code"); assert.ok(!w.calls.includes("code"));
});

test("only a reference Pip itself stored is ever read back", () => {
  assert.deepEqual(parseRef(REF), { vaultId: "vaultabcdefghij", itemId: "itemabcdefghijk" });
  for (const bad of ["op://vault/item/password", "op://Private/Login", "https://example.com", "", "op://a/b"]) assert.equal(parseRef(bad), null, bad);
});
