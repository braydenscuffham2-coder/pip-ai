// Step 2 of a scan: turn the raw facts into a Profile plus a Kit of words written for this one
// business. Works without a model (plain facts only) and gets much richer with one.
// Shared by the server and the sidebar build, so it must not use Node-only APIs.
import { IND, INDUSTRY_IDS, MODULE_TYPES, TYPES } from '../knowledge';
import { sanitizeKit, sanitizeProfile } from '../engine';
import type { AreaId, Competitor, IndustryId, Kit, Profile, ReviewTheme, ToolId } from '../types';
import type { Raw, RawCompetitor } from './gather';
import { llm, parseJson } from './llm';

/* ---------- facts without a model ---------- */

const TYPE_MAP: [RegExp, IndustryId][] = [
  [/(dent|doctor|physician|hospital|clinic|medical|physiotherap|chiropract|veterinar|optometr|skin_care_clinic|health)/, 'health'],
  [/(plumb|electric|roofing|contractor|hvac|painter|locksmith|moving_company|pest|landscap|cleaning|handyman)/, 'home'],
  [/(car_|auto_|tire|motor)/, 'auto'],
  [/(hair|beauty|barber|nail|spa|salon|massage|tanning)/, 'salon'],
  [/(restaurant|cafe|coffee|bakery|bar$|^bar|meal_|food|pizza|diner|brewery)/, 'restaurant'],
  [/real_estate/, 'realestate'],
  [/(gym|fitness|yoga|pilates|sports_club|martial)/, 'fitness'],
  [/(store|shop|boutique|market)/, 'retail'],
];

const WORDS: Record<IndustryId, string[]> = {
  health: ['dental', 'dentist', 'dentistry', 'orthodont', 'patients', 'clinic', 'chiropract', 'physical therapy', 'physiotherap', 'medical', 'veterinar', 'optometr', 'dermatolog', 'pediatric', 'insurance accepted', 'hygienist', 'exam'],
  home: ['hvac', 'heating', 'cooling', 'furnace', 'plumbing', 'plumber', 'roofing', 'electrician', 'electrical', 'water heater', 'drain', 'contractor', 'remodel', 'pest control', 'landscaping', 'lawn', 'garage door', 'handyman', 'cleaning service', 'technician'],
  auto: ['auto repair', 'oil change', 'brake', 'transmission', 'tires', 'collision', 'mechanic', 'vehicle', 'alignment', 'smog'],
  salon: ['salon', 'hair', 'stylist', 'balayage', 'haircut', 'nails', 'manicure', 'lash', 'brow', 'barber', 'spa', 'facial', 'massage', 'waxing'],
  restaurant: ['menu', 'reservations', 'dinner', 'lunch', 'brunch', 'cuisine', 'chef', 'dine', 'takeout', 'catering', 'coffee', 'bakery', 'pizza'],
  realestate: ['realtor', 'real estate', 'listings', 'homes for sale', 'buyers', 'sellers', 'brokerage', 'mls', 'open house'],
  fitness: ['gym', 'fitness', 'classes', 'yoga', 'pilates', 'crossfit', 'personal training', 'membership', 'workout', 'barre', 'studio schedule'],
  retail: ['shop now', 'add to cart', 'boutique', 'collection', 'in stock', 'free shipping', 'gift', 'store hours', 'apparel'],
  other: [],
};

export function classify(raw: Raw): IndustryId {
  const types = [raw.place?.primaryType, ...(raw.place?.types || [])].filter(Boolean) as string[];
  for (const t of types) for (const [re, id] of TYPE_MAP) if (re.test(t)) return id;
  const ldTypes = raw.ld.map(o => String(o['@type'] || '')).join(' ').toLowerCase();
  for (const [re, id] of TYPE_MAP) if (re.test(ldTypes.replace(/([a-z])([A-Z])/g, '$1_$2'))) return id;
  const text = `${raw.meta.title || ''} ${raw.meta.description || ''} ${raw.pages.map(p => p.title + ' ' + p.text.slice(0, 3000)).join(' ')}`.toLowerCase();
  let best: IndustryId = 'other', score = 0;
  for (const id of INDUSTRY_IDS) {
    let s = 0;
    for (const w of WORDS[id]) { const m = text.match(new RegExp(`\\b${w.replace(/ /g, '\\s+')}`, 'g')); if (m) s += Math.min(m.length, 6) * (w.includes(' ') ? 2 : 1); }
    if (s > score) { score = s; best = id; }
  }
  return score >= 3 ? best : 'other';
}

