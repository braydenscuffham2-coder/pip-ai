import { AREAS, GENERIC_DEMO, IND, INDUSTRY_IDS, MODULE_TYPES, OVERLAPS, PAIN_IDS, PAINS, TOOL_IDS, TOOLS, TYPES } from './knowledge';
import type { AreaId, Demo, IndustryId, Kit, Module, ModuleCopy, ModuleType, PainId, Profile, RecommendResponse, Report, ToolId } from './types';

export const AREA_IDS = Object.keys(AREAS) as AreaId[];

export function coverage(tools: ToolId[]): Record<AreaId, number> {
  const c = { leads: 0, scheduling: 0, followup: 0, questions: 0, reviews: 0, admin: 0 } as Record<AreaId, number>;
  for (const t of tools) {
    const cv = TOOLS[t]?.cover || {};
    for (const k of Object.keys(cv) as AreaId[]) c[k] = Math.min(85, c[k] + (cv[k] || 0));
  }
  return c;
}

export function scoreOf(c: Record<AreaId, number>): number {
  const v = Object.values(c);
  return Math.round(8 + (v.reduce((a, b) => a + b, 0) / v.length) * 0.9);
}

export function demoFor(type: ModuleType, ind: IndustryId): Demo {
  return IND[ind].demo[type] || IND.other.demo[type] || GENERIC_DEMO[type] || { kind: 'timeline', steps: ['Set up', 'Running', 'Working', 'Done'] };
}

export function allowType(t: ModuleType, ind: IndustryId): boolean {
  return t !== 'dispatch' || ind === 'home';
}

function themeFor(p: Profile, area: AreaId) {
  return p.themes
    .filter(t => t.sentiment === 'negative' && t.relates === area)
    .sort((a, b) => b.count - a.count)[0];
}

function vendorFor(p: Profile, ids: ToolId[]): string | undefined {
  const d = p.detected.find(x => ids.includes(x.id) && x.vendor);
  return d?.vendor;
}

/** One line of evidence for why this module fits this business, or undefined. */
export function whyFor(type: ModuleType, p: Profile, used: Set<string> = new Set()): string | undefined {
  const T = TYPES[type];
  const theme = themeFor(p, T.area);
  const own = theme && (T.pains.some(x => PAINS[x].area === theme.relates) || T.area === theme.relates);
  if (theme && own && !used.has(`theme:${theme.label}`)) { used.add(`theme:${theme.label}`); return `${theme.count} reviews mention ${theme.label.toLowerCase()}`; }
  const has = (t: ToolId) => p.tools.includes(t);
  const after = p.competitors.filter(c => /after hours|24\/7|nights/i.test(c.note || ''));
  switch (type) {
    case 'after':
      if (after.length) return `${after.length} nearby competitor${after.length > 1 ? 's answer' : ' answers'} after hours`;
      if (!has('booking')) return 'No way to book on your site after hours';
      break;
    case 'missed':
      if (!has('phone')) return 'No AI phone answering found';
      break;
    case 'answers':
      if (has('chatbot')) return "Your chatbot can't use your real details yet";
      return 'Customers can only get answers by calling';
    case 'reviews':
      if (has('reviewsTool')) return 'Your review tool asks everyone, even unhappy customers';
      if (p.reviewCount != null && p.rating != null) return `${p.reviewCount} reviews at ${p.rating.toFixed(1)}★. More happy reviews lift that`;
      break;
    case 'noshow':
      if (has('booking') && !has('emails')) return "Your booking tool doesn't refill cancellations";
      break;
  }
  const pain = p.pains.find(x => T.pains.includes(x));
  if (pain && !used.has(`pain:${pain}`)) { used.add(`pain:${pain}`); return `Fits what you picked: ${PAINS[pain].label.toLowerCase()}`; }
  return undefined;
}

function worksWithFor(type: ModuleType, p: Profile): string | undefined {
  const map: Partial<Record<ModuleType, ToolId[]>> = {
    after: ['booking', 'chatbot'], noshow: ['booking'], dispatch: ['booking'], briefing: ['booking'],
    answers: ['chatbot'], missed: ['phone'], reviews: ['reviewsTool'], followup: ['emails'], winback: ['emails'], paperwork: ['chatgpt'],
  };
  const v = vendorFor(p, map[type] || []);
  return v ? `Connects to your ${v.charAt(0).toLowerCase() + v.slice(1)}` : undefined;
}

