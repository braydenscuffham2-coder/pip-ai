// Reads a business's homepage and returns what Pip needs to show it back to them:
// their logo (as data, since the Pip page can't load outside images), colors, fonts,
// headline, menu, buttons, phone and a small hero photo. Pip reaches this through the
// Claude browser (navigate + get_page_text), the same way it reads the scan.
// Public sites only, short timeouts, small images.
//
// v9 (Nov 2026): when Pip's main Google step can't read a site (it blocks plain readers) and so
// can't find the business, this function finds the Google listing itself from what a real
// browser read on the site (name, phone, address), then the nearby businesses of the same kind.
// A blocked site's contact and about pages are read too, not just the homepage.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PipScanner/1.0";
const HTML_MAX = 1_500_000, CSS_MAX = 400_000, LOGO_MAX = 90_000, PHOTO_MAX = 120_000;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": status === 200 ? "public, max-age=86400" : "no-store", "access-control-allow-origin": "*" },
});

// ---------- safety: public hostnames only ----------
function okUrl(u: string): URL | null {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) return null;
    return x;
  } catch { return null; }
}
async function get(url: string, ms: number, max: number, accept = "*/*") {
  const u = okUrl(url); if (!u) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(u, { headers: { "user-agent": UA, accept, "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: ctl.signal });
    if (!okUrl(r.url)) return null;
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > max) { await r.body?.cancel(); return { status: r.status, url: r.url, type: r.headers.get("content-type") || "", bytes: null as Uint8Array | null, tooBig: true }; }
    const reader = r.body?.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > max) { await reader.cancel(); return { status: r.status, url: r.url, type: r.headers.get("content-type") || "", bytes: null, tooBig: true }; } chunks.push(value); }
    const bytes = new Uint8Array(n); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
    return { status: r.status, url: r.url, type: r.headers.get("content-type") || "", bytes, tooBig: false };
  } catch { return null; } finally { clearTimeout(t); }
}
const text = (b: Uint8Array | null) => b ? new TextDecoder().decode(b) : "";

// ---------- tiny HTML helpers (no DOM: fast and cheap) ----------
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", reg: "®", trade: "™", copy: "©" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);
const strip = (s: string) => decode(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : "";
}
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(m => ({ tag: m[0], at: m.index ?? 0 }));
const abs = (u: string, base: string) => { try { return new URL(u.trim(), base).toString(); } catch { return ""; } };

// ---------- images: type and size from the first bytes ----------
function dims(b: Uint8Array, type: string): { w: number; h: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
  if (b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | b[7] << 8, h: b[8] | b[9] << 8 };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8] };
      i += 2 + len;
    }
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) { // WEBP
    const f = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (f === "VP8X") return { w: 1 + (b[24] | b[25] << 8 | b[26] << 16), h: 1 + (b[27] | b[28] << 8 | b[29] << 16) };
    if (f === "VP8 ") return { w: (b[26] | b[27] << 8) & 0x3fff, h: (b[28] | b[29] << 8) & 0x3fff };
    if (f === "VP8L") { const v = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return { w: (v & 0x3fff) + 1, h: (v >> 14 & 0x3fff) + 1 }; }
  }
  if (/svg/.test(type)) {
    const s = new TextDecoder().decode(b.slice(0, 3000));
    const vb = s.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (vb) return { w: +vb[1], h: +vb[2] };
    const w = s.match(/\swidth\s*=\s*["']?([\d.]+)/i), h = s.match(/\sheight\s*=\s*["']?([\d.]+)/i);
    if (w && h) return { w: +w[1], h: +h[1] };
  }
  return null;
}
function mime(b: Uint8Array, type: string) {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return "image/webp";
  if (/svg/.test(type) || /^\s*(<\?xml|<svg)/i.test(new TextDecoder().decode(b.slice(0, 200)))) return "image/svg+xml";
  return "";
}
function b64(b: Uint8Array) { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
// SVG shown inside <img> can't run scripts, but strip anything active anyway
const cleanSvg = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, "$1#");
async function image(url: string, max: number) {
  const r = await get(url, 6000, max, "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8");
  if (!r || r.status >= 400 || !r.bytes || r.tooBig) return null;
  const m = mime(r.bytes, r.type); if (!m) return null;
  let bytes = r.bytes;
  if (m === "image/svg+xml") bytes = new TextEncoder().encode(cleanSvg(new TextDecoder().decode(bytes)));
  const d = dims(bytes, m);
  return { data: `data:${m};base64,${b64(bytes)}`, w: d?.w ?? 0, h: d?.h ?? 0, src: r.url, bytes: bytes.length };
}

// ---------- colors ----------
function hsl(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
const norm = (c: string) => {
  c = c.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) return "#" + [...c.slice(1)].map(x => x + x).join("");
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  const m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/); if (m) return "#" + [m[1], m[2], m[3]].map(x => Math.min(255, +x).toString(16).padStart(2, "0")).join("");
  return "";
};
function brandColors(css: string) {
  const count = new Map<string, number>();
  for (const m of css.matchAll(/(background(?:-color)?|color|border(?:-[a-z]+)?-color|fill)\s*:\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]+\))/gi)) {
    const c = norm(m[2]); if (!c) continue;
    if (/^#(0000ee|0000ff|551a8b|ff0000|00ff00|ffff00|ff00ff|00ffff)$/.test(c)) continue; // browser defaults
    const { s, l } = hsl(c); if (s < 0.28 || l < 0.12 || l > 0.88) continue;
    count.set(c, (count.get(c) || 0) + (/background/i.test(m[1]) ? 2 : 1));
  }
  // merge near-identical shades
  const list = [...count.entries()].sort((a, b) => b[1] - a[1]); const out: string[] = [];
  for (const [c] of list) { const a = hsl(c); if (out.every(o => { const b = hsl(o); return Math.abs(a.h - b.h) > 18 || Math.abs(a.l - b.l) > .2; })) out.push(c); if (out.length >= 3) break; }
  return out;
}