const NOT_BIZ = /^(BreadcrumbList|WebPage|ListItem|ImageObject|FAQPage|Question|Answer|SiteNavigationElement|SearchAction|Article|BlogPosting|CollectionPage|ItemList|VideoObject|Person|Offer|AggregateRating|Review|ContactPoint|PostalAddress|GeoCoordinates|OpeningHoursSpecification)$/;
/** JSON-LD objects that describe the business itself, most complete first. */
function bizLd(raw: Raw): Record<string, unknown>[] {
  const typeOf = (o: Record<string, unknown>) => (Array.isArray(o['@type']) ? (o['@type'] as string[]).join(' ') : String(o['@type'] || ''));
  return raw.ld
    .filter(o => !typeOf(o).split(' ').every(t => NOT_BIZ.test(t)) && typeOf(o) !== 'WebSite')
    .sort((a, b) => Number(!!b.address || !!b.telephone) - Number(!!a.address || !!a.telephone));
}

function ldValue(raw: Raw, key: string): unknown {
  for (const o of bizLd(raw)) if (o[key] != null) return o[key];
  return undefined;
}

export function formatPhone(p?: string): string | undefined {
  if (!p) return undefined;
  const d = p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p.trim();
}

/** Service names from the titles of service pages, e.g. "/services/drain-cleaning". */
function servicesFromPages(raw: Raw): string[] {
  return raw.pages
    .filter(p => /(service|treatment|what-we-do|repair|install)/i.test(new URL(p.url).pathname) && new URL(p.url).pathname.split('/').filter(Boolean).length >= 2)
    .map(p => p.title.split(/\s[|\-–—:•·]\s/)[0].replace(/[®™]/g, '').trim())
    .filter(t => t.length >= 3 && t.length <= 40);
}

function hoursText(raw: Raw): string | undefined {
  const h = raw.place?.hours;
  if (h?.length) {
    // "Monday: 8:00 AM – 5:00 PM" x7 → "Mon–Fri 8 AM–5 PM, Sat 9 AM–1 PM"
    const days = h.map(line => { const [d, ...rest] = line.split(': '); return { d: d.slice(0, 3), v: rest.join(': ').replace(/:00/g, '').replace(/ /g, ' ').replace(/ /g, '') }; });
    const groups: { a: string; b: string; v: string }[] = [];
    for (const x of days) {
      const g = groups[groups.length - 1];
      if (g && g.v === x.v) g.b = x.d; else groups.push({ a: x.d, b: x.d, v: x.v });
    }
    if (groups.length === 1 && /24 hours/i.test(groups[0].v) && days.length === 7) return 'Open 24 hours, every day';
    return groups.filter(g => !/closed/i.test(g.v)).map(g => `${g.a}${g.a !== g.b ? '–' + g.b : ''} ${g.v.replace(/^Open 24 hours$/i, '24 hours')}`).join(', ').slice(0, 80) || undefined;
  }
  const oh = ldValue(raw, 'openingHours');
  if (typeof oh === 'string') return oh.slice(0, 80);
  if (Array.isArray(oh)) return oh.join(', ').slice(0, 80);
  return undefined;
}

function areaText(raw: Raw): string | undefined {
  const served = ldValue(raw, 'areaServed');
  const names = (Array.isArray(served) ? served : served ? [served] : [])
    .map(a => (typeof a === 'string' ? a : (a as Record<string, unknown>)?.name)).filter(x => typeof x === 'string') as string[];
  const towns = Array.from(new Set(names.map(n => n.replace(/,\s*[A-Z]{2}$/, '').trim()))).filter(Boolean);
  if (towns.length) return towns.slice(0, 5).join(', ').slice(0, 80);
  const addr = raw.place?.address;
  if (addr) { const parts = addr.split(',').map(s => s.trim()); return parts.length >= 3 ? parts[parts.length - 3] : parts[0]; }
  return undefined;
}

const NOTE: [ToolId, string][] = [['booking', 'let customers book online'], ['chatbot', 'have chat on their site'], ['phone', 'answer calls with AI']];

function competitorsOf(raw: Raw, own: ToolId[]): Competitor[] {
  return raw.competitors.map((c: RawCompetitor) => {
    const theirs = c.tools.map(t => t.id);
    const edge = NOTE.find(([id]) => theirs.includes(id) && !own.includes(id));
    return { name: c.name, rating: c.rating, distanceMi: c.distanceMi, note: edge?.[1] };
  });
}

