// Pip's brain for the sidebar build. Facts come from the Pip server through the Claude app's
// browser; all thinking runs on the viewer's own Claude plan via the `sample` capability.
import type { Raw } from '@/lib/server/gather';
import { factProfile, grounded } from '@/lib/server/personalize';
import { IND, INDUSTRY_IDS } from '@/lib/knowledge';
import type { IndustryId } from '@/lib/types';
import { CATEGORIES, ICONS, type AiItem, type Brief, type Category, type Demo, type IconName, type Rival, type Skill, type Theme, type Understanding } from './types';

export const SERVER = 'https://pip-ai-drab.vercel.app';

/* ---------------- capabilities ---------------- */

type Msg = { role: 'user' | 'assistant'; content: string };
type SampleFn = ((input: string | Msg[], o?: { modelTier?: 'quick' | 'default' | 'complex'; signal?: AbortSignal; cache?: boolean; onText?: (u: { text: string }) => void }) => Promise<{ text: string }>);
type Mcp = { callTool: (server: string, tool: string, input?: unknown) => Promise<{ payload?: unknown; content?: { type: string; text?: string }[] }> };
type Doc = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
type Db = { doc(path: string): Doc; collection(path: string): { add(d: Record<string, unknown>): Promise<unknown> } };

const claude = () => (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
const memo: Record<string, Promise<unknown>> = {};
function use<T>(name: string): Promise<T | null> {
  const c = claude();
  if (!c?.use) return Promise.resolve(null);
  memo[name] ??= c.use(name).catch(() => null);
  return memo[name] as Promise<T | null>;
}

export class BrainError extends Error {
  constructor(public code: 'no_model' | 'no_browser' | 'blocked' | 'unreachable' | 'model_failed' | 'rate_limited', detail?: string) { super(detail || code); }
}

/* ---------------- model calls ---------------- */

function parseJson<T>(text: string): T | null {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { return null; }
}

async function think(prompt: string | Msg[], tier: 'quick' | 'default' | 'complex', onText?: (chars: number) => void, ms = 150000): Promise<string> {
  const sample = await use<SampleFn>('sample');
  if (!sample) throw new BrainError('no_model');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await sample(prompt, { modelTier: tier, signal: ctl.signal, cache: false, onText: onText ? u => onText(u.text.length) : undefined });
    return r.text || '';
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'rate_limited') throw new BrainError('rate_limited');
    if (code === 'not_granted') throw new BrainError('no_model');
    throw new BrainError('model_failed', code || String(e));
  } finally {
    clearTimeout(t);
  }
}

/** Asks for JSON; if the reply doesn't parse, asks once more to fix it. */
async function thinkJson<T>(prompt: string, tier: 'quick' | 'default' | 'complex', onText?: (chars: number) => void): Promise<T> {
  const first = await think(prompt, tier, onText);
  const a = parseJson<T>(first);
  if (a) return a;
  const second = await think([{ role: 'user', content: prompt }, { role: 'assistant', content: first.slice(0, 20000) }, { role: 'user', content: 'That reply was not valid JSON. Return only the corrected JSON object, nothing else.' }], 'default');
  const b = parseJson<T>(second);
  if (b) return b;
  throw new BrainError('model_failed', 'bad_json');
}

/* ---------------- facts ---------------- */

export async function readFacts(domain: string): Promise<Raw> {
  const mcp = await use<Mcp>('mcp');
  if (!mcp) throw new BrainError('no_browser');
  try {
    await mcp.callTool('host:claude_browser', 'navigate', { url: `${SERVER}/api/gather?d=${encodeURIComponent(domain)}` });
    const r = await mcp.callTool('host:claude_browser', 'get_page_text', { max_chars: 200000 });
    const text = typeof r.payload === 'string' ? r.payload : (r.content || []).map(c => c.text || '').join('') || JSON.stringify(r.payload ?? '');
    const data = parseJson<Raw & { error?: string }>(text);
    if (!data) throw new BrainError('unreachable', 'unreadable');
    if (data.error) throw new BrainError(data.error === 'blocked' ? 'blocked' : 'unreachable', data.error);
    if (!data.domain || !Array.isArray(data.pages)) throw new BrainError('unreachable', 'bad_facts');
    return data;
  } catch (e) {
    if (e instanceof BrainError) throw e;
    const code = String((e as { code?: string })?.code || e);
    throw new BrainError(/not_connected|server_not_connected|not_granted|unavailable|not_in_manifest/.test(code) ? 'no_browser' : 'unreachable', code);
  }
}

