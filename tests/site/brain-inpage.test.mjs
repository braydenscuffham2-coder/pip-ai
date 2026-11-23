// The Brain that visitors get lives minified inside public/app.html. These tests load that exact script
// and check the rules that decide which teammates a business is shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const page = read('public/app.html');
const prompt = read('scripts/brain/engine-prompt.txt');

function loadBrain(html) {
  const open = '<script id="pip-brain">';
  const a = html.indexOf(open);
  assert.ok(a > 0, 'page has the Brain script');
  const b = html.indexOf('</script>', a);
  const sandbox = { console, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder, fetch: async () => { throw new Error('no network in tests'); } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(html.slice(a + open.length, b), sandbox, { timeout: 5000 });
  return sandbox.__pipBrain;
}

const brain = loadBrain(page);
const T = brain._t;
const moments = new Map([['m1', { id: 'm1', severity: 4 }], ['m2', { id: 'm2', severity: 4 }], ['m3', { id: 'm3', severity: 4 }], ['m4', { id: 'm4', severity: 4 }]]);
const seen = n => Array.from({ length: n }, (_, i) => ({ text: `claim ${i}`, status: 'seen', evidence: [] }));
const idea = (id, uses, extra = {}) => ({ id, name: id, power: 'other', moment: 'm1', uses, claims: seen(2), concept: '', ...extra });
const gateOf = async c => T.gate(c, { industry: 'home', state: 'ID', material: 'claim 0 claim 1', neverDesign: async () => null });
const scored = async (list, withRank = false) => Promise.all(list.map(async (c, i) => { const gate = await gateOf(c); return { candidate: c, gate, score: T.score(c, gate, moments, withRank ? i : undefined) }; }));

test('every copy of the Brain carries the same engine prompt', () => {
  for (const file of ['public/app.html', 'claude-app/modules/brain.js']) {
    const text = read(file);
    const start = text.indexOf('var __EP="') + 'var __EP='.length;
    let end = start + 1;
    for (;;) { end = text.indexOf('"', end); let back = 0; for (let m = end - 1; text[m] === '\\'; m--) back++; if (back % 2 === 0) break; end++; }
    assert.equal(JSON.parse(text.slice(start, end + 1)), prompt, `${file} is out of date: run scripts/brain/patch_brain.py`);
  }
});

test('the filled prompt has no empty slots and asks for what the business deserves', () => {
  const filled = T.fill({ name: 'Test Co', industry: 'home' }, [], {}, 'MATERIAL TEXT');
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(filled), 'no unfilled {{SLOT}}');
  assert.ok(filled.includes('- voice: Phone calls'), 'lists the building blocks');
  assert.ok(filled.includes('"new_capability"'), 'lets an idea name a part Pip would build');
  assert.ok(filled.includes('MATERIAL TEXT'));
  assert.ok(!filled.includes('—'), 'no em dashes');
});

test('a teammate that still has to be built is no longer buried under an easy one', async () => {
  const [easy, phone, camera] = await scored([
    idea('easy', ['web_chat', 'knowledge', 'capture_lead']),
    idea('phone', ['voice', 'calendar', 'transcripts', 'knowledge']),
    idea('camera', ['edge_box', 'vision_zones', 'dwell_model', 'live_board']),
  ]);
  assert.ok(phone.score.score >= 0.75 * easy.score.score, `phone ${phone.score.score} vs easy ${easy.score.score}`);
  assert.ok(camera.score.score >= 0.5 * easy.score.score, `camera ${camera.score.score} vs easy ${easy.score.score}`);
  assert.ok(easy.score.score >= phone.score.score && phone.score.score >= camera.score.score, 'with equal evidence, ready still edges out build, and build edges out hardware');
});

test("the engine's own order counts, and evidence still beats it", async () => {
  const [first, ninth] = [T.score(idea('a', ['web_chat']), await gateOf(idea('a', ['web_chat'])), moments, 0), T.score(idea('b', ['web_chat']), await gateOf(idea('b', ['web_chat'])), moments, 9)];
  assert.ok(first.score > ninth.score);
  const weak = idea('weak', ['web_chat'], { claims: [{ text: 'claim 0', status: 'inferred', evidence: [] }] });
  const strong = idea('strong', ['web_chat'], { claims: seen(3) });
  assert.ok(T.score(strong, await gateOf(strong), moments, 11).score > T.score(weak, await gateOf(weak), moments, 0).score);
});

