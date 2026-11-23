// Tests for the owner's approval checks. Run from the repo root:
//   node --experimental-strip-types --test supabase/functions/_shared/operate-approval.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAsk, mayApprove, mayRevoke } from "./operate-approval.ts";
import { compileOperator } from "./operate.ts";
import { CONTRACT } from "./teammate-spec.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const spec = (p: "content_social" | "review_requests"): J => { const c = compileOperator(p, { business: "Fork Plumbing", teammate: "Pip", accounts: ["facebook_page", "instagram_biz"], channels: p === "content_social" ? ["facebook", "instagram"] : ["email"] }); return { contract: CONTRACT, jobs: c.jobs, operate: c.operate }; };
const POSTS = spec("content_social"), REVIEW = spec("review_requests");

test("only the business's own owner approves; the founder and staff never do", () => {
  assert.equal(mayApprove("owner", false), true);
  assert.equal(mayApprove("owner", true), false, "an admin acting as founder is not the owner");
  for (const r of ["founder", "staff", "", "admin", "OWNER"]) assert.equal(mayApprove(r, false), false, r);
});
test("taking an approval back is open to the owner, staff and the founder, and nobody else", () => {
  for (const r of ["owner", "staff", "founder"]) assert.equal(mayRevoke(r), true);
  for (const r of ["", "customer", "OWNER"]) assert.equal(mayRevoke(r), false);
});
test("a brand voice is requested with real words, and only by an operator that posts", () => {
  assert.deepEqual(checkAsk(POSTS, { do: "request", kind: "brand_voice", voice: { text: "Friendly, plain, a little dry. We say 'fixed it right'." } }), { ok: true, do: "request", kind: "brand_voice", subject: "", voice: { text: "Friendly, plain, a little dry. We say 'fixed it right'." } });
  assert.equal(checkAsk(POSTS, { do: "request", kind: "brand_voice", voice: { text: "ok" } }).ok, false);
  assert.equal(checkAsk(POSTS, { do: "request", kind: "brand_voice" }).ok, false);
  assert.equal(checkAsk(REVIEW, { do: "request", kind: "brand_voice", voice: { text: "A perfectly good voice description." } }).ok, false, "a review operator has no voice to approve");
});
test("an account is requested only if the operator was built to post to it", () => {
  assert.equal(checkAsk(POSTS, { do: "request", kind: "account", subject: "facebook_page" }).ok, true);
  assert.equal(checkAsk(POSTS, { do: "request", kind: "account", subject: "tiktok" }).ok, false);
  assert.equal(checkAsk(POSTS, { do: "request", kind: "account", subject: "" }).ok, false);
  assert.equal(checkAsk(REVIEW, { do: "request", kind: "account", subject: "facebook_page" }).ok, false);
});
test("approve and revoke need a real id; anything else is refused", () => {
  assert.deepEqual(checkAsk(POSTS, { do: "approve", id: 5 }), { ok: true, do: "approve", id: 5 });
  assert.deepEqual(checkAsk(POSTS, { do: "revoke", id: "7" }), { ok: true, do: "revoke", id: 7 });
  for (const id of [0, -1, 1.5, "x", null, undefined, 2 ** 60]) assert.equal(checkAsk(POSTS, { do: "approve", id }).ok, false, String(id));
  for (const b of [null, undefined, 1, "x", [], {}, { do: "delete" }, { do: "request" }, { do: "request", kind: "other" }]) assert.equal(checkAsk(POSTS, b).ok, false, JSON.stringify(b));
});
test("a teammate that is not an operator has nothing to approve, and nothing throws on junk", () => {
  for (const s of [null, undefined, {}, { contract: CONTRACT, jobs: [] }, "x", 1]) assert.equal(checkAsk(s, { do: "approve", id: 1 }).ok, false);
});