export interface ManualInput { name: string; what: string; town: string; site?: string; reviews?: string }

/** Builds the same raw shape from what the owner typed, for businesses we can't scan. */
export function manualRaw(m: ManualInput): Raw {
  const reviews = (m.reviews || '').split(/\n{2,}|\n(?=\d+[.)]|\-|•)/).map(s => s.replace(/^\s*(\d+[.)]|-|•)\s*/, '').trim()).filter(s => s.length > 12).slice(0, 10);
  return {
    domain: (m.site || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'no-website',
    url: m.site || '',
    pages: [{ url: 'owner', title: `${m.name} (from the owner)`, text: `${m.name}\n${m.what}\nLocated in / serving: ${m.town}` }],
    meta: { title: m.name, description: m.what },
    ld: [], phones: [], emails: [], detected: [],
    place: reviews.length ? { id: 'owner', name: m.name, types: [], reviews: reviews.map(text => ({ rating: 0, text })) } : undefined,
    competitors: [],
    gatheredAt: new Date().toISOString(),
  };
}

/* ---------------- prompts ---------------- */

function digest(raw: Raw): string {
  const pages = raw.pages.map(p => `## ${p.title} (${p.url})\n${p.text.slice(0, 2600)}`).join('\n\n').slice(0, 16000);
  const reviews = (raw.place?.reviews || []).map((r, i) => `${i + 1}. ${r.rating ? r.rating + '★ ' : ''}${r.when || ''}: ${r.text.slice(0, 700)}`).join('\n');
  const rivals = raw.competitors.map(c => `- ${c.name}: ${c.rating ?? '?'}★ from ${c.count ?? '?'} reviews, ${c.distanceMi ?? '?'} mi away. Tools on their site: ${c.tools.map(t => t.vendor).join(', ') || 'none detected'}`).join('\n');
  return [
    `WEBSITE: ${raw.domain}${raw.siteBlocked ? ' (the site blocked our scanner; rely on Google data)' : ''}`,
    `TITLE: ${raw.meta.title || ''}`,
    `DESCRIPTION: ${raw.meta.description || ''}`,
    raw.ld.length ? `STRUCTURED DATA: ${JSON.stringify(raw.ld).slice(0, 2500)}` : '',
    raw.place && raw.place.id !== 'owner' ? `GOOGLE LISTING: ${raw.place.name}, ${raw.place.address || ''}. Rating ${raw.place.rating ?? '?'} from ${raw.place.count ?? '?'} reviews. Type: ${raw.place.primaryType || '?'}. Hours: ${(raw.place.hours || []).join('; ') || '?'}. Phone: ${raw.place.phone || '?'}` : 'GOOGLE LISTING: not available',
    reviews ? `REVIEWS WE CAN READ (${raw.place!.reviews.length} of them; these are the only reviews you have):\n${reviews}` : 'REVIEWS: none available',
    `TOOLS DETECTED ON THEIR SITE: ${raw.detected.map(d => `${d.vendor} (${d.id}, ${d.evidence})`).join('; ') || 'none'}`,
    `PHONES ON SITE: ${raw.phones.join(', ') || 'none'}. EMAILS: ${raw.emails.join(', ') || 'none'}`,
    rivals ? `NEARBY COMPETITORS (from Google):\n${rivals}` : 'NEARBY COMPETITORS: none found',
    `PAGES:\n${pages}`,
  ].filter(Boolean).join('\n\n');
}