// ---------- fonts ----------
function googleFonts(html: string, css: string) {
  const fams = new Set<string>();
  for (const m of (html + css).matchAll(/fonts\.googleapis\.com\/css2?\?([^"')\s>]+)/gi)) {
    const q = decode(m[1]);
    for (const f of q.matchAll(/family=([^&]+)/g)) for (const part of decodeURIComponent(f[1].replace(/\+/g, " ")).split("|")) { const name = part.split(":")[0].trim(); if (name && name.length < 40) fams.add(name); }
  }
  return [...fams].slice(0, 3);
}
function cssFamily(css: string, sel: RegExp) {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (sel.test(m[1])) { const f = m[2].match(/font-family\s*:\s*([^;]+)/i); if (f) return f[1].split(",")[0].replace(/["']/g, "").trim(); }
  return "";
}

// ---------- logo ----------
const BAD = /badge|award|seal|trophy|nextdoor|bbb|accredit|google|yelp|angi|homeadvisor|facebook|instagram|twitter|linkedin|youtube|tiktok|houzz|thumbtack|brand-logo|partner|certif|member|visa|mastercard|financ|payment|sprite|loader|spinner|flag/i;
function srcsetPick(set: string, base: string) {
  const c = set.split(",").map(s => s.trim().split(/\s+/)).filter(p => p[0]).map(p => ({ url: abs(p[0], base), w: parseInt(p[1]) || 0 }));
  if (!c.length) return "";
  const good = c.filter(x => x.w >= 160).sort((a, b) => a.w - b.w);
  return (good[0] || c[c.length - 1]).url;
}
function logoCandidates(html: string, base: string, name: string, ld: any[]) {
  const cands: { url: string; score: number; inline?: string }[] = [];
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !/^(the|and|llc|inc|services?|company)$/.test(w));
  const bodyAt = html.search(/<body\b/i), mainAt = html.search(/<main\b|<\/header>/i);
  const headerEnd = mainAt > 0 ? mainAt + 400 : bodyAt + Math.floor((html.length - bodyAt) * 0.2);
  for (const o of ld) { const l = o?.logo; const u = typeof l === "string" ? l : l?.url; if (u) cands.push({ url: abs(u, base), score: 60 }); }
  for (const { tag, at } of tags(html, "img")) {
    const alt = attr(tag, "alt"), src = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src"), set = attr(tag, "srcset") || attr(tag, "data-srcset");
    const hay = `${alt} ${src} ${attr(tag, "class")} ${attr(tag, "id")}`.toLowerCase();
    if (!src && !set) continue;
    let s = 0;
    if (/logo/.test(hay)) s += 40;
    if (at < headerEnd) s += 20;
    if (words.length && words.some(w => alt.toLowerCase().includes(w))) s += 20;
    if (words.length && words.some(w => src.toLowerCase().includes(w))) s += 8;
    if (BAD.test(hay)) s -= 80;
    if (/^data:/.test(src) && !set) s -= 30;
    if (s < 30) continue;
    const url = set ? srcsetPick(set, base) : abs(src.replace(/-(1920|2048|2560|3840)w\./, "-640w."), base);
    if (url) cands.push({ url, score: s });
  }
  // inline <svg> inside an element whose class/id says logo
  for (const m of html.matchAll(/<(a|div|span)\b[^>]*(class|id)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>\s*(?:<[^>]+>\s*){0,3}(<svg\b[\s\S]{0,40000}?<\/svg>)/gi)) {
    if ((m.index ?? 0) > headerEnd + 2000) break;
    cands.push({ url: "", score: 70, inline: cleanSvg(m[3]) });
  }
  for (const { tag } of tags(html, "link")) {
    const rel = attr(tag, "rel").toLowerCase(), href = attr(tag, "href");
    if (!href) continue;
    if (/apple-touch-icon/.test(rel)) cands.push({ url: abs(href, base), score: 25 });
    else if (/\bicon\b/.test(rel) && /\.(png|svg)(\?|$)/i.test(href) && !/16|32/.test(attr(tag, "sizes"))) cands.push({ url: abs(href, base), score: 12 });
  }
  const seen = new Set<string>();
  return cands.filter(c => { const k = c.inline ? c.inline.slice(0, 200) : c.url; if (!k || seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.score - a.score).slice(0, 4);
}


// ---------- the kit: logo, colors, font, headline, tagline, phone, photo candidates ----------
async function parseKit(d: string, html: string, base: string) {
  // structured data
  const ld: any[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (x["@graph"]) walk(x["@graph"]); if (x.logo || x.name) ld.push(x); } }; walk(j); } catch { /* ignore */ }
  }
  const meta = (k: string) => { for (const { tag } of tags(html, "meta")) if ((attr(tag, "property") || attr(tag, "name")).toLowerCase() === k) return attr(tag, "content"); return ""; };
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const name = meta("og:site_name") || ld.find(x => x.name && /business|organization|plumb|dent|clinic|store|restaurant|service/i.test(String(x["@type"])))?.name || title.split(/\s[|\-–—]\s/).pop() || d;

  // CSS: inline styles plus the first two stylesheets
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join("\n") + "\n" + [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map(m => `x{${m[1]}}`).join("\n");
  const sheets = tags(html, "link").filter(t => /stylesheet/i.test(attr(t.tag, "rel"))).map(t => abs(attr(t.tag, "href"), base)).filter(h => h && !/fonts\.googleapis|font-awesome|bootstrap\.min|jquery/i.test(h)).slice(0, 2);
  const got = await Promise.all(sheets.map(h => get(h, 5000, CSS_MAX, "text/css")));
  css += got.map(g => g && g.bytes ? text(g.bytes) : "").join("\n");

  // logo (best candidate that fetches within size)
  let logo: any = null;
  for (const c of logoCandidates(html, base, name, ld)) {
    if (c.inline) { const s = new TextEncoder().encode(c.inline); if (s.length <= LOGO_MAX) { const dm = dims(s, "image/svg+xml"); logo = { data: `data:image/svg+xml;base64,${b64(s)}`, w: dm?.w ?? 0, h: dm?.h ?? 0, src: "inline-svg", bytes: s.length }; break; } continue; }
    const im = await image(c.url, LOGO_MAX) ?? await image(wsrv(c.url, "w=480&output=png"), LOGO_MAX);
    if (im && (im.w === 0 || (im.w >= 32 && im.h >= 16))) { logo = { ...im, src: c.url }; break; }
  }
  if (logo) logo.wide = logo.w && logo.h ? logo.w / logo.h > 2 : false;

  // hero words
  const bodyAt = Math.max(0, html.search(/<body\b/i));
  const h1m = html.slice(bodyAt).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1m ? strip(h1m[1]).slice(0, 140) : "";
  let sub = "";
  if (h1m) { const after = html.slice(bodyAt + (h1m.index ?? 0), bodyAt + (h1m.index ?? 0) + 6000); for (const p of after.matchAll(/<(p|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const t = strip(p[2]); if (t.length >= 12 && t.length <= 240) { sub = t; break; } } }
  if (!sub) sub = meta("og:description") || meta("description");
  const tel = (html.match(/href\s*=\s*["']tel:([^"']+)["']/i) || [])[1] || "";

  // photo candidates: hero backgrounds, then big content images (never logos, icons or badges)
  const NOT_PHOTO = /logo|icon|badge|sprite|svg|avatar|award|seal|bbb|google|yelp|facebook|payment|financ|placeholder|spacer|pixel|loader|coupon|bat\.bing|doubleclick|analytics|initial-media|\/tr\?/i;
  const STOCK = /shutterstock|istock|getty|adobestock|stock-photo|stock_|unsplash|pexels|depositphotos|dreamstime|123rf|bigstock/i;
  const bg = [...html.slice(bodyAt, bodyAt + 120000).matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)/gi)].map(m => abs(m[1], base));
  const imgs = tags(html.slice(bodyAt), "img").map(t => {
    const set = attr(t.tag, "srcset") || attr(t.tag, "data-srcset");
    const src = set ? srcsetPick(set, base) : abs(attr(t.tag, "src") || attr(t.tag, "data-src") || attr(t.tag, "data-lazy-src"), base);
    const w = parseInt(attr(t.tag, "width")) || 0;
    return { src, hay: `${attr(t.tag, "alt")} ${attr(t.tag, "class")} ${src}`.toLowerCase(), small: w > 0 && w < 300 };
  }).filter(x => x.src && !x.small && !NOT_PHOTO.test(x.hay));
  // Their own photos first: hero backgrounds, then images named after the business; share images (often stock or text cards) last
  const words = strip(name).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !/^(services?|company|group|studio)$/.test(w));
  const isNamed = (h: string) => words.some(w => h.toLowerCase().includes(w));
  // (their share image is left out: it's usually a card with their logo and words on it, not a photo)
  const all = [...bg.map(src => ({ src, hay: src })), ...imgs]
    .filter(x => x.src && !/^data:/.test(x.src) && !NOT_PHOTO.test(x.src) && x.src !== logo?.src);
  const rank = (x: { src: string; hay: string }) => (STOCK.test(x.src) ? 2 : 0) + (isNamed(x.hay) ? 0 : 1);
  const photoCands = [...new Set(all.map((x, i) => ({ ...x, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i).map(x => x.src))].slice(0, 10);

  const colors = brandColors(css);
  const g = googleFonts(html, css);
  const family = g[0] || cssFamily(css, /(^|,)\s*h1\b/) || cssFamily(css, /(^|,)\s*body\b/) || "";
  return {
    ok: true, domain: d, url: base, name: strip(name).slice(0, 80), title: title.slice(0, 140),
    logo: logo ? { data: logo.data, w: logo.w, h: logo.h, bytes: logo.bytes, wide: logo.wide } : null,
    colors: { theme: norm(meta("theme-color")) || null, brand: colors },
    fonts: { google: g, family, serif: /serif|times|georgia|garamond|playfair|merriweather|lora|baskerville|libre|crimson|bodoni|didot|cormorant/i.test(family) && !/sans/i.test(family) },
    hero: { h1, sub: sub.slice(0, 240), phone: decode(tel).replace(/[^\d+]/g, "").slice(0, 16) },
    photoCands,
  };
}
async function loadHome(d: string) {
  let page = await get(`https://${d}/`, 8000, HTML_MAX, "text/html,application/xhtml+xml");
  if (!page || !page.bytes) page = await get(`https://www.${d}/`, 8000, HTML_MAX, "text/html,application/xhtml+xml");
  if (!page || !page.bytes) return { error: "unreachable" as const };
  if (page.status === 401 || page.status === 403 || page.status === 429 || page.status === 503) return { error: "blocked" as const };
  if (page.status >= 400) return { error: "unreachable" as const };
  return { html: text(page.bytes), url: page.url };
}
async function kitWithHtml(d: string): Promise<{ kit: any; html: string }> {
  const p = await loadHome(d);
  if ("error" in p) return { kit: { ok: false, error: p.error }, html: "" };
  return { kit: await parseKit(d, p.html, p.url), html: p.html };
}
async function kitFor(d: string) { return (await kitWithHtml(d)).kit; }

// ---------- a real browser's view of the page: Firecrawl, else Microlink (keyless: 25 a day) ----------
// Works on sites that block plain readers and on sites built with JavaScript.
// A FIRECRAWL_API_KEY secret on this function makes Firecrawl the reader; Microlink is the fallback.
// With a MICROLINK_API_KEY secret Microlink switches to the paid endpoint.
const FC_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const ML_KEY = Deno.env.get("MICROLINK_API_KEY") ?? "";
type Rendered = { html: string; url: string; error?: undefined; why?: undefined } | { error: string; why?: string; html?: undefined; url?: undefined };
async function firecrawlUrl(url: string, ms = 30000): Promise<Rendered> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST", signal: ctl.signal,
      headers: { authorization: `Bearer ${FC_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ url, formats: [{ type: "rawHtml" }], onlyMainContent: false, waitFor: 1200, timeout: Math.max(5000, ms - 5000) }),
    });
    const j: any = await r.json().catch(() => null);
    const html = j?.data?.rawHtml, code = j?.data?.metadata?.statusCode;
    if (!r.ok || !j?.success || typeof html !== "string" || html.length < 500 || code >= 400) return { error: r.status === 429 || r.status === 402 ? "limit" : "unavailable", why: `firecrawl ${code || r.status}`.slice(0, 40) };
    return { html: html.slice(0, HTML_MAX), url: j.data.metadata?.url || url };
  } catch { return { error: "unavailable", why: "firecrawl timeout" }; } finally { clearTimeout(t); }
}
const firecrawl = (d: string) => firecrawlUrl(`https://${d}/`);
async function rendered(d: string): Promise<Rendered> {
  if (FC_KEY) { const p = await firecrawl(d); if (!p.error) return p; }
  return await microlink(d);
}
async function microlink(d: string): Promise<Rendered> {
  const q = new URLSearchParams({ url: `https://${d}/`, meta: "false", "data.html.selector": "html", "data.html.attr": "html", waitForTimeout: "1200" });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(`${ML_KEY ? "https://pro.microlink.io" : "https://api.microlink.io"}/?${q}`, { headers: ML_KEY ? { "x-api-key": ML_KEY } : {}, signal: ctl.signal });
    const j: any = await r.json().catch(() => null);
    const html = j?.data?.html;
    if (!r.ok || j?.status !== "success" || typeof html !== "string" || html.length < 500) return { error: r.status === 429 ? "limit" : "unavailable", why: String(j?.code || r.status).slice(0, 40) };
    return { html: html.slice(0, HTML_MAX), url: j?.data?.url || `https://${d}/` };
  } catch { return { error: "unavailable" }; } finally { clearTimeout(t); }
}
// Readable text of a page, by section, without menus, scripts or repeats. Feeds Pip's study.
function siteText(html: string) {
  let b = html.slice(Math.max(0, html.search(/<body\b/i))).replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ");
  b = b.replace(/<(script|style|noscript|svg|iframe|template|select|form)\b[\s\S]*?<\/\1>/gi, " ").replace(/<nav\b[\s\S]*?<\/nav>/gi, " ");
  b = b.replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, _n, t) => `\n## ${strip(t)}\n`);
  b = b.replace(/<(p|li|br|div|section|header|footer|blockquote|tr|article|h5|h6|dt|dd)\b[^>]*>/gi, "\n");
  const lines = decode(b.replace(/<[^>]+>/g, " ")).split("\n").map(s => s.replace(/[ \t ]+/g, " ").trim()).filter(s => s.length > 1 && s !== "##");
  const seen = new Set<string>(), out: string[] = [];
  for (const l of lines) {
    const k = l.toLowerCase().replace(/^## /, "");
    if (seen.has(k)) continue;
    if (/cookie|privacy preference|skip to content|high contrast|increase text size|accessibility options/i.test(l) && l.length < 160) continue;
    seen.add(k); out.push(l);
  }
  return out.join("\n").replace(/(## [^\n]+\n)(?=## )/g, "").slice(0, 14000);
}

// ---------- more of a blocked site: its contact and about pages, through the same real-browser reader ----------
// Only with a Firecrawl key (the keyless fallback is capped at 25 reads a day). At most two pages, read together.
const EXTRA_PATHS: [RegExp, number][] = [[/contact/i, 0], [/about|our-story|who-we-are|meet|team/i, 1], [/locations?|services?|what-we-do/i, 2]];
export function pickLinks(html: string, base: string, d: string, paths: [RegExp, number][] = EXTRA_PATHS): string[] {
  const seen = new Set<string>(); const out: { url: string; rank: number }[] = [];
  for (const { tag } of tags(html, "a")) {
    const href = attr(tag, "href"); if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    const u = abs(href, base); if (!u) continue;
    let x: URL; try { x = new URL(u); } catch { continue; }
    const host = x.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== d || !okUrl(u)) continue;
    const path = x.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path || path.length > 80 || /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(path)) continue;
    const hit = paths.find(([re]) => re.test(path)); if (!hit) continue;
    if (seen.has(path)) continue; seen.add(path);
    out.push({ url: `${x.origin}${x.pathname}`, rank: hit[1] });
  }
  const best: string[] = [];
  for (let r = 0; r < paths.length && best.length < 2; r++) { const f = out.find(o => o.rank === r); if (f) best.push(f.url); }
  return best;
}
async function extraPages(html: string, base: string, d: string) {
  if (!FC_KEY) return [];
  const links = pickLinks(html, base, d);
  const got = await Promise.all(links.map(u => firecrawlUrl(u, 22000)));
  const out: { title: string; url: string; text: string }[] = [];
  got.forEach((p, i) => {
    if (p.error || !p.html) return;
    const t = siteText(p.html).slice(0, 5000);
    if (t.length < 200) return;
    const title = strip((p.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").slice(0, 140) || links[i];
    out.push({ title, url: p.url || links[i], text: t });
  });
  return out;
}

// ---------- Google, second chance: find the listing from what a real browser read on the site ----------
// Used only when Pip's main Google step couldn't read the site and so couldn't find the business.
// A listing is accepted only when its website is this domain, or its phone is a phone on the site and
// its name shares a distinctive word with the site's name or domain, or its street address is on the site
// and its name matches. Then up to five nearby competitors. With no listing at all, competitors are still found
// from the kind of business the site says it is and the address on the site.
const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";
const PLACES = "https://places.googleapis.com/v1";
const P_FIELDS = ["id", "displayName", "websiteUri", "rating", "userRatingCount", "formattedAddress", "nationalPhoneNumber", "internationalPhoneNumber", "primaryType", "primaryTypeDisplayName", "types", "regularOpeningHours", "location", "reviews"];
const R_FIELDS = ["id", "displayName", "websiteUri", "rating", "userRatingCount", "primaryType", "primaryTypeDisplayName", "location", "reviews"];
async function placesCall(path: string, body: unknown, fields: string[], ms = 9000): Promise<any | null> {
  if (!PLACES_KEY) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(PLACES + path, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fields.map(f => `places.${f}`).join(",") }, body: JSON.stringify(body) });
    if (!r.ok) { console.error("[site-kit places]", path, r.status, (await r.text().catch(() => "")).slice(0, 200)); return null; }
    return await r.json();
  } catch (e) { console.error("[site-kit places]", path, String(e).slice(0, 120)); return null; } finally { clearTimeout(t); }
}

const STOP = new Set(["the", "and", "of", "at", "a", "an", "llc", "inc", "co", "corp", "ltd", "pllc", "pc", "dba", "usa"]);
const GENERIC = new Set(["team", "group", "services", "service", "company", "homes", "home", "real", "estate", "realty", "agents", "agent", "realtors", "realtor", "properties", "property", "plumbing", "plumber", "plumbers", "dental", "dentist", "dentistry", "law", "firm", "office", "offices", "center", "studio", "shop", "store", "restaurant", "cafe", "grill", "salon", "clinic", "care", "health", "auto", "repair", "solutions", "pros", "best", "local", "official", "site", "website", "welcome", "heating", "cooling", "roofing", "electric", "construction", "contractors", "contractor", "insurance", "agency", "financial", "medical", "family", "north", "south", "east", "west", "city", "county", "valley"]);
const tok = (s: string) => String(s || "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
const last10 = (s: string) => { const x = String(s || "").replace(/\D/g, ""); const t = x.length === 11 && x[0] === "1" ? x.slice(1) : x; return t.length === 10 && !/^[01]/.test(t) ? t : ""; };
const streetKey = (num: string, name: string) => `${num} ${tok(name)[0] || ""}`.trim();
const STREET_RE = /\b(\d{2,6})\s+((?:[A-Za-z0-9][\w.'-]*\s+){0,3}?)(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Ter|Terrace|Trl|Trail|Sq|Square|Loop|Plaza)\b/g;
const CITY_RE = /\b((?:[A-Z][a-zA-Z.'-]+ ){0,2}[A-Z][a-zA-Z.'-]+),\s*([A-Z]{2})\s+(\d{5})\b/g;

// What kind of business the site says it is, as a Google category. Only well-known categories; anything else is skipped.
const KINDS: [RegExp, string][] = [
  [/strip club|gentlem[ae]n'?s club|exotic danc|topless/i, "adult_entertainment_club"], [/night ?club|dance club/i, "night_club"],
  [/print shop|printing (company|services?)|screen print|offset print|digital print|sign shop/i, "print_shop"], [/security (guard|services|company|patrol|officers)|private security/i, "security_service"],
  [/steel fabricat|metal fabricat|welding|structural steel/i, "metal_fabricator"], [/\bhvac\b|air condition|heating (and|&) (cooling|air)|furnace/i, "hvac_contractor"],
  [/landscap|lawn care/i, "landscaper"], [/pest control|exterminat/i, "pest_control_service"], [/cleaning services?|janitorial|maid service|house cleaning/i, "cleaning_service"],
  [/daycare|day care|child ?care|preschool/i, "child_care_agency"], [/tattoo/i, "tattoo_shop"], [/dog groom|pet groom/i, "pet_groomer"], [/self storage|storage units/i, "storage"],
  [/real estate|realtor|realty|homes for sale|buy(ing)? a home|sell(ing)? (your|a) home/i, "real_estate_agency"],
  [/plumb/i, "plumber"], [/dentist|dental/i, "dentist"], [/roofing|roofer/i, "roofing_contractor"], [/electrician|electrical contractor/i, "electrician"],
  [/attorney|lawyer|law firm|law office/i, "lawyer"], [/chiropract/i, "chiropractor"], [/veterinar|animal hospital/i, "veterinary_care"],
  [/auto repair|car repair|mechanic|collision/i, "car_repair"], [/insurance agen/i, "insurance_agency"], [/accountant|accounting|cpa firm|bookkeeping/i, "accounting"],
  [/hair salon|barber/i, "hair_salon"], [/\bspa\b|massage/i, "spa"], [/\bgym\b|fitness center|personal train/i, "gym"],
  [/physical therap|physiotherap/i, "physiotherapist"], [/bakery/i, "bakery"], [/coffee shop|\bcafe\b/i, "cafe"], [/restaurant|dine in|our menu/i, "restaurant"],
  [/general contractor|remodel|home builder|construction company/i, "general_contractor"], [/moving company|movers\b/i, "moving_company"],
  [/locksmith/i, "locksmith"], [/painting contractor|house painter/i, "painter"], [/florist/i, "florist"], [/hotel|lodging/i, "hotel"],
];
function kindOf(head: string, body: string) {
  let best = "", score = 0;
  for (const [re, type] of KINDS) { const g = new RegExp(re.source, "gi"); const n = (head.match(g) || []).length * 3 + Math.min(6, (body.match(g) || []).length); if (n > score) { score = n; best = type; } }
  return score >= 3 ? best : "";
}

export function siteFacts(d: string, kit: any, html: string, pages: { title: string; text: string }[]) {
  const txt = pages.map(p => `${p.title}\n${p.text}`).join("\n");
  const phones = new Set<string>();
  const addPhone = (s: string) => { const p = last10(s); if (p && phones.size < 8) phones.add(p); };
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) addPhone(decode(m[1]));
  if (kit?.hero?.phone) addPhone(kit.hero.phone);
  for (const m of txt.matchAll(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)) addPhone(m[1] + m[2] + m[3]);
  const streets = new Set<string>();
  const streetAt: { i: number; s: string }[] = [];
  for (const m of txt.matchAll(STREET_RE)) { streets.add(streetKey(m[1], m[2] || m[0].split(/\s+/)[1] || "")); streetAt.push({ i: m.index ?? 0, s: m[0] }); }
  // the business's own city: structured data first, then the last ordinary-case "City, ST 12345" on the page
  // (footers carry the business address; ALL-CAPS ones are usually property or listing addresses)
  const ldCities: { city: string; state: string }[] = [];
  const found: { city: string; state: string; i: number; caps: boolean }[] = [];
  for (const m of txt.matchAll(CITY_RE)) found.push({ city: m[1], state: m[2], i: m.index ?? 0, caps: m[1] === m[1].toUpperCase() });
  found.sort((a, b) => a.caps === b.caps ? b.i - a.i : (a.caps ? 1 : -1));
  // names: the site's own name in its share tags, structured data and page title; ranked by how much of it is in the domain
  const names: string[] = [];
  const addName = (s: unknown) => { const n = strip(String(s || "")).replace(/^(home|welcome to|welcome)\s*[|:–—-]?\s*/i, "").trim(); if (n && n.length >= 3 && n.length <= 80 && !names.includes(n)) names.push(n); };
  addName(kit?.name);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (x["@graph"]) walk(x["@graph"]); if (x.name && /business|organization|agent|store|service|restaurant|dent|plumb|realestate/i.test(String(x["@type"]))) { addName(x.name); if (x.telephone) addPhone(String(x.telephone)); const a = x.address; if (a && typeof a === "object") { const sm = String(a.streetAddress || "").match(/^(\d{2,6})\s+(.+)/); if (sm) streets.add(streetKey(sm[1], sm[2])); if (a.addressLocality && a.addressRegion) ldCities.push({ city: String(a.addressLocality), state: String(a.addressRegion) }); } } } };
      walk(JSON.parse(m[1].trim()));
    } catch { /* ignore */ }
  }
  for (const part of String(kit?.title || pages[0]?.title || "").split(/\s[|\-–—:]\s/)) addName(part);
  const cities: { city: string; state: string }[] = [];
  for (const c of [...ldCities, ...found]) if (cities.length < 4 && !cities.some(x => x.city.toLowerCase() === c.city.toLowerCase() && x.state === c.state)) cities.push({ city: c.city, state: c.state });
  const dom = d.toLowerCase().replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9]/g, "");
  const inDomain = (n: string) => tok(n).filter(w => w.length >= 3 && dom.includes(w)).length;
  names.sort((a, b) => inDomain(b) - inDomain(a));
  const cityToks = new Set(cities.flatMap(c => tok(c.city)));
  // the street that sits right before the chosen city ("1420 Kettner Blvd #100 San Diego, CA 92101") is taken as the business's address
  const top = found.find(c => cities[0] && c.city.toLowerCase() === cities[0].city.toLowerCase() && c.state === cities[0].state);
  const near = top ? streetAt.filter(x => x.i < top.i && top.i - x.i < 90).pop() : undefined;
  const addr = near && cities[0] ? `${near.s} ${cities[0].city}, ${cities[0].state}` : "";
  const emails = [...new Set([...txt.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)].map(m => m[0].toLowerCase()))].filter(e => !/\.(png|jpe?g|gif|webp|svg)$/.test(e)).slice(0, 4);
  return { names: names.slice(0, 4), phones, streets, cities, cityToks, dom, emails, addr, kind: kindOf(names.join(" ") + " " + String(kit?.title || ""), txt.slice(0, 6000)) };
}
type Facts = ReturnType<typeof siteFacts>;

export function judge(p: any, d: string, f: Facts): { ok: boolean; why: string } {
  const name = String(p?.displayName?.text || "");
  let host = ""; try { host = p?.websiteUri ? new URL(p.websiteUri).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { /* ignore */ }
  if (host && (host === d || host.endsWith("." + d))) return { ok: true, why: "website" };
  const nt = tok(name);
  const distinctOf = (ws: string[]) => ws.filter(w => w.length >= 4 && !GENERIC.has(w) && !f.cityToks.has(w));
  const ours = new Set(f.names.flatMap(tok));
  const oursDistinct = new Set(distinctOf([...ours]));
  const shared = distinctOf(nt).some(w => oursDistinct.has(w) || f.dom.includes(w));
  const score = (() => { let best = 0; for (const n of f.names) { const a = new Set(tok(n)); if (!a.size || !nt.length) continue; const inter = nt.filter(w => a.has(w)).length; best = Math.max(best, inter / Math.min(a.size, new Set(nt).size)); } return best; })();
  const phone = last10(p?.nationalPhoneNumber || p?.internationalPhoneNumber || "");
  if (phone && f.phones.has(phone) && shared) return { ok: true, why: "phone+name" };
  const sm = String(p?.formattedAddress || "").match(/^(\d{2,6})\s+([^,]+)/);
  if (sm && f.streets.has(streetKey(sm[1], sm[2])) && shared && score >= 0.5) return { ok: true, why: "street+name" };
  return { ok: false, why: `no match (name ${score.toFixed(2)}${shared ? ", shared word" : ""}${phone && f.phones.has(phone) ? ", phone" : ""})` };
}

const toReviews = (rs: any[] | undefined) => (rs || []).map(r => ({ rating: Number(r?.rating) || 0, text: String(r?.text?.text || r?.originalText?.text || "").slice(0, 1500), when: r?.relativePublishTimeDescription || undefined })).filter(r => r.text.length > 3).slice(0, 5);
const human = (t: string) => String(t || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
function miles(a: any, b: any) {
  if (!a || !b) return null;
  const R = 3958.8, toR = (x: number) => x * Math.PI / 180;
  const dLat = toR(b.latitude - a.latitude), dLng = toR(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.latitude)) * Math.cos(toR(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
const GENERIC_TYPES = new Set(["point_of_interest", "establishment", "premise", "subpremise", "street_address", "store", "service", "food"]);
// "City, ST" from an address, with or without a country at the end ("..., Meridian, ID 83646" or "..., Meridian, ID 83646, USA")
function cityOf(addr: string) {
  const parts = String(addr || "").split(",").map(s => s.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 1; i--) { const st = (parts[i].match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/) || [])[1]; if (st) return `${parts[i - 1]}, ${st}`; }
  return "";
}

// Where an address or city is, from Google (for measuring how far away competitors are).
async function locate(q: string): Promise<{ location: { latitude: number; longitude: number }; basis: string } | null> {
  if (!q) return null;
  const j = await placesCall("/places:searchText", { textQuery: q, pageSize: 1, languageCode: "en", regionCode: "US" }, ["location", "formattedAddress"]);
  const p = j?.places?.[0];
  return p?.location ? { location: p.location, basis: String(p.formattedAddress || q).slice(0, 120) } : null;
}
// Up to five nearby competitors; never the business itself. Found with a plain-words search ("real estate agents near
// <address>") because Google files many unrelated places under the same category (apartment complexes are filed as
// real estate agencies), so a category-only search returns the wrong kind of business. Places Google also files as
// apartments, hotels or travel agencies are dropped unless that is the business's own kind.
const KIND_WORDS: Record<string, string> = {
  real_estate_agency: "real estate agents", plumber: "plumbers", dentist: "dentists", roofing_contractor: "roofing contractors",
  electrician: "electricians", lawyer: "lawyers", chiropractor: "chiropractors", veterinary_care: "veterinarians", car_repair: "auto repair shops",
  insurance_agency: "insurance agencies", accounting: "accountants", hair_salon: "hair salons", spa: "spas", gym: "gyms",
  physiotherapist: "physical therapists", bakery: "bakeries", cafe: "cafes", restaurant: "restaurants", general_contractor: "general contractors",
  moving_company: "moving companies", locksmith: "locksmiths", painter: "painters", florist: "florists", hotel: "hotels",
  adult_entertainment_club: "strip clubs", night_club: "nightclubs", bar: "bars", american_restaurant: "restaurants",
  print_shop: "print shops", security_service: "security companies", metal_fabricator: "metal fabricators", hvac_contractor: "hvac contractors",
  landscaper: "landscapers", pest_control_service: "pest control companies", cleaning_service: "cleaning services", child_care_agency: "daycares",
  tattoo_shop: "tattoo shops", pet_groomer: "pet groomers", storage: "self storage facilities",
};
const NOT_RIVAL = ["apartment_complex", "apartment_building", "housing_complex", "condominium_complex", "lodging", "hotel", "travel_agency", "shopping_mall", "storage"];
async function rivalsNear(type: string, at: { latitude: number; longitude: number }, near: string, self: { id: string; name: string; d: string; phones: Set<string> }, opts: { share?: string[]; popular?: boolean } = {}) {
  const share = opts.share || [], rankIt = !!(share.length || opts.popular);
  const words = KIND_WORDS[type] || human(type).toLowerCase();
  const j = await placesCall("/places:searchText", { textQuery: `${words} near ${near}`, pageSize: 12, languageCode: "en", regionCode: "US", locationBias: { circle: { center: { latitude: at.latitude, longitude: at.longitude }, radius: 15000 } } }, [...R_FIELDS, "nationalPhoneNumber", "types"]);
  const skip = new Set(NOT_RIVAL.filter(t => t !== type && !(type === "hotel" && t === "lodging")));
  const selfName = tok(self.name).join(" ");
  const isSelf = (x: any) => {
    if (x.id === self.id) return true;
    if (selfName && tok(x.displayName?.text || "").join(" ") === selfName) return true;
    let host = ""; try { host = x.websiteUri ? new URL(x.websiteUri).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { /* ignore */ }
    if (host && (host === self.d || host.endsWith("." + self.d))) return true;
    const ph = last10(x.nationalPhoneNumber || ""); return !!ph && self.phones.has(ph);
  };
  return (j?.places || [])
    .filter((x: any) => x?.id && x.displayName?.text && !isSelf(x) && !(x.types || []).some((t: string) => skip.has(t)))
    .map((x: any) => ({
      name: String(x.displayName.text).slice(0, 120), rating: x.rating ?? undefined, count: x.userRatingCount ?? undefined,
      distanceMi: miles(at, x.location), website: x.websiteUri || undefined, tools: [], signals: [],
      placeId: x.id, kind: x.primaryTypeDisplayName?.text || human(x.primaryType || type),
      match: { sameKind: (x.primaryType || type) === type || (x.types || []).includes(type), basis: `Google search: ${words} near the business` },
      reviews: toReviews(x.reviews),
      _o: !rankIt ? 0 : x.primaryType === type || (x.types || []).includes(type) ? 0 : (x.types || []).some((t: string) => share.includes(t)) ? 1 : 2,
    }))
    .filter((c: any) => c.distanceMi != null && c.distanceMi <= 20)
    .filter((c: any, _i: number, all: any[]) => c._o === 0 || all.filter((x: any) => x._o === 0).length < 3) // enough of the same kind: only those
    // with opts: places of the same kind first, then those sharing one of the business's categories; most reviewed first within each
    // (booking services and promoters are often filed under the same category, with a handful of reviews)
    .sort((a: any, b: any) => a._o - b._o || (opts.popular ? (b.count ?? 0) - (a.count ?? 0) : 0))
    .slice(0, 5)
    .map(({ _o, ...c }: any) => c);
}

export async function secondChance(d: string, kit: any, html: string, pages: { title: string; url: string; text: string }[], withRivals = true) {
  if (!PLACES_KEY || !pages.length) return null;
  const f = siteFacts(d, kit, html, pages);
  const where = f.cities[0] ? `${f.cities[0].city}, ${f.cities[0].state}` : "";
  const fmt = (p: string) => `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
  const queries = [...new Set([
    f.names[0] ? `${f.names[0]}${where ? " " + where : ""}` : "",
    [...f.phones][0] ? fmt([...f.phones][0]) : "",
    f.names[1] ? `${f.names[1]}${where ? " " + where : ""}` : "",
  ].filter(Boolean))].slice(0, 3);
  let place: any = null, why = "";
  const tried: string[] = [], seen: string[] = [];
  for (const q of queries) {
    const j = await placesCall("/places:searchText", { textQuery: q, pageSize: 5, languageCode: "en", regionCode: "US" }, P_FIELDS);
    tried.push(q);
    for (const p of j?.places || []) {
      const v = judge(p, d, f);
      let host = ""; try { host = p?.websiteUri ? new URL(p.websiteUri).hostname : ""; } catch { /* ignore */ }
      if (seen.length < 12) seen.push(`${String(p?.displayName?.text || "").slice(0, 50)} | ${host} | ${v.why}`);
      if (v.ok) { place = p; why = v.why; break; }
    }
    if (place) break;
  }
  console.log("[site-kit second chance]", d, JSON.stringify({ names: f.names, phones: f.phones.size, streets: f.streets.size, city: where, queries: tried, found: place ? why : "none", candidates: place ? undefined : seen }));
  const base = {
    domain: d, siteBlocked: true, url: `https://${d}/`, pages: [],
    meta: { title: String(kit?.title || pages[0]?.title || "").slice(0, 200), description: String(kit?.hero?.sub || "").slice(0, 300) },
    ld: [], phones: [...f.phones].map(fmt), emails: f.emails, detected: [], signals: { items: [], socials: [] },
  };
  if (!place) {
    // No Google listing for this business. Its competitors can still be found: businesses Google files under the
    // kind of business the site says it is, around the address on the site (or its city).
    if (!f.kind || !where) return null;
    const center = await locate(f.addr) ?? await locate(where);
    if (!center) return null;
    const competitors = await rivalsNear(f.kind, center.location, center.basis, { id: "", name: "", d, phones: f.phones });
    console.log("[site-kit second chance]", d, JSON.stringify({ noListing: true, kind: f.kind, center: center.basis, rivals: competitors.length }));
    if (!competitors.length) return null;
    return {
      ...base, competitors,
      industry: { type: f.kind, name: human(f.kind), city: where },
      found: { by: "site-kit", basis: "no Google listing", rivalsNear: center.basis },
      gatheredAt: new Date().toISOString(),
    };
  }

  // nearby businesses of the same Google category, most popular first
  let competitors: any[] = [];
  const type = place.primaryType && !GENERIC_TYPES.has(place.primaryType) ? place.primaryType : "";
  if (withRivals && type && place.location) competitors = await rivalsNear(type, place.location, place.formattedAddress || where, { id: place.id, name: place.displayName?.text || "", d, phones: f.phones });
  const kind = place.primaryTypeDisplayName?.text || human(place.primaryType || "");
  return {
    ...base,
    place: {
      id: place.id, name: String(place.displayName?.text || "").slice(0, 120), website: place.websiteUri || undefined,
      rating: place.rating ?? undefined, count: place.userRatingCount ?? undefined, address: place.formattedAddress || undefined,
      phone: place.nationalPhoneNumber || undefined, primaryType: place.primaryType || undefined, types: place.types || [],
      hours: place.regularOpeningHours?.weekdayDescriptions || undefined, reviews: toReviews(place.reviews),
      location: place.location || undefined,
    },
    competitors,
    industry: { type: place.primaryType || "", name: kind, city: cityOf(place.formattedAddress || "") || where },
    found: { by: "site-kit", basis: why },
    gatheredAt: new Date().toISOString(),
  };
}

// ---------- market: where the business really shows up on Google Maps, and how many people search for what it does ----------
// DataForSEO, with the DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD secrets on this function (the same login the Vercel
// backend uses). Reached as ?insight=1&d=<domain> once a scan has started; the answer is kept on the scan's row, so
// opening the same scan again costs nothing. About $0.004 for two Maps searches plus $0.09 for the search counts.
const DFS_LOGIN = Deno.env.get("DATAFORSEO_LOGIN") ?? "", DFS_PASS = Deno.env.get("DATAFORSEO_PASSWORD") ?? "";
const DFS = "https://api.dataforseo.com/v3";
async function dfs(path: string, body: unknown, ms = 25000): Promise<any | null> {
  if (!DFS_LOGIN || !DFS_PASS) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(DFS + path, { method: "POST", signal: ctl.signal, headers: { authorization: "Basic " + btoa(`${DFS_LOGIN}:${DFS_PASS}`), "content-type": "application/json" }, body: JSON.stringify(body) });
    const j: any = await r.json().catch(() => null);
    const task = j?.tasks?.[0];
    if (!r.ok || !task) { console.error("[site-kit dfs]", path, r.status, String(j?.status_message || "").slice(0, 160)); return null; }
    if (task.status_code !== 20000) { console.error("[site-kit dfs]", path, task.status_code, String(task.status_message || "").slice(0, 160)); return { error: task.status_code, message: String(task.status_message || "").slice(0, 160) }; }
    return task;
  } catch (e) { console.error("[site-kit dfs]", path, String(e).slice(0, 120)); return null; } finally { clearTimeout(t); }
}

// What customers actually type for each kind of business (Google's category names are not how people search).
const SEARCH_WORDS: Record<string, string[]> = {
  real_estate_agency: ["realtor", "real estate agent"], real_estate_agent: ["realtor", "real estate agent"],
  plumber: ["plumber", "emergency plumber"], dentist: ["dentist", "family dentist"], dental_clinic: ["dentist", "dental clinic"],
  roofing_contractor: ["roofer", "roof repair"], electrician: ["electrician"], lawyer: ["lawyer", "attorney"],
  chiropractor: ["chiropractor"], veterinary_care: ["vet", "veterinarian"], car_repair: ["auto repair", "mechanic"],
  insurance_agency: ["insurance agent", "insurance agency"], accounting: ["accountant", "cpa"],
  hair_salon: ["hair salon"], beauty_salon: ["beauty salon"], barber_shop: ["barber shop"], nail_salon: ["nail salon"],
  spa: ["spa", "massage"], massage: ["massage"], gym: ["gym"], fitness_center: ["gym"], physiotherapist: ["physical therapy"],
  bakery: ["bakery"], cafe: ["coffee shop"], coffee_shop: ["coffee shop"], restaurant: ["restaurant"], bar: ["bar"], brewery: ["brewery"],
  general_contractor: ["general contractor", "home remodeling"], moving_company: ["movers", "moving company"], locksmith: ["locksmith"],
  painter: ["painter", "house painter"], florist: ["florist"], hotel: ["hotel"], hvac_contractor: ["hvac", "ac repair"],
  pest_control_service: ["pest control"], landscaper: ["landscaping"], child_care_agency: ["daycare"], preschool: ["preschool"],
  doctor: ["doctor"], pharmacy: ["pharmacy"], optometrist: ["optometrist"], pet_groomer: ["dog groomer"], storage: ["storage units"],
  car_dealer: ["car dealership"], tire_shop: ["tire shop"], car_wash: ["car wash"], dry_cleaner: ["dry cleaner"], tattoo_shop: ["tattoo shop"],
  adult_entertainment_club: ["strip club", "gentlemens club"], strip_club: ["strip club", "gentlemens club"], night_club: ["nightclub"],
  print_shop: ["print shop", "printing services"], security_service: ["security company", "security guard services"], security_guard_service: ["security company", "security guard services"],
  metal_fabricator: ["metal fabrication", "steel fabricator"], cleaning_service: ["cleaning service", "house cleaning"],
};
function wordsFor(type: string, name: string): string[] {
  if (SEARCH_WORDS[type]) return SEARCH_WORDS[type];
  const n = String(name || human(type)).trim().toLowerCase();
  return n && n.length <= 40 && n.split(/\s+/).length <= 4 && !/\d/.test(n) && !GENERIC_TYPES.has(type) ? [n] : [];
}
const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const hostOf = (s: unknown) => { try { const x = String(s || ""); return new URL(/^https?:/i.test(x) ? x : `https://${x}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
type Self = { id: string; name: string; d: string; phones: Set<string> };

// One Google Maps search, as a customer around the business would see it (a city-wide map centred on it).
export async function mapsRank(keyword: string, at: { latitude: number; longitude: number }, self: Self) {
  const task = await dfs("/serp/google/maps/live/advanced", [{ keyword, location_coordinate: `${at.latitude.toFixed(7)},${at.longitude.toFixed(7)},12z`, language_code: "en", depth: 100, device: "desktop" }]);
  if (!task || task.error) return null;
  const items = (task.result?.[0]?.items || []).filter((x: any) => x?.type === "maps_search" && x.title);
  if (items.length < 5) return null;
  const selfName = tok(self.name).join(" ");
  const isSelf = (x: any) => {
    if (self.id && x.place_id === self.id) return true;
    const h = hostOf(x.domain || x.url);
    if (h && (h === self.d || h.endsWith("." + self.d))) return true;
    const ph = last10(x.phone || ""); if (ph && self.phones.has(ph)) return true;
    return !!selfName && tok(x.title).join(" ") === selfName;
  };
  const i = items.findIndex(isSelf);
  const pos = (x: any, k: number) => Number(x.rank_group) || k + 1;
  const stars = (x: any) => ({ rating: Number.isFinite(x?.rating?.value) ? Math.round(x.rating.value * 10) / 10 : null, reviews: Number.isFinite(x?.rating?.votes_count) ? x.rating.votes_count : null });
  return {
    query: keyword, checked: items.length, rank: i >= 0 ? pos(items[i], i) : null, listed: !!self.id,
    top: items.slice(0, 3).map((x: any, k: number) => ({ pos: pos(x, k), name: clip(x.title, 80), ...stars(x), you: k === i })),
    you: i >= 0 ? { name: clip(items[i].title, 80), ...stars(items[i]) } : null,
  };
}

// ---------- the competitor engine ----------
// Pip's main Google step picks competitors by the listing's main Google category. That works for plumbers and dentists,
// but many listings carry a vague category ("Services", "Manufacturer", "Supplier") or none at all, and then it returns
// whatever is near: a print shop got a social services office and senior home care, realtors got hospitals, a strip
// club got nothing. The engine works the way a customer does. It looks the business up on Google Maps for its real
// category ("Print shop", "Strip club", "Real estate agent"), searches Maps for that category around the business, and
// keeps the places in that category in the order Maps shows them, leaving out the business itself, tiny listings
// (booking services, promoters) and anything over 20 miles away. Each competitor's website is read (homepage plus a
// services or about page), the tools on it noted, and up to 5 Google reviews attached, so Pip can study each one.
// Maps goes through DataForSEO (about $0.002 a lookup, two per business); when that isn't available, Google Places is
// searched for what the site says the business is. A business that doesn't compete locally (a corporate office, a
// trade association) gets no competitors rather than unrelated neighbours. Runs once per scan, only when needed.
const VAGUE = new Set([...GENERIC_TYPES, "health", "finance", "supplier", "manufacturer", "wholesaler", "consultant", "corporate_office", "association_or_organization", "non_profit_organization", "business_center", "local_government_office"]);
const NON_LOCAL = /corporate office|headquarters|software company|internet company|^website|e-?commerce|online (store|retailer|marketplace)|association|non-?profit|charity|foundation|government|embassy|consulate|political|trade union/i;
const okListing = (g: any) => !!(g && !g.error && g.place && typeof g.place === "object" && g.place.id);
// The main step's list is kept when the listing has a clear main category and at least two competitors of that kind.
const trusted = (g: any) => { const t = String(g?.place?.primaryType || ""); return !!t && !VAGUE.has(t) && (Array.isArray(g.competitors) ? g.competitors : []).filter((c: any) => c && c.match?.sameKind !== false).length >= 2; };
export const needsRivals = (g: any, force = false) => !!(g && !g.error && (force || !g.found?.rivals) && (okListing(g) ? force || !trusted(g) : Array.isArray(g.pages) && g.pages.length > 0));
const slug = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
const dfsOn = () => !!(DFS_LOGIN && DFS_PASS);
const dfsIsSelf = (self: Self) => {
  const selfName = tok(self.name).join(" ");
  return (x: any) => {
    if (self.id && x.place_id === self.id) return true;
    const h = hostOf(x.domain || x.url);
    if (h && (h === self.d || h.endsWith("." + self.d))) return true;
    const ph = last10(x.phone || ""); if (ph && self.phones.has(ph)) return true;
    return !!selfName && tok(x.title).join(" ") === selfName;
  };
};
async function mapsItems(keyword: string, at: { latitude: number; longitude: number }, zoom: number, depth: number): Promise<any[] | null> {
  const task = await dfs("/serp/google/maps/live/advanced", [{ keyword: clip(keyword, 120), location_coordinate: `${at.latitude.toFixed(7)},${at.longitude.toFixed(7)},${zoom}z`, language_code: "en", depth, device: "desktop" }], 20000);
  if (!task || task.error) return null;
  return (task.result?.[0]?.items || []).filter((x: any) => x?.type === "maps_search" && x.title);
}
// The business's own Maps entry, for its real Google categories. null when DataForSEO isn't answering.
async function mapsSelf(name: string, city: string, at: { latitude: number; longitude: number }, self: Self) {
  const isSelf = dfsIsSelf(self);
  for (const q of [...new Set([name, `${name} ${city}`.trim()])]) {
    if (!q) continue;
    const items = await mapsItems(q, at, 15, 20);
    if (items === null) return null;
    const me = items.find(isSelf);
    if (me?.category) return { category: clip(me.category, 60), more: (Array.isArray(me.additional_categories) ? me.additional_categories : []).map((c: any) => clip(c, 60)).filter(Boolean) as string[] };
  }
  return { category: "", more: [] as string[] };
}

// what a customer can do on a competitor's site (chat, booking, review requests), from the scripts on the page
const VENDORS: [string, string, RegExp][] = [
  ["answers", "Podium chat", /podium\.com\/(widget|webchat)|connect\.podium\.com|podium-website-widget/i], ["answers", "Birdeye chat", /birdeye\.com\/[^"']*(webchat|widget)|bewebchat|birdeye-webchat/i],
  ["answers", "HubSpot chat", /js\.hs-scripts\.com|js\.usemessages\.com|hubspot-messages/i], ["answers", "Intercom", /widget\.intercom\.io|intercomSettings/i],
  ["answers", "Drift", /js\.driftt\.com|drift\.load\(/i], ["answers", "Tidio", /code\.tidio\.co/i], ["answers", "LiveChat", /cdn\.livechatinc\.com|livechatinc\.com\/tracking/i],
  ["answers", "Tawk.to", /embed\.tawk\.to/i], ["answers", "Zendesk chat", /static\.zdassets\.com|zopim/i], ["answers", "Olark", /static\.olark\.com/i],
  ["answers", "Crisp", /client\.crisp\.chat/i], ["answers", "Freshchat", /wchat\.freshchat\.com|freshworks\.com\/live-chat/i], ["answers", "Weave chat", /getweave\.com[^"']*(chat|widget)|weave-webchat/i],
  ["answers", "Smith.ai chat", /smith\.ai\/(chat|widget)/i], ["answers", "Chatbase", /chatbase\.co\/embed/i], ["answers", "Voiceflow", /cdn\.voiceflow\.com|voiceflow\.chat/i],
  ["answers", "Kenect", /kenect\.com[^"']*(widget|chat)/i], ["answers", "Leadferno", /leadferno/i], ["answers", "ServiceTitan chat", /chat\.servicetitan\.com/i],
  ["answers", "Facebook Messenger chat", /fb-customerchat|customerchat\.js/i],
  ["booking", "Housecall Pro", /housecallpro\.com\/(book|embed)|book\.housecallpro\.com|hcp-booking|housecall-pro/i], ["booking", "ServiceTitan scheduler", /scheduler\.servicetitan\.com|embed\.scheduler\.servicetitan|st-scheduler/i],
  ["booking", "Schedule Engine", /scheduleengine\.(net|com)|schedule-engine/i], ["booking", "Jobber", /clienthub\.getjobber\.com|getjobber\.com\/(request|booking)/i],
  ["booking", "Workiz", /workiz\.com\/(online-booking|booking)/i], ["booking", "Calendly", /calendly\.com\//i], ["booking", "Acuity", /acuityscheduling\.com/i],
  ["booking", "Square Appointments", /squareup\.com\/appointments|square\.site\/book/i], ["booking", "Zocdoc", /zocdoc\.com/i], ["booking", "NexHealth", /nexhealth\.com/i],
  ["booking", "LocalMed", /localmed\.com/i], ["booking", "Lighthouse 360", /lh360\.com|lighthouse360/i], ["booking", "Solutionreach", /solutionreach\.com/i],
  ["booking", "Vagaro", /vagaro\.com/i], ["booking", "Mindbody", /mindbodyonline\.com|healcode/i], ["booking", "Booksy", /booksy\.com/i], ["booking", "Fresha", /fresha\.com/i],
  ["booking", "GlossGenius", /glossgenius\.com/i], ["booking", "OpenTable", /opentable\.com\/(widget|restref|r\/)/i], ["booking", "Resy", /resy\.com\/(cities|embed)|widgets\.resy\.com/i],
  ["booking", "Tock", /exploretock\.com/i], ["booking", "Setmore", /setmore\.com/i], ["booking", "SimplyBook", /simplybook\.me/i],
  ["reviews", "Podium", /podium\.com/i], ["reviews", "Birdeye", /birdeye\.com/i], ["reviews", "NiceJob", /nicejob\.(co|com)/i], ["reviews", "GatherUp", /gatherup\.com|getfivestars/i],
  ["reviews", "Grade.us", /grade\.us/i], ["reviews", "Broadly", /broadly\.com/i], ["reviews", "ReviewTrackers", /reviewtrackers\.com/i], ["reviews", "Swell", /swellcx\.com/i],
  ["reviews", "Demandforce", /demandforce\.com/i], ["reviews", "Weave reviews", /getweave\.com[^"']*review/i],
];
export function vendorsOf(html: string) {
  const out: { cap: string; vendor: string }[] = [], seen = new Set<string>();
  for (const [cap, vendor, re] of VENDORS) if (re.test(html) && !seen.has(cap + vendor)) { seen.add(cap + vendor); out.push({ cap, vendor }); }
  return out;
}
// A competitor's own site: homepage plus a services or about page, as readable text.
const RIVAL_PATHS: [RegExp, number][] = [[/services?|what-we-do|menu|pricing|prices|rates|treatments|practice-areas|products/i, 0], [/about|our-story|who-we-are|why-us/i, 1]];
// A bot check instead of the site (big chains often show one to plain readers): "Robot or human?", "Just a moment..."
export const BOT_PAGE = /robot or human|are you a (robot|human)|access denied|just a moment(\.\.\.|…)|attention required|verify (that )?you are (a )?human|request (was )?blocked|pardon our interruption|checking your browser|unusual traffic|captcha/i;
export function isBotPage(html: string, url = "") {
  if (/\/(blocked|captcha|challenge)\b/i.test(url)) return true;
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  if (BOT_PAGE.test(title)) return true;
  const words = siteText(html).split(/\s+/).filter(Boolean).length;
  return words < 150 && BOT_PAGE.test(siteText(html));
}
async function rivalSite(url: string) {
  const home = await get(url, 8000, HTML_MAX, "text/html,application/xhtml+xml");
  if (!home?.bytes || home.status >= 400) return { site: null, tools: [] as { cap: string; vendor: string }[] };
  const html = text(home.bytes);
  if (isBotPage(html, home.url)) return { site: null, tools: [] as { cap: string; vendor: string }[] };
  const links = pickLinks(html, home.url, hostOf(home.url), RIVAL_PATHS);
  let body = siteText(html).slice(0, 3500), pages = 1;
  const more = await Promise.all(links.map(u => get(u, 6000, HTML_MAX, "text/html,application/xhtml+xml")));
  more.forEach((p, i) => { if (p?.bytes && p.status < 400) { const t = siteText(text(p.bytes)).slice(0, 1500); if (t.length > 200) { body += `\n\n# ${links[i]}\n${t}`; pages++; } } });
  return { site: body.length > 150 ? { url: home.url, text: body, pages } : null, tools: vendorsOf(html) };
}
const ptOf = (x: any) => Number.isFinite(x?.latitude) && Number.isFinite(x?.longitude) ? { latitude: x.latitude, longitude: x.longitude } : null;
// Same brand: the business's own other locations, or colleagues under the same brokerage or franchise name. Two names
// share a brand when they share a pair of words that isn't a place name or two generic words ("Realty One", "Minuteman
// Press"; not "Real Estate" or "Boise River").
const STATE_WORDS = new Set(Object.values(STATES).flatMap(n => tok(n)));
function brandPairs(name: string, places: Set<string>) {
  const t = tok(name), out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) {
    const a = t[i], b = t[i + 1];
    if (places.has(a) || places.has(b) || STATE_WORDS.has(a) || STATE_WORDS.has(b)) continue;
    if ((GENERIC.has(a) || a.length < 3) && (GENERIC.has(b) || b.length < 3)) continue;
    out.add(`${a} ${b}`);
  }
  return out;
}
// Listed under the same Google category but a different trade (security training schools under "Security guard service").
const OTHER_TRADE = /\b(school|schools|training|academy|institute|university|college|classes|courses?)\b/i;

export async function findRivals(d: string, g: any, extraText = "") {
  const t0 = Date.now();
  const place = g.place;
  const pa = g.presence?.at;
  const at = pa && Number.isFinite(pa.lat) && Number.isFinite(pa.lng) ? { latitude: pa.lat, longitude: pa.lng }
    : ptOf(place.location) ?? (await locate(String(place.address || "")))?.location ?? null;
  const city = String(g.industry?.city || cityOf(String(place.address || "")) || "");
  const done = (how: string, competitors: any[] = [], extra: Record<string, unknown> = {}) => {
    console.log("[site-kit rivals]", d, JSON.stringify({ how, found: competitors.length, ...extra, ms: Date.now() - t0 }));
    return { competitors, how, category: "", kind: "", industry: null as any, ...extra };
  };
  if (!at) return done("no_location");
  const phones = new Set<string>([...(Array.isArray(g.phones) ? g.phones : []), place.phone || ""].map((p: string) => last10(p)).filter(Boolean));
  const self: Self = { id: String(place.id), name: String(place.name || ""), d, phones };
  const near = String(place.address || city);
  // 1. its real Google category
  const me = dfsOn() ? await mapsSelf(String(place.name || ""), city, at, self).catch(() => null) : null;
  const category = me?.category || "";
  if (category && NON_LOCAL.test(category)) return done("not_local", [], { category });
  let picked: any[] = [], how = "", kind = "";
  if (category) {
    // 2. what a customer nearby sees when they search Maps for that category (and Google's own search, for reviews)
    const [items, pl] = await Promise.all([
      mapsItems(category, at, 13, 40).catch(() => null),
      placesCall("/places:searchText", { textQuery: `${category} near ${near}`, pageSize: 12, languageCode: "en", regionCode: "US", locationBias: { circle: { center: at, radius: 15000 } } }, [...R_FIELDS, "nationalPhoneNumber", "types"]),
    ]);
    const isSelf = dfsIsSelf(self);
    const cat = category.toLowerCase(), mine = new Set([cat, ...me!.more.map(c => c.toLowerCase())]);
    const level = (x: any) => {
      const c = String(x.category || "").toLowerCase(), extra = (Array.isArray(x.additional_categories) ? x.additional_categories : []).map((s: any) => String(s).toLowerCase());
      return c === cat ? 0 : extra.includes(cat) ? 1 : mine.has(c) ? 2 : 9;
    };
    const places = new Set(tok(city.split(",")[0] || "")), mineB = brandPairs(self.name, places);
    const sameBrand = (t: string) => [...brandPairs(t, places)].some(p => mineB.has(p));
    const otherTrade = (t: string) => OTHER_TRADE.test(t) && !OTHER_TRADE.test(self.name);
    let pool = (items || []).filter((x: any) => !isSelf(x) && level(x) < 9 && !sameBrand(String(x.title)))
      .map((x: any) => {
        // a listing that hides its address (service-area businesses) is placed by Maps where the search was centred:
        // its distance isn't known from Maps
        const pt = ptOf(x), mi = pt ? miles(at, pt) : null;
        return { x, lv: level(x), mi: mi != null && (mi >= 0.05 || String(x.address || "").trim()) ? mi : null, trade: otherTrade(String(x.title)) };
      })
      .filter((c: any) => c.mi == null || c.mi <= 20);
    const sameTrade = pool.filter((c: any) => !c.trade);
    if (sameTrade.length >= 3) pool = sameTrade;
    // leave out tiny listings (booking services, promoters, empty profiles) when there are enough real ones
    const floor = Math.min(100, Math.max(5, Math.round((Number(place.count) || 0) * 0.05)));
    const big = pool.filter((c: any) => (Number(c.x?.rating?.votes_count) || 0) >= floor);
    if (big.length >= 3) pool = big;
    pool.sort((a: any, b: any) => a.lv - b.lv || (Number(a.x.rank_group) || 999) - (Number(b.x.rank_group) || 999));
    picked = pool.slice(0, 5).map((c: any) => ({
      name: clip(c.x.title, 120), rating: Number.isFinite(c.x?.rating?.value) ? Math.round(c.x.rating.value * 10) / 10 : undefined,
      count: Number.isFinite(c.x?.rating?.votes_count) ? c.x.rating.votes_count : undefined, distanceMi: c.mi,
      website: c.x.url || undefined, tools: [] as any[], signals: [] as any[], placeId: c.x.place_id || undefined,
      kind: clip(c.x.category, 60) || category, mapsRank: Number(c.x.rank_group) || null, address: clip(c.x.address, 140) || undefined,
      match: { sameKind: c.lv === 0, basis: `Google Maps: ${category} near the business`, maps: true, siteRead: false },
      reviews: [] as any[],
    }));
    // Google's own search: reviews for the ones Maps found, and more competitors if Maps found too few
    const gp = (pl?.places || []).filter((x: any) => x?.id && x.displayName?.text);
    const byId = new Map<string, any>(gp.map((x: any) => [x.id, x]));
    for (const c of picked) {
      const x = c.placeId && byId.get(c.placeId);
      if (!x) continue;
      c.reviews = toReviews(x.reviews);
      if (c.distanceMi == null && x.location) { const mi = miles(at, x.location); if (mi != null && mi <= 20) c.distanceMi = mi; }
    }
    if (picked.length < 3) {
      const have = new Set(picked.map(c => c.placeId));
      const selfPhone = (x: any) => { const ph = last10(x.nationalPhoneNumber || ""); return !!ph && phones.has(ph); };
      for (const x of gp) {
        if (picked.length >= 5) break;
        if (have.has(x.id) || x.id === self.id || selfPhone(x) || hostOf(x.websiteUri) === d || sameBrand(String(x.displayName.text)) || (x.types || []).some((t: string) => NOT_RIVAL.includes(t))) continue;
        const mi = miles(at, x.location); if (mi == null || mi > 20) continue;
        picked.push({ name: clip(x.displayName.text, 120), rating: x.rating ?? undefined, count: x.userRatingCount ?? undefined, distanceMi: mi, website: x.websiteUri || undefined,
          tools: [], signals: [], placeId: x.id, kind: x.primaryTypeDisplayName?.text || category,
          match: { sameKind: false, basis: `Google search: ${category} near the business`, maps: false, siteRead: false }, reviews: toReviews(x.reviews) });
      }
    }
    how = items ? "maps" : "places";
    kind = slug(category);
  } else {
    // 3. no Maps: Google Places, searched for what the listing or the site says the business is
    const own = place.primaryType && !VAGUE.has(place.primaryType) ? String(place.primaryType) : "";
    const listed: string[] = (Array.isArray(place.types) ? place.types : []).map(String).filter((t: string) => !VAGUE.has(t));
    const head = `${g.meta?.title || ""} ${g.meta?.description || ""} ${place.name || ""}`;
    const body = `${(g.pages || []).map((p: any) => String(p?.text || "")).join("\n")}\n${extraText}`.slice(0, 6000);
    kind = own || kindOf(head, body) || listed[0] || "";
    if (!kind) return done(me ? "unknown_kind" : "unknown_kind_no_maps");
    picked = await rivalsNear(kind, at, near, self, { share: listed, popular: true });
    picked.forEach(c => { c.match = { ...(c.match || {}), siteRead: false }; });
    how = "places";
  }
  // 4. each competitor's own website, and the tools on it
  await Promise.all(picked.map(async c => {
    if (!c.website) return;
    const r = await rivalSite(c.website).catch(() => null);
    if (r?.site) { c.site = r.site; c.match.siteRead = true; }
    if (r?.tools?.length) c.tools = r.tools;
  }));
  const industry = category ? { type: kind, name: category, city } : kind ? { type: kind, name: human(kind), city } : null;
  return done(how, picked, { category, kind, industry });
}

// Runs the engine on a scan's Google read when it needs it (see trusted above), and when Google found no listing for
// the business, first looks for the listing from what the site says (name, phone, address). Changes g in place.
export async function improveRivals(d: string, g: any, getKit?: (() => Promise<{ kit: any; html: string }>) | null, extraText = "", force = false) {
  if (!needsRivals(g, force)) return false;
  g.found = { ...(g.found || {}) };
  if (!okListing(g)) {
    let found: any = null;
    if (PLACES_KEY) {
      const k = getKit ? await getKit().catch(() => null) : null;
      const pages = (g.pages || []).map((p: any) => ({ title: String(p?.title || ""), url: String(p?.url || ""), text: String(p?.text || "") }));
      found = await secondChance(d, k?.kit?.ok ? k.kit : {}, k?.html || "", pages, false).catch(() => null);
    }
    if (found?.place) { g.place = found.place; g.found.listing = found.found?.basis || "site-kit"; }
    else {
      const comps = found?.competitors || [];
      g.found.rivals = comps.length ? "no_listing_kind" : "no_listing";
      if (comps.length && !(g.competitors || []).length) { g.competitors = comps; if (!g.industry?.type) g.industry = found.industry; }
      console.log("[site-kit rivals]", d, JSON.stringify({ how: g.found.rivals, found: comps.length }));
      return comps.length > 0;
    }
  }
  const r = await findRivals(d, g, extraText);
  g.found.rivals = r.how;
  if (r.category) g.found.category = r.category;
  // a vague or missing category's list from the main step is unrelated neighbours: replace it, even with nothing
  const t = String(g.place.primaryType || "");
  if (r.competitors.length || r.how === "not_local" || !t || VAGUE.has(t)) g.competitors = r.competitors;
  if (r.industry && (!g.industry?.type || VAGUE.has(String(g.industry.type)))) g.industry = { ...(g.industry || {}), ...r.industry };
  return r.competitors.length > 0;
}

// Monthly Google searches for what the business does, by people in its city (the state when Google has no city figure).
export async function demandFor(words: string[], cityName: string, st: string) {
  const state = STATES[st] || "";
  if (!state || !words.length) return null;
  const kws = [...new Set(words.slice(0, 2).flatMap(w => [w, `${w} near me`, `${w} ${cityName.toLowerCase()}`]))].filter(k => k.length <= 80 && k.split(/\s+/).length <= 10);
  for (const t of [{ loc: `${cityName},${state},United States`, scope: "city", area: `${cityName}, ${st}` }, { loc: `${state},United States`, scope: "state", area: state }]) {
    const task = await dfs("/keywords_data/google_ads/search_volume/live", [{ keywords: kws, location_name: t.loc, language_code: "en" }], 40000);
    if (!task || task.error) continue;
    const rows = (task.result || []).filter((r: any) => r && typeof r.keyword === "string" && Number(r.search_volume) > 0);
    const total = rows.reduce((n: number, r: any) => n + Number(r.search_volume), 0);
    if (total < 10) continue;
    const byMonth = new Map<string, { y: number; m: number; v: number }>();
    for (const r of rows) for (const x of r.monthly_searches || []) {
      if (!Number.isFinite(x?.year) || !Number.isFinite(x?.month)) continue;
      const k = `${x.year}-${String(x.month).padStart(2, "0")}`;
      const cur = byMonth.get(k) || { y: x.year, m: x.month, v: 0 };
      cur.v += Number(x.search_volume) || 0; byMonth.set(k, cur);
    }
    const months = [...byMonth.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(e => e[1]).slice(-12);
    const peak = months.length ? months.reduce((a, b) => b.v > a.v ? b : a) : null;
    const lead = [...rows].sort((a: any, b: any) => Number(b.search_volume) - Number(a.search_volume));
    const priced = lead.find((r: any) => Number(r.cpc) > 0);
    return {
      area: t.area, scope: t.scope, total, word: words[0],
      cpc: priced ? Math.round(Number(priced.cpc) * 100) / 100 : null,
      top: lead.slice(0, 3).map((r: any) => ({ q: clip(r.keyword, 80), v: Number(r.search_volume) })),
      months, peak,
    };
  }
  return null;
}

export function marketHints(u: URL) {
  const g = (k: string, re: RegExp, n: number) => { const v = clip(u.searchParams.get(k), n); return re.test(v) ? v : ""; };
  const num = (k: string, lim: number) => { const v = Number(u.searchParams.get(k)); return Number.isFinite(v) && v !== 0 && Math.abs(v) <= lim ? v : null; };
  return {
    kind: g("kind", /^[a-z_]{2,40}$/, 40), kname: g("kname", /^[A-Za-z &'-]{2,40}$/, 40), city: g("city", /^[A-Za-z .'-]{2,40},\s*[A-Z]{2}$/, 50),
    lat: num("lat", 90), lng: num("lng", 180), place: g("place", /^[A-Za-z0-9_-]{16,80}$/, 80), name: g("name", /^[^<>{}"]{2,80}$/, 80),
  };
}

export async function insightFor(d: string, g: any, h: ReturnType<typeof marketHints>) {
  const ok = g && !g.error;
  const place = ok && g.place && typeof g.place === "object" ? g.place : null;
  const type = String((ok && g.industry?.type) || place?.primaryType || h.kind || "");
  const kname = String((ok && g.industry?.name) || h.kname || "");
  const city = String((ok && g.industry?.city) || cityOf(place?.address || "") || h.city || "");
  const cm = city.match(/^(.+?),\s*([A-Z]{2})\b/);
  const cityName = (cm ? cm[1] : city).trim(), st = cm ? cm[2] : "";
  const words = wordsFor(type, kname);
  if (!words.length || !cityName) return { error: "no_kind_or_city" };
  const pa = ok ? g.presence?.at : null;
  let at = pa && Number.isFinite(pa.lat) && Number.isFinite(pa.lng) ? { latitude: pa.lat, longitude: pa.lng }
    : h.lat != null && h.lng != null ? { latitude: h.lat, longitude: h.lng } : null;
  if (!at) at = (await locate(place?.address || city))?.location ?? null;
  const phones = new Set<string>([...((ok && g.phones) || []), place?.phone || ""].map(last10).filter(Boolean));
  const self: Self = { id: String(place?.id || h.place || ""), name: String(place?.name || h.name || ""), d, phones };
  const [maps, demand] = await Promise.all([
    at ? Promise.all(words.slice(0, 2).map(w => mapsRank(`${w} ${cityName}`, at!, self))).then(r => r.filter(Boolean)) : Promise.resolve([]),
    demandFor(words, cityName, st),
  ]);
  return { at: new Date().toISOString(), city: cityName, state: st, words, maps, demand };
}

// Google's own speed test of the home page on a phone. Free; needs the PageSpeed Insights API turned on for the
// Google Cloud project that owns GOOGLE_PLACES_API_KEY (and allowed on the key, if the key is restricted).
export async function pageSpeed(d: string) {
  if (!PLACES_KEY) return { ok: false, error: "no_key" };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 58000);
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(`https://${d}/`)}&strategy=mobile&category=performance&key=${PLACES_KEY}`, { signal: ctl.signal });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) {
      const why = String(j?.error?.message || "");
      return { ok: false, error: r.status === 403 ? "not_enabled" : "failed", http: r.status, why: why.slice(0, 160) };
    }
    const lr = j?.lighthouseResult, a = lr?.audits || {};
    const score = Number(lr?.categories?.performance?.score);
    if (!Number.isFinite(score)) return { ok: false, error: "no_score" };
    const sec = (k: string) => Number.isFinite(a[k]?.numericValue) ? Math.round(a[k].numericValue / 100) / 10 : null;
    return { ok: true, score: Math.round(score * 100), lcp: sec("largest-contentful-paint"), fcp: sec("first-contentful-paint"), at: new Date().toISOString() };
  } catch (e) { return { ok: false, error: "failed", why: String(e).slice(0, 120) }; } finally { clearTimeout(t); }
}

// ---------- deep reviews: recent Google reviews for the business and each competitor, through DataForSEO ----------
// Google's own listing gives Pip only 5 reviews per business. Pip asks for these the moment it starts studying a business
// (?reviews=start), on DataForSEO's fast queue, and collects them as they finish (?reviews=poll), so they are back before
// Pip designs anything. Each set is kept on the scan's row. Reviewer names, profile links and photos are dropped here
// and never stored. About $0.0015 per 10 reviews: up to 300 of the business's own plus 100 for each of 5 competitors.
const OWN_DEPTH = 300, RIVAL_DEPTH = 100;
const PLACE_RE = /^[A-Za-z0-9_-]{16,120}$/, TASK_RE = /^[0-9a-f]{8}-[0-9a-f-]{20,40}$/i;
const rvKey = (id: string) => "rv_" + id.replace(/[^0-9a-z]/gi, "").slice(0, 40);
async function dfsCall(path: string, init: RequestInit = {}, ms = 20000): Promise<any | null> {
  if (!DFS_LOGIN || !DFS_PASS) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(DFS + path, { ...init, signal: ctl.signal, headers: { authorization: "Basic " + btoa(`${DFS_LOGIN}:${DFS_PASS}`), "content-type": "application/json" } });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) { console.error("[site-kit reviews]", path.split("/").slice(0, 6).join("/"), r.status, String(j?.status_message || "").slice(0, 160)); return null; }
    return j;
  } catch (e) { console.error("[site-kit reviews]", String(e).slice(0, 120)); return null; } finally { clearTimeout(t); }
}
export async function postReviews(own: string, rivals: string[]) {
  const jobs = [
    ...(own ? [{ place_id: own, depth: OWN_DEPTH, tag: "own" }] : []),
    ...[...new Set(rivals)].filter(p => p !== own).slice(0, 5).map(p => ({ place_id: p, depth: RIVAL_DEPTH, tag: "rival" })),
  ];
  if (!jobs.length) return [];
  const j = await dfsCall("/business_data/google/reviews/task_post", { method: "POST", body: JSON.stringify(jobs.map(x => ({ ...x, location_code: 2840, language_code: "en", sort_by: "newest", priority: 2 }))) });
  const tasks = (j?.tasks || []).filter((t: any) => t && t.status_code === 20100 && typeof t.id === "string");
  if ((j?.tasks || []).length && !tasks.length) console.error("[site-kit reviews] not created", JSON.stringify((j.tasks || []).map((t: any) => [t?.status_code, String(t?.status_message || "").slice(0, 80)])));
  return tasks.map((t: any) => ({ id: String(t.id), tag: t.data?.tag === "own" ? "own" : "rival", placeId: String(t.data?.place_id || "") }));
}
const reviewOf = (it: any) => ({
  rating: Number(it?.rating?.value) || 0,
  text: clip(it?.review_text ?? it?.original_review_text ?? "", 900),
  at: typeof it?.timestamp === "string" ? it.timestamp.slice(0, 10) : undefined,
  ago: typeof it?.time_ago === "string" ? it.time_ago.slice(0, 40) : undefined,
  replied: !!it?.owner_answer,
});
export async function getReviews(id: string) {
  const j = await dfsCall(`/business_data/google/reviews/task_get/${encodeURIComponent(id)}`);
  const t = j?.tasks?.[0];
  if (!t) return { status: "pending" as const };
  if (t.status_code === 20000) {
    const res = t.result?.[0];
    if (!res) return { status: "pending" as const };
    const reviews = (res.items || []).map(reviewOf).filter((r: any) => r.text.length > 3);
    return { status: "ready" as const, reviews, total: Number.isFinite(res.reviews_count) ? res.reviews_count : null };
  }
  if (t.status_code === 40601 || t.status_code === 40602) return { status: "pending" as const };
  return { status: "error" as const, code: t.status_code };
}
// One part of the scan's row, without loading the rest (the review sets make the row large).
async function getPart(d: string, k: string): Promise<{ status: string; v: any } | null> {
  const r = await db(`site_builds?domain=eq.${encodeURIComponent(d)}&select=status,v:parts->${k}`);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null); return j?.[0] ?? null;
}
export async function reviewsMode(u: URL, d: string) {
  const mode = u.searchParams.get("reviews");
  if (mode === "start") {
    let b = await getPart(d, "rv_tasks");
    if (!b) return { ok: false, error: "no_scan" };
    if (Array.isArray(b.v)) return { ok: true, tasks: b.v, cached: true };
    const at = (await getPart(d, "rv_at"))?.v;
    if (at && Date.now() - Date.parse(at) < 60_000) {
      // another call is placing the order right now: wait a moment for its task list rather than paying twice
      for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 750)); b = await getPart(d, "rv_tasks"); if (Array.isArray(b?.v)) return { ok: true, tasks: b!.v, cached: true }; }
      return { ok: false, pending: true };
    }
    // which places: the scan's own Google read first; the page's copy only when the scan has none
    const g = (await getPart(d, "gather"))?.v;
    let own = String(g?.place?.id || ""), rivals: string[] = (Array.isArray(g?.competitors) ? g.competitors : []).map((c: any) => String(c?.placeId || ""));
    if (!own && !rivals.some(Boolean)) { own = String(u.searchParams.get("own") || ""); rivals = String(u.searchParams.get("rivals") || "").split(","); }
    own = PLACE_RE.test(own) && own !== "owner" ? own : "";
    rivals = rivals.filter(p => PLACE_RE.test(p));
    if (!own && !rivals.length) return { ok: false, error: "no_places" };
    await put(d, "rv_at", new Date().toISOString());
    const tasks = await postReviews(own, rivals);
    if (tasks.length) await put(d, "rv_tasks", tasks);
    return { ok: tasks.length > 0, tasks };
  }
  if (mode === "poll") {
    const id = String(u.searchParams.get("id") || "");
    if (!TASK_RE.test(id)) return { ok: false, error: "bad_id" };
    const b = await getPart(d, "rv_tasks");
    if (!b) return { ok: false, error: "no_scan" };
    if (!(Array.isArray(b.v) ? b.v : []).some((t: any) => t?.id === id)) return { ok: false, error: "unknown_task" };
    const kept = (await getPart(d, rvKey(id)))?.v;
    if (kept && Array.isArray(kept.reviews)) return { ok: true, status: "ready", reviews: kept.reviews, total: kept.total ?? null, cached: true };
    const r: any = await getReviews(id);
    if (r.status === "ready") { await put(d, rvKey(id), { reviews: r.reviews, total: r.total }); return { ok: true, status: "ready", reviews: r.reviews, total: r.total }; }
    return { ok: true, status: r.status, ...(r.code ? { code: r.code } : {}) };
  }
  return { ok: false, error: "bad_mode" };
}

// ---------- key check: are the secrets present and accepted? (no business data, nothing billed) ----------
const CHECK_CODE = Deno.env.get("SITE_KIT_CHECK_CODE") ?? "";
async function keyCheck() {
  const out: Record<string, unknown> = { places_key: !!PLACES_KEY, firecrawl_key: !!FC_KEY };
  if (PLACES_KEY) {
    try {
      // An empty search is refused after the key is checked, so nothing comes back and nothing is billed.
      const r = await fetch(PLACES + "/places:searchText", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": "places.id" }, body: JSON.stringify({ textQuery: "" }) });
      const j: any = await r.json().catch(() => null);
      out.places = { http: r.status, status: j?.error?.status ?? null, message: String(j?.error?.message ?? "").slice(0, 160), reasons: (j?.error?.details || []).map((x: any) => x?.reason).filter(Boolean) };
    } catch (e) { out.places = { error: String(e).slice(0, 120) }; }
  }
  if (FC_KEY) {
    for (const path of ["/v2/team/credit-usage", "/v1/team/credit-usage"]) {
      try {
        const r = await fetch("https://api.firecrawl.dev" + path, { headers: { authorization: `Bearer ${FC_KEY}` } });
        const j: any = await r.json().catch(() => null);
        out.firecrawl = { path, http: r.status, success: j?.success ?? null, remaining: j?.data?.remainingCredits ?? j?.data?.remaining_credits ?? null, error: j?.error ? String(j.error).slice(0, 120) : null };
        if (r.status !== 404) break;
      } catch (e) { out.firecrawl = { path, error: String(e).slice(0, 120) }; }
    }
  }
  if (PLACES_KEY) {
    try {
      // No page given, so Google answers right after checking the key and the API: 400 means PageSpeed is on, 403 means it isn't.
      const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=&key=${PLACES_KEY}`);
      const j: any = await r.json().catch(() => null);
      out.pagespeed = { http: r.status, on: r.status !== 403, reasons: (j?.error?.details || []).map((x: any) => x?.reason).filter(Boolean), message: String(j?.error?.message ?? "").slice(0, 160) };
    } catch (e) { out.pagespeed = { error: String(e).slice(0, 120) }; }
  }
  out.dataforseo_key = !!(DFS_LOGIN && DFS_PASS);
  if (DFS_LOGIN && DFS_PASS) {
    try {
      const r = await fetch(DFS + "/appendix/user_data", { headers: { authorization: "Basic " + btoa(`${DFS_LOGIN}:${DFS_PASS}`) } });
      const j: any = await r.json().catch(() => null);
      out.dataforseo = { http: r.status, status: j?.status_code ?? null, balance: j?.tasks?.[0]?.result?.[0]?.money?.balance ?? null };
    } catch (e) { out.dataforseo = { error: String(e).slice(0, 120) }; }
  }
  return out;
}

// ---------- photos: small, cropped, through the wsrv.nl image resizer ----------
const wsrv = (u: string, q: string) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&${q}`;
async function photosFor(cands: string[]) {
  const out: any[] = [];
  for (let i = 0; i < cands.length && out.length < 3; i += 3) {
    const got = await Promise.all(cands.slice(i, i + 3).map(c => image(wsrv(c, "w=720&h=460&fit=cover&a=attention&we&output=jpg&q=62"), 90_000)));
    for (const im of got) if (im && im.w >= 420 && im.h >= 260 && !out.some(o => o.bytes === im.bytes) && out.length < 3) out.push({ data: im.data, w: im.w, h: im.h, bytes: im.bytes });
  }
  return out;
}

// ---------- the learn job: kit + Google + (when needed) a real browser's read + photos ----------
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GATHER = "https://pip-ai-drab.vercel.app/api/gather";
const POLL_MAX = 300_000;
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...(init.headers as Record<string, string> || {}) } });
async function getBuild(d: string) {
  const r = await db(`site_builds?domain=eq.${encodeURIComponent(d)}&select=status,parts,created_at,updated_at`);
  if (!r.ok) return null;
  const j = await r.json(); return j?.[0] ?? null;
}
const put = (d: string, k: string, v: unknown) => db("rpc/site_build_put", { method: "POST", body: JSON.stringify({ d, k, v }) }).then(r => r.body?.cancel()).catch(() => {});
const setStatus = (d: string, status: string) => db(`site_builds?domain=eq.${encodeURIComponent(d)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }) }).then(r => r.body?.cancel()).catch(() => {});
async function fetchJson(url: string, ms: number) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
}
const pagesText = (g: any) => (g?.pages || []).reduce((n: number, p: any) => n + String(p?.text || "").length, 0);

