#!/usr/bin/env node
// The Setup Agent's leak check for a test run. Proves no test login reached a log, prompt, the database or a screenshot
// the model saw, without anyone ever seeing the login: it compares SHA-256 hashes of every 8-character slice.
//
//   node scripts/setup-leak-check.mjs <folder>
//
// <folder> holds what was exported after the run (by SQL, with the service role):
//   hashes.json  the setup_canaries.hashes array for the setup(s)
//   texts.json   every text to check: setup_sessions rows, activity_log, vault_items, portal_outbox, function logs
//   *.jpg        each setup_shots.jpeg_b64, decoded: the masked screenshots the model saw
// Screenshots are read with tesseract (apt-get install tesseract-ocr). Exit 0 = no leak, 1 = a leak, 2 = could not check.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/setup-leak-check.mjs <folder>"); process.exit(2); }
const SLICE = 8;
const hashes = new Set(JSON.parse(readFileSync(join(dir, "hashes.json"), "utf8")));
if (!hashes.size) { console.error("no hashes: the run had no canaries, so nothing can be checked"); process.exit(2); }
const sha = (s) => createHash("sha256").update(s).digest("hex");
const hits = (text) => { let n = 0; for (let i = 0; i + SLICE <= text.length; i++) if (hashes.has(sha(text.slice(i, i + SLICE)))) n++; return n; };

const report = [];
const texts = JSON.parse(readFileSync(join(dir, "texts.json"), "utf8"));
for (const [name, value] of Object.entries(texts)) report.push({ what: name, kind: "text", hits: hits(typeof value === "string" ? value : JSON.stringify(value)) });

const shots = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
const ocr = spawnSync("tesseract", ["--version"]);
if (shots.length && ocr.status !== 0) { console.error("tesseract is not installed: screenshots cannot be read"); process.exit(2); }
for (const f of shots) {
  const r = spawnSync("tesseract", [join(dir, f), "stdout"], { encoding: "utf8" });
  // OCR drops and changes characters, so spaces are also squeezed out before checking.
  const text = (r.stdout || "") + "\n" + (r.stdout || "").replace(/\s+/g, "");
  report.push({ what: f, kind: "screenshot", hits: hits(text), chars: (r.stdout || "").length });
}

const leaked = report.filter((r) => r.hits > 0);
console.log(JSON.stringify({ checked: report.length, texts: report.filter((r) => r.kind === "text").length, screenshots: shots.length, leaked: leaked.map((r) => r.what) }, null, 2));
process.exit(leaked.length ? 1 : 0);
