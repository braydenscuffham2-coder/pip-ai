import { bad, json } from '@/lib/server/http';
import { getSpec } from '@/lib/server/runtime-store';

export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

/** GET /api/runtime/skill?id=<spec id> -> what the chat widget shows (never the persona or brain). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('invalid_id');
  const s = await getSpec(id);
  if (!s || !['live', 'approved', 'sandbox'].includes(s.status)) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json', ...CORS } });
  const r = json({ business: s.business, name: s.spec.name, opener: s.spec.agent.opener || `Hi! You've reached ${s.business}. How can we help?`, status: s.status });
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
