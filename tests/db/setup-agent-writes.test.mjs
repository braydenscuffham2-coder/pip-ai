// What Pip's functions write to the owner's outbox and activity must be something the database accepts.
// Found before the Setup Agent's first live run: two of its writes were being refused without a sound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* not installed */ }
const root = fileURLToPath(new URL("../../", import.meta.url));
const sql = readFileSync(join(root, "supabase/migrations/20261127_03_setup_agent_writes.sql"), "utf8");
const ALLOWED = ["welcome", "signin", "invite", "paused", "price_ready", "disconnected", "setup_resignin", "tool_needs_you"];
// The live activity_log checks, read from the database on Nov 26, 2026.
const KINDS = ["action", "pause", "resume", "alert", "error", "supervisor", "system", "owner", "connection"];
const OUTCOMES = ["ok", "failed", "skipped", "paused", "info"];

function sources(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) out.push(p);
  }
  return out;
}
const files = sources(join(root, "supabase/functions")).map((p) => ({ p, s: readFileSync(p, "utf8") }));

test("the outbox accepts every email the functions queue, and still refuses one it does not know", { skip: !PGlite }, async () => {
  const db = new PGlite();
  await db.exec(`create table portal_outbox (id bigserial primary key, to_email text, template text,
    constraint portal_outbox_template_check check (template = any (array['welcome','signin','invite','paused','price_ready','disconnected'])));`);
  await assert.rejects(db.query("insert into portal_outbox (to_email, template) values ('owner@example.test', 'setup_resignin')"), "refused before the fix");
  await db.exec(sql);
  for (const t of ALLOWED) await db.query("insert into portal_outbox (to_email, template) values ('owner@example.test', $1)", [t]);
  await assert.rejects(db.query("insert into portal_outbox (to_email, template) values ('owner@example.test', 'made_up')"));
});

test("every outbox template a function names is one the database allows and pip-portal can write", () => {
  const portal = files.find((f) => f.p.endsWith("pip-portal/index.ts")).s;
  const named = new Set();
  for (const { s } of files) for (const line of s.split("\n")) {
    if (!line.includes("portal_outbox")) continue;
    for (const m of line.matchAll(/template:\s*"([a-z_]+)"/g)) named.add(m[1]);
  }
  assert.ok(named.has("setup_resignin"), "the Setup Agent's re-sign-in email is found by this scan");
  for (const t of named) {
    assert.ok(ALLOWED.includes(t), `${t} is not allowed by portal_outbox`);
    assert.ok(new RegExp(`\\b${t}: \\(d\\) =>`).test(portal), `pip-portal has no email written for ${t}`);
  }
});

test("every line a function writes to the owner's activity uses a kind and an outcome the database allows", () => {
  let seen = 0;
  for (const { p, s } of files) for (const line of s.split("\n")) {
    if (!/["'(]activity_log["')]/.test(line)) continue;
    for (const m of line.matchAll(/\bkind:\s*"([a-z_]+)"/g)) { seen++; assert.ok(KINDS.includes(m[1]), `${p}: activity kind "${m[1]}" is refused by the database`); }
    for (const m of line.matchAll(/\boutcome:\s*(?:[^,}]*\?\s*)?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/g)) for (const v of [m[1], m[2]].filter(Boolean)) assert.ok(OUTCOMES.includes(v), `${p}: activity outcome "${v}" is refused by the database`);
  }
  assert.ok(seen >= 1, "the scan found activity lines to check");
});
