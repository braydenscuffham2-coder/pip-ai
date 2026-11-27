// Shared by the trigger, the action and the connection test. One place knows Pip's address and how the secret travels.
// The secret goes in a header, never in the address, so it never lands in a log on either side.
const BASE = 'https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-edge';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const door = (bundle) => {
  const id = String((bundle.authData && bundle.authData.connection_id) || '').trim();
  if (!ID.test(id)) throw new Error('The Connection ID does not look right. Copy it from your Pip Portal: Setup, Doors.');
  return id;
};
const headers = (bundle) => ({ 'content-type': 'application/json', 'x-pip-secret': String((bundle.authData && bundle.authData.secret) || '').trim() });

/** Turn Pip's answer into a plain error a Zap owner can act on. */
const explain = (z, res) => {
  if (res.status === 404) throw new z.errors.Error('Pip did not recognise this connection. Check the Connection ID and make a new secret in your Pip Portal (Setup, Doors).', 'AuthenticationError', 404);
  if (res.status === 429) throw new z.errors.ThrottledError('This Pip connection is at its limit for now.', 300);
  if (res.status === 503) throw new z.errors.Error('Pip has paused connections for the moment. Nothing was lost; try again later.', 'Paused', 503);
  if (res.status >= 400) throw new z.errors.Error('Pip could not take that (' + res.status + ').', 'PipError', res.status);
  return res;
};
module.exports = { BASE, door, headers, explain };