const RULES = `Hard rules:
- Use only facts in the material. Never invent numbers, prices, names, staff, years, awards or reviews.
- Any number you write must appear in the material, or be a count you made from the reviews given.
- Plain words, short sentences, specific to this business. Talk to the owner as "you". No hype. No em dashes.
- Return one JSON object and nothing else.`;

function understandPrompt(raw: Raw, ownerNote?: string): string {
  return `You are Pip, an expert AI consultant for small businesses. Study this business closely. You will present it back to the owner, so they should feel you know their business inside out.

${RULES}

MATERIAL
${digest(raw)}
${ownerNote ? `\nTHE OWNER SAYS: ${ownerNote}` : ''}

Return JSON:
{
  "name": business name as customers know it,
  "industry": one of ${INDUSTRY_IDS.map(i => `"${i}"`).join(', ')} (${INDUSTRY_IDS.map(i => `${i}=${IND[i].label}`).join('; ')}),
  "oneLiner": what they do and for whom, under 16 words,
  "services": their main services in their own words (max 8),
  "customers": who their customers are and what they usually need, one sentence,
  "area": towns or area served, short,
  "hours": short hours text,
  "phone": main phone,
  "facts": up to 5 short, true, specific details that make this business distinct (from the material),
  "aiToday": {
    "score": 0-100, how well AI and automation cover their customer journey today (0 = everything manual, 100 = fully covered). Be honest and consistent: chat that only answers FAQs ~10-20, online booking ~15-25, AI phone ~20-30, combined systems higher.
    "verdict": a 3-6 word headline,
    "items": what they use today for customers, including manual ones, e.g. phone-only booking or a contact form: [{"name","kind":"ai"|"tool"|"manual","does": what it handles, "misses": what it can't do for this business}] (2-5 items),
    "gaps": the 3 biggest gaps for THIS business: [{"area": 2-3 words, "detail": one specific sentence}]
  },
  "reviews": {
    "summary": one sentence on what customers love and what frustrates them,
    "themes": up to 5 themes from the reviews given: [{"label": 2-5 words, "count": how many of the given reviews mention it, "quote": a short exact phrase from a review, "sentiment": "positive"|"negative"}]
  },
  "competition": {
    "summary": one sentence on how they compare nearby,
    "edges": {"<competitor name>": "what that competitor has or does better, from the material, or empty"}
  },
  "narration": {
    "who": Pip opening the presentation about this business (1-2 sentences, cites a real detail),
    "ai": Pip presenting their AI today (1-2 sentences),
    "reviews": Pip presenting what customers say (1-2 sentences, quote-worthy),
    "competition": Pip presenting the competition (1-2 sentences)
  }
}`;
}

const DEMO_SPEC = `Demo kinds (pick the one that shows the skill best):
- {"kind":"chat","opener": a realistic first message from a customer, "persona": instructions for an AI agent that plays this skill for this business: role, what it knows (real services, hours, area, policies from the material), how it talks, what it does (book, qualify, route), what it must never claim}
- {"kind":"flow","steps":[{"at": when, e.g. "Day 0" or "8:02 PM","text": what happens}] 4-6 steps}
- {"kind":"message","channel":"text"|"email","to": who receives it,"subject": for email,"body": the actual message the skill would send, written in the business's voice}
- {"kind":"brief","title": e.g. "7:00 AM briefing","lines": 3-5 lines}`;

