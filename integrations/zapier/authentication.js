// The owner connects Pip with two values from their own Pip Portal (Setup, Doors, the door named Zapier):
// the Connection ID and its secret. The secret is shown once in the Portal and can be replaced there at any time.
const { BASE, door, headers, explain } = require('./lib');

const test = async (z, bundle) => {
  const res = explain(z, await z.request({ url: `${BASE}/hook/${door(bundle)}`, method: 'GET', headers: headers(bundle), skipThrowForStatus: true }));
  return res.data;
};

module.exports = {
  type: 'custom',
  fields: [
    { key: 'connection_id', label: 'Connection ID', required: true, type: 'string', helpText: 'In your Pip Portal open Setup, then Doors, and copy the Connection ID of the door called Zapier.' },
    { key: 'secret', label: 'Secret', required: true, type: 'password', helpText: 'In the same place tap "Make and show a new secret". It is shown once. Making a new one stops the old one.' },
  ],
  test,
  connectionLabel: '{{business}}',
};
