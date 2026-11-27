// The Zapier app's own logic, run against a fake of Zapier's `z` and a fake of Pip's door. No network, and no need
// for zapier-platform-core to be installed (index.js is the only file that loads it).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const authentication = require('../authentication');
const startJob = require('../creates/start_job');
const teammateUpdate = require('../triggers/teammate_update');

const ID = '44444444-4444-4444-8444-444444444445';
const bundle = (extra) => Object.assign({ authData: { connection_id: ID, secret: 's'.repeat(48) }, inputData: {}, meta: {} }, extra);
function fakeZ(answer) {
  const calls = [];
  class ZErr extends Error { constructor(m, code, status) { super(m); this.code = code; this.status = status; } }
  class Throttled extends Error { constructor(m, delay) { super(m); this.delay = delay; } }
  return { calls, z: { errors: { Error: ZErr, ThrottledError: Throttled }, request: async (req) => { calls.push(req); return typeof answer === 'function' ? answer(req) : answer; } } };
}

test('the connection test sends the secret in a header, never in the address', async () => {
  const { z, calls } = fakeZ({ status: 200, data: { ok: true, business: 'TEST Fork', door: 'Zapier' } });
  const who = await authentication.test(z, bundle());
  assert.equal(who.business, 'TEST Fork');
  assert.equal(calls[0].method, 'GET');
  assert.ok(calls[0].url.endsWith('/hook/' + ID) && !calls[0].url.includes('ssss'));
  assert.equal(calls[0].headers['x-pip-secret'], 's'.repeat(48));
  assert.equal(authentication.fields.find((f) => f.key === 'secret').type, 'password');
});

test('a wrong secret, a busy door and a pause each give the Zap owner a plain reason', async () => {
  await assert.rejects(() => authentication.test(fakeZ({ status: 404, data: {} }).z, bundle()), /did not recognise this connection/);
  await assert.rejects(() => startJob.operation.perform(fakeZ({ status: 429, data: {} }).z, bundle({ inputData: { subject: 'x' } })), /at its limit/);
  await assert.rejects(() => teammateUpdate.operation.perform(fakeZ({ status: 503, data: {} }).z, bundle()), /paused/);
  await assert.rejects(() => authentication.test(fakeZ({ status: 200, data: {} }).z, bundle({ authData: { connection_id: 'not-an-id', secret: 'x' } })), /Connection ID does not look right/);
});

test('the action posts what happened once, with Zapier\'s own run id as the once-only key', async () => {
  const { z, calls } = fakeZ({ status: 200, data: { ok: true, id: 'ev-1', started: 2 } });
  const out = await startJob.operation.perform(z, bundle({ inputData: { subject: 'New booking', details: 'Dana, Tuesday 3pm', fields: { customer_name: 'Dana' } }, meta: { id: 'run-9', zap: { id: 'zap-7' } } }));
  assert.deepEqual(out, { id: 'ev-1', received: true, already_received: false, jobs_started: 2 });
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { customer_name: 'Dana', subject: 'New booking', details: 'Dana, Tuesday 3pm' });
  assert.equal(calls[0].headers['idempotency-key'], 'zap-zap-7-run-9');
  const again = await startJob.operation.perform(fakeZ({ status: 200, data: { ok: true, duplicate: true } }).z, bundle({ inputData: { subject: 'New booking' }, meta: { id: 'run-9', zap: { id: 'zap-7' } } }));
  assert.equal(again.already_received, true); assert.equal(again.jobs_started, 0);
});

test('the trigger returns one flat item per update, each with the id Zapier counts it by', async () => {
  const { z, calls } = fakeZ({ status: 200, data: { ok: true, items: [{ id: 'u2', sent_at: '2026-11-27T02:05:00Z', data: { lead_name: 'Dana', need: 'Refill' } }, { id: 'u1', sent_at: '2026-11-27T02:00:00Z', data: { lead_name: 'Marcus' } }] } });
  const items = await teammateUpdate.operation.perform(z, bundle());
  assert.deepEqual(items, [{ id: 'u2', sent_at: '2026-11-27T02:05:00Z', lead_name: 'Dana', need: 'Refill' }, { id: 'u1', sent_at: '2026-11-27T02:00:00Z', lead_name: 'Marcus' }]);
  assert.ok(calls[0].url.endsWith('/feed/' + ID));
  assert.deepEqual(await teammateUpdate.operation.perform(fakeZ({ status: 200, data: { ok: true } }).z, bundle()), []);
});

test('every key, label and sample Zapier needs is present', () => {
  for (const part of [startJob, teammateUpdate]) {
    assert.match(part.key, /^[a-z_]+$/); assert.ok(part.noun && part.display.label && part.display.description.endsWith('.'));
    assert.ok(part.operation.sample.id && typeof part.operation.perform === 'function');
  }
  assert.ok(startJob.operation.inputFields.some((f) => f.key === 'subject' && f.required));
});
