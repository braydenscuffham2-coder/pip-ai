// The Portal's background-work routes: who may use them and what leaves the server. Read from the source, because the
// function needs a database to run; the page itself is checked in a browser by scripts/portal-check/work_card.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const between = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const action = between("async function workAction", "throw new Fail(400, \"bad_action\")");
const list = between("async function workList", "async function workAction");

test("only the owner (or the founder) may answer for a job, and only for a job of their own business", () => {
  assert.match(action, /need\(r, "owner"\)/);
  assert.match(action, /\.eq\("id", jid\)\.eq\("business_id", bid\)/, "the job is looked up inside this business");
  assert.ok(action.indexOf('.eq("business_id", bid)') < action.indexOf("work_approve"), "ownership is checked before anything is answered");
});

test("the list sends the owner what they need to decide and never the whole plan", () => {
  assert.match(list, /pending: j\.status === "waiting_approval"/);
  assert.ok(!/plan: j\.plan/.test(list), "the plan itself never leaves the server");
  assert.match(src, /work: r\.role === "staff" \? \[\] : await workList\(bid\)/, "staff get no background-work list");
});

test("the yes and the no go through the database's own rule, with the owner's email on record", () => {
  assert.match(action, /db\.rpc\("work_approve", \{ p_job: jid, p_ok: action === "approve", p_by: u\.email \}\)/);
  assert.match(action, /db\.rpc\("work_resume", \{ p_job: jid \}\)/);
});
