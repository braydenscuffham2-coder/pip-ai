// The Portal's "What your team knows" card and the server's list of basics are written in two places (the Portal is
// one plain HTML file). This holds them together: same fields, same order, same labels, same lengths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/portal.html", import.meta.url), "utf8");
const ts = readFileSync(new URL("../supabase/functions/_shared/basics.ts", import.meta.url), "utf8");

const server = [...ts.matchAll(/\{ key: "(\w+)", label: "([^"]+)", hint: "([^"]+)", max: (\d+) \}/g)].map((m) => [m[1], m[2], m[3], Number(m[4])]);
const block = html.slice(html.indexOf("const BASICS = ["), html.indexOf("function knowsCard()"));
const portal = [...block.matchAll(/\["(\w+)", "([^"]+)", "([^"]+)", (\d+)\]/g)].map((m) => [m[1], m[2], m[3], Number(m[4])]);

test("the Portal card and the server agree on what a business can tell its team", () => {
  assert.equal(server.length, 8);
  assert.deepEqual(portal, server);
});

test("the card saves through the owner-only basics route and is drawn on the Setup tab", () => {
  assert.match(html, /api\("\/business\/" \+ id \+ "\/basics", \{ basics \}\)/);
  assert.match(html.slice(html.indexOf("function setupTab()")), /knowsCard\(\)/);
  const portalFn = readFileSync(new URL("../supabase/functions/pip-portal/index.ts", import.meta.url), "utf8");
  assert.match(portalFn, /async function setBasics\(u: User, bid: string, body: any\) \{\s*const r = await access\(u, bid\); need\(r, "owner"\);\s*const basics = cleanBasics\(body\?\.basics\);/);
});
