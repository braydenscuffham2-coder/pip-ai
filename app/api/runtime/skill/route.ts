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
  // Board-built teammates keep their name in the brain; the older kind keeps it in the spec.
  const agent = (s.brain as unknown as { agent?: { name?: string; teammate?: { name?: string } } }).agent;
  const name = s.spec?.name || agent?.teammate?.name || agent?.name || 'Assistant';
  // The first thing a visitor reads says this is an AI, on every teammate.
  const AI = /(\b(ai|artificial intelligence|automated assistant|virtual assistant|bot)\b|\ba\.i\.)/i;
  const given = s.spec?.agent?.opener || '';
  const opener = given && AI.test(given) ? given
    : given ? `${given} (I'm an AI assistant.)`
    : s.spec?.agent ? `Hi! You've reached ${s.business}. I'm an AI assistant. How can we help?`
    : `Hi, I'm ${name}, an AI assistant for ${s.business}. How can I help?`;
  const r = json({ business: s.business, name, opener, status: s.status });
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
