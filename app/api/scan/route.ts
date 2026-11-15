import { previewScan, normalizeDomain } from '@/lib/preview';
import { liveScan } from '@/lib/server/scan';
import { bad, readJson } from '@/lib/server/http';
import { getScan } from '@/lib/server/store';
import { llmEnabled } from '@/lib/server/llm';
import { guard, isPlatform } from '@/lib/server/guard';
import type { ScanEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EXAMPLE = 'harborlinehvac.com';

/**
 * POST /api/scan  { url: string }
 * Streams ScanEvent objects as newline-delimited JSON (application/x-ndjson).
 * Preview implementation: replace previewScan() with the real crawler + reviews + competitors pipeline.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJson(req, 4_000); } catch { return bad('bad_request'); }
  const url = typeof (body as { url?: unknown })?.url === 'string' ? (body as { url: string }).url : '';
  const fresh = (body as { fresh?: unknown })?.fresh === true;
  const domain = normalizeDomain(url);
  if (!domain) return bad('invalid_url');

  // A saved scan replays free. Anything else buys data and model time, so it has to pass the spend guard first.
  const preview = domain === EXAMPLE || process.env.PIP_PREVIEW_ONLY === '1';
  const cached = preview ? null : await getScan(domain);
  let refused: 'limit' | 'not_a_business' | null = null;
  let useFresh = fresh;
  if (!preview) {
    const whole = !!(cached?.raw && cached.profile) && (cached.used_model || !llmEnabled());
    if (!whole || fresh) {
      if (!cached?.raw && isPlatform(domain)) refused = 'not_a_business';
      else if (!(await guard(req, 'web_scan')).ok) { if (whole) useFresh = false; else refused = 'limit'; }
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ScanEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        // The example business is fictional, so it always uses the labeled preview data.
        if (refused) {
          send({ type: 'meta', source: 'live' });
          send({ type: 'error', code: refused, message: refused === 'limit' ? "I've read all the new sites I can for now." : "That isn't a business's own website." });
          return;
        }
        const events = preview ? previewScan(domain) : liveScan(domain, { fresh: useFresh, cached });
        for await (const e of events) {
          if (req.signal.aborted) break;
          send(e);
        }
      } catch {
        send({ type: 'error', message: "I couldn't finish reading that site.", code: 'internal' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}
