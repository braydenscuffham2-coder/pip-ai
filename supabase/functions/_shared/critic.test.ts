// The Brain's critic: it argues against the first six, may swap at most two for stronger bench ideas, and every swap
// is checked in code. What it said is kept either way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCritique, bench, criticPrompt, MAX_SWAPS, readCritique, type Scored, type Selection } from "./critic.ts";

const idea = (id: string, score: number, gate = "pass"): Scored => ({ candidate: { id, name: id.replace(/-/g, " "), moment: "m1", power: "other", why_personal: `why ${id}`, claims: [{ text: `claim for ${id}`, status: "seen", evidence: [{ quote: "a quote", source: "review" }] }] }, gate: { status: gate }, score: { score } });
const six = ["a", "b", "c", "d", "e", "f"].map((x, i) => idea(x, 90 - i));
const scored = [...six, idea("wild", 70), idea("g", 69), idea("h", 68), idea("dropped", 99, "drop"), idea("i", 60)];
const sel = (): Selection => ({ selected: [...six], wild: scored[6], excluded: [] });
const V = (id: string, o: Record<string, unknown> = {}) => ({ id, evidence: "thin", generic: true, verdict: "keep", swap_for: null, why: `about ${id}`, ...o });

test("the bench is only ideas that passed the gate and were not picked, best first", () => {
  assert.deepEqual(bench(scored, sel()).map((s) => s.candidate.id), ["g", "h", "i"]);
});

test("six kept is a good answer: nothing changes and the critique is still written down", () => {
  const r = applyCritique(sel(), scored, { verdicts: six.map((s) => V(s.candidate.id, { evidence: "strong", generic: false })), note: "A specific set." }, "2026-11-27T05:00:00Z", 11.2);
  assert.equal(r.critique.revised, false); assert.deepEqual(r.selection.selected.map((s) => s.candidate.id), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(r.critique.verdicts.length, 6); assert.equal(r.critique.note, "A specific set."); assert.equal(r.critique.seconds, 11.2);
});

test("a generic, thinly evidenced idea is swapped for a bench idea, in place", () => {
  const r = applyCritique(sel(), scored, { verdicts: [V("a", { evidence: "strong", generic: false }), V("c", { verdict: "swap", swap_for: "g", why: "Any dentist could be sold this." })] }, "t");
  assert.equal(r.critique.revised, true);
  assert.deepEqual(r.selection.selected.map((s) => s.candidate.id), ["a", "b", "g", "d", "e", "f"]);
  assert.deepEqual(r.critique.swapped, [{ out: "c", in: "g", why: "Any dentist could be sold this." }]);
  assert.equal(r.selection.wild?.candidate.id, "wild", "the wild pick is not the critic's to touch");
});

test("every swap is checked: no dropped idea, no invented idea, no idea used twice, never more than two, never a strong specific one", () => {
  const r = applyCritique(sel(), scored, { verdicts: [
    V("a", { verdict: "swap", swap_for: "dropped" }), V("b", { verdict: "swap", swap_for: "made-up" }), V("c", { verdict: "swap", swap_for: "wild" }),
    V("d", { verdict: "swap", swap_for: "g" }), V("e", { verdict: "swap", swap_for: "g" }), V("f", { verdict: "swap", swap_for: "h", evidence: "strong", generic: false }),
    V("not-one-of-the-six", { verdict: "swap", swap_for: "i" }) ] }, "t");
  assert.deepEqual(r.critique.swapped.map((s) => `${s.out}>${s.in}`), ["d>g"]);
  assert.deepEqual(r.selection.selected.map((s) => s.candidate.id), ["a", "b", "c", "g", "e", "f"]);
  assert.deepEqual(r.critique.refused.map((x) => x.id), ["a", "b", "c", "e", "f"]);
  const many = applyCritique(sel(), scored, { verdicts: [V("a", { verdict: "swap", swap_for: "g" }), V("b", { verdict: "swap", swap_for: "h" }), V("c", { verdict: "swap", swap_for: "i" })] }, "t");
  assert.equal(many.critique.swapped.length, MAX_SWAPS); assert.match(many.critique.refused[0].why, /Only 2 swaps/);
});

test("an unreadable critique changes nothing and says so", () => {
  for (const bad of ["no json", '{"verdicts": "nope"}', '{"verdicts":[']) assert.equal(readCritique(bad), null);
  const r = applyCritique(sel(), scored, null, "t");
  assert.equal(r.critique.revised, false); assert.match(r.critique.note, /no readable answer/);
  assert.deepEqual(readCritique('Sure.\n{"verdicts":[{"id":"a"}],"note":"ok"} trailing {')!.verdicts, [{ id: "a" }]);
});

test("the prompt puts the evidence and both tests in front of the critic and caps what it is shown", () => {
  const p = criticPrompt({ profile: { name: "Maple Street Vet", industry: "vet", facts: ["x".repeat(9000)] }, moments: [{ id: "m1", when: "Sunday 9pm", severity: 5 }], selected: six, bench: bench(scored, sel()) });
  assert.match(p, /argue against them/); assert.match(p, /ANY BUSINESS\?/); assert.match(p, /At most 2 swaps/);
  assert.match(p, /"quotes":\["a quote"\]/); assert.ok(p.length < 16000, String(p.length));
  assert.ok(!p.includes("dropped"), "an idea the gate dropped is never offered");
});
