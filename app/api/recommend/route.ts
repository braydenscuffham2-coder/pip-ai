import { recommend, sanitizeProfile } from '@/lib/engine';
import { bad, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/recommend  { profile: Profile }  ->  RecommendResponse
 * Preview implementation uses the rules engine. The real backend can keep the engine for
 * scores and ask the model to rewrite module names, lines, and demos for the business.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJson(req); } catch { return bad('bad_request'); }
  const profile = sanitizeProfile((body as { profile?: unknown })?.profile);
  if (!profile) return bad('invalid_profile');
  return json(recommend(profile, 'preview'));
}
