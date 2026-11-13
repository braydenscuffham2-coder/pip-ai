// Who a business really competes with, and how findable it is.
//   competitors   the five nearby businesses most similar to this one (kind of business, what their
//                 own site says they do, price level, size, distance), replacing "most popular in the
//                 same Google category"
//   presence      Google profile basics, where the business comes up in Google Maps searches for its
//                 own category, and whether AI crawlers are allowed to read its site
// Facts only, no model calls. Never throws: on any failure the reply keeps what it already had.
import { readSite } from './deep';

const BASE = 'https://places.googleapis.com/v1';
const UA = 'Mozilla/5.0 (compatible; PipScanner/1.0)';
const RADIUS = 12000;
const POOL_FIELDS = ['id', 'displayName', 'primaryType', 'primaryTypeDisplayName', 'types', 'location', 'rating', 'userRatingCount', 'websiteUri', 'priceLevel', 'businessStatus', 'editorialSummary', 'reviews'].map(f => 'places.' + f).join(',');
const SELF_FIELDS = 'id,displayName,location,primaryType,primaryTypeDisplayName,types,priceLevel,businessStatus,photos,regularOpeningHours,nationalPhoneNumber,websiteUri,rating,userRatingCount,reviews';
const GENERIC = new Set(['point_of_interest', 'establishment', 'store', 'food', 'service', 'health', 'finance', 'restaurant', 'local_business']);
const VAGUE = new Set(['restaurant', 'store', 'establishment', 'point_of_interest', 'corporate_office', 'service']);
const PRICE: Record<string, number> = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
const STOP = new Set('the and for with you your our are was were this that from have has not but all can will its their they them his her she him who what when where how why out get got one two also more most very just into over than then there here been being any each such only own same too about after before while near contact call today now free best new home page click learn read menu about services service company business llc inc'.split(' '));
const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Bingbot'];

interface LatLng { latitude: number; longitude: number }
interface GReview { rating?: number; text?: { text?: string }; relativePublishTimeDescription?: string; publishTime?: string }
interface GPlace {
  id?: string; displayName?: { text?: string }; primaryType?: string; primaryTypeDisplayName?: { text?: string }; types?: string[]; location?: LatLng;
  rating?: number; userRatingCount?: number; websiteUri?: string; priceLevel?: string; businessStatus?: string; editorialSummary?: { text?: string };
  reviews?: GReview[]; photos?: unknown[]; regularOpeningHours?: unknown; nationalPhoneNumber?: string;
}
interface Rival { name?: string; website?: string; tools?: unknown[]; signals?: unknown[]; [k: string]: unknown }
interface Out {
  domain?: string; url?: string; siteBlocked?: boolean; ld?: { '@type'?: unknown }[]; meta?: { title?: string; description?: string };
  place?: { id?: string; name?: string; address?: string; primaryType?: string; types?: string[]; website?: string };
  located?: { address?: string | null; about?: string | null };
  competitors?: Rival[]; industry?: unknown; presence?: unknown; timing?: Record<string, number>;
}
interface Full { pages?: { text?: string }[] }

const key = () => process.env.GOOGLE_PLACES_API_KEY || '';
const within = <T>(p: Promise<T>, ms: number, v: T) => Promise.race([p, new Promise<T>(r => setTimeout(() => r(v), ms))]);
const hostOf = (u?: string) => { try { return new URL(u || '').hostname.toLowerCase().replace(/^www[.]/, '') } catch { return '' } };
const norm = (s?: string) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/ +/g, ' ').trim();
const core = (s?: string) => norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w) && !/^(restaurant|services?|plumbing|dental|group|of|co)$/.test(w));

async function google<T>(path: string, mask: string, body?: unknown, ms = 7000): Promise<T | null> {
  if (!key()) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': mask }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) { console.error('[market]', path.split(':').pop(), res.status); return null; }
    return (await res.json()) as T;
  } catch { return null } finally { clearTimeout(t) }
}
const circle = (c: LatLng, radius = RADIUS) => ({ circle: { center: { latitude: c.latitude, longitude: c.longitude }, radius } });
const searchText = (textQuery: string, at: LatLng | null, mask: string) => google<{ places?: GPlace[] }>('/places:searchText', mask, { textQuery, pageSize: 20, ...(at ? { locationBias: circle(at) } : {}) }).then(r => r?.places ?? []);

