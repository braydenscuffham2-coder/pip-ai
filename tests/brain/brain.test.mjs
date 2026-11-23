// Job 3 and the Brain bundle. (1) Nothing that is not an operator changes: the patched bundle gives byte-identical gate,
// score and selection output on a fixed corpus recorded from the unpatched bundle. (2) The operator rules hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadBrain } from "./harness.mjs";
import { CORPUS, MATERIAL, MOMENTS, NEVER, CTXS } from "./corpus.mjs";

const golden = JSON.parse(readFileSync(fileURLToPath(new URL("./golden.json", import.meta.url)), "utf8"));
const brain = await loadBrain();
const ctx = (extra = {}) => ({ industry: "plumbing", state: "ID", material: MATERIAL, neverDesign: async () => null, ...extra });
const op = (id, name, uses, claims = [["Finished jobs never get asked for a review", "seen"]], why = "They told us on the site.") =>
  ({ id, name, uses, lens: "t", power: "operates", moment: "m1", why_personal: why, claims: claims.map(([text, status]) => ({ text, status, evidence: [] })) });
const ON = { operateLane: true };

test("golden: the gate, scorer and selection give identical output on 25 non-operator candidates, in three industries", async () => {
  for (const c of CTXS) {
    const rows = [];
    for (const cand of CORPUS) {
      const gate = await brain.__gate(cand, { ...c, material: MATERIAL, neverDesign: async () => NEVER[cand.id] || null });
      assert.deepEqual(JSON.parse(JSON.stringify(gate)), golden.gates[c.industry][cand.id], `gate ${c.industry} ${cand.id}`);
      const score = brain.__score(cand, gate, MOMENTS);
      assert.deepEqual(score, golden.scored[c.industry][cand.id], `score ${c.industry} ${cand.id}`);
      rows.push({ candidate: cand, gate, score });
    }
    const sel = brain.__select(rows, { industry: c.industry, keep: 6, fingerprints: [], scansInIndustry: 0 });
    assert.deepEqual({ selected: sel.selected.map((r) => r.candidate.id), wild: sel.wild?.candidate.id ?? null, excluded: sel.excluded.map((e) => [e.candidate.id, e.reason]) }, golden.selection[c.industry]);
  }
});

test("golden: the flag being on changes nothing for a candidate that has no operator in it", async () => {
  for (const cand of CORPUS) {
    const a = await brain.__gate(cand, { ...ctx(), neverDesign: async () => NEVER[cand.id] || null });
    const b = await brain.__gate(cand, { ...ctx(ON), neverDesign: async () => NEVER[cand.id] || null });
    assert.deepEqual(b, a, cand.id);
  }
});

test("the three operators are known to the gate but are not in the list a scan shows the model", () => {
  const ids = ["operate_content_social", "operate_review_requests", "operate_quote_followup"];
  for (const id of ids) { assert.equal(brain.__catalog.get(id)?.kind, "operate", id); assert.ok(!brain.PRIMITIVES.some((p) => p.id === id), `${id} must not be in PRIMITIVES`); }
  assert.equal(brain.PRIMITIVES.length, 63, "the catalog a scan reads is exactly what it was");
});

test("the Brain's operator rows match the ones the migration inserts, field by field", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261123_01_operate.sql", import.meta.url)), "utf8");
  for (const [id, row] of [...brain.__catalog].filter(([id]) => id.startsWith("operate_"))) {
    const at = sql.indexOf(`('${id}', 'operate'`); assert.ok(at > 0, `${id} not in the migration`);
    const part = sql.slice(at, sql.indexOf("\n", sql.indexOf("array['", sql.indexOf("'conversation_sim'", at))) + 1);
    for (const r of row.requires) assert.ok(part.includes(`'${r}'`), `${id} requires ${r}`);
    assert.ok(part.includes(`'${row.label.replace(/'/g, "''")}'`), `${id} label`);
    assert.ok(part.includes(`'${row.limits.replace(/'/g, "''")}'`), `${id} limits`);
    assert.ok(part.includes(row.outbound ? "'conversation_sim', true" : "'conversation_sim', false"), `${id} outbound`);
  }
});

test("flag off: an operator candidate is dropped with a plain reason", async () => {
  const g = await brain.__gate(op("o1", "Review asker", ["operate_review_requests"]), ctx());
  assert.equal(g.status, "drop"); assert.deepEqual(g.errors, ["operators are not switched on yet"]);
});

test("flag on: the components and the guards come with it, and the lane is operate", async () => {
  const g = await brain.__gate(op("o1", "Review asker", ["operate_review_requests"]), ctx(ON));
  assert.equal(g.status, "pass", g.errors.join("; "));
  assert.equal(g.lane, "operate");
  for (const need of ["email", "handoff", "consent_ledger", "ai_disclosure"]) assert.ok(g.repaired_uses.includes(need), `missing ${need}: ${g.repaired_uses}`);
  assert.equal(g.tier, "build");
});

