import Anthropic from '@anthropic-ai/sdk';
import { guard } from '@/lib/server/guard';
import { logEvent } from '@/lib/server/store';
import { costOf } from '@/lib/server/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/sample  { input, modelTier?, model?, effort? }  ->  a stream of JSON lines
 *   {"t":"d","d":"<new text>"} ... then {"t":"end","truncated":bool,"tier":"...","model":"..."} or {"t":"err","code":"..."}
 *
 * The website's stand-in for the Claude app's `sample` capability, so the Pip page (public/app.html) works for
 * anyone, with no Claude account. In the Claude app every model call runs on the viewer's own plan; here it runs
 * on Pip's ANTHROPIC_API_KEY, so it sits behind the spend guard: kind `app_llm` (calls per visitor and per day) and
 * the dollar meter `app_llm_usd` (see supabase/migrations/20261115_app_llm_guard.sql). Over a limit the page gets
 * `rate_limited`, the same code the Claude app gives.
 *
 * Tiers follow the page's own map (opus = complex, sonnet = default, haiku = quick).
 */

const TIERS = {
  quick: { model: 'claude-haiku-5-5', effort: 'low' },
  default: { model: 'claude-sonnet-5-5', effort: 'medium' },
  complex: { model: 'claude-opus-5-5', effort: 'high' },
} as const;
type Tier = keyof typeof TIERS;
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const EFFORTS = new Set(['low', 'medium', 'high']);
const MAX_CHARS = 900_000;

// Only the Pip page itself may call this from a browser.
function fromPip(req: Request): boolean {
  const o = req.headers.get('origin') || '';
  if (!o) return false;
  try {
    const h = new URL(o).hostname;
    return h === 'pip-ai-drab.vercel.app' || /^pip-[a-z0-9-]+-braydenscuffham2-coders-projects\.vercel\.app$/.test(h) || h === 'localhost';
  } catch { return false; }
}

type Turn = { role: 'user' | 'assistant'; content: string };
function turnsOf(input: unknown): Turn[] | null {
  if (typeof input === 'string') return input.trim() ? [{ role: 'user', content: input }] : null;
  if (!Array.isArray(input) || !input.length || input.length > 40) return null;
  const out: Turn[] = [];
  for (const m of input) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    out.push({ role, content });
  }
  return out[out.length - 1].role === 'user' ? out : null;
}

export async function POST(req: Request) {
  const line = (o: unknown) => JSON.stringify(o) + '\n';
  const fail = (code: string, status: number) => new Response(line({ t: 'err', code }), { status, headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
  if (!fromPip(req)) { console.warn('[sample] refused origin', (req.headers.get('origin') || '-').slice(0, 80)); return fail('not_granted', 403); }
  if (!process.env.ANTHROPIC_API_KEY) return fail('sampling_disabled', 503);

  const raw = await req.text();
  if (raw.length > MAX_CHARS + 2000) return fail('prompt_too_large', 413);
  let body: { input?: unknown; modelTier?: unknown; model?: unknown; effort?: unknown };
  try { body = JSON.parse(raw); } catch { return fail('invalid_request', 400); }
  const turns = turnsOf(body.input);
  if (!turns) return fail('invalid_request', 400);
  if (turns.reduce((n, t) => n + t.content.length, 0) > MAX_CHARS) return fail('prompt_too_large', 413);

  const tier: Tier = body.modelTier === 'quick' || body.modelTier === 'complex' ? body.modelTier : 'default';
  const named = typeof body.model === 'string' && MODELS.has(body.model) ? body.model : null;
  const model = named || TIERS[tier].model;
  const effort = typeof body.effort === 'string' && EFFORTS.has(body.effort) ? body.effort : TIERS[tier].effort;

  const g = await guard(req, 'app_llm');
  if (!g.ok) { console.warn('[sample] over limit', g.why); return fail('rate_limited', 429); }

  const client = new Anthropic();
  const enc = new TextEncoder();
  const params = {
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    cache_control: { type: 'ephemeral' },
    messages: turns,
    // A policy decline on Opus or Sonnet is re-run on a fallback model inside the same call.
    ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
  } as unknown as Parameters<typeof client.beta.messages.stream>[0];

  const out = new ReadableStream<Uint8Array>({
    async start(ctl) {
      const send = (o: unknown) => { try { ctl.enqueue(enc.encode(line(o))); } catch { /* closed */ } };
      let wrote = false;
      try {
        const stream = client.beta.messages.stream(params, { signal: req.signal });
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && ev.delta.text) { wrote = true; send({ t: 'd', d: ev.delta.text }); }
        }
        const msg = await stream.finalMessage();
        const u = msg.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
        const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.05;
        void logEvent('llm', null, { purpose: 'app:sample', model, tier, input: u.input_tokens, output: u.output_tokens, cache_read: u.cache_read_input_tokens, cache_write: u.cache_creation_input_tokens, usd: Math.round(costOf(model, inTok, u.output_tokens || 0) * 1e5) / 1e5 });
        if (msg.stop_reason === 'refusal') send({ t: 'err', code: 'refused' });
        else if (!wrote) send({ t: 'err', code: 'empty_completion' });
        else send({ t: 'end', truncated: msg.stop_reason === 'max_tokens', tier, model: named || undefined });
      } catch (e) {
        if (req.signal.aborted) { /* the page stopped it */ }
        else if (e instanceof Anthropic.RateLimitError) send({ t: 'err', code: 'rate_limited' });
        else if (e instanceof Anthropic.BadRequestError) { console.error('[sample] 400', String(e).slice(0, 300)); send({ t: 'err', code: /too long|too large|context/i.test(String(e)) ? 'prompt_too_large' : 'invalid_request' }); }
        else { console.error('[sample]', String(e).slice(0, 300)); send({ t: 'err', code: 'upstream_error' }); }
      } finally {
        try { ctl.close(); } catch { /* closed */ }
      }
    },
  });
  return new Response(out, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

/** GET /api/sample -> { ready } : whether model calls can run here (the key is set). Says nothing else. */
export async function GET() {
  return new Response(JSON.stringify({ ready: !!process.env.ANTHROPIC_API_KEY }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
