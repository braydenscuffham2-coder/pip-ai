// The owner's inbox in pip-portal, read from the source: who may see it, who may mark it, and that marking never deletes.
// (How it behaves in a browser is scripts/portal-check/inbox.py; what the database does is tests/db/owner-inbox.test.mjs.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync(new URL("../supabase/functions/pip-portal/index.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/portal.html", import.meta.url), "utf8");
const list = fn.slice(fn.indexOf("async function inboxList("), fn.indexOf("async function inboxAction("));
const action = fn.slice(fn.indexOf("async function inboxAction("), fn.indexOf("// Weekly notes (pip-notes)"));

test("staff are sent no messages; owners and the founder are", () => {
  assert.match(fn, /inbox: r\.role === "staff" \? \[\] : await inboxList\(bid,/);
});

test("the list is only this business's rows, only the kinds a teammate passes on, and every field is cut to length", () => {
  assert.match(list, /\.eq\("business_id", bid\)\.in\("kind", INBOX_KINDS\)/);
  assert.match(list, /cut\(args\[k\], k === "text" \? 1200 : 400\)/);
  assert.ok(!/awaiting_golive|needs_founder/.test(fn.slice(fn.indexOf("const INBOX_KINDS"), fn.indexOf("async function inboxList("))), "the founder's own alerts are not an owner's messages");
});

test("only an owner may mark a message, only inside their own business, and nothing is deleted", () => {
  assert.match(action, /const r = await access\(u, bid\); need\(r, "owner"\);/);
  assert.equal((action.match(/\.eq\("business_id", bid\)/g) || []).length, 3, "every read and write names the business");
  assert.ok(!/\.delete\(/.test(action) && !/\.delete\(/.test(list));
  assert.match(fn, /if \(a === "inbox"\) return await inboxAction\(u, bid, body\);/);
});

test("the Portal shows the card to owners on the Team tab and puts a customer's words on the page as text", () => {
  assert.match(html, /isOwner\(\) \? inboxCard\(\) : null,/);
  const card = html.slice(html.indexOf("function inboxCard()"), html.indexOf("function notesCard()"));
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(card));
});
