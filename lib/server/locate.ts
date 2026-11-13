// Second-chance Google lookup for a business the main gather step could not match.
// 1. Try to find the business's own Google listing from its name plus the address or phone on its site.
//    A listing is accepted only when its website is the same domain, or its name matches and its
//    phone or street address is the one on the site.
// 2. With a listing: nearby businesses of the same Google type.
// 3. Without a listing but with an address: businesses Google returns for what the site says it does,
//    near that address. The result says which basis was used so nothing downstream has to guess.
// No model calls. Shapes match what gather returns for `place` and `competitors`.

type LatLng = { latitude: number; longitude: number };
interface GPlace {
  id?: string;
  displayName?: { text?: string };
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  primaryType?: string;
  types?: string[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  location?: LatLng;
  reviews?: { rating?: number; text?: { text?: string }; relativePublishTimeDescription?: string }[];
}

const BASE = 'https://places.googleapis.com/v1';
const FIELDS = ['id', 'displayName', 'websiteUri', 'rating', 'userRatingCount', 'formattedAddress', 'nationalPhoneNumber', 'primaryType', 'types', 'regularOpeningHours', 'location'];
const GENERIC = new Set(['point_of_interest', 'establishment', 'premise', 'subpremise', 'street_address', 'route', 'locality', 'political', 'store', 'food', 'health', 'finance', 'service']);
const NOISE = new Set(['the', 'and', 'of', 'llc', 'inc', 'co', 'company', 'corp', 'group', 'services', 'service', 'home', 'official', 'site', 'website']);

async function call(method: 'POST' | 'GET', path: string, mask: string[], body?: unknown): Promise<Record<string, unknown> | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask.join(',') },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[locate]', path, res.status); return null; }
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function searchText(textQuery: string, near?: LatLng, radius = 20000, max = 8): Promise<GPlace[]> {
  const body: Record<string, unknown> = { textQuery, maxResultCount: max };
  if (near) body.locationBias = { circle: { center: near, radius } };
  const r = await call('POST', '/places:searchText', FIELDS.map(f => 'places.' + f), body);
  return (r?.places as GPlace[] | undefined) ?? [];
}
async function searchNearby(center: LatLng, type: string, max = 12): Promise<GPlace[]> {
  const r = await call('POST', '/places:searchNearby', FIELDS.map(f => 'places.' + f), {
    includedPrimaryTypes: [type], maxResultCount: max, rankPreference: 'POPULARITY',
    locationRestriction: { circle: { center, radius: 16000 } },
  });
  return (r?.places as GPlace[] | undefined) ?? [];
}

