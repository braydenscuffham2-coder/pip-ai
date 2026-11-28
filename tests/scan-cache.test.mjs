// A slimmed saved scan is never handed back as a full read.
// On Nov 28, 2026 the live page stopped with "I lost my train of thought" for a business Pip had already studied:
// the saved copy had a Google listing with no reviews list, and the page read its length.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usableScan, wholeRead } from "../lib/server/scan-cache.ts";

const PAGES = [{ url: "https://x.test/", title: "Home", text: "We fix pipes." }];
const FULL_PLACE = { id: "ChIJ1", name: "Gary The Plumber", rating: 4.9, count: 192, primaryType: "plumber", types: ["plumber"], reviews: [{ text: "Great", rating: 5 }] };
// exactly what scan-run keeps: the listing's id and kind, nothing else
const SLIM_PLACE = { id: "ChIJ1", primaryType: "plumber" };

test("the whole read the website saves is served", () => {
  assert.equal(wholeRead({ pages: PAGES, place: FULL_PLACE, competitors: [] }), true);
  assert.equal(wholeRead({ pages: PAGES, place: { ...FULL_PLACE, reviews: [] }, competitors: [] }), true, "a listing with no reviews yet still has the list");
  assert.equal(wholeRead({ pages: PAGES, competitors: [] }), true, "a business Google does not list");
  const saved = { raw: { pages: PAGES, place: FULL_PLACE }, profile: {}, used_model: true, created_at: "2026-11-28T00:00:00Z" };
  assert.equal(usableScan(saved), saved);
});

test("the slimmed copy the server-side scan keeps is not", () => {
  assert.equal(wholeRead({ pages: PAGES, place: SLIM_PLACE, competitors: [{ name: "Rival" }] }), false, "the copy that broke the live page");
  assert.equal(wholeRead({ pages: PAGES, place: { ...SLIM_PLACE, name: "Gary" } }), false, "a name alone is not a listing");
  assert.equal(wholeRead({ pages: PAGES, place: { ...FULL_PLACE, reviews: undefined } }), false);
  assert.equal(wholeRead({ kept: "slim", pages: PAGES }), false, "marked slim, even with no listing to give it away");
  assert.equal(wholeRead({ kept: "slim", pages: PAGES, place: FULL_PLACE }), false);
  assert.equal(usableScan({ raw: { pages: PAGES, place: SLIM_PLACE } }), null);
});

test("nothing odd is served either", () => {
  for (const raw of [null, undefined, "", 7, [], {}, { pages: "no" }, { pages: PAGES, place: "ChIJ1" }, { pages: PAGES, place: [] }]) assert.equal(wholeRead(raw), false, JSON.stringify(raw));
  assert.equal(usableScan(null), null); assert.equal(usableScan(undefined), null); assert.equal(usableScan({}), null);
});

test("every saved scan the website reads goes through the check, and the server-side scan marks its copy", () => {
  const store = readFileSync(new URL("../lib/server/store.ts", import.meta.url), "utf8");
  assert.match(store, /export const getScan = async \(domain: string, maxAgeHours = 168\) => usableScan\(await rpc<Cached>\('pip_scan_get'/);
  assert.equal((store.match(/pip_scan_get/g) || []).length, 1, "one reader of saved scans, and it is checked");
  const run = readFileSync(new URL("../supabase/functions/scan-run/index.ts", import.meta.url), "utf8");
  assert.match(run, /const keptRaw = \{ \.\.\.raw, kept: 'slim', pages:/);
  assert.match(run, /place: raw\.place \? \{ id: raw\.place\.id, primaryType: raw\.place\.primaryType \} : undefined/, "the slim listing is still what this test describes");
});
