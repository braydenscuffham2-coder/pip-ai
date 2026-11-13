import { normalizeDomain } from '@/lib/preview';
import { compact, gather } from '@/lib/server/gather';
import { CrawlError } from '@/lib/server/crawl';
import { bad, json } from '@/lib/server/http';
import { getScan } from '@/lib/server/store';
import { findSignals } from '@/lib/server/signals';
import { secondChance } from '@/lib/server/locate';
import { enrich } from '@/lib/server/deep';
import { reviewsPart } from '@/lib/server/reviews';
import { marketPass, rankPart } from '@/lib/server/market';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/gather?d=example.com  ->  Raw
 * The facts-only half of a scan (site, tools, Google listing, competitors), with no model calls.
 * The sidebar build reads this and does the writing itself on the viewer's own Claude plan.
 * When Google has no listing for the business, a second lookup works from the name and address on its site.
 * The reply also carries the deep reading: full page text, and each competitor's site text and Google reviews.
 * GET /api/gather?part=reviews&... is the paid review history (see lib/server/reviews.ts).
 * Competitors are the five most similar nearby businesses, and `presence` says how findable the business is
 * (lib/server/market.ts). GET /api/gather?part=rank&... checks more Google Maps searches for the page.
 */
type Loose = { competitors?: { site?: unknown }[]; deep?: { pages: unknown[] }; timing?: Record<string, number> };

// Similar competitors and the deep reading run side by side; the old competitor list is the fallback.
async function finish<T extends object>(domain: string, out: T, full: Parameters<typeof enrich>[1], t0: number): Promise<T> {
  const o = out as Loose, before = o.competitors ?? [];
  const market = marketPass(domain, out, full, t0);
  o.competitors = [];
  await Promise.all([market, enrich(out, full, t0)]);
  if (!o.competitors?.length) o.competitors = before;
  if (o.competitors === before && before.length) await enrich(out, full, t0);
  for (let i = (o.competitors ?? []).length - 1; i >= 0 && JSON.stringify(out).length > 170000; i--) delete o.competitors![i].site;
  while (JSON.stringify(out).length > 170000 && (o.deep?.pages.length ?? 0) > 1) o.deep!.pages.pop();
  o.timing = { ...(o.timing || {}), total: Date.now() - t0 };
  return out;
}
export async function GET(req: Request) {
  const t0 = Date.now();
  const q = new URL(req.url).searchParams;
  if (q.get('part') === 'reviews') return reviewsPart(q);
  if (q.get('part') === 'rank') return rankPart(q);
  const domain = normalizeDomain(q.get('d') || '');
  if (!domain) return bad('invalid_url');
  const cached = await getScan(domain);
  if (cached?.raw) {
    // Scans saved before signals existed get them now (DNS and wording only).
    const raw = cached.raw.signals ? cached.raw : { ...cached.raw, signals: await findSignals(domain, cached.raw.pages.map(p => ({ text: p.text }))) };
    return json(await finish(domain, await secondChance(domain, compact(raw)), raw, t0));
  }
  try {
    const full = await gather(domain, () => {});
    return json(await finish(domain, await secondChance(domain, compact(full)), full, t0));
  } catch (e) {
    return bad(e instanceof CrawlError ? e.code : 'internal', 422);
  }
}