function cleanName(raw: Raw): string {
  if (raw.place?.name) return raw.place.name;
  const ld = bizLd(raw).map(o => o.name).find(n => typeof n === 'string') as string | undefined;
  if (ld) return ld;
  if (raw.meta.siteName) return raw.meta.siteName;
  const t = (raw.meta.title || '').split(/\s[|\-–—:•·]\s/).map(s => s.trim()).filter(Boolean);
  return t.sort((a, b) => a.length - b.length)[0] || raw.domain;
}

/** A profile built only from facts we can point to. No model involved. */
export function factProfile(raw: Raw): Profile {
  const tools = Array.from(new Set(raw.detected.map(d => d.id)));
  const offers = ldValue(raw, 'makesOffer') || (ldValue(raw, 'hasOfferCatalog') as Record<string, unknown> | undefined)?.itemListElement;
  const services = (Array.isArray(offers) ? offers : [])
    .map(o => { const x = o as Record<string, unknown>; const io = x.itemOffered as Record<string, unknown> | undefined; return (io?.name || x.name) as string | undefined; })
    .filter((s): s is string => typeof s === 'string');
  if (!services.length) services.push(...servicesFromPages(raw));
  return {
    name: cleanName(raw).slice(0, 80),
    site: raw.domain,
    industry: classify(raw),
    desc: raw.meta.description?.slice(0, 100),
    services: Array.from(new Set(services)).slice(0, 6),
    hours: hoursText(raw),
    area: areaText(raw),
    phone: formatPhone(raw.place?.phone || raw.phones[0]),
    tools,
    detected: raw.detected,
    pains: [],
    rating: raw.place?.rating,
    reviewCount: raw.place?.count,
    themes: [],
    competitors: competitorsOf(raw, tools),
  };
}

/* ---------- writing with a model ---------- */

const DEMO_SHAPES = `chat: {"kind":"chat","c":customer message,"r":reply as the business,"res":short result like "Booked · Thu 8:30 AM"}
phone: {"kind":"phone","c":what the caller needed,"r":the text-back reply,"res":short result}
timeline: {"kind":"timeline","steps":[4 short steps]}
trigger: {"kind":"trigger","trig":a real-world trigger,"act":what Pip does,"res":result}
review: {"kind":"review","svc":service name,"rev":a short happy review}
brief: {"kind":"brief","lines":[3 short lines]}`;

function digest(raw: Raw, base: Profile): string {
  const pages = raw.pages.map(p => `## ${p.title} (${p.url})\n${p.text.slice(0, 2600)}`).join('\n\n').slice(0, 14000);
  const reviews = (raw.place?.reviews || []).map((r, i) => `${i + 1}. ${r.rating}★ ${r.when || ''}: ${r.text.slice(0, 500)}`).join('\n');
  return [
    `DOMAIN: ${raw.domain}`,
    `TITLE: ${raw.meta.title || ''}`,
    `DESCRIPTION: ${raw.meta.description || ''}`,
    raw.ld.length ? `STRUCTURED DATA: ${JSON.stringify(raw.ld).slice(0, 2500)}` : '',
    raw.place ? `GOOGLE LISTING: ${raw.place.name}, ${raw.place.address || ''}, rating ${raw.place.rating ?? '?'} from ${raw.place.count ?? '?'} reviews, type ${raw.place.primaryType || '?'}, hours: ${(raw.place.hours || []).join('; ')}` : 'GOOGLE LISTING: not found',
    reviews ? `RECENT GOOGLE REVIEWS (the only reviews you have):\n${reviews}` : 'REVIEWS: none available',
    `TOOLS FOUND ON THE SITE: ${raw.detected.map(d => `${d.vendor} (${d.id}, ${d.evidence})`).join('; ') || 'none'}`,
    `NEARBY COMPETITORS: ${base.competitors.map(c => `${c.name} ${c.rating ?? ''}★ ${c.distanceMi ?? '?'} mi${c.note ? ', they ' + c.note : ''}`).join('; ') || 'none found'}`,
    `PHONE: ${base.phone || 'unknown'}`,
    `PAGES:\n${pages}`,
  ].filter(Boolean).join('\n\n');
}

const SYSTEM = `You are the research analyst behind Pip, a guide that shows a small-business owner which AI upgrades fit their business. You study one business and write everything Pip will say about it.

Hard rules:
- Use only facts present in the material. Never invent numbers, names, prices, awards, staff, years, or reviews.
- Any number you write must appear in the material, or be a count you made from the reviews given (say "of N recent reviews").
- Write like a sharp local consultant talking to the owner: plain words, short sentences, specific to this business. No hype, no em dashes.
- Demo conversations are examples of the AI working for this business. Use its real services, hours, area and tone. Don't promise specific prices.
- Return one JSON object and nothing else.`;

