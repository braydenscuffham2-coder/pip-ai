// The one-connection rule, checked in the source of the three functions that connect to the secure browser.
// On a plan where a browser ends when any connection leaves it, these are the mistakes that would end it early or
// move a password somewhere new.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fn = (name) => readFileSync(fileURLToPath(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url)), "utf8");
const setup = fn("setup-run"), vault = fn("vault-writer"), work = fn("pip-work");

test("no function keeps browser connections where another request could close them", () => {
  for (const [name, src] of [["setup-run", setup], ["vault-writer", vault], ["pip-work", work]]) {
    assert.equal(/^(const|let|var) sockets\b/m.test(src), false, `${name} has a shared socket list`);
  }
});

test("vault-writer never just disconnects: every connection it opens goes through letGo", () => {
  assert.equal((vault.match(/await letGo\(held\)/g) || []).length, 2, "both routes hand their connections to letGo");
  const closes = [...vault.matchAll(/\.close\(\)/g)].map((m) => vault.slice(Math.max(0, m.index - 60), m.index + 8));
  for (const c of closes) assert.ok(/h\.conn\.close\(\)/.test(c), "a close outside letGo: " + c);
  assert.match(vault, /browser_keep_alive/);
  assert.match(vault, /waitUntil\(linger\(/);
});

test("only vault-writer can reach the vault", () => {
  const dir = fileURLToPath(new URL("../supabase/functions/", import.meta.url));
  for (const name of readdirSync(dir)) {
    if (name === "vault-writer" || name === "_shared") continue;
    let src = ""; try { src = fn(name); } catch { continue; }
    assert.equal(/OP_SERVICE_ACCOUNT_TOKEN"\s*\)/.test(src) && /Deno\.env\.get\("OP_SERVICE_ACCOUNT_TOKEN"\)/.test(src), false, `${name} reads the vault token`);
    assert.equal(/onePassword\(/.test(src), false, `${name} opens the vault`);
    assert.equal(/getLogin\(/.test(src), false, `${name} reads a login`);
  }
  assert.match(vault, /onePassword\(OP\)/);
});

test("the runner has its own connections and writes a step only if the setup has not moved", () => {
  assert.match(setup, /async function runner\(id: string, me: string\) \{\s*const sockets: Sockets = new Map\(\);/);
  assert.match(setup, /save: \(patch, ifState\) => saveIf\(id, patch, ifState\)/);
  assert.match(setup, /&state=eq\.\$\{encodeURIComponent\(ifState\)\}/);
  assert.match(setup, /if \(await claimRunner\(id, me\)\) EdgeRuntime\.waitUntil\(runner\(id, me\)\);/);
});

test("the runner's path never asks vault-writer for anything and never types a login", () => {
  assert.equal(/vault-writer/.test(setup.replace(/\/\/.*$/gm, "")), false, "setup-run calls vault-writer");
  assert.equal(/fillLogin|fillCode/.test(setup), false, "setup-run types a login");
});