const host = (u?: string) => { try { return new URL(u || '').hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const digits = (s?: string) => (s || '').replace(/\D/g, '').slice(-10);
const words = (s: string) => s.toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(w => w.length > 1 && !NOISE.has(w));
function nameMatch(a: string, b: string) {
  const x = words(a), y = new Set(words(b));
  if (!x.length || !y.size) return 0;
  return x.filter(w => y.has(w)).length / x.length;
}
// Same street number and street name: the only way a name match is trusted without a website match.
function sameAddr(a: string, b?: string) {
  const num = (a.match(/\d{1,6}/) || [])[0];
  const street = words(a.replace(/\d+/g, ' '))[0];
  return !!num && !!b && new RegExp(`\\b${num}\\b`).test(b) && (!street || b.toLowerCase().includes(street));
}
function miles(a: LatLng, b: LatLng) {
  const R = 3958.8, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const rival = (p: GPlace, from: LatLng) => ({
  name: p.displayName?.text || '',
  rating: p.rating,
  count: p.userRatingCount,
  distanceMi: p.location ? Math.round(miles(from, p.location) * 10) / 10 : undefined,
  website: p.websiteUri,
  tools: [] as unknown[],
  signals: [] as unknown[],
});
function pickRivals(list: GPlace[], from: LatLng, domain: string, selfId?: string, maxMi = 30) {
  const seen = new Set<string>();
  return list
    .filter(p => p.id && p.id !== selfId && p.displayName?.text && p.location && typeof p.rating === 'number' && (p.userRatingCount ?? 0) >= 3)
    .filter(p => host(p.websiteUri) !== domain)
    .filter(p => miles(from, p.location as LatLng) <= maxMi)
    .filter(p => { const k = (p.displayName?.text || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 4)
    .map(p => rival(p, from));
}

export interface LocateInput { domain: string; name: string; addr: string; phone: string; about: string }
export interface LocateResult { basis: 'listing' | 'address' | null; query?: string; place?: Record<string, unknown>; competitors: ReturnType<typeof rival>[] }

export const locateEnabled = () => !!process.env.GOOGLE_PLACES_API_KEY;

export async function locate(input: LocateInput): Promise<LocateResult> {
  const { domain, name, addr, about } = input;
  const phone = digits(input.phone);
  if (!name && !addr) return { basis: null, competitors: [] };

  // 1. the business's own listing
  let own: GPlace | null = null;
  const tries = [name && addr ? `${name} ${addr}` : '', name ? `${name} ${domain}` : '', phone.length === 10 ? phone : ''].filter(Boolean);
  for (const t of tries) {
    const found = await searchText(t, undefined, 20000, 5);
    // Several listings on the same website means a chain or a multi-office business: only the one at the
    // address on the site counts, so Pip never picks a location at random.
    const sameSite = found.filter(p => host(p.websiteUri) === domain);
    own = (sameSite.length === 1 ? sameSite[0] : sameSite.find(p => !!addr && sameAddr(addr, p.formattedAddress)))
      ?? found.find(p => name && nameMatch(name, p.displayName?.text || '') >= 0.75
        && ((phone.length === 10 && digits(p.nationalPhoneNumber) === phone) || (!!addr && sameAddr(addr, p.formattedAddress))))
      ?? null;
    if (own) break;
  }

  if (own?.id && own.location) {
    const detail = (await call('GET', `/places/${own.id}`, [...FIELDS, 'reviews'])) as GPlace | null;
    const p = detail ?? own;
    const place = {
      id: own.id,
      name: p.displayName?.text || name,
      website: p.websiteUri,
      rating: p.rating,
      count: p.userRatingCount,
      address: p.formattedAddress,
      phone: p.nationalPhoneNumber,
      primaryType: p.primaryType,
      types: p.types ?? [],
      hours: p.regularOpeningHours?.weekdayDescriptions,
      reviews: (p.reviews ?? []).slice(0, 5).map(r => ({ rating: r.rating ?? 0, text: r.text?.text || '', when: r.relativePublishTimeDescription })).filter(r => r.text),
    };
    const type = p.primaryType && !GENERIC.has(p.primaryType) ? p.primaryType : (p.types ?? []).find(t => !GENERIC.has(t));
    let near = type ? await searchNearby(own.location, type) : [];
    if (near.length < 2 && about) near = await searchText(about, own.location);
    return { basis: 'listing', place, competitors: pickRivals(near, own.location, domain, own.id) };
  }

  // 2. no listing: work from the address on their site
  if (addr && about) {
    const at = (await searchText(addr, undefined, 20000, 1))[0];
    if (at?.location) {
      const near = await searchText(about, at.location, 25000, 12);
      return { basis: 'address', query: about, competitors: pickRivals(near, at.location, domain) };
    }
  }
  return { basis: null, competitors: [] };
}

// ---------- hints from a gathered site ----------
interface Loose {
  place?: unknown;
  competitors?: unknown[];
  pages?: { url?: string; title?: string; text?: string }[];
  meta?: { title?: string; description?: string; siteName?: string };
  ld?: Record<string, unknown>[];
  phones?: string[];
  located?: unknown;
}
const STREET = /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.' -]{2,40}?\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Hwy|Highway|Pl|Place|Cir|Circle|Sq|Square|Ter|Terrace|Trl|Trail|Loop|Row|Plaza)\b\.?(?:[ ,]+(?:#|Suite|Ste\.?|Unit|Apt\.?)\s*[\w-]+)?[\s,]+[A-Z][A-Za-z .'-]{1,28},\s*[A-Z]{2}\b(?:\s+\d{5})?/;
const FLUFF = /\b(exceptional|premier|leading|quality|high-quality|top|best|trusted|full-service|professional|award-winning|local|your|our|the|a|an)\b/gi;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nameFrom(o: Loose, domain: string) {
  const org = (o.ld ?? []).find(x => /organization|business|store|restaurant|service|dentist|plumb|clinic/i.test(String(x['@type'] ?? '')) && typeof x.name === 'string');
  const fromTitle = (o.meta?.title || '').split(/\s[|\-–—:]\s/).map(s => s.trim()).filter(s => s && !/^home$/i.test(s)).pop() || '';
  return String(o.meta?.siteName || (org?.name as string | undefined) || fromTitle || domain.split('.')[0]).replace(/\s+/g, ' ').trim().slice(0, 80);
}
function addrFrom(o: Loose) {
  for (const x of o.ld ?? []) {
    const a = x.address as Record<string, unknown> | string | undefined;
    if (typeof a === 'string' && a.length > 8) return a.slice(0, 140);
    if (a && typeof a === 'object' && a.streetAddress) return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ').slice(0, 140);
  }
  const pages = [...(o.pages ?? [])].sort((p, q) => Number(/contact|location|visit|find-us/i.test(q.url || '')) - Number(/contact|location|visit|find-us/i.test(p.url || '')));
  for (const p of pages) { const m = (p.text || '').match(STREET); if (m) return m[0].replace(/\s+/g, ' ').trim().slice(0, 140); }
  return '';
}
function aboutFrom(o: Loose, name: string) {
  const strip = (s: string) => (name ? s.replace(new RegExp(esc(name), 'ig'), ' ') : s).replace(/\s+/g, ' ').trim();
  const d = strip(o.meta?.description || '');
  let phrase = (d.match(/\b(?:specializ(?:es|ing) in|is an?|are an?|provides?|providing|offers?|offering|delivers?)\s+([^.,;|!?]{6,90})/i) || [])[1] || '';
  if (!phrase) phrase = (o.meta?.title || '').split(/\s[|\-–—:]\s/).map(strip).filter(s => s.length > 3 && !/^home$/i.test(s))[0] || '';
  if (!phrase) phrase = d.split(/[.!?|]/)[0] || '';
  phrase = phrase.replace(FLUFF, ' ').replace(/\s(with|for|in|throughout|across|that|who|to|from|serving|creating|since)\s.*$/i, '').replace(/[^A-Za-z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim();
  const n = phrase.split(' ').filter(Boolean);
  return n.length >= 2 && n.length <= 8 ? n.join(' ') : '';
}

/** Fills in `place` and `competitors` on a gathered site that came back with no Google listing. Never throws. */
export async function secondChance<T extends object>(domain: string, out: T): Promise<T> {
  try {
    const o = out as Loose;
    if (!locateEnabled() || o.place || (o.competitors?.length ?? 0) > 0) return out;
    const name = nameFrom(o, domain), addr = addrFrom(o), about = aboutFrom(o, name);
    if (!addr && !name) return out;
    const r = await locate({ domain, name, addr, phone: (o.phones ?? [])[0] || '', about });
    if (r.place) o.place = r.place;
    if (r.competitors.length >= 2) o.competitors = r.competitors;
    o.located = { basis: r.basis, query: r.query ?? null, address: addr || null, about: about || null };
  } catch (e) {
    console.error('[locate] second chance failed', String(e).slice(0, 120));
  }
  return out;
}