function prompt(raw: Raw, base: Profile): string {
  const types = MODULE_TYPES.filter(t => t !== 'dispatch' || base.industry === 'home').map(t => `- ${t} (${TYPES[t].name}): ${TYPES[t].brief}. Demo kind: ${TYPES[t].demo}`).join('\n');
  return `MATERIAL\n${digest(raw, base)}

TASK
Return JSON with this shape:
{
  "name": business name as customers know it,
  "industry": one of ${INDUSTRY_IDS.map(i => `"${i}"`).join(', ')} (${INDUSTRY_IDS.map(i => `${i}=${IND[i].label}`).join('; ')}),
  "desc": what they do in under 12 words,
  "services": up to 6 main services in their own words,
  "hours": short hours text if known,
  "area": the towns or area they serve, short,
  "themes": review themes from the reviews above only. [{"label": 2-5 words, "count": how many of the given reviews mention it, "quote": a short exact phrase from one review, "sentiment": "negative"|"positive", "relates": one of "leads","scheduling","followup","questions","reviews","admin"}]. Max 4. Empty if no reviews.
  "kit": {
    "summary": one sentence about the business, as Pip would introduce it,
    "facts": up to 4 short, specific, true details worth mentioning (family owned since X, 24/7 emergency, accepts Delta Dental...),
    "slots": two realistic appointment or booking options in this business's terms, like "Thursday 8:30 AM cleaning",
    "pricing": how they handle price questions, from their site; else a careful honest line,
    "asks": up to 5 things customers most likely call or message about, in customers' words,
    "say": {
      "report": Pip presenting the current state to the owner (1-2 sentences, cites one real detail),
      "market": Pip introducing the upgrades picked for them (1 sentence),
      "build": Pip wrapping up the build for them (1 sentence)
    },
    "modules": { for each of the 6-8 modules that fit best: "<module id>": {"line": what it does for THIS business in under 12 words, "why": evidence from the material in under 10 words (omit if none), "demo": a demo in the module's demo kind} }
  }
}

Modules:
${types}

Demo shapes:
${DEMO_SHAPES}`;
}

/** Drops sentences that cite a number we can't find in the material. */
export function grounded(text: string | undefined, corpus: string): string | undefined {
  if (!text) return text;
  const nums = text.match(/\d+(?:[.,]\d+)?/g) || [];
  return nums.every(n => corpus.includes(n) || Number(n) <= 12) ? text : undefined;
}

type Draft = Partial<Omit<Profile, 'kit'>> & { kit?: Kit; themes?: ReviewTheme[] };

/** Builds the final profile. Uses the model when one is available; otherwise facts only. */
export async function personalize(raw: Raw): Promise<{ profile: Profile; usedModel: boolean }> {
  const base = factProfile(raw);
  const reply = await llm({ system: SYSTEM, messages: [{ role: 'user', content: prompt(raw, base) }], maxTokens: 3500, tier: 'fast', timeoutMs: 50000, purpose: 'scan:personalize', domain: raw.domain });
  const d = parseJson<Draft>(reply);
  if (!d) return { profile: base, usedModel: false };

  const corpus = JSON.stringify(raw);
  const reviewN = raw.place?.reviews.length || 0;
  const themes = (Array.isArray(d.themes) ? d.themes : [])
    .filter(t => t && typeof t.label === 'string' && Number(t.count) >= 1 && Number(t.count) <= reviewN)
    .map(t => ({ ...t, quote: t.quote && corpus.toLowerCase().includes(t.quote.toLowerCase().slice(0, 25)) ? t.quote : undefined, relates: t.relates as AreaId | undefined }));

  const kit = sanitizeKit(d.kit);
  if (kit) {
    kit.facts = kit.facts?.filter(f => grounded(f, corpus));
    if (kit.say) for (const k of ['report', 'market', 'build'] as const) kit.say[k] = grounded(kit.say[k], corpus);
    if (kit.modules) for (const m of Object.values(kit.modules)) if (m) m.why = grounded(m.why, corpus);
  }

  const merged = sanitizeProfile({
    ...base,
    name: d.name || base.name,
    industry: INDUSTRY_IDS.includes(d.industry as IndustryId) ? d.industry : base.industry,
    desc: d.desc || base.desc,
    services: d.services?.length ? d.services : base.services,
    hours: base.hours || d.hours,
    area: d.area || base.area,
    themes,
    kit,
  });
  return { profile: merged || base, usedModel: true };
}