function miles(a: LatLng, b: LatLng) {
  const r = (x: number) => x * Math.PI / 180, dLat = r(b.latitude - a.latitude), dLng = r(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
// "610 W Grove St, Boise, ID 83702, USA" -> "Boise, ID"
function cityOf(address?: string | null) {
  const p = String(address || '').split(',').map(s => s.trim()).filter(Boolean), i = p.findIndex(x => /^[A-Z]{2}( [0-9]{5})?$/.test(x));
  return i > 0 ? `${p[i - 1]}, ${p[i].slice(0, 2)}` : '';
}

// ---------- what words a business uses about itself ----------
function terms(text: string, skip: Set<string>) {
  const m = new Map<string, number>();
  for (let w of norm(text).split(' ')) {
    if (w.length < 3 || /^[0-9]+$/.test(w) || STOP.has(w) || skip.has(w)) continue;
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    m.set(w, (m.get(w) || 0) + 1);
  }
  return m;
}
function cosine(a: Map<string, number>, b: Map<string, number>, idf: Map<string, number>) {
  let dot = 0, na = 0, nb = 0;
  for (const [w, n] of a) { const x = (1 + Math.log(n)) * (idf.get(w) || 1); na += x * x; const m = b.get(w); if (m) dot += x * (1 + Math.log(m)) * (idf.get(w) || 1); }
  for (const [w, n] of b) { const x = (1 + Math.log(n)) * (idf.get(w) || 1); nb += x * x; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// The services a site lists under its own "Services" heading: short title-case lines, in the site's words.
const NAV = /^(home|about( us)?|contact( us)?|blog|gallery|reviews?|careers?|faqs?|our team|projects|menu|login|more|select page|view all|learn more|read more|get started|request service)$/i;
const NOT_SERVICE = /^(our|what|why|who|how|meet|view|see|start|get|call|book|schedule|contact|learn|read|recent|latest|featured|by|from|posted|quality assurance|testimonials?|years of|about)\b|\b(blog|posts?|news|articles?|january|february|march|april|june|july|august|september|october|november|december)\b/i;
function serviceNames(pages: { text?: string }[]) {
  const out: string[] = [];
  for (const pg of pages.slice(0, 4)) {
    const lines = String(pg.text || '').split('\n').map(l => l.replace(/^#+ */, '').trim());
    for (let i = 0; i < lines.length && out.length < 6; i++) {
      if (!/^(our )?services( we offer)?$|^what we do$|^our (work|specialties|expertise)$/i.test(lines[i])) continue;
      for (let j = i + 1; j < Math.min(lines.length, i + 30) && out.length < 6; j++) {
        const l = lines[j], w = l.split(' ').length;
        if (l.length >= 4 && l.length <= 34 && w <= 4 && /^[A-Z]/.test(l) && !/[.!?:]$/.test(l) && !/\d/.test(l) && !NAV.test(l) && !NOT_SERVICE.test(l) && !out.some(x => x.toLowerCase() === l.toLowerCase())) out.push(l);
      }
    }
  }
  return out;
}
const chainish = (u?: string) => { try { const x = new URL(u || ''), p = x.pathname.split('/').filter(Boolean); return /^(locations?|stores?|local)[.]/i.test(x.hostname) || p.length >= 2 || /location|stores?[/]|restaurants?[/]/i.test(x.pathname) } catch { return false } };

// ---------- AI crawlers ----------
async function text(url: string, ms = 4000): Promise<string | null> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: ctl.signal }); return r.ok && /text|plain/i.test(r.headers.get('content-type') || 'text/plain') ? (await r.text()).slice(0, 60000) : null }
  catch { return null } finally { clearTimeout(t) }
}
function robotsBlocked(robots: string) {
  const groups: { agents: string[]; all: boolean }[] = []; let cur: { agents: string[]; all: boolean } | null = null, inAgents = false;
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim(), i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!cur || !inAgents) { cur = { agents: [], all: false }; groups.push(cur); } cur.agents.push(v.toLowerCase()); inAgents = true; }
    else { inAgents = false; if (cur && k === 'disallow' && v === '/') cur.all = true; if (cur && k === 'allow' && v === '/') cur.all = false; }
  }
  return AI_AGENTS.filter(a => { const own = groups.find(g => g.agents.includes(a.toLowerCase())); return own ? own.all : !!groups.find(g => g.agents.includes('*'))?.all; });
}