test('at most one competitor-watching pick and one reviews pick reach a team', async () => {
  const list = await scored([
    idea('rival-a', ['rival_watch', 'weekly_report'], { moment: 'm1', claims: seen(4) }),
    idea('rival-b', ['rival_watch', 'owner_alerts'], { moment: 'm2', claims: seen(4) }),
    idea('reviews-a', ['google_profile', 'documents'], { power: 'reviews', moment: 'm3', claims: seen(4) }),
    idea('reviews-b', ['google_profile', 'owner_alerts'], { power: 'reviews', moment: 'm4', claims: seen(4) }),
    idea('desk', ['voice', 'calendar', 'knowledge'], { power: 'phone', moment: 'm2' }),
    idea('quote', ['photos', 'documents', 'knowledge'], { power: 'followup', moment: 'm3' }),
  ]);
  const picked = T.select(list, { industry: 'home', keep: 6 }).selected.map(x => x.candidate.id);
  assert.equal(picked.filter(id => id.startsWith('rival')).length, 1, picked.join(','));
  assert.equal(picked.filter(id => id.startsWith('reviews')).length, 1, picked.join(','));
  assert.ok(picked.includes('desk') && picked.includes('quote'));
});

test('with equal evidence, a specific teammate outranks a house pick', async () => {
  const list = await scored([idea('rival', ['rival_watch', 'weekly_report'], { moment: 'm1' }), idea('desk', ['voice', 'calendar', 'knowledge'], { power: 'phone', moment: 'm2' })]);
  assert.equal(T.select(list, { industry: 'home', keep: 1 }).selected[0].candidate.id, 'desk');
});

test('an idea that needs a part Pip has not built yet can take the big-swing slot', async () => {
  const list = await scored([
    idea('a', ['web_chat', 'knowledge'], { moment: 'm1', claims: seen(3) }),
    idea('frontier', ['pos', 'demand_forecast', 'weekly_report'], { moment: 'm2', new_capability: 'reads the kitchen screen to know ticket times' }),
  ]);
  const out = T.select(list, { industry: 'restaurant', keep: 1 });
  assert.equal(out.selected[0].candidate.id, 'a');
  assert.equal(out.wild?.candidate.id, 'frontier');
});

test('the gate still drops an idea built from parts that do not exist', async () => {
  const gate = await gateOf(idea('ghost', ['teleporter']));
  assert.equal(gate.status, 'drop');
  assert.equal(T.score(idea('ghost', ['teleporter']), gate, moments, 0).score, 0);
});

test('if the engine writes its answer twice, the last complete answer is used', () => {
  const first = { read: {}, moments: [{ id: 'm1' }], ideas: [{ id: 'draft', uses: ['made_up'] }] };
  const second = { read: {}, moments: [{ id: 'm1' }], ideas: [{ id: 'final', uses: ['voice'], concept: 'He said "hold on" {twice}' }] };
  const reply = '```json\n' + JSON.stringify(first, null, 2) + '\n```\n\nI caught an error in my "draft". Here is the corrected answer:\n\n```json\n' + JSON.stringify(second, null, 2) + '\n```';
  assert.equal(T.last(reply).ideas[0].id, 'final');
  assert.equal(T.last('no json here'), null);
  assert.equal(T.last('{"ideas":[]} trailing {'), null);
});

test('a house pick the engine ranked low needs far stronger evidence to make the team', async () => {
  const list = await scored([
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => idea(id, ['web_chat', 'knowledge'], { power: ['answers', 'booking', 'phone', 'followup', 'assistant', 'other'][i], moment: `m${(i % 4) + 1}` })),
    idea('ask-everyone', ['google_profile', 'documents'], { power: 'reviews', moment: 'm4', claims: seen(3) }),
    idea('g', ['forms', 'knowledge', 'capture_lead'], { power: 'other', moment: 'm3' }),
  ], true);
  const picked = T.select(list, { industry: 'home', keep: 7 }).selected.map(x => x.candidate.id);
  assert.ok(picked.indexOf('ask-everyone') === -1 || picked.indexOf('ask-everyone') > picked.indexOf('g'), picked.join(','));
});