async function learn(d: string) {
  const t0 = Date.now();
  try {
    // A good Google read is saved the moment it lands. A failed one is held back until the second chance below has run,
    // so Pip never receives the failure first and then misses the better answer.
    const held: { failed: { error: string } | null } = { failed: null };
    const kitP = kitWithHtml(d);
    const gP = fetchJson(`${GATHER}?d=${encodeURIComponent(d)}`, 45000).then(async g => {
      if (g && !g.error && Array.isArray(g.pages)) {
        // the right competitors before Pip sees the read (see the competitor engine)
        await improveRivals(d, g, () => kitP).catch(e => console.error("[site-kit rivals]", d, String(e).slice(0, 160)));
        await put(d, "gather", g);
      }
      else held.failed = { error: g?.error || "unreachable" };
      return g;
    });
    let kit: any = (await kitP).kit;
    let page: any = null;
    if (!kit.ok) { // blocked or unreachable for a plain reader: let a real browser load it
      page = await rendered(d);
      if (!page.error) kit = await parseKit(d, page.html, page.url);
    }
    const { photoCands = [], ...pub } = kit;
    await put(d, "kit", pub);
    const phP = photosFor(photoCands).then(p => put(d, "photos", p));
    const g = await gP;
    // Pip reads the page text itself when Google's read was blocked or thin
    let site: any = { pages: [] };
    if (!g || g.error || g.siteBlocked || pagesText(g) < 2500) {
      if (!page) page = await rendered(d);
      if (!page.error) {
        const pages: { title: string; url: string; text: string }[] = [];
        const t = siteText(page.html);
        if (t.length > 200) pages.push({ title: pub.title || pub.name || d, url: page.url, text: t });
        const more = await extraPages(page.html, page.url, d).catch(() => []);
        pages.push(...more);
        if (pages.length) site = { rendered: true, pages };
      }
      else site = { pages: [], error: page.error, why: page.why };
    }
    if (held.failed) {
      let found: any = null;
      if (site.pages?.length) found = await secondChance(d, pub, page?.html || "", site.pages).catch(e => { console.error("[site-kit second chance]", d, String(e).slice(0, 160)); return null; });
      if (found) await improveRivals(d, found, null, site.pages.map((p: any) => p.text).join("\n")).catch(e => console.error("[site-kit rivals]", d, String(e).slice(0, 160)));
      await put(d, "gather", found || held.failed);
    }
    await put(d, "site", site);
    await phP;
    await put(d, "took", Date.now() - t0);
    await setStatus(d, "done");
  } catch (e) {
    await put(d, "fail", String(e).slice(0, 200));
    await setStatus(d, "failed");
  }
}

