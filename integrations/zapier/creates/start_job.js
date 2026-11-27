// Action: "Send to Your Pip Team". Whatever the Zap sends arrives at the business's Zapier door, and every teammate
// job that listens to that door starts once. Pip treats what arrives as information, never as instructions.
const { BASE, door, headers, explain } = require('../lib');

const perform = async (z, bundle) => {
  const { subject, details, fields } = bundle.inputData;
  const body = Object.assign({}, fields && typeof fields === 'object' ? fields : {}, { subject: String(subject || '').slice(0, 200) }, details ? { details: String(details).slice(0, 2000) } : {});
  // The same Zap step retried must not start the job twice: Zapier's own id for this run is the once-only key.
  const once = bundle.meta && bundle.meta.zap && bundle.meta.zap.id && bundle.meta.id ? `zap-${bundle.meta.zap.id}-${bundle.meta.id}`.slice(0, 100) : undefined;
  const res = explain(z, await z.request({ url: `${BASE}/hook/${door(bundle)}`, method: 'POST', headers: Object.assign(headers(bundle), once ? { 'idempotency-key': once } : {}), body, skipThrowForStatus: true }));
  const d = res.data || {};
  return { id: d.id || once || 'already-received', received: true, already_received: d.duplicate === true, jobs_started: d.started || 0 };
};

module.exports = {
  key: 'start_job',
  noun: 'Message',
  display: { label: 'Send to Your Pip Team', description: 'Tells your Pip team that something happened, so a teammate can act on it.' },
  operation: {
    inputFields: [
      { key: 'subject', label: 'What happened', required: true, type: 'string', helpText: 'A short line, for example "New booking" or "Invoice overdue".' },
      { key: 'details', label: 'Details', required: false, type: 'text', helpText: 'Anything the teammate should know. Do not send passwords or card numbers: Pip drops fields that look like secrets.' },
      { key: 'fields', label: 'More fields', required: false, dict: true, helpText: 'Named values from earlier steps, for example customer_name or appointment_time.' },
    ],
    perform,
    sample: { id: '7f1c2c1e-1111-4111-8111-000000000001', received: true, already_received: false, jobs_started: 1 },
    outputFields: [
      { key: 'id', label: 'Pip ID' }, { key: 'received', label: 'Received', type: 'boolean' },
      { key: 'already_received', label: 'Already received before', type: 'boolean' }, { key: 'jobs_started', label: 'Teammate jobs started', type: 'integer' },
    ],
  },
};