function skillsPrompt(raw: Raw, und: Understanding, n = 6): string {
  return `You are Pip, a senior AI solutions designer. Design the ${n} AI skills that would help THIS business most. Each must be built around their real services, customers, reviews, tools and competition. Do not offer generic products; a skill only belongs here if you can point to evidence for it. Mix quick wins with bigger ideas the owner would never think of. Cover different parts of the business.

${RULES}

WHAT WE KNOW
${JSON.stringify({ name: und.name, industry: und.industry, oneLiner: und.oneLiner, services: und.services, customers: und.customers, area: und.area, hours: und.hours, facts: und.facts, aiToday: und.aiToday, reviews: und.reviews, competition: und.competition })}

SOURCE MATERIAL
${digest(raw).slice(0, 14000)}

Return JSON:
{
  "skills": [
    {
      "id": short-kebab-id,
      "name": a memorable 2-3 word name,
      "tagline": what it does for this business, under 12 words,
      "category": one of ${CATEGORIES.map(c => `"${c}"`).join(', ')},
      "icon": one of ${ICONS.map(c => `"${c}"`).join(', ')},
      "why": the evidence in one sentence under 20 words (cite a review theme, a service, a gap, or a competitor),
      "evidence": [{"source":"review"|"site"|"competitor"|"google","text": short specific evidence}] (1-3),
      "how": exactly 3 short steps of what it does,
      "impact": the outcome for the owner in plain words, no invented numbers,
      "connects": names of their existing tools it works with (from the material, may be empty),
      "demo": a demo,
      "match": 60-98, how strongly the evidence supports it,
      "effort": "Live in a day" | "Live in a few days" | "About two weeks"
    }
  ],
  "narration": {
    "upgrades": Pip introducing these skills (1-2 sentences),
    "build": Pip wrapping up (1 sentence)
  }
}

${DEMO_SPEC}`;
}

function wishPrompt(wish: string, b: Brief): string {
  return `You are Pip, a senior AI solutions designer. The owner of ${b.und.name} asked for this: "${wish}"
Design one AI skill that does it, built specifically for their business. If the request is vague, make the most useful concrete version of it. If it's impossible or unsafe, design the closest safe, legal version.

${RULES}

THE BUSINESS
${JSON.stringify({ name: b.und.name, oneLiner: b.und.oneLiner, services: b.und.services, customers: b.und.customers, area: b.und.area, hours: b.und.hours, facts: b.und.facts, tools: b.und.aiToday.items.map(i => i.name), reviews: b.und.reviews.summary })}

Return JSON for one skill (same shape as below, "evidence" source "owner" allowed):
{"id","name","tagline","category","icon","why","evidence":[{"source","text"}],"how":[3 steps],"impact","connects":[],"demo":{...},"match":60-98,"effort"}
category: one of ${CATEGORIES.join(', ')}. icon: one of ${ICONS.join(', ')}.

${DEMO_SPEC}`;
}

/* ---------------- cleaning model output ---------------- */

const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/—/g, ', ').trim().slice(0, n) : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);

function cleanUnderstanding(x: Record<string, unknown>, raw: Raw): Understanding {
  const corpus = JSON.stringify(raw);
  const base = factProfile(raw);
  const g = (t: string) => grounded(t, corpus) || '';
  const ai = (x.aiToday || {}) as Record<string, unknown>;
  const rv = (x.reviews || {}) as Record<string, unknown>;
  const cp = (x.competition || {}) as Record<string, unknown>;
  const nar = (x.narration || {}) as Record<string, unknown>;
  const edges = (cp.edges && typeof cp.edges === 'object' ? cp.edges : {}) as Record<string, unknown>;
  const n = raw.place?.reviews.length || 0;
  const themes: Theme[] = arr(rv.themes).map(t => {
    const o = (t || {}) as Record<string, unknown>;
    const quote = s(o.quote, 140);
    return { label: s(o.label, 40), count: Math.round(num(o.count, 0, n) ?? 0), quote: quote && corpus.toLowerCase().includes(quote.toLowerCase().slice(0, 24)) ? quote : undefined, sentiment: o.sentiment === 'positive' ? 'positive' : 'negative' } as Theme;
  }).filter(t => t.label && t.count > 0).slice(0, 5);
  const rivals: Rival[] = raw.competitors.map(c => {
    const key = Object.keys(edges).find(k => k.toLowerCase().includes(c.name.toLowerCase().slice(0, 12)) || c.name.toLowerCase().includes(k.toLowerCase().slice(0, 12)));
    return { name: c.name, rating: c.rating, distanceMi: c.distanceMi, edge: key ? g(s(edges[key], 90)) || undefined : undefined };
  });
  const industry = INDUSTRY_IDS.includes(x.industry as IndustryId) ? (x.industry as IndustryId) : base.industry;
  return {
    name: s(x.name, 80) || base.name,
    industry,
    oneLiner: g(s(x.oneLiner, 140)) || base.desc || IND[industry].label,
    services: arr(x.services).map(v => s(v, 60)).filter(Boolean).slice(0, 8),
    customers: g(s(x.customers, 200)),
    area: s(x.area, 80) || base.area,
    hours: base.hours || s(x.hours, 80) || undefined,
    phone: base.phone || s(x.phone, 30) || undefined,
    rating: raw.place?.rating,
    reviewCount: raw.place?.count,
    facts: arr(x.facts).map(v => g(s(v, 100))).filter(Boolean).slice(0, 5),
    aiToday: {
      score: Math.round(num(ai.score, 0, 100) ?? 15),
      verdict: s(ai.verdict, 50) || 'Room to grow',
      items: arr(ai.items).map(i => { const o = (i || {}) as Record<string, unknown>; return { name: s(o.name, 50), kind: (['ai', 'tool', 'manual'].includes(o.kind as string) ? o.kind : 'manual') as AiItem['kind'], does: g(s(o.does, 110)), misses: g(s(o.misses, 130)) }; }).filter(i => i.name).slice(0, 5),
      gaps: arr(ai.gaps).map(i => { const o = (i || {}) as Record<string, unknown>; return { area: s(o.area, 30), detail: g(s(o.detail, 160)) }; }).filter(i => i.area && i.detail).slice(0, 3),
    },
    reviews: { summary: g(s(rv.summary, 220)), themes, sample: n },
    competition: { summary: g(s(cp.summary, 220)), rivals },
    narration: { who: g(s(nar.who, 260)), ai: g(s(nar.ai, 260)), reviews: g(s(nar.reviews, 260)), competition: g(s(nar.competition, 260)) },
  };
}

