// Extra reading for Pip's intelligence layer. Added to the gather reply without changing any existing field:
//   deep.pages            the full text the crawler captured for the business's own pages, plus up to six
//                         more of its key pages (pricing, about, FAQ and the like) that the crawler skipped
//   competitors[i].site   cleaned text of the competitor's homepage plus up to two key pages
//   competitors[i].placeId and .reviews   their Google place id and the reviews Google shows
// Public pages only, short timeouts, never throws.

const BASE = 'https://places.googleapis.com/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PipScanner/1.0';
const PAGE_CAP = 9000;
const SITE_CAP = 5000;
const OWN_EXTRA = 6;
const OWN_CAP = 6000;
const DEEP_TOTAL = 60000;
// The Pip page cuts a direct gather reply at 200,000 characters, so the whole reply stays under this.
const REPLY_MAX = 170000;
const KEY_LINK = /service|pricing|price|rates|about|menu|faq|financ|emergency|new-patient|book|schedule|appointment|warranty|guarantee|why/i;

interface Review { rating: number; text: string; when?: string }
interface Rival { name?: string; website?: string; placeId?: string; site?: { url: string; text: string; pages: number }; reviews?: Review[] }
interface Loose {
  url?: string;
  siteBlocked?: boolean;
  place?: { address?: string };
  located?: { address?: string | null };
  competitors?: Rival[];
  deep?: { pages: { url: string; title: string; text: string }[] };
}
interface FullPages { pages?: { url?: string; title?: string; text?: string }[] }

function publicUrl(u: string): URL | null {
  try {
    const x = new URL(u);
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
    const h = x.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.includes(':') || /^[0-9.]+$/.test(h) || !h.includes('.')) return null;
    return x;
  } catch {
    return null;
  }
}
const host = (u?: string) => { const x = publicUrl(u || ''); return x ? x.hostname.toLowerCase().replace(/^www[.]/, '') : ''; };

async function fetchHtml(url: string, ms: number): Promise<{ html: string; url: string } | null> {
  const u = publicUrl(url);
  if (!u) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok || !publicUrl(res.url)) return null;
    if (!/html/i.test(res.headers.get('content-type') || 'text/html')) return null;
    return { html: (await res.text()).slice(0, 1200000), url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Readable text of a page: no scripts, menus or repeated lines; headings marked with "## ".
function clean(html: string): string {
  let b = html;
  const at = b.search(/<body[ >]/i);
  if (at > 0) b = b.slice(at);
  b = b
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template|nav|form|select)(?: [^>]*)?>[^]*?<[/]\1>/gi, ' ')
    .replace(/<h[1-4](?: [^>]*)?>/gi, '\n## ')
    .replace(/<(?:p|li|br|div|section|article|tr|h5|h6|blockquote|footer|header)(?:[ /][^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&lsquo;|&apos;/g, "'").replace(/&[a-z#0-9]+;/gi, ' ');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of b.split('\n')) {
    const l = line.replace(/[ \t\r\f\v]+/g, ' ').trim();
    if (l.length < 2 || l === '##') continue;
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    if (l.length < 160 && /cookie|skip to content|accessibility options|all rights reserved/i.test(l)) continue;
    seen.add(k);
    out.push(l);
  }
  return out.join('\n');
}

function keyLinks(html: string, base: string, max = 2): string[] {
  const home = host(base);
  const found: string[] = [];
  for (const m of html.matchAll(/<a [^>]*href *= *["']([^"'#]+)["'][^>]*>([^]{0,90}?)<[/]a>/gi)) {
    let abs = '';
    try { abs = new URL(m[1], base).toString(); } catch { continue; }
    if (host(abs) !== home || !KEY_LINK.test(m[1] + ' ' + m[2])) continue;
    if (/[.](pdf|jpg|jpeg|png|webp|zip)([?]|$)/i.test(abs) || abs.replace(/[/]$/, '') === base.replace(/[/]$/, '')) continue;
    abs = abs.replace(/[/]$/, '');
    if (!found.includes(abs)) found.push(abs);
    if (found.length >= max) break;
  }
  return found;
}

/** A competitor's own words: homepage plus up to two key pages, cleaned and capped. */
export async function readSite(website: string, cap = SITE_CAP): Promise<{ url: string; text: string; pages: number } | null> {
  const home = await fetchHtml(website, 6000);
  if (!home) return null;
  const rest = await Promise.all(keyLinks(home.html, home.url).map(u => fetchHtml(u, 5000)));
  const parts = [clean(home.html).slice(0, Math.round(cap * 0.6))];
  let pages = 1;
  for (const p of rest) {
    if (!p) continue;
    const t = clean(p.html);
    if (t.length < 80) continue;
    parts.push(`# ${p.url}\n${t.slice(0, Math.round(cap * 0.25))}`);
    pages++;
  }
  const text = parts.join('\n\n').slice(0, cap);
  return text.length > 120 ? { url: home.url, text, pages } : null;
}

/** Key pages of the business's own site that the crawler did not read. */
async function readMore(homeUrl: string, have: string[]): Promise<{ url: string; title: string; text: string }[]> {
  const home = await fetchHtml(homeUrl, 6000);
  if (!home) return [];
  const norm = (u: string) => u.replace(/[/]$/, '').replace(/^https?:[/][/](www[.])?/, '').toLowerCase();
  const seen = new Set(have.map(norm));
  const links = keyLinks(home.html, home.url, OWN_EXTRA + have.length + 2).filter(u => !seen.has(norm(u))).slice(0, OWN_EXTRA);
  const got = await Promise.all(links.map(u => fetchHtml(u, 5000)));
  const out: { url: string; title: string; text: string }[] = [];
  for (const p of got) {
    if (!p || seen.has(norm(p.url))) continue;
    seen.add(norm(p.url));
    const text = clean(p.html).slice(0, OWN_CAP);
    if (text.length < 200) continue;
    const title = ((p.html.match(/<title[^>]*>([^<]*)</i) || [])[1] || '').replace(/[ \t\r\n]+/g, ' ').trim().slice(0, 140);
    out.push({ url: p.url, title, text });
  }
  return out;
}

interface GPlace { id?: string; displayName?: { text?: string }; websiteUri?: string; reviews?: { rating?: number; text?: { text?: string }; relativePublishTimeDescription?: string }[] }

/** The competitor's Google place id and the reviews Google shows for it. */
async function listing(name: string, website: string | undefined, near: string): Promise<{ placeId?: string; reviews: Review[] }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !name) return { reviews: [] };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetch(BASE + '/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.reviews' },
      body: JSON.stringify({ textQuery: `${name} ${near}`.trim(), maxResultCount: 5 }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[deep] listing', res.status); return { reviews: [] }; }
    const places = (((await res.json()) as { places?: GPlace[] }).places) ?? [];
    const want = (website || '').replace(/[/]$/, '').toLowerCase();
    const same = (p: GPlace) => (p.displayName?.text || '').trim().toLowerCase() === name.trim().toLowerCase();
    const hit = places.find(p => !!want && (p.websiteUri || '').replace(/[/]$/, '').toLowerCase() === want)
      ?? places.find(p => !!website && host(p.websiteUri) === host(website) && same(p))
      ?? places.find(p => same(p) && (!website || host(p.websiteUri) === host(website) || !p.websiteUri));
    if (!hit) return { reviews: [] };
    const reviews = (hit.reviews ?? []).slice(0, 5)
      .map(r => ({ rating: r.rating ?? 0, text: (r.text?.text || '').slice(0, 700), when: r.relativePublishTimeDescription }))
      .filter(r => r.text);
    return { placeId: hit.id, reviews };
  } catch {
    return { reviews: [] };
  } finally {
    clearTimeout(t);
  }
}

