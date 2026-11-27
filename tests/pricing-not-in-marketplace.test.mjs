// Pip's own prices come from one function, quote(), and reach two places only: the founder's pricing draft in the
// Portal and the pricing email tool in the Forge connector. The Marketplace never asks for them and never shows them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
test("no Marketplace page asks for a price or names the price book", () => {
  const pages = readdirSync(root("public")).filter((f) => f.endsWith(".html") && !["portal.html", "setup.html"].includes(f));
  assert.ok(pages.includes("app.html") && pages.includes("lock.html"));
  for (const f of pages) {
    const t = readFileSync(root("public/" + f), "utf8");
    for (const bad of ["quote_draft", "/founder/quote", "rpc/quote", "price_book", "price_settings", "pricing_quote"]) assert.ok(!t.includes(bad), `${f} mentions ${bad}`);
  }
});

test("quote() is called from the founder's Portal action and the Forge connector, and nowhere else", () => {
  const dir = root("supabase/functions"), callers = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "test") walk(p); } else if (/\.ts$/.test(f) && !/\.test\./.test(f) && /rpc\("quote"|rpc\/quote/.test(readFileSync(p, "utf8"))) callers.push(p.slice(dir.length + 1)); } })(dir);
  assert.deepEqual(callers.sort(), ["pip-forge-mcp/index.ts", "pip-portal/index.ts"]);
  const portal = readFileSync(join(dir, "pip-portal/index.ts"), "utf8");
  const founder = portal.slice(portal.indexOf('if (action === "quote_draft")'));
  assert.ok(portal.indexOf('rpc("quote"') > portal.indexOf('action === "quote_draft"'), "both calls sit inside the founder-only actions");
  assert.match(founder.slice(0, 2500), /draftWords\(data, mates\)/, "the draft answers with words and two numbers, not quote()'s cost lines");
});
