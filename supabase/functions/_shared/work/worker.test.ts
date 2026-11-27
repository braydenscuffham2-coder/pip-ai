// pip-work's small decisions (worker.ts).
//   node --test supabase/functions/_shared/work/worker.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { failureEmail, FILL_CODES, nextRelease } from "./worker.ts";

test("a job is given back as what its last step said: again, a person, done or failed", () => {
  assert.deepEqual(nextRelease({ patch: {}, next: "again" }), { status: "queued", runAfterSeconds: 0 });
  assert.deepEqual(nextRelease({ patch: {}, next: "again", waitSeconds: 60 }), { status: "queued", runAfterSeconds: 60 });
  assert.deepEqual(nextRelease({ patch: {}, next: "again", waitSeconds: 999999 }), { status: "queued", runAfterSeconds: 3600 }, "never parked longer than an hour");
  assert.equal(nextRelease({ patch: {}, next: "owner" }).status, "waiting_owner");
  assert.equal(nextRelease({ patch: {}, next: "approval" }).status, "waiting_approval");
  assert.equal(nextRelease({ patch: {}, next: "done" }).status, "done");
  assert.equal(nextRelease({ patch: {}, next: "failed" }).status, "failed");
});

test("the founder's failure email names the business, the job and the reason", () => {
  const m = failureEmail({ id: "job-1", business_id: "biz-1", kind: "screen", title: "Add today's refill requests", reason: "Stopped at this job's $1.00 cap.", summary: "Pip stopped this job.", step: 12, cost_usd: 1.004, finished_at: "2026-11-27T12:00:00Z", businesses: { name: "TEST Fork" } });
  assert.equal(m.subject, "Pip background job failed: Add today's refill requests");
  for (const part of ["Business: TEST Fork", "Reason: Stopped at this job's $1.00 cap.", "Steps taken: 12. Cost: $1.00.", "Job id: job-1"]) assert.ok(m.text.includes(part), part);
});

test("pip-work only believes vault answers it knows, and its knock needs no pass while the other routes do", () => {
  assert.ok(FILL_CODES.includes("wrong_site") && FILL_CODES.includes("submitted"));
  const src = readFileSync(new URL("../../pip-work/index.ts", import.meta.url), "utf8");
  assert.ok(/FILL_CODES\.includes\(code\) \? code : "unavailable"/.test(src), "an unknown vault answer is treated as unavailable");
  const tick = src.indexOf('path === "/tick"'), gate = src.indexOf("same(bearer, SB_KEY)"), enqueue = src.indexOf('path === "/enqueue"');
  assert.ok(tick > 0 && gate > tick && enqueue > gate, "/enqueue, /resume and /stop sit behind the service key; /tick does not");
  assert.ok(!/console\.(log|error)\([^)]*(password|username|secret)/i.test(src), "nothing secret-shaped is logged");
});
