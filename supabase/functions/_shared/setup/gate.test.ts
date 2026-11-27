// Who may use the Setup Agent (gate.ts).
//   node --test supabase/functions/_shared/setup/gate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupOpen } from "./gate.ts";

const TEST_BIZ = "38794f73-3586-475b-b428-da75f29e6a27";
const REAL_BIZ = "11111111-2222-3333-4444-555555555555";

test("with the flag off, an owner cannot use the Setup Agent, on a real business or a TEST one", () => {
  assert.deepEqual(setupOpen({ flag: false, admin: false, business: REAL_BIZ, sandbox: [TEST_BIZ] }), { open: false, why: "off" });
  assert.deepEqual(setupOpen({ flag: false, admin: false, business: TEST_BIZ, sandbox: [TEST_BIZ] }), { open: false, why: "off" });
});

test("with the flag off, the founder can use it on a TEST business only", () => {
  assert.deepEqual(setupOpen({ flag: false, admin: true, business: TEST_BIZ, sandbox: [TEST_BIZ] }), { open: true, why: "founder_test" });
  assert.deepEqual(setupOpen({ flag: false, admin: true, business: REAL_BIZ, sandbox: [TEST_BIZ] }), { open: false, why: "off" });
});

test("with the flag on, every owner can use it", () => {
  assert.deepEqual(setupOpen({ flag: true, admin: false, business: REAL_BIZ, sandbox: [] }), { open: true, why: "on" });
});

test("a flag that is not the boolean true is off, and a TEST list that is not a list is empty", () => {
  for (const flag of ["true", 1, null, undefined, {}, "on"]) assert.equal(setupOpen({ flag, admin: false, business: REAL_BIZ, sandbox: [] }).open, false, String(flag));
  for (const sandbox of [null, undefined, "x", { [TEST_BIZ]: true }, TEST_BIZ]) assert.equal(setupOpen({ flag: false, admin: true, business: TEST_BIZ, sandbox }).open, false, String(sandbox));
  assert.equal(setupOpen({ flag: false, admin: true, business: "", sandbox: [""] }).open, false, "an empty business id never matches");
});

test("pip-portal asks this gate in both places, and nowhere reads the flag on its own", () => {
  const src = readFileSync(new URL("../../pip-portal/index.ts", import.meta.url), "utf8");
  assert.equal((src.match(/setupGate\(/g) || []).length, 3, "one definition and two uses");
  assert.equal((src.match(/setting\("setup_agent_on"/g) || []).length, 1, "the flag is read once, inside setupGate");
});
