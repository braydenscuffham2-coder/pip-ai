// Google Places (New) lookups: the business's own listing, its recent reviews, and nearby competitors.
// Needs GOOGLE_PLACES_API_KEY. Every function returns null instead of throwing, so a scan never
// fails because Places did.

export interface PlaceReview { rating: number; text: string; when?: string }
export interface Place {
  id: string;
  name: string;
  website?: string;
  rating?: number;
  count?: number;
  address?: string;
  phone?: string;
  primaryType?: string;
  types: string[];
  hours?: string[];
  location?: { latitude: number; longitude: number };
  reviews: PlaceReview[];
}

const BASE = 'https://places.googleapis.com/v1';
const FIELDS = ['id', 'displayName', 'websiteUri', 'rating', 'userRatingCount', 'formattedAddress', 'nationalPhoneNumber', 'primaryType', 'types', 'regularOpeningHours', 'location'];

export const placesEnabled = () => !!process.env.GOOGLE_PLACES_API_KEY;

async function call(path: string, body: unknown, fields: string[], ms = 8000): Promise<Record<string, unknown> | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields.join(',') },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[places]', path, res.status, (await res.text()).slice(0, 300)); return null; }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.error('[places]', path, String(e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

function toPlace(p: Record<string, unknown>): Place {
  const dn = p.displayName as { text?: string } | undefined;
  const hours = (p.regularOpeningHours as { weekdayDescriptions?: string[] } | undefined)?.weekdayDescriptions;
  const reviews = (Array.isArray(p.reviews) ? p.reviews : []).map((r: Record<string, unknown>) => ({
    rating: Number(r.rating) || 0,
    text: String((r.text as { text?: string } | undefined)?.text || (r.originalText as { text?: string } | undefined)?.text || '').trim(),
    when: r.relativePublishTimeDescription as string | undefined,
  })).filter(r => r.text);
  return {
    id: String(p.id),
    name: dn?.text || '',
    website: p.websiteUri as string | undefined,
    rating: typeof p.rating === 'number' ? p.rating : undefined,
    count: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
    address: p.formattedAddress as string | undefined,
    phone: p.nationalPhoneNumber as string | undefined,
    primaryType: p.primaryType as string | undefined,
    types: (p.types as string[]) || [],
    hours,
    location: p.location as Place['location'],
    reviews,
  };
}

const host = (u?: string) => { try { return new URL(u!).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Finds the business's own listing. Prefers the result whose website matches the domain. */
export async function findBusiness(domain: string, nameHint: string, cityHint?: string): Promise<Place | null> {
  const queries = [`${nameHint}${cityHint ? ' ' + cityHint : ''}`, domain];
  for (const textQuery of queries) {
    const r = await call('/places:searchText', { textQuery, maxResultCount: 5 }, [...FIELDS, 'reviews'].map(f => 'places.' + f));
    const list = (Array.isArray(r?.places) ? r!.places as Record<string, unknown>[] : []).map(toPlace);
    const match = list.find(p => host(p.website) === domain) || list.find(p => host(p.website).endsWith(domain));
    if (match) return match;
  }
  return null;
}

/** Up to `n` similar businesses nearby, most reviewed first, excluding the business itself. */
export async function nearbyCompetitors(self: Place, n = 4): Promise<Place[]> {
  if (!self.location || !self.primaryType) return [];
  const r = await call('/places:searchNearby', {
    includedTypes: [self.primaryType],
    maxResultCount: 12,
    rankPreference: 'POPULARITY',
    locationRestriction: { circle: { center: self.location, radius: 10000 } },
  }, FIELDS.map(f => 'places.' + f));
  const list = (Array.isArray(r?.places) ? r!.places as Record<string, unknown>[] : []).map(toPlace);
  // Big-box chains aren't the competition a local owner thinks about.
  const chain = /(home depot|lowe'?s|sears|walmart|costco|target|best buy|amazon|angi|homeadvisor)/i;
  return list.filter(p => p.id !== self.id && (p.count || 0) >= 5 && !chain.test(p.name)).slice(0, n);
}

/** Straight-line distance in miles. */
export function miles(a?: Place['location'], b?: Place['location']): number | undefined {
  if (!a || !b) return undefined;
  const R = 3958.8, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.latitude - a.latitude), dLon = toR(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.latitude)) * Math.cos(toR(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
