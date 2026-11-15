// The spend guard for the public routes. Anyone can use Pip without signing in, and most routes buy something:
// model time (Anthropic), Google Places lookups, DataForSEO reviews, ElevenLabs minutes. Before a route spends,
// it asks here. The answer comes from the database (public.pip_gate, see supabase/migrations): one visitor's
// allowance for the hour and the day, then everyone's budget for the day and the month, then the pause switch.
// Every number lives in the pip_limits table and can be changed there without a deploy.
//
// A visitor is a salted hash of the IP address Vercel reports; the address itself is never stored.
// If the database can't be asked (a local run with no keys, or a short outage), a small in-memory count
// with the same per-visitor numbers stands in, so the site keeps working and still can't be hammered.
import { gate, storeEnabled } from './store';

export type GuardKind = 'web_scan' | 'web_gather' | 'web_places' | 'web_reviews' | 'web_llm' | 'skill_turn' | 'web_voice' | 'web_lead';
export interface Verdict { ok: boolean; why?: string }

async function visitorOf(req: Request): Promise<string> {
  const h = req.headers;
  const ip = (h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim();
  if (!ip) return '';
  const data = new TextEncoder().encode(`pip-visitor|${process.env.PIP_SERVER_SECRET || ''}|${ip}`);
  const d = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- the stand-in, used only when the database can't answer ----------
// [per visitor an hour, per visitor a day, everyone a day on this server instance]
const LOCAL: Record<GuardKind, [number, number, number]> = {
  web_scan: [3, 8, 25], web_gather: [30, 60, 60], web_places: [16, 40, 150], web_reviews: [3, 6, 10],
  web_llm: [40, 120, 600], skill_turn: [60, 240, 3000], web_voice: [3, 3, 20], web_lead: [6, 15, 200],
};
const counts = new Map<string, { hour: number; h: number; day: number; d: number }>();
function bump(key: string, units: number, perHour: number, perDay: number): boolean {
  const now = Date.now(), h = Math.floor(now / 3_600_000), d = Math.floor(now / 86_400_000);
  if (counts.size > 5000) counts.clear();
  const c = counts.get(key) || { hour: 0, h, day: 0, d };
  if (c.h !== h) { c.h = h; c.hour = 0; }
  if (c.d !== d) { c.d = d; c.day = 0; }
  if (c.hour + units > perHour || c.day + units > perDay) return false;
  c.hour += units; c.day += units;
  counts.set(key, c);
  return true;
}
function local(kind: GuardKind, visitor: string, units: number): Verdict {
  const [perHour, perDay, total] = LOCAL[kind];
  if (visitor && !bump(`${kind}|${visitor}`, units, perHour, perDay)) return { ok: false, why: 'visitor_hour' };
  if (!bump(`${kind}|*`, units, total, total)) return { ok: false, why: 'daily_limit' };
  return { ok: true };
}

/** Asks before spending. `units` is how many paid things this request is about to buy (1 for most). */
export async function guard(req: Request, kind: GuardKind, units = 1): Promise<Verdict> {
  const visitor = await visitorOf(req);
  if (storeEnabled()) {
    const v = await gate(kind, visitor, units);
    if (v && typeof v.ok === 'boolean') return v.ok ? { ok: true } : { ok: false, why: v.why || 'limit' };
  }
  return local(kind, visitor, units);
}

// ---------- websites that are never a local business's own site ----------
// A scan of one of these buys the same data as a real one and tells the visitor nothing.
const PLATFORMS = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com',
  'pinterest.com', 'reddit.com', 'snapchat.com', 'whatsapp.com', 'amazon.com', 'ebay.com', 'walmart.com', 'apple.com',
  'microsoft.com', 'netflix.com', 'wikipedia.org', 'yelp.com', 'tripadvisor.com', 'nextdoor.com', 'github.com',
  'openai.com', 'chatgpt.com', 'anthropic.com', 'claude.ai', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  'example.com', 'example.org', 'localhost.com', 'test.com',
]);
export function isPlatform(domain: string): boolean {
  const d = domain.toLowerCase();
  if (PLATFORMS.has(d)) return true;
  for (const p of PLATFORMS) if (d.endsWith('.' + p)) return true;
  return false;
}
