import { bad, json, readJson } from '@/lib/server/http';
import { upsertSpec } from '@/lib/server/runtime-store';
import { validateSpec } from '@/lib/skills/spec';
import type { Brain } from '@/lib/skills/runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/specs  (header x-pip-admin: PIP_ADMIN_TOKEN)
 * { id?, business, domain?, status, spec, brain, quote?, tests? } -> { id }
 * Saves an approved Skill Spec so the runtime and the chat widget can serve it.
 */
export async function POST(req: Request) {
  const token = process.env.PIP_ADMIN_TOKEN;
  if (!token || req.headers.get('x-pip-admin') !== token) return bad('denied', 401);
  let body: unknown;
  try { body = await readJson(req, 200_000); } catch { return bad('bad_request'); }
  const b = (body || {}) as Record<string, unknown>;
  const business = typeof b.business === 'string' ? b.business.slice(0, 120) : '';
  const v = validateSpec(b.spec, business);
  if (!business || !v.spec) return bad('invalid_spec');
  if (!v.ok) return json({ error: 'invalid_spec', errors: v.errors }, 422);
  const status = ['draft', 'testing', 'needs_review', 'sandbox', 'approved', 'live', 'paused'].includes(b.status as string) ? b.status : 'approved';
  const brain = b.brain as Brain;
  if (!brain || !Array.isArray(brain.facts) || !Array.isArray(brain.qa)) return bad('invalid_brain');
  const id = await upsertSpec({ id: typeof b.id === 'string' ? b.id : null, business, domain: typeof b.domain === 'string' ? b.domain : null, status: status as never, spec: v.spec, brain, quote: b.quote, tests: b.tests });
  return id ? json({ id, waitingOn: v.waitingOn, tier: v.tier }) : bad('store_unavailable', 503);
}
