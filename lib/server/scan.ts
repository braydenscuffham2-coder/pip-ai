// The live scan: gather facts, write the personalization, cache it, and stream progress as ScanEvents.
import { IND } from '../knowledge';
import type { Competitor, Profile, ScanEvent } from '../types';
import { CrawlError } from './crawl';
import { gather, type Raw, type RawCompetitor } from './gather';
import { factProfile, personalize } from './personalize';
import { getScan, logEvent, putScan } from './store';
import { llmEnabled } from './llm';

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export function factsOf(p: Profile): ScanEvent[] {
  const out: ScanEvent[] = [
    { type: 'fact', key: 'name', label: 'Business', value: p.name },
    { type: 'fact', key: 'industry', label: 'Industry', value: IND[p.industry].label },
  ];
  if (p.services.length) out.push({ type: 'fact', key: 'services', label: 'Services', value: p.services.join(', ') });
  if (p.hours) out.push({ type: 'fact', key: 'hours', label: 'Hours', value: p.hours });
  if (p.area) out.push({ type: 'fact', key: 'area', label: 'Service area', value: p.area });
  if (p.phone) out.push({ type: 'fact', key: 'phone', label: 'Phone', value: p.phone });
  return out;
}

function quickNote(c: RawCompetitor, own: Raw['detected']): Competitor {
  const has = (id: string) => own.some(d => d.id === id);
  const t = c.tools.map(x => x.id);
  const note = t.includes('booking') && !has('booking') ? 'let customers book online' : t.includes('chatbot') && !has('chatbot') ? 'have chat on their site' : undefined;
  return { name: c.name, rating: c.rating, distanceMi: c.distanceMi, note };
}

/** Replays a cached scan quickly so returning visitors see the same report. */
export async function* replay(raw: Raw, profile: Profile): AsyncGenerator<ScanEvent> {
  yield { type: 'status', message: `Opening ${raw.domain}`, progress: 8 };
  for (const p of raw.pages) { yield { type: 'page', url: shortUrl(p.url), title: p.title }; await wait(160); }
  yield { type: 'status', message: 'Reading your pages', progress: 34 };
  for (const f of factsOf(profile)) { yield f; await wait(120); }
  for (const d of profile.detected) { yield { type: 'tech', tool: d, label: d.vendor || d.id }; await wait(140); }
  if (profile.rating != null && profile.reviewCount != null) {
    yield { type: 'reviews', rating: profile.rating, count: profile.reviewCount, themes: profile.themes, sample: raw.place?.reviews.length };
    await wait(300);
  }
  for (const c of profile.competitors) { yield { type: 'competitor', competitor: c }; await wait(140); }
}

export async function* liveScan(domain: string, opts: { fresh?: boolean } = {}): AsyncGenerator<ScanEvent> {
  yield { type: 'meta', source: 'live' };
  const cached = opts.fresh ? null : await getScan(domain);
  // A facts-only scan from before the model was switched on: reuse the facts, write the rest now.
  if (cached?.raw && !cached.used_model && llmEnabled()) {
    yield* replay(cached.raw, factProfile(cached.raw));
    yield* write(domain, cached.raw);
    return;
  }
  if (cached?.profile && cached.raw) {
    yield* replay(cached.raw, cached.profile);
    if (cached.profile.kit) yield { type: 'kit', kit: cached.profile.kit };
    yield { type: 'status', message: 'Done', progress: 100 };
    yield { type: 'done', profile: { ...cached.profile, pains: [] }, source: 'live' };
    await logEvent('scan_cached', domain);
    return;
  }

  // gather() reports through a callback; turn that into a stream.
  const queue: ScanEvent[] = [];
  let wake: (() => void) | null = null;
  const push = (e: ScanEvent) => { queue.push(e); wake?.(); };
  let raw: Raw | null = null;
  let failure: unknown = null;
  let own: Raw['detected'] = [];
  const job = gather(domain, g => {
    if (g.t === 'page') push({ type: 'page', url: shortUrl(g.url), title: g.title });
    else if (g.t === 'status') push({ type: 'status', message: g.message, progress: g.progress });
    else if (g.t === 'tech') { own = [...own, g.tool]; push({ type: 'tech', tool: g.tool, label: g.tool.vendor || g.tool.id }); }
    else if (g.t === 'place' && g.place.rating != null && g.place.count != null) push({ type: 'reviews', rating: g.place.rating, count: g.place.count, themes: [], sample: g.place.reviews.length });
    else if (g.t === 'competitor') push({ type: 'competitor', competitor: quickNote(g.competitor, own) });
  }).then(r => { raw = r; }, e => { failure = e; }).finally(() => wake?.());

  let done = false;
  void job.then(() => { done = true; wake?.(); });
  while (!done || queue.length) {
    if (!queue.length) await new Promise<void>(r => { wake = r; setTimeout(r, 1000); });
    wake = null;
    while (queue.length) yield queue.shift()!;
  }

  if (failure || !raw) {
    const code = failure instanceof CrawlError ? failure.code : 'internal';
    await logEvent('scan_failed', domain, { code, error: String(failure) });
    yield { type: 'error', code, message: code === 'blocked' ? 'That site blocks automated visitors.' : "I couldn't open that site." };
    return;
  }
  const r: Raw = raw;
  // Facts first, so the owner sees something real right away.
  for (const f of factsOf(factProfile(r))) yield f;
  yield* write(domain, r);
}

/** Writes the personalization, stores the scan, and finishes the stream. */
async function* write(domain: string, r: Raw): AsyncGenerator<ScanEvent> {
  yield { type: 'status', message: 'Writing your briefing', progress: 86 };
  const { profile, usedModel } = await personalize(r);
  if (usedModel) {
    for (const f of factsOf(profile)) yield f;
    if (profile.rating != null && profile.reviewCount != null && profile.themes.length)
      yield { type: 'reviews', rating: profile.rating, count: profile.reviewCount, themes: profile.themes, sample: r.place?.reviews.length };
    if (profile.kit) yield { type: 'kit', kit: profile.kit };
  }
  await Promise.all([
    putScan(domain, r, profile, usedModel),
    logEvent('scan', domain, { pages: r.pages.length, tools: r.detected.length, place: !!r.place, competitors: r.competitors.length, usedModel }),
  ]);
  yield { type: 'status', message: 'Done', progress: 100 };
  yield { type: 'done', profile, source: 'live' };
}
