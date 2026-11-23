// The three places that know the operator catalog must agree: the Brain bundle, the Forge bundle, the migration.
//   node --experimental-strip-types --test tests/operate/drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIMITIVE_OF, PROCESSES, RULES } from "../../supabase/functions/_shared/operate.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const brain = read("supabase/functions/scan-run/brain.js"), forge = read("supabase/functions/pip-forge/forge.js"), mig = read("supabase/migrations/20261123_01_operate.sql");
const rowsOf = (src, helper) => [...src.matchAll(new RegExp(`^\\s*${helper}\\(\\{ id: "(operate_[a-z_]+)".*$`, "gm"))].map((m) => [m[1], m[0].trim().replace(new RegExp(`^${helper}\\(`), "d(").replace(/,$/, "")]);

test("the Brain and the Forge carry the same three operator rows, byte for byte", () => {
  const b = rowsOf(brain, "d"), f = rowsOf(forge, "a");
  assert.deepEqual(b.map((r) => r[0]), Object.values(PRIMITIVE_OF));
  assert.deepEqual(f.map((r) => r[0]), Object.values(PRIMITIVE_OF));
  assert.deepEqual(f, b);
});
test("the migration knows the same processes, with the same cadence limits as the TypeScript rules", () => {
  for (const p of PROCESSES) {
    assert.ok(mig.includes(`'${p}'`), `${p} is in the migration`);
    const r = RULES[p];
    if (r.reaches === "customer") for (const n of [r.max_days, r.max_touches ?? r.touches?.max, r.min_gap_hours]) if (n != null) assert.ok(new RegExp(`\\b${n}\\b`).test(mig), `${p}: ${n} appears in the migration`);
  }
});