function cleanDemo(v: unknown): Demo | null {
  const o = (v || {}) as Record<string, unknown>;
  if (o.kind === 'chat' && s(o.opener, 200) && s(o.persona, 3000)) return { kind: 'chat', opener: s(o.opener, 200), persona: s(o.persona, 3000) };
  if (o.kind === 'flow') { const steps = arr(o.steps).map(x => { const y = (x || {}) as Record<string, unknown>; return { at: s(y.at, 24), text: s(y.text, 140) }; }).filter(x => x.text).slice(0, 6); if (steps.length >= 3) return { kind: 'flow', steps }; }
  if (o.kind === 'message' && s(o.body, 900)) return { kind: 'message', channel: o.channel === 'email' ? 'email' : 'text', to: s(o.to, 60) || 'Customer', subject: s(o.subject, 100) || undefined, body: s(o.body, 900) };
  if (o.kind === 'brief') { const lines = arr(o.lines).map(x => s(x, 120)).filter(Boolean).slice(0, 5); if (lines.length >= 2) return { kind: 'brief', title: s(o.title, 40) || 'Today', lines }; }
  return null;
}

function cleanSkill(v: unknown, corpus: string, custom = false): Skill | null {
  const o = (v || {}) as Record<string, unknown>;
  const name = s(o.name, 40), demo = cleanDemo(o.demo);
  if (!name || !demo) return null;
  const g = (t: string) => grounded(t, corpus) || '';
  const how = arr(o.how).map(x => s(x, 120)).filter(Boolean).slice(0, 3);
  return {
    id: (s(o.id, 40) || name).toLowerCase().replace(/[^a-z0-9]+/g, '-') + (custom ? '-' + Math.random().toString(36).slice(2, 6) : ''),
    name,
    tagline: s(o.tagline, 100),
    category: (CATEGORIES.includes(o.category as Category) ? o.category : 'Customers') as Category,
    icon: (ICONS.includes(o.icon as IconName) ? o.icon : 'chip') as IconName,
    why: g(s(o.why, 160)) || (custom ? 'You asked for it.' : ''),
    evidence: arr(o.evidence).map(x => { const y = (x || {}) as Record<string, unknown>; return { source: (['review', 'site', 'competitor', 'google', 'owner'].includes(y.source as string) ? y.source : 'site') as Skill['evidence'][number]['source'], text: g(s(y.text, 140)) }; }).filter(x => x.text).slice(0, 3),
    how: how.length ? how : ['Learns your business', 'Runs on its own', 'Reports back to you'],
    impact: g(s(o.impact, 160)),
    connects: arr(o.connects).map(x => s(x, 40)).filter(Boolean).slice(0, 4),
    demo,
    match: Math.round(num(o.match, 50, 98) ?? 75),
    effort: s(o.effort, 30) || 'Live in a few days',
    custom: custom || undefined,
  };
}