// "610 W Grove St, Boise, ID 83702, USA" -> "Boise, ID"
function cityOf(address?: string | null): string {
  const parts = String(address || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const i = parts.findIndex(p => /^[A-Z]{2}( [0-9]{5})?$/.test(p));
  return i > 0 ? `${parts[i - 1]}, ${parts[i].slice(0, 2)}` : parts.slice(-2).join(', ');
}

const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);

/** Adds the deep reading to a gather reply. `full` is the uncut crawl result; `t0` is when the request started. */
export async function enrich<T extends object>(out: T, full: FullPages | null, t0: number): Promise<T> {
  try {
    const o = out as Loose;
    const pages = (full?.pages ?? []).filter(p => p && p.text).map(p => ({ url: String(p.url || ''), title: String(p.title || ''), text: String(p.text).slice(0, PAGE_CAP) }));
    if (pages.length) o.deep = { pages };
    if (Date.now() - t0 > 28000) return out;
    const more = o.url && !o.siteBlocked && pages.length ? within(readMore(o.url, pages.map(p => p.url)), 9000, []) : Promise.resolve([]);
    const rivals = (o.competitors ?? []).slice(0, 4);
    const near = cityOf(o.place?.address) || cityOf(o.located?.address);
    await Promise.all(rivals.map(async c => {
      const [site, g] = await Promise.all([
        c.website ? within(readSite(c.website), 9000, null) : Promise.resolve(null),
        within(listing(c.name || '', c.website, near), 8000, { reviews: [] as Review[] }),
      ]);
      if (site) c.site = site;
      if (g.placeId) c.placeId = g.placeId;
      if (g.reviews.length) c.reviews = g.reviews;
    }));
    let total = pages.reduce((n, p) => n + p.text.length, 0);
    for (const p of await more) {
      if (total + p.text.length > DEEP_TOTAL) break;
      pages.push(p);
      total += p.text.length;
    }
    // Stay inside the reply budget: drop the last deep pages first, then competitor site text.
    while (JSON.stringify(out).length > REPLY_MAX && pages.length > 1) pages.pop();
    for (const c of rivals) if (c.site && JSON.stringify(out).length > REPLY_MAX) delete c.site;
  } catch (e) {
    console.error('[deep] enrich failed', String(e).slice(0, 120));
  }
  return out;
}