export function matchOf(type: ModuleType, p: Profile, cov: Record<AreaId, number>, idx: number): number {
  const T = TYPES[type];
  let m = 56;
  if (T.pains.some(x => p.pains.includes(x))) m += 24;
  m += Math.round((1 - cov[T.area] / 85) * 12);
  if (p.tools.some(t => (T.covers[t] || 0) >= 0.5)) m -= 12;
  if (themeFor(p, T.area)) m += 8;
  if (type === 'after' && p.competitors.some(c => /after hours|24\/7/i.test(c.note || ''))) m += 4;
  m += Math.max(0, 8 - idx);
  return Math.max(52, Math.min(97, m));
}

/** Keeps ranks readable: no ties, and a visible step between neighbours. */
function spreadMatches(list: Module[]): void {
  for (let i = 1; i < list.length; i++) {
    const step = 2 + (list[i].type.length % 3);
    if (list[i].match > list[i - 1].match - step) list[i].match = Math.max(50, list[i - 1].match - step);
  }
}

export function recommendModules(p: Profile): Module[] {
  const cov = coverage(p.tools);
  const unit = IND[p.industry].unit;
  // Industry shortlist, plus anything that answers a pain the owner named.
  const extra = MODULE_TYPES.filter(t => !IND[p.industry].cands.includes(t) && TYPES[t].pains.some(x => p.pains.includes(x)));
  const list: Module[] = [...IND[p.industry].cands, ...extra]
    .filter(t => allowType(t, p.industry))
    .map((t, i) => {
      const own = p.kit?.modules?.[t];
      const base = demoFor(t, p.industry);
      return {
        type: t,
        name: TYPES[t].name,
        line: own?.line || TYPES[t].line,
        worksWith: worksWithFor(t, p),
        match: matchOf(t, p, cov, i),
        impact: TYPES[t].impact(unit),
        demo: own?.demo && own.demo.kind === base.kind ? own.demo : base,
        uses: TYPES[t].uses,
      };
    });
  list.sort((a, b) => b.match - a.match);
  const top = list.slice(0, 6);
  const used = new Set<string>();
  const seen = new Set<string>();
  for (const m of top) {
    const w = whyFor(m.type, p, used);
    if (w && !seen.has(w)) { m.why = w; seen.add(w); continue; }
    const k = p.kit?.modules?.[m.type]?.why;
    if (k && !seen.has(k)) { m.why = k; seen.add(k); }
  }
  spreadMatches(top);
  return top;
}

export function buildReport(p: Profile): Report {
  const areas = coverage(p.tools);
  const score = scoreOf(areas);
  const painAreas = p.pains.map(x => PAINS[x].area).sort((a, b) => areas[a] - areas[b]);
  const gap = painAreas[0] || AREA_IDS.slice().sort((a, b) => areas[a] - areas[b])[0];
  const headline = score < 25 ? 'Lots of room to grow' : score < 50 ? 'A good start, with gaps' : 'Strong, with a few gaps';
  const top = p.themes.filter(t => t.sentiment === 'negative').sort((a, b) => b.count - a.count)[0];
  const insight = top ? `${top.count} of your ${p.reviewCount && p.reviewCount > top.count * 3 ? 'recent ' : ''}reviews mention ${top.label.toLowerCase()}. That's the first thing to fix.` : undefined;
  const have = p.tools.filter(t => t !== 'none').map(t => {
    const vendor = p.detected.find(d => d.id === t)?.vendor;
    return { tool: t, label: TOOLS[t].label + (vendor && vendor.toLowerCase() !== TOOLS[t].label.toLowerCase() ? ` · ${vendor}` : ''), does: TOOLS[t].does, limit: TOOLS[t].limit };
  });
  const ov = OVERLAPS.find(o => p.tools.includes(o.a) && p.tools.includes(o.b));
  const withNotes = p.competitors.filter(c => c.note);
  let competitorNote: string | undefined;
  if (withNotes.length) {
    const note = withNotes[0].note!;
    const same = withNotes.filter(c => c.note === note).length;
    competitorNote = `${same} of ${p.competitors.length} nearby competitors ${note}.`;
  }
  return { score, areas, gap, headline, insight, have, overlap: ov?.t, competitorNote };
}

export function recommend(p: Profile, source: 'live' | 'preview'): RecommendResponse {
  return { report: buildReport(p), modules: recommendModules(p), source };
}

/* ---------- input validation for API routes ---------- */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);