const ORDER = ["kit", "gather", "site", "photos", "took", "fail"];
const noStore = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (CHECK_CODE && u.searchParams.get("check") === CHECK_CODE) return noStore(await keyCheck());
  const d = (u.searchParams.get("d") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return json({ ok: false, error: "invalid" }, 400);

  // Test run of the competitor engine on a saved scan (needs the check code). Nothing is saved unless save=1;
  // force=1 runs it even on a scan whose own list would be kept.
  if (u.searchParams.get("rivals") === "check" && CHECK_CODE && u.searchParams.get("code") === CHECK_CODE) {
    if (!SB_URL || !SB_KEY) return noStore({ ok: false, error: "not_configured" });
    const g0 = (await getPart(d, "gather"))?.v;
    if (!g0 || g0.error) return noStore({ ok: false, error: "no_scan" });
    const g = JSON.parse(JSON.stringify(g0)), t0 = Date.now(), force = u.searchParams.get("force") === "1";
    if (g.found) delete g.found.rivals;
    const ran = needsRivals(g, force);
    if (ran) await improveRivals(d, g, () => kitWithHtml(d), "", force);
    const brief = (c: any) => ({ name: c?.name, kind: c?.kind, mi: c?.distanceMi, address: c?.address ?? null, rating: c?.rating, reviews: c?.count, mapsRank: c?.mapsRank ?? null, sameKind: c?.match?.sameKind ?? null, site: c?.site ? `${c.site.pages || 1}p ${String(c.site.text || "").length}ch` : null, tools: (c?.tools || []).map((t: any) => t?.vendor), googleReviews: (c?.reviews || []).length });
    const out: any = { ok: true, ran, ms: Date.now() - t0, found: g.found ?? null, industry: g.industry ?? null, listing: g.place ? { name: g.place.name, primaryType: g.place.primaryType ?? null, types: g.place.types } : null, before: (g0.competitors || []).map((c: any) => c?.name), after: (g.competitors || []).map(brief) };
    if (ran && u.searchParams.get("save") === "1") { await put(d, "gather", g); await put(d, "rivals", null); out.saved = true; }
    return noStore(out);
  }

  // Start (or reuse) a learn job. Returns at once; the work continues in the background.
  if (u.searchParams.get("start") === "1") {
    if (!SB_URL || !SB_KEY) return noStore({ ok: false, error: "not_configured" });
    const b = await getBuild(d);
    const age = b ? Date.now() - Date.parse(b.created_at) : Infinity;
    const quiet = b ? Date.now() - Date.parse(b.updated_at) : Infinity;
    if (b && b.status === "done" && age < 86_400_000) {
      // a scan saved before the competitor engine: run it once, and have the competitor read run again if the list changed
      const g = b.parts?.gather;
      if (needsRivals(g)) {
        const before = JSON.stringify((g.competitors || []).map((c: any) => c?.name));
        await improveRivals(d, g, () => kitWithHtml(d)).catch(e => console.error("[site-kit rivals]", d, String(e).slice(0, 160)));
        await put(d, "gather", g);
        if (JSON.stringify((g.competitors || []).map((c: any) => c?.name)) !== before) await put(d, "rivals", null);
      }
      return noStore({ ok: true, job: d, cached: true });
    }
    if (b && b.status === "running" && quiet < 90_000) return noStore({ ok: true, job: d, running: true });
    const now = new Date().toISOString();
    await db("site_builds?on_conflict=domain", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ domain: d, status: "running", parts: {}, created_at: now, updated_at: now }) }).then(r => r.body?.cancel());
    if (Math.random() < 0.1) db(`site_builds?created_at=lt.${new Date(Date.now() - 7 * 86_400_000).toISOString()}`, { method: "DELETE" }).then(r => r.body?.cancel()).catch(() => {});
    EdgeRuntime.waitUntil(learn(d));
    return noStore({ ok: true, job: d });
  }

  // Market: Google Maps rankings and local search demand for a scan that has started. Worked out once per scan.
  if (u.searchParams.get("insight") === "1") {
    if (!SB_URL || !SB_KEY) return noStore({ ok: false, error: "not_configured" });
    if (!DFS_LOGIN || !DFS_PASS) return noStore({ ok: false, error: "no_dataforseo" });
    const b = await getBuild(d);
    if (!b) return noStore({ ok: false, error: "no_scan" });
    const p = b.parts || {};
    if (p.insight) return noStore({ ok: true, cached: true, ...p.insight });
    if (p.insight_at && Date.now() - Date.parse(p.insight_at) < 75_000) return noStore({ ok: false, pending: true });
    await put(d, "insight_at", new Date().toISOString());
    const out: any = await insightFor(d, p.gather, marketHints(u)).catch(e => ({ error: String(e).slice(0, 160) }));
    const good = !!(out.maps?.length || out.demand);
    if (good) await put(d, "insight", out);
    return noStore({ ok: good, ...out });
  }
  // Deep reviews: order them (start) and collect each finished set (poll). See reviewsMode above.
  if (u.searchParams.has("reviews")) {
    if (!SB_URL || !SB_KEY) return noStore({ ok: false, error: "not_configured" });
    if (!DFS_LOGIN || !DFS_PASS) return noStore({ ok: false, error: "no_dataforseo" });
    return noStore(await reviewsMode(u, d).catch(e => ({ ok: false, error: String(e).slice(0, 160) })));
  }
  // Speed: Google's PageSpeed test of the home page on a phone. Kept once it works; a refusal isn't kept, so it
  // starts working by itself once the API is turned on.
  if (u.searchParams.get("speed") === "1") {
    if (!SB_URL || !SB_KEY) return noStore({ ok: false, error: "not_configured" });
    const b = await getBuild(d);
    if (!b) return noStore({ ok: false, error: "no_scan" });
    const p = b.parts || {};
    if (p.speed?.ok) return noStore({ ...p.speed, cached: true });
    if (p.speed_at && Date.now() - Date.parse(p.speed_at) < 75_000) return noStore({ ok: false, pending: true });
    await put(d, "speed_at", new Date().toISOString());
    const s: any = await pageSpeed(d);
    if (s.ok) await put(d, "speed", s);
    return noStore(s);
  }

  // Poll: the parts the caller doesn't have yet, kept under ~300 KB per reply.
  // With wait=1 the reply is held (up to 12s) until something new lands or the job ends, so the
  // caller's browser loads a handful of pages per scan instead of dozens.
  if (u.searchParams.get("poll") === "1") {
    const have = new Set((u.searchParams.get("have") || "").split(",").filter(Boolean));
    let b = await getBuild(d);
    if (!b) return noStore({ ok: false, error: "no_job" });
    const fresh = (x: any) => x.status !== "running" || ORDER.some(k => k in (x.parts || {}) && !have.has(k));
    if (u.searchParams.get("wait") === "1") {
      const until = Date.now() + 12_000;
      while (!fresh(b) && Date.now() < until) {
        await new Promise(r => setTimeout(r, 600));
        b = await getBuild(d) ?? b;
      }
    }
    const parts: Record<string, unknown> = {}; let size = 0;
    for (const k of ORDER) {
      if (have.has(k) || !(k in (b.parts || {}))) continue;
      const n = JSON.stringify(b.parts[k]).length;
      if (size && size + n > POLL_MAX) break;
      parts[k] = b.parts[k]; size += n;
    }
    const more = ORDER.some(k => k in (b.parts || {}) && !have.has(k) && !(k in parts));
    return noStore({ ok: true, status: b.status, parts, more });
  }

  // Plain kit (older saved plans still ask for this)
  const k: any = await kitFor(d);
  if (!k.ok) return json(k, 200);
  const { photoCands: _p, ...pub } = k;
  return json(pub);
});
