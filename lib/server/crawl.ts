// Reads a business website: a few key pages, their visible text, structured data and scripts.
// Runs on the server. Every limit here is deliberate: small pages, short timeouts, same host only.

export interface Page {
  url: string;
  title: string;
  text: string;
  html: string;
}

export interface SiteData {
  domain: string;
  finalUrl: string;
  pages: Page[];
  /** schema.org LocalBusiness-like objects found in JSON-LD. */
  ld: Record<string, unknown>[];
  meta: { title?: string; description?: string; siteName?: string };
  phones: string[];
  emails: string[];
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PipScanner/1.0';
const MAX_BYTES = 1_500_000;
const KEY_PATHS = /(service|about|contact|location|hour|book|schedul|appointment|menu|price|pricing|faq|team|insurance|area|reviews?|testimonial|treatment|class|membership|listing)/i;

export class CrawlError extends Error {
  constructor(public code: 'unreachable' | 'blocked' | 'invalid_url') { super(code); }
}

async function get(url: string, ms: number): Promise<{ url: string; html: string; type: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: ctl.signal });
    const type = res.headers.get('content-type') || '';
    if (res.status === 401 || res.status === 403 || res.status === 429) throw new CrawlError('blocked');
    if (!res.ok || !/html/i.test(type)) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size > MAX_BYTES) { await reader.cancel(); break; }
    }
    const buf = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, size - o)), o); o += c.length; if (o >= size) break; }
    return { url: res.url || url, html: new TextDecoder().decode(buf), type };
  } catch (e) {
    if (e instanceof CrawlError) throw e;
    return null;
  } finally {
    clearTimeout(t);
  }
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };
export const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });

/** Visible text, with headings and list items kept on their own lines. */
export function textOf(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section|\/tr|\/td|\/a|\/button|h[1-6][^>]*)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\r]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(l => l.length > 1)
    .filter((l, i, a) => a.indexOf(l) === i)
    .join('\n');
}

const titleOf = (html: string) => decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim());
const metaOf = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '').trim() || undefined : undefined;
};

function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1].trim());
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === 'object') {
          const o = x as Record<string, unknown>;
          if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(walk);
          if (o['@type']) out.push(o);
        }
      };
      walk(v);
    } catch { /* invalid JSON-LD is common; skip it */ }
  }
  return out;
}

function links(html: string, base: URL): string[] {
  const seen = new Set<string>();
  const scored: [number, string][] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      if (!/^https?:$/.test(u.protocol) || /\.(pdf|jpe?g|png|gif|webp|zip|mp4|docx?)$/i.test(u.pathname)) continue;
      u.hash = ''; u.search = '';
      const key = u.toString().replace(/\/$/, '');
      if (seen.has(key) || key === base.toString().replace(/\/$/, '')) continue;
      seen.add(key);
      const label = m[2].replace(/<[^>]+>/g, ' ');
      let s = 0;
      if (KEY_PATHS.test(u.pathname)) s += 3;
      if (KEY_PATHS.test(label)) s += 2;
      s -= u.pathname.split('/').filter(Boolean).length - 1;
      if (/(blog|news|post|privacy|terms|careers|login|cart|account|wp-)/i.test(u.pathname)) s -= 5;
      if (s > 0) scored.push([s, key]);
    } catch { /* bad href */ }
  }
  return scored.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}

/** Crawls the homepage plus up to `extra` important pages. Calls onPage as each one lands. */
export async function crawl(domain: string, onPage: (p: Page) => void, extra = 5): Promise<SiteData> {
  let home = null as Awaited<ReturnType<typeof get>>;
  for (const u of [`https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`]) {
    home = await get(u, 9000);
    if (home) break;
  }
  if (!home) throw new CrawlError('unreachable');
  const base = new URL(home.url);
  const pages: Page[] = [];
  const add = (url: string, html: string) => {
    const p = { url, html, title: titleOf(html) || new URL(url).pathname, text: textOf(html).slice(0, 12000) };
    pages.push(p);
    onPage(p);
  };
  add(home.url, home.html);
  const next = links(home.html, base).slice(0, extra);
  const got = await Promise.all(next.map(u => get(u, 7000).catch(() => null)));
  got.forEach((g, i) => { if (g) add(g.url || next[i], g.html); });

  const all = pages.map(p => p.html).join('\n');
  const ld = pages.flatMap(p => jsonLd(p.html));
  const phones = Array.from(new Set([
    ...Array.from(all.matchAll(/href=["']tel:([^"']+)["']/gi)).map(m => decodeURIComponent(m[1]).trim()),
    ...Array.from(pages.map(p => p.text).join('\n').matchAll(/\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g)).map(m => m[0]),
  ])).slice(0, 4);
  const emails = Array.from(new Set(Array.from(all.matchAll(/mailto:([^"'?]+)/gi)).map(m => m[1].toLowerCase()))).slice(0, 3);
  return {
    domain,
    finalUrl: home.url,
    pages,
    ld,
    meta: { title: titleOf(home.html), description: metaOf(home.html, 'description') || metaOf(home.html, 'og:description'), siteName: metaOf(home.html, 'og:site_name') },
    phones,
    emails,
  };
}