/* ---------------- public API ---------------- */

export async function understand(raw: Raw, ownerNote?: string, onText?: (n: number) => void): Promise<Understanding> {
  const x = await thinkJson<Record<string, unknown>>(understandPrompt(raw, ownerNote), 'default', onText);
  return cleanUnderstanding(x, raw);
}

export async function designSkills(raw: Raw, und: Understanding, onText?: (n: number) => void): Promise<{ skills: Skill[]; narration: Brief['narration'] }> {
  const x = await thinkJson<{ skills?: unknown[]; narration?: Record<string, unknown> }>(skillsPrompt(raw, und), 'complex', onText);
  const corpus = JSON.stringify(raw) + JSON.stringify(und);
  const seen = new Set<string>();
  const skills = arr(x.skills).map(v => cleanSkill(v, corpus)).filter((k): k is Skill => !!k && !seen.has(k.id) && !!seen.add(k.id)).sort((a, b) => b.match - a.match);
  if (!skills.length) throw new BrainError('model_failed', 'no_skills');
  const nar = (x.narration || {}) as Record<string, unknown>;
  return { skills, narration: { upgrades: s(nar.upgrades, 260), build: s(nar.build, 220) } };
}

export async function wishSkill(wish: string, b: Brief): Promise<Skill> {
  const x = await thinkJson<Record<string, unknown>>(wishPrompt(wish, b), 'default');
  const k = cleanSkill(x, JSON.stringify(b.raw) + JSON.stringify(b.und) + wish, true);
  if (!k) throw new BrainError('model_failed', 'bad_skill');
  return k;
}

function card(b: Brief): string {
  const u = b.und;
  return [`Business: ${u.name}`, `What they do: ${u.oneLiner}`, u.services.length ? `Services: ${u.services.join(', ')}` : '', u.hours ? `Hours: ${u.hours}` : '', u.area ? `Area: ${u.area}` : '', u.phone ? `Phone: ${u.phone}` : '', u.facts.length ? `Details: ${u.facts.join('; ')}` : ''].filter(Boolean).join('\n');
}

/** One turn of a live demo, with the model playing the skill. */
export async function demoTurn(skill: Skill, b: Brief, history: Msg[]): Promise<string> {
  const persona = skill.demo.kind === 'chat' ? skill.demo.persona : skill.tagline;
  const system = `${persona}

${card(b)}

You are being shown live to the owner, who is playing a customer. Stay in role as ${b.und.name}'s "${skill.name}". Reply by text in 1-3 short sentences. Use only the details above; if you don't know something (exact prices, policies), say a team member will confirm and offer the next step. Never mention being a demo or an AI model unless asked directly.`;
  const msgs = history.map((m, i) => (i === 0 ? { ...m, content: `${system}\n\n---\nCustomer: ${m.content}` } : m));
  return (await think(msgs, 'quick', undefined, 40000)).trim();
}

export async function askPip(q: string, b: Brief | null, where: string, history: Msg[]): Promise<string> {
  const ctx = b ? `\n\nThe business you're presenting:\n${card(b)}\nTheir AI today: ${b.und.aiToday.verdict} (${b.und.aiToday.score}/100)\nSkills on offer: ${b.skills.map(k => `${k.name}: ${k.tagline}`).join('; ')}` : '';
  const system = `You are Pip, a small, friendly AI guide presenting AI upgrades to a business owner. You're on the "${where}" slide. Answer in 1-3 short, plain, honest sentences.
How the service works: Pip's scan and build plan are free. A person on the team reviews every build before it goes live, and anything risky waits for the owner's OK. A build takes about a day to a few weeks depending on the skill. There's no public price list; pricing is discussed after the owner sees it working. Never invent prices, numbers or guarantees.${ctx}`;
  const msgs = [...history, { role: 'user' as const, content: q }].map((m, i) => (i === 0 ? { ...m, content: `${system}\n\n---\nOwner: ${m.content}` } : m));
  return (await think(msgs, 'quick', undefined, 40000)).trim();
}

