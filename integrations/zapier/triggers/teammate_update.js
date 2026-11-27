// Trigger: "New Update From Your Pip Team". A teammate leaves an update in the business's Zapier door (its job is given
// that door by name); Zapier reads the door's feed and starts the Zap once per update. Nothing is pushed to Zapier.
const { BASE, door, headers, explain } = require('../lib');

const perform = async (z, bundle) => {
  const res = explain(z, await z.request({ url: `${BASE}/feed/${door(bundle)}`, method: 'GET', headers: headers(bundle), skipThrowForStatus: true }));
  const items = (res.data && Array.isArray(res.data.items)) ? res.data.items : [];
  // Zapier counts an item once by its id. Flatten what the teammate sent so each value can be mapped in later steps.
  return items.map((i) => Object.assign({ id: i.id, sent_at: i.sent_at }, i.data && typeof i.data === 'object' ? i.data : {}));
};

module.exports = {
  key: 'teammate_update',
  noun: 'Update',
  display: { label: 'New Update From Your Pip Team', description: 'Triggers when one of your Pip teammates leaves an update for Zapier, for example a new lead or a finished job.' },
  operation: {
    perform,
    sample: { id: '7f1c2c1e-1111-4111-8111-000000000002', sent_at: '2026-11-27T02:00:00.000Z', lead_name: 'Dana Whitfield', need: 'Refill for Pickle' },
    outputFields: [{ key: 'id', label: 'Update ID' }, { key: 'sent_at', label: 'Sent at', type: 'datetime' }],
  },
};