// ---------- Google Maps rank for a search, ids only (no charge) ----------
async function rankOf(query: string, placeId: string, at: LatLng | null, names: Map<string, string>) {
  const ids = (await searchText(query, at, 'places.id')).map(p => p.id || '');
  if (!ids.length) return { query, rank: null as number | null, checked: 0, ahead: [] as string[] };
  const i = ids.indexOf(placeId);
  return { query, rank: i < 0 ? null : i + 1, checked: ids.length, ahead: ids.slice(0, i < 0 ? 3 : Math.min(i, 3)).map(id => names.get(id) || '').filter(Boolean) };
}
const PLACE_ID = /^[A-Za-z0-9_-]{16,120}$/;
/** /api/gather?part=rank&place=<id>&lat=&lng=&q=a|b|c  ->  where the place comes up for each search. */
export async function rankPart(q: URLSearchParams): Promise<Response> {
  const reply = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
  try {
    const place = q.get('place') || '', lat = Number(q.get('lat')), lng = Number(q.get('lng'));
    const qs = (q.get('q') || '').split('|').map(s => s.replace(/[^\p{L}\p{N} ,.'&-]+/gu, ' ').trim().slice(0, 80)).filter(s => s.length > 2).slice(0, 4);
    if (!PLACE_ID.test(place) || !qs.length) return reply({ ok: false, error: 'bad_request' });
    const at = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { latitude: lat, longitude: lng } : null;
    return reply({ ok: true, searches: await Promise.all(qs.map(s => rankOf(s, place, at, new Map()))) });
  } catch { return reply({ ok: false, error: 'unavailable' }) }
}

/** Replaces out.competitors with the five most similar nearby businesses and adds out.presence. */
export async function marketPass<T extends object>(domain: string, out: T, full: Full | null, t0: number): Promise<T> {
  const o = out as Out, started = Date.now(), oldList = o.competitors ?? [];
  let picked: Rival[] | null = null;
  try {
    if (!key() || Date.now() - t0 > 24000) return out;
    const placeId = o.place?.id && o.place.id !== 'owner' ? o.place.id : '';
    // 1. the business itself
    const [self, robots, llms] = await Promise.all([
      placeId ? google<GPlace>('/places/' + placeId, SELF_FIELDS) : Promise.resolve(null),
      o.url ? text(new URL('/robots.txt', o.url).toString()) : Promise.resolve(null),
      o.url ? text(new URL('/llms.txt', o.url).toString(), 3000) : Promise.resolve(null),
    ]);
    const address = o.place?.address || o.located?.address || '', city = cityOf(address);
    let at: LatLng | null = self?.location ?? null;
    if (!at && address) at = (await searchText(address, null, 'places.location'))[0]?.location ?? null;
    const type = self?.primaryType || o.place?.primaryType || '', typeName = self?.primaryTypeDisplayName?.text || (type ? type.replace(/_/g, ' ') : String(o.located?.about || '').trim());
    const ownTypes = new Set([...(self?.types || o.place?.types || [])].filter(t => !GENERIC.has(t)));
    const ownName = self?.displayName?.text || o.place?.name || '', ownCore = core(ownName), ownHost = hostOf(o.url) || domain;
    o.industry = { type: type || null, name: typeName || null, city: city || null, priceLevel: PRICE[self?.priceLevel || ''] ?? null };

    // 2. everyone who could be a competitor
    const pool = new Map<string, GPlace>(), found = new Map<string, number>(), services = serviceNames(full?.pages ?? []), inCity = city ? ' in ' + city : '';
    if (at && typeName) {
      const lists = await Promise.all([
        type && !VAGUE.has(type) ? google<{ places?: GPlace[] }>('/places:searchNearby', POOL_FIELDS, { includedPrimaryTypes: [type], maxResultCount: 20, rankPreference: 'POPULARITY', locationRestriction: circle(at) }).then(r => r?.places ?? []) : Promise.resolve([] as GPlace[]),
        searchText(typeName + inCity, at, POOL_FIELDS),
        // no Google category to go on: the trade the site names, asked a second way
        ...(type ? [] : [searchText(`${typeName} company${inCity}`, at, POOL_FIELDS)]),
      ]);
      const add = (list: GPlace[], ranked: boolean) => list.forEach((p, j) => { if (!p.id) return; if (!pool.has(p.id)) pool.set(p.id, p); if (ranked) found.set(p.id, Math.min(found.get(p.id) ?? 99, j)); });
      lists.forEach((list, k) => add(list, k > 0));
      // still thin: search for what the site says it sells (these pull in neighbours of the trade, so they come last)
      if (!type && pool.size < 12) (await Promise.all(services.slice(0, 2).map(sv => searchText(sv + inCity, at, POOL_FIELDS)))).forEach(list => add(list, true));
    }
    const names = new Map([...pool.values()].map(p => [p.id || '', p.displayName?.text || '']));
    const mine = terms(`${o.meta?.title || ''} ${o.meta?.description || ''} ${(full?.pages ?? []).map(p => p.text || '').join(' ').slice(0, 40000)}`, new Set([...ownCore, ...norm(city).split(' ')]));

    // 3. first cut on what Google knows, then read the best candidates' own sites
    const sameBrand = (p: GPlace) => p.id === placeId || (!!hostOf(p.websiteUri) && hostOf(p.websiteUri) === ownHost) || (ownCore.length > 0 && ownCore.every(w => core(p.displayName?.text).includes(w)));
    const typeScore = (p: GPlace) => {
      if (type && p.primaryType === type) return 1;
      const theirs = (p.types || []).filter(t => !GENERIC.has(t)), both = theirs.filter(t => ownTypes.has(t)).length, any = new Set([...theirs, ...ownTypes]).size;
      const fast = (p.types || []).includes('fast_food_restaurant') !== ownTypes.has('fast_food_restaurant');
      return (any ? 0.8 * both / any : type ? 0 : 0.4) * (fast ? 0.3 : 1);
    };
    const cands = [...pool.values()].filter(p => !sameBrand(p) && (p.businessStatus || 'OPERATIONAL') === 'OPERATIONAL' && p.rating != null && (p.userRatingCount || 0) >= 3 && p.location && miles(at!, p.location) <= 15)
      .map(p => { const mi = miles(at!, p.location!), ty = typeScore(p), rel = found.has(p.id!) ? 1 - Math.min(19, found.get(p.id!)!) / 20 : 0, near = 1 - Math.min(1, mi / 15); return { p, mi, ty, rel, near, first: (type ? 0.5 * ty : 0) + 0.3 * rel + 0.2 * near }; })
      .sort((a, b) => b.first - a.first).slice(0, 10);
    const left = Math.max(2500, Math.min(9000, 30000 - (Date.now() - t0)));
    const sites = await Promise.all(cands.map(c => c.p.websiteUri ? within(readSite(c.p.websiteUri, 4000), left, null) : Promise.resolve(null)));
    const docs = cands.map((c, i) => terms(`${c.p.displayName?.text || ''} ${c.p.primaryTypeDisplayName?.text || ''} ${c.p.editorialSummary?.text || ''} ${(c.p.types || []).join(' ').replace(/_/g, ' ')} ${sites[i]?.text || ''}`, new Set([...core(c.p.displayName?.text), ...norm(city).split(' ')])));
    const idf = new Map<string, number>(), all = [mine, ...docs];
    for (const d of all) for (const w of d.keys()) idf.set(w, (idf.get(w) || 0) + 1);
    for (const [w, n] of idf) idf.set(w, Math.log(1 + all.length / n));
    const ownPrice = PRICE[self?.priceLevel || ''], ownCount = self?.userRatingCount ?? 0;
    const scored = cands.map((c, i) => {
      const words = cosine(mine, docs[i], idf) * (sites[i] ? 1 : 0.7), theirPrice = PRICE[c.p.priceLevel || ''];
      const price = ownPrice && theirPrice ? 1 - Math.abs(ownPrice - theirPrice) / 3 : 0.5;
      const size = ownCount && c.p.userRatingCount ? 1 - Math.min(1, Math.abs(Math.log10(ownCount / c.p.userRatingCount)) / 2) : 0.5;
      const w = Math.min(1, words * 2.5), chain = chainish(c.p.websiteUri) && !chainish(o.url) ? 0.08 : 0;
      const score = (type ? 0.3 * c.ty + 0.36 * w + 0.08 * price + 0.04 * size + 0.14 * c.near + 0.08 * c.rel : 0.6 * w + 0.16 * c.near + 0.04 * size + 0.2 * c.rel) - chain;
      return { ...c, site: sites[i], words, score };
    }).sort((a, b) => b.score - a.score);

    // 4. the five most similar; anything the old list had for them (tools found on their site) is kept
    const old = new Map(oldList.map(c => [norm(c.name), c]));
    const top = scored.slice(0, 5).map(c => {
      const was = old.get(norm(c.p.displayName?.text)) || {};
      return {
        ...was, name: c.p.displayName?.text || '', rating: c.p.rating ?? null, count: c.p.userRatingCount ?? null, distanceMi: Math.round(c.mi * 10) / 10, website: c.p.websiteUri || (was.website as string | undefined) || undefined,
        tools: was.tools ?? [], signals: was.signals ?? [], placeId: c.p.id, kind: c.p.primaryTypeDisplayName?.text || undefined, priceLevel: PRICE[c.p.priceLevel || ''] ?? undefined,
        match: { score: Math.round(c.score * 100) / 100, sameKind: c.ty === 1, words: Math.round(c.words * 100) / 100, siteRead: !!c.site },
        ...(c.site ? { site: c.site } : {}),
        reviews: (c.p.reviews ?? []).slice(0, 5).map(r => ({ rating: r.rating ?? 0, text: (r.text?.text || '').slice(0, 700), when: r.relativePublishTimeDescription })).filter(r => r.text),
      };
    });
    if (top.length >= 3) picked = top;

    // 5. how findable the business is
    const rivalIds = new Map(top.map(c => [c.placeId || '', c.name]));
    for (const [id, n] of names) if (!rivalIds.has(id)) rivalIds.set(id, n);
    const searches = placeId && typeName ? await Promise.all([typeName + inCity, `best ${typeName}${city ? ' ' + city : ''}`, ...services.slice(0, 2).map(sv => sv + inCity)].map(s => rankOf(s, placeId, null, rivalIds))) : [];
    const schema = [...new Set((o.ld ?? []).flatMap(x => Array.isArray(x?.['@type']) ? x['@type'] : [x?.['@type']]).filter((x): x is string => typeof x === 'string'))].slice(0, 8);
    o.presence = {
      at: at ? { lat: at.latitude, lng: at.longitude } : null,
      profile: self ? { found: true, category: typeName || null, phone: !!self.nationalPhoneNumber, website: !!self.websiteUri, hours: !!self.regularOpeningHours, photos: (self.photos ?? []).length, photosCapped: (self.photos ?? []).length >= 10, rating: self.rating ?? null, reviews: self.userRatingCount ?? null, open: (self.businessStatus || 'OPERATIONAL') === 'OPERATIONAL' } : { found: false },
      searches,
      ai: { robots: robots == null ? 'none' : 'found', blocked: robots ? robotsBlocked(robots) : [], llmsTxt: !!llms && !/<html/i.test(llms.slice(0, 300)), schema, crawlBlocked: !!o.siteBlocked },
      considered: pool.size, services,
    };
  } catch (e) {
    console.error('[market] failed', String(e).slice(0, 160));
  }
  // the caller may have emptied the list while this ran; always leave either the new five or the old list
  o.competitors = picked ?? oldList;
  o.timing = { ...(o.timing || {}), market: Date.now() - started, similar: picked ? 1 : 0 };
  return out;
}