/* ---------------- memory ---------------- */

const key = (d: string) => 'briefs/' + d.replace(/[^a-z0-9-]/gi, '_');

export async function loadBrief(domain: string, maxAgeDays = 7): Promise<Brief | null> {
  try {
    const db = await use<Db>('db');
    if (!db) return null;
    const snap = await db.doc(key(domain)).get();
    const b = snap.exists ? (snap.data()?.brief as Brief | undefined) : undefined;
    if (!b || Date.now() - Date.parse(b.at) > maxAgeDays * 864e5) return null;
    return b;
  } catch { return null; }
}

export async function saveBrief(b: Brief): Promise<void> {
  if (!b.domain) return;
  try {
    const db = await use<Db>('db');
    // Keep under the 256 KiB document limit: trim page text before storing.
    const slim = { ...b, raw: { ...b.raw, pages: b.raw.pages.map(p => ({ ...p, text: p.text.slice(0, 1500) })) } };
    await db?.doc(key(b.domain)).set({ brief: JSON.parse(JSON.stringify(slim)) });
  } catch { /* memory is a convenience */ }
}

export async function saveLead(lead: { name: string; contact: string; business: string; site: string | null; skills: string[] }): Promise<boolean> {
  try {
    const db = await use<Db>('db');
    if (!db) return false;
    await db.collection('leads').add({ ...lead, at: new Date().toISOString() });
    return true;
  } catch { return false; }
}

/* ---------------- setup: running real skills on the owner's plan ---------------- */

/** The runtime's model, backed by `sample`. "smart" uses the top tier for compiling specs. */
export const runtimeLlm = async (system: string, messages: Msg[], tier: 'fast' | 'smart'): Promise<string | null> => {
  if (!messages.length) return null;
  const msgs = messages.map((m, i) => (i === 0 ? { ...m, content: `${system}\n\n---\n\n${m.content}` } : m));
  try { return (await think(msgs, tier === 'smart' ? 'complex' : 'quick', undefined, tier === 'smart' ? 180000 : 45000)).trim() || null; }
  catch (e) { if ((e as BrainError).code === 'rate_limited' || (e as BrainError).code === 'no_model') throw e; return null; }
};

export function brainFrom(b: Brief): { business: string; facts: string[]; qa: { q: string; a: string }[] } {
  const u = b.und;
  return {
    business: u.name,
    facts: [
      `What they do: ${u.oneLiner}`,
      u.services.length ? `Services: ${u.services.join(', ')}` : '',
      u.customers ? `Customers: ${u.customers}` : '',
      u.area ? `Area served: ${u.area}` : '',
      u.hours ? `Hours: ${u.hours}` : '',
      u.phone ? `Phone: ${u.phone}` : '',
      b.domain ? `Website: ${b.domain}` : '',
      ...u.facts,
    ].filter(Boolean),
    qa: [],
  };
}

export async function loadSetup<T>(domain: string): Promise<T | null> {
  try { const db = await use<Db>('db'); const s = await db?.doc('setups/' + domain.replace(/[^a-z0-9-]/gi, '_')).get(); return s?.exists ? (s.data()?.setup as T) : null; } catch { return null; }
}

export async function saveSetup(domain: string, setup: unknown): Promise<boolean> {
  try { const db = await use<Db>('db'); if (!db) return false; await db.doc('setups/' + domain.replace(/[^a-z0-9-]/gi, '_')).set({ setup: JSON.parse(JSON.stringify(setup)), at: new Date().toISOString() }); return true; } catch { return false; }
}
