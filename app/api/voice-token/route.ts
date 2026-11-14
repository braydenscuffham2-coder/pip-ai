export const dynamic = 'force-dynamic';

/**
 * POST /api/voice-token  { biz, mate }  ->  the voice-token edge function's answer
 * Pip's call page (/talk.html) asks here for a one-time ElevenLabs token. The key and the call caps
 * live in the edge function; this route only forwards, so the page needs no backend address.
 */
export async function POST(req: Request) {
  const base = process.env.SUPABASE_URL;
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (!base) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers });
  const body = (await req.text()).slice(0, 4000);
  const r = await fetch(`${base}/functions/v1/voice-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r) return new Response(JSON.stringify({ error: 'unavailable' }), { status: 502, headers });
  return new Response(await r.text(), { status: r.status, headers });
}
