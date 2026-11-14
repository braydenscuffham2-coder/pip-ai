import { addLead, storeEnabled } from '@/lib/server/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * POST /api/order  { lid, order, owner, consent, plan }  ->  { ok, code, orderId }
 * Pip's own order page (/lock.html) sends the owner's Lock it in here. The order goes to Pip's intake
 * (the pip-forge edge function), which files it for the Forge Board, gives it a code and emails Brayden.
 * A link from before full orders (only a light plan, no teammates) is saved as a lead instead.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 400_000) return json({ ok: false, error: 'too_large' }, 413);
  let b: Record<string, any>;
  try { b = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  const base = process.env.SUPABASE_URL;
  if (!base) return json({ ok: false, error: 'not_configured' }, 503);

  if (b.order && Array.isArray(b.order.agents) && b.order.agents.length) {
    const r = await fetch(`${base}/functions/v1/pip-forge/intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' },
      body: JSON.stringify({ source: 'pip-order-page', lid: b.lid, order: b.order, owner: b.owner, consent: b.consent, plan: b.plan }),
      signal: AbortSignal.timeout(55_000),
    }).catch(() => null);
    if (!r) return json({ ok: false, error: 'unreachable' }, 502);
    const j = await r.json().catch(() => ({}));
    return json(j, r.status);
  }

  // an older link: a light plan only
  const o = b.owner || {};
  const name = str(o.name, 80), contact = str(o.email, 120) || str(o.phone, 40);
  if (!name || contact.length < 3) return json({ ok: false, error: 'invalid_contact' }, 400);
  if (!storeEnabled()) return json({ ok: false, error: 'not_configured' }, 503);
  const l = b.legacy || {};
  const modules = (Array.isArray(l.team) ? l.team : []).map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 11);
  const id = await addLead(name, contact, { name: str(l.business, 80) || 'Unknown business', site: str(l.site, 120) || undefined } as any, modules);
  return id ? json({ ok: true, code: null, leadId: id }) : json({ ok: false, error: 'save_failed' }, 503);
}
