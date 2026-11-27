// The integration ladder picks the highest rung that fits AND that Pip can run today, and writes down why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRung, pickWords, READY_TODAY, RUNGS } from "./ladder.ts";

const ALL = Object.fromEntries(RUNGS.map((r) => [r.id, true])) as typeof READY_TODAY;

test("a tool with a reviewed connection takes rung 1, whatever else is true of it", () => {
  const p = pickRung({ tool: "Jobber", composio_toolkit: "jobber", on_zapier: true, owner_uses_zapier: true, has_webhooks: true, web_sign_in: true, terms: "allowed" });
  assert.equal(p.rung, "api"); assert.equal(p.n, 1); assert.match(p.why, /signs in on the tool's own page/);
  assert.deepEqual(p.better_later, []);
});

test("Zapier counts only in the owner's own account, and only when both halves are known to be true", () => {
  const base = { tool: "Vagaro", web_sign_in: true, terms: "unknown" as const, has_webhooks: false, can_email: false, has_export: false, desktop_only: false };
  assert.equal(pickRung({ ...base, on_zapier: true, owner_uses_zapier: true }, ALL).rung, "zapier");
  const no = pickRung({ ...base, on_zapier: true, owner_uses_zapier: false }, ALL);
  assert.notEqual(no.rung, "zapier"); assert.match(no.steps.find((s) => s.rung === "zapier")!.why, /never connects through an account of its own/);
  const maybe = pickRung({ ...base, on_zapier: true }, ALL);
  assert.equal(maybe.steps.find((s) => s.rung === "zapier")!.fits, "unknown");
  assert.ok(maybe.unknown.some((u) => /whether the owner uses Zapier/.test(u)), "what is not known is listed, not guessed");
});

test("a rung that fits but is not ready is passed over and named as better later", () => {
  const p = pickRung({ tool: "Vagaro", on_zapier: true, owner_uses_zapier: true, can_email: true, web_sign_in: true, terms: "allowed" });
  assert.equal(p.rung, "edges", "today that is email, because Zapier is not published and screens cannot be signed in");
  assert.deepEqual(p.better_later.map((b) => b.rung), ["zapier"]);
  assert.match(p.better_later[0].waiting_on, /prepared but not published/);
  assert.match(pickWords(p), /A better way later: the owner's own zapier\./);
});

test("screens are never chosen when the tool's terms forbid it or have not been read", () => {
  const f = { tool: "Some CRM", web_sign_in: true, has_webhooks: false, can_email: false, has_export: false, on_zapier: false, desktop_only: false };
  assert.equal(pickRung({ ...f, terms: "forbidden" }, ALL).rung, null);
  assert.match(pickRung({ ...f, terms: "forbidden" }, ALL).steps.find((s) => s.rung === "screen")!.why, /do not allow/);
  const unread = pickRung({ ...f, terms: "unknown" }, ALL);
  assert.equal(unread.rung, null); assert.match(unread.why, /Not enough is known/);
  assert.equal(pickRung({ ...f, terms: "allowed" }, ALL).rung, "screen");
});

test("desktop-only software goes to the on-site rung; today that is told plainly as not built", () => {
  const f = { tool: "QuickBooks Desktop", desktop_only: true, web_sign_in: false, has_webhooks: false, can_email: false, has_export: false, on_zapier: false };
  assert.equal(pickRung(f, ALL).rung, "onsite");
  const today = pickRung(f);
  assert.equal(today.rung, null); assert.match(today.why, /designed, not built/);
  assert.equal(pickRung({ ...f, partner: "Conductor" }, ALL).rung, "partner", "a sync partner outranks a box");
});

test("no software for the job means Pip builds the piece; and the order of the rungs never changes", () => {
  assert.equal(pickRung({ tool: "a waitlist", no_software: true }, ALL).rung, "build");
  assert.equal(pickRung({ tool: "a waitlist", no_software: true }).rung, null);
  assert.deepEqual(RUNGS.map((r) => r.id), ["api", "partner", "zapier", "edges", "screen", "onsite", "build"]);
  assert.deepEqual(pickRung({ tool: "x" }, ALL).steps.map((s) => s.rung), RUNGS.map((r) => r.id));
});
