// The choke point, checked from the outside: a provider call that can reach a customer may only live in a file that
// asks the one outbound gate. Mail Pip sends to owners, staff and Brayden (sign-in links, alerts) is a short named
// list, so a new sender cannot appear without someone adding it here on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../supabase/functions/", import.meta.url));
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "test") walk(p); } else if (/\.(ts|js)$/.test(f) && !/\.test\./.test(f)) files.push(p); } })(ROOT);
const src = Object.fromEntries(files.map((p) => [p.slice(ROOT.length), readFileSync(p, "utf8")]));

test("texts, customer email and door posts are only sent from files that ask the outbound gate", () => {
  const reaches = { "a text (Twilio Messages)": /\/Messages\.json/, "customer email (Gmail send)": /GMAIL_SEND_EMAIL/, "a door post (sendOut)": /\bsendOut\(/ };
  const found = [];
  for (const [name, text] of Object.entries(src)) {
    if (name === "_shared/edges.ts" || /brain\.js$|forge\.js$/.test(name)) continue; // where sendOut is defined; bundles that only name tools
    for (const [what, re] of Object.entries(reaches)) if (re.test(text)) { found.push(`${name}: ${what}`); assert.match(text, /outboundGate\(/, `${name} sends ${what} without asking the outbound gate`); }
  }
  assert.ok(found.some((f) => f.startsWith("pip-turn/")) && found.some((f) => f.startsWith("pip-run/")), "the known senders were found: " + found.join("; "));
});

test("mail to owners, staff and Brayden is sent from a short named list of files", () => {
  const KNOWN = ["lead-alert/index.ts", "pip-portal-ops/index.ts", "pip-portal/index.ts", "pip-reader/index.ts", "pip-shelf/index.ts", "pip-work/index.ts"];
  const senders = Object.entries(src).filter(([, t]) => /api\.resend\.com\/emails["'`]/.test(t)).map(([n]) => n).sort();
  assert.deepEqual(senders, KNOWN, "a new file sends mail through Resend: if it can reach a customer it must ask the outbound gate; if it is operational mail, add it to this list");
});

test("the gate is the database's to answer: the shared helper calls outbound_gate and nothing else", () => {
  const t = src["_shared/outbound.ts"];
  assert.match(t, /rpc\("outbound_gate"/); assert.doesNotMatch(t, /fetch\(/);
});
