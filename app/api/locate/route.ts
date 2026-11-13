// GET /api/locate?d=example.com&name=...&addr=...&phone=...&about=...
// Second-chance Google lookup on its own, for checking what it finds. gather calls the same code.
import { locate, locateEnabled } from '@/lib/server/locate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const domain = (q.get('d') || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return reply({ ok: false, error: 'invalid_url' }, 400);
  if (!locateEnabled()) return reply({ ok: false, error: 'not_configured' });
  const r = await locate({
    domain,
    name: (q.get('name') || '').trim().slice(0, 80),
    addr: (q.get('addr') || '').trim().slice(0, 140),
    phone: q.get('phone') || '',
    about: (q.get('about') || '').trim().slice(0, 120),
  });
  return reply({ ok: true, ...r });
}