test("a posting operator brings a public_post risk and the approval need", async () => {
  const g = await brain.__gate(op("o2", "Social poster", ["operate_content_social"], [["Their page has been quiet for months", "seen"]]), ctx(ON));
  assert.equal(g.status, "pass", g.errors.join("; "));
  assert.ok(g.risk.includes("public_post")); assert.ok(g.needs.includes("owner approves the brand voice and the accounts once"));
  for (const need of ["social_posting", "owner_approval", "draft_for_approval"]) assert.ok(g.repaired_uses.includes(need), need);
  const other = await brain.__gate(op("o3", "Quote follow-up", ["operate_quote_followup"], [["Quotes go quiet", "seen"]]), ctx(ON));
  assert.ok(!other.risk.includes("public_post"), "a customer operator does not post");
});

test("operators run in the cloud: any camera or on-site part drops it", async () => {
  const g = await brain.__gate(op("o4", "Review asker with a camera", ["operate_review_requests", "edge_box", "vision_zones"]), ctx(ON));
  assert.equal(g.status, "drop"); assert.match(g.errors.join(), /operators run in the cloud; remove the camera box/);
});

test("review gating is refused in the operator's own words, however it is worded", async () => {
  for (const [name, claim] of [
    ["Ask only happy customers", "Finished jobs go unasked"],
    ["Review asker", "Only ask customers who gave us 5 stars"],
    ["Review asker", "Screen with a sentiment check before we ask"],
    ["Review asker", "Send it to our promoters"],
    ["Review asker", "Ask satisfied customers for a Google review"],
  ]) {
    const g = await brain.__gate(op("o5", name, ["operate_review_requests"], [[claim, "seen"]]), ctx(ON));
    assert.equal(g.status, "drop", `${name} / ${claim}`); assert.match(g.errors.join(), /NEVER DESIGN/);
  }
  const ok = await brain.__gate(op("o6", "Review asker", ["operate_review_requests"], [["Reviews average 4.8 stars on Google", "seen"], ["Every finished job gets a thank-you", "seen"]]), ctx(ON));
  assert.equal(ok.status, "pass", "a claim that merely mentions stars is not gating: " + ok.errors.join("; "));
});

test("an operator is scored on its worst component once, with an autonomy discount, not once per part", async () => {
  const cand = op("o7", "Review asker", ["operate_review_requests"], [["Finished jobs go unasked", "seen"], ["Owner says reviews are thin", "seen"]]);
  const gate = await brain.__gate(cand, ctx(ON));
  const sc = brain.__score(cand, gate, MOMENTS);
  assert.equal(sc.feasibility, 0.7 * 0.85, "worst tier weight (build 0.7) times 0.85");
  assert.ok(sc.effort >= 3);
  const bag = 0.7 * 0.7 * 0.7; // what multiplying every build-tier part (operate, email, social) would give
  assert.ok(sc.feasibility > bag, "better than the product over every part");
});

test("at most two operators in the six shown, and an operator is never the wild idea", async () => {
  const mk = async (id, uses, power) => { const c = { ...op(id, id, uses, [["Evidence seen on site", "seen"], ["More evidence seen", "seen"], ["Owner said so", "seen"]]), power }; return { candidate: c, gate: await brain.__gate(c, ctx(ON)) }; };
  const rows = [];
  for (const [i, u] of [["a", "operate_review_requests"], ["b", "operate_quote_followup"], ["c", "operate_content_social"], ["d", "operate_review_requests"]]) rows.push(await mk(`op_${i}`, [u], `p_${i}`));
  for (const c of CORPUS.slice(0, 8)) { const gate = await brain.__gate(c, ctx()); rows.push({ candidate: c, gate }); }
  for (const r of rows) r.score = brain.__score(r.candidate, r.gate, MOMENTS);
  for (const r of rows.slice(0, 4)) r.score = { ...r.score, score: r.score.score * 100 + 100, impact: r.score.impact * 100 + 100 }; // make them the best by far
  const sel = brain.__select(rows, { industry: "plumbing", keep: 6, fingerprints: [], scansInIndustry: 0 });
  assert.equal(sel.selected.filter((r) => r.gate.lane === "operate").length, 2);
  assert.equal(sel.selected.length, 6);
  assert.ok(!sel.wild || sel.wild.gate.lane !== "operate");
});

test("the lane picker: onprem first, then operate, then code, then spec", () => {
  const P = (id) => brain.__catalog.get(id);
  assert.equal(brain.__lane([P("web_chat")]), "spec");
  assert.equal(brain.__lane([P("web_chat"), P("demand_forecast")]), "code");
  assert.equal(brain.__lane([P("operate_review_requests"), P("email")]), "operate");
  assert.equal(brain.__lane([P("operate_review_requests"), P("demand_forecast")]), "operate");
  assert.equal(brain.__lane([P("operate_review_requests"), P("edge_box")]), "onprem");
});
