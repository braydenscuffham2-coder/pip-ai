import { previewScan, normalizeDomain } from '@/lib/preview';
import { liveScan } from '@/lib/server/scan';
import { bad, readJson } from '@/lib/server/http';
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ScanEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        // The example business is fictional, so it always uses the labeled preview data.
        const events = domain === EXAMPLE || process.env.PIP_PREVIEW_ONLY === '1' ? previewScan(domain) : liveScan(domain, { fresh });
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
