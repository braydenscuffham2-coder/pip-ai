// Step 1 of a scan: collect facts. Crawls the site, detects tools, and pulls the Google listing,
// reviews and competitors. No model calls here, so the result is cheap to cache and replay.
import type { DetectedTool } from '../types';
import { crawl, CrawlError, type SiteData } from './crawl';
import { findBusiness, miles, nearbyCompetitors, type Place, type PlaceReview } from './places';
import { detectTools } from './tech';
import { findSignals, type Signal, type Signals } from './signals';

export interface RawCompetitor { name: string; rating?: number; count?: number; distanceMi?: number; website?: string; tools: DetectedTool[]; signals?: Signal[] }

/** Everything Pip knows about one business before any writing happens. JSON-safe. */
export interface Raw {
  domain: string;
  /** True when the website itself couldn't be read and everything came from Google. */
  siteBlocked?: boolean;
  url: string;
  pages: { url: string; title: string; text: string }[];
  meta: SiteData['meta'];
  ld: Record<string, unknown>[];
  phones: string[];
  emails: string[];
  detected: DetectedTool[];
  /** Tools and AI found outside the page code: DNS records, email provider, social pages, wording. */
  signals?: Signals;
  place?: Omit<Place, 'reviews' | 'location'> & { reviews: PlaceReview[] };
  competitors: RawCompetitor[];
  gatheredAt: string;
}

export type GatherEvent =
  | { t: 'page'; url: string; title: string }
  | { t: 'tech'; tool: DetectedTool }
  | { t: 'status'; message: string; progress: number }
  | { t: 'place'; place: NonNullable<Raw['place']> }
  | { t: 'competitor'; competitor: RawCompetitor };

const host = (u?: string) => { try { return new URL(u!).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Rough business name from title / og:site_name / JSON-LD, used to search Google. */
export function nameHint(site: Pick<SiteData, 'meta' | 'ld' | 'domain'>): string {
  const ldName = site.ld.filter(o => !/^(BreadcrumbList|WebPage|ListItem|WebSite|FAQPage|ImageObject)$/.test(String(o['@type']))).map(o => o.name).find(n => typeof n === 'string') as string | undefined;
  if (ldName) return ldName;
  if (site.meta.siteName) return site.meta.siteName;
  const t = (site.meta.title || '').split(/\s[|\-–—:•·]\s/).map(s => s.trim()).filter(Boolean);
  // Titles are often "Service in City | Business Name": the shortest part is usually the name.
  return t.sort((a, b) => a.length - b.length)[0] || site.domain;
}

function cityHint(site: SiteData): string | undefined {
  for (const o of site.ld) {
    const a = o.address as Record<string, unknown> | undefined;
    if (a && typeof a.addressLocality === 'string') return `${a.addressLocality}${typeof a.addressRegion === 'string' ? ' ' + a.addressRegion : ''}`;
  }
  return undefined;
}

async function competitorTools(website?: string): Promise<{ tools: DetectedTool[]; signals: Signal[] }> {
  if (!website) return { tools: [], signals: [] };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(website, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; PipScanner/1.0)' }, redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return { tools: [], signals: [] };
    const html = (await res.text()).slice(0, 1_000_000);
    const sig = await findSignals(host(res.url || website), [{ html, text: '' }]);
    return { tools: detectTools([{ url: res.url || website, html }]), signals: sig.items.filter(x => x.source !== 'site_text') };
  } catch {
    return { tools: [], signals: [] };
  }
}

export async function gather(domain: string, emit: (e: GatherEvent) => void): Promise<Raw> {
  emit({ t: 'status', message: `Opening ${domain}`, progress: 6 });
  let n = 0;
  let site: SiteData;
  let siteError: CrawlError | null = null;
  try {
    site = await crawl(domain, p => { n++; emit({ t: 'page', url: p.url, title: p.title }); emit({ t: 'status', message: 'Reading your pages', progress: Math.min(34, 8 + n * 5) }); });
  } catch (e) {
    // Some sites block automated visitors. Keep going with Google's data instead of failing.
    siteError = e instanceof CrawlError ? e : new CrawlError('unreachable');
    emit({ t: 'status', message: siteError.code === 'blocked' ? 'Your site blocks scanners, so I\'ll use your Google listing' : "Your site didn't load, so I'll use your Google listing", progress: 30 });
    site = { domain, finalUrl: `https://${domain}/`, pages: [], ld: [], meta: {}, phones: [], emails: [] };
  }

  emit({ t: 'status', message: 'Checking the tools on your site', progress: 40 });
  const detected = detectTools(site.pages);
  const signalsP = findSignals(domain, site.pages);
  for (const tool of detected) emit({ t: 'tech', tool });
  if (!detected.length) emit({ t: 'status', message: 'No chat, booking, or AI tools found on your site', progress: 46 });

  emit({ t: 'status', message: 'Finding you on Google', progress: 52 });
  const place = await findBusiness(domain, nameHint(site), cityHint(site));
  let competitors: RawCompetitor[] = [];
  if (place) {
    emit({ t: 'place', place: { ...place, location: undefined } as NonNullable<Raw['place']> });
    emit({ t: 'status', message: 'Checking nearby competitors', progress: 66 });
    const near = await nearbyCompetitors(place);
    competitors = await Promise.all(near.map(async c => ({
      name: c.name, rating: c.rating, count: c.count, distanceMi: miles(place.location, c.location), website: c.website,
      ...(host(c.website) === domain ? { tools: [], signals: [] } : await competitorTools(c.website)),
    })));
    for (const c of competitors) emit({ t: 'competitor', competitor: c });
  } else {
    if (siteError) throw siteError;
    emit({ t: 'status', message: "Couldn't find a matching Google listing", progress: 66 });
  }

  const { location: _loc, ...placeRest } = place || ({} as Place);
  void _loc;
  return {
    domain,
    siteBlocked: !!siteError,
    url: site.finalUrl,
    pages: site.pages.map(p => ({ url: p.url, title: p.title, text: p.text })),
    meta: site.meta,
    ld: site.ld.slice(0, 6),
    phones: site.phones,
    emails: site.emails,
    detected,
    signals: await signalsP,
    place: place ? (placeRest as NonNullable<Raw['place']>) : undefined,
    competitors,
    gatheredAt: new Date().toISOString(),
  };
}

/** Smaller copy of the raw facts, sized for a model prompt. */
export function compact(r: Raw): Raw {
  return { ...r, pages: r.pages.map(p => ({ ...p, text: p.text.slice(0, 3000) })), ld: r.ld.slice(0, 4) };
}