export function sanitizeProfile(input: unknown): Profile | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const name = str(o.name, 80);
  const industry = oneOf(o.industry, INDUSTRY_IDS);
  if (!name || !industry) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const tools = Array.from(new Set(arr(o.tools).map(t => oneOf(t, TOOL_IDS)).filter(Boolean) as ToolId[]));
  const pains = Array.from(new Set(arr(o.pains).map(t => oneOf(t, PAIN_IDS)).filter(Boolean) as PainId[])).slice(0, 2);
  return {
    name,
    site: str(o.site, 120) || undefined,
    industry,
    desc: str(o.desc, 100) || undefined,
    services: arr(o.services).map(s => str(s, 60)).filter(Boolean).slice(0, 8),
    hours: str(o.hours, 80) || undefined,
    area: str(o.area, 80) || undefined,
    phone: str(o.phone, 30) || undefined,
    tools: tools.includes('none') && tools.length > 1 ? tools.filter(t => t !== 'none') : tools,
    detected: arr(o.detected).map(d => {
      const x = (d || {}) as Record<string, unknown>;
      const id = oneOf(x.id, TOOL_IDS);
      return id ? { id, vendor: str(x.vendor, 40) || undefined, evidence: str(x.evidence, 80) || undefined } : null;
    }).filter(Boolean).slice(0, 10) as Profile['detected'],
    pains,
    rating: num(o.rating, 0, 5),
    reviewCount: num(o.reviewCount, 0, 1e6),
    themes: arr(o.themes).map(t => {
      const x = (t || {}) as Record<string, unknown>;
      const label = str(x.label, 50);
      if (!label) return null;
      return { label, count: num(x.count, 0, 1e5) ?? 0, quote: str(x.quote, 160) || undefined, sentiment: x.sentiment === 'positive' ? 'positive' : 'negative', relates: oneOf(x.relates, AREA_IDS) };
    }).filter(Boolean).slice(0, 6) as Profile['themes'],
    competitors: arr(o.competitors).map(c => {
      const x = (c || {}) as Record<string, unknown>;
      const cname = str(x.name, 60);
      return cname ? { name: cname, rating: num(x.rating, 0, 5), distanceMi: num(x.distanceMi, 0, 500), note: str(x.note, 60) || undefined } : null;
    }).filter(Boolean).slice(0, 5) as Profile['competitors'],
    kit: sanitizeKit(o.kit),
  };
}

const DEMO_FIELDS: Record<Demo['kind'], string[]> = {
  chat: ['c', 'r', 'res'], phone: ['c', 'r', 'res'], timeline: [], trigger: ['trig', 'act', 'res'], review: ['svc', 'rev'], map: ['job'], brief: [],
};

function sanitizeDemo(v: unknown): Demo | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const x = v as Record<string, unknown>;
  const kind = x.kind as Demo['kind'];
  if (!(kind in DEMO_FIELDS)) return undefined;
  if (kind === 'timeline' || kind === 'brief') {
    const key = kind === 'timeline' ? 'steps' : 'lines';
    const list = (Array.isArray(x[key]) ? x[key] as unknown[] : []).map(s => str(s, 70)).filter(Boolean).slice(0, 4);
    return list.length >= 3 ? ({ kind, [key]: list } as unknown as Demo) : undefined;
  }
  const out: Record<string, string> = { kind };
  for (const f of DEMO_FIELDS[kind]) { const val = str(x[f], 120); if (!val) return undefined; out[f] = val; }
  return out as unknown as Demo;
}

export function sanitizeKit(v: unknown): Kit | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const arr = (a: unknown, n: number, len: number) => (Array.isArray(a) ? a.map(s => str(s, len)).filter(Boolean).slice(0, n) : []);
  const slots = arr(o.slots, 2, 40);
  const sayIn = (o.say && typeof o.say === 'object' ? o.say : {}) as Record<string, unknown>;
  const say = { report: str(sayIn.report, 240) || undefined, market: str(sayIn.market, 240) || undefined, build: str(sayIn.build, 240) || undefined };
  const modules: Partial<Record<ModuleType, ModuleCopy>> = {};
  if (o.modules && typeof o.modules === 'object') {
    for (const [k, m] of Object.entries(o.modules as Record<string, unknown>)) {
      if (!isModuleType(k) || !m || typeof m !== 'object') continue;
      const mm = m as Record<string, unknown>;
      const c: ModuleCopy = { line: str(mm.line, 90) || undefined, why: str(mm.why, 80) || undefined, demo: sanitizeDemo(mm.demo) };
      if (c.line || c.why || c.demo) modules[k] = c;
    }
  }
  const kit: Kit = {
    summary: str(o.summary, 200) || undefined,
    facts: arr(o.facts, 5, 90),
    slots: slots.length === 2 ? [slots[0], slots[1]] : undefined,
    pricing: str(o.pricing, 160) || undefined,
    asks: arr(o.asks, 6, 90),
    say: say.report || say.market || say.build ? say : undefined,
    modules: Object.keys(modules).length ? modules : undefined,
  };
  return Object.values(kit).some(x => (Array.isArray(x) ? x.length : x)) ? kit : undefined;
}

export const isModuleType = (v: unknown): v is ModuleType => typeof v === 'string' && (MODULE_TYPES as string[]).includes(v);
