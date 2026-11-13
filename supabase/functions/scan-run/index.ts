// scan-run: the Brain as a resumable job.
//
//   GET  ?d=<domain>&start=1[&state=ID][&says=...]   start (or reuse) a scan → { ok, scanId, status }
//   GET  ?scan=<id>                                  status, events, and the result when done
//   POST ?scan=<id>&answer=1  {answers:{<signalId>:text}}   owner answers to the Ask step
//   POST ?advance=<id>   (internal, service-role bearer)    run one stage, then chain the next
//
// One invocation does ONE stage (gather polling, understand, opportunity, invent, gate, render,
// brief) so no single request outlives the edge-function limit. State lives in scan_jobs.state;
// progress streams to scan_events (Realtime). Google review text is used while the job runs and
// never persisted: scans.raw keeps only the place id.
//
// Secrets: ANTHROPIC_API_KEY (required), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided).
// Optional: BRAIN_MONTHLY_CAP_USD (300), BRAIN_SCAN_BUDGET_USD (2), BRAIN_PER_IP_PER_HOUR (6).
// deno-lint-ignore-file no-explicit-any
import { newState, runStage, siteResult, toOutput, PRIMITIVES } from './brain.js';

// The Messages API adapter lives here (not in brain.js) so the price table can be corrected without rebuilding the bundle.
// List prices per million tokens, platform.claude.com/docs/en/about-claude/pricing, read Nov 4 2026. Budget guard only.
const MODELS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' } as const;
const PRICE = {
  opus: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  sonnet: { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  haiku: { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
} as const;
const MAX_TOKENS = { opus: 8000, sonnet: 8000, haiku: 4000 } as const;
type Tier = keyof typeof MODELS;
function splitForCache(prompt: string): { system: string; user: string } {
  const markers = ['\nWHAT WE KNOW\n', '\nMATERIAL\n', '\nPROFILE\n', '\nTHE IDEA\n', '\nTHE BUSINESS\n', '\nTHE SKILL (as presented', '\nBUSINESS\n', '\nSTATEMENTS\n'];
  let cut = -1;
  for (const m of markers) { const i = prompt.indexOf(m); if (i > 0 && (cut < 0 || i < cut)) cut = i; }
  if (cut < 2000) return { system: '', user: prompt };
  return { system: prompt.slice(0, cut), user: prompt.slice(cut) };
}
function anthropicModel(o: { apiKey: string; budgetUsd?: number; onUsage?: (u: any) => void }) {
  let spent = 0;
  return async (prompt: string, tier: Tier, stage: string): Promise<string> => {
    if (o.budgetUsd !== undefined && spent >= o.budgetUsd) throw new Error(`budget exceeded before ${stage} ($${spent.toFixed(3)})`);
    const { system, user } = splitForCache(prompt);
    const body: Record<string, unknown> = { model: MODELS[tier], max_tokens: MAX_TOKENS[tier], messages: [{ role: 'user', content: user }] };
    if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`${stage}: ${res.status === 429 ? 'rate_limited' : `http_${res.status}`} ${t.slice(0, 200)}`); }
    const data = await res.json();
    const text = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join('');
    const u = data.usage || { input_tokens: 0, output_tokens: 0 };
    const p = PRICE[tier];
    const usd = (u.input_tokens * p.in + u.output_tokens * p.out + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
    spent += usd;
    o.onUsage?.({ stage, tier, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, usd });
    return text;
  };
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MONTHLY_CAP = Number(Deno.env.get('BRAIN_MONTHLY_CAP_USD') ?? '300');
const SCAN_BUDGET = Number(Deno.env.get('BRAIN_SCAN_BUDGET_USD') ?? '2');
const PER_IP_HOUR = Number(Deno.env.get('BRAIN_PER_IP_PER_HOUR') ?? '6');
const SELF = `${SB_URL}/functions/v1/scan-run`;
const KIT = `${SB_URL}/functions/v1/site-kit`;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'GET, POST, OPTIONS' },
});
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', ...((init.headers as Record<string, string>) || {}) } });
const one = async (path: string) => { const r = await db(path); if (!r.ok) return null; const j = await r.json(); return Array.isArray(j) ? j[0] ?? null : j; };
const cleanDomain = (s: string) => (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
const validDomain = (d: string) => /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);

type Job = { id: string; domain: string; status: 'running' | 'done' | 'failed'; stage: string; state: any; result: any; error: string | null; attempts: number; created_at: string; updated_at: string };

async function getJob(id: string): Promise<Job | null> { return one(`scan_jobs?id=eq.${encodeURIComponent(id)}&select=*`); }
async function patchJob(id: string, patch: Partial<Job>) {
  await db(`scan_jobs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }).then((r) => r.body?.cancel());
}
async function event(scanId: string, domain: string, stage: string, payload: unknown) {
  await db('scan_events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ scan_id: scanId, domain, stage, payload, at: new Date().toISOString() }) }).then((r) => r.body?.cancel()).catch(() => {});
}
function chain(id: string) {
  // fire the next stage as its own invocation; the service-role bearer is the internal auth
  EdgeRuntime.waitUntil(fetch(`${SELF}?advance=${encodeURIComponent(id)}`, { method: 'POST', headers: { authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY } }).then((r) => r.body?.cancel()).catch(() => {}));
}

// ---------- gather: drive site-kit's background job and assemble the raw material ----------
async function kit(q: string) {
  const r = await fetch(`${KIT}?${q}`, { headers: { accept: 'application/json' } }).catch(() => null);
  return r && r.ok ? r.json().catch(() => null) : null;
}
function assembleRaw(domain: string, parts: any) {
  const g = parts.gather, site = parts.site, k = parts.kit;
  const rendered = (site?.pages || []).filter((p: any) => p && typeof p.text === 'string' && p.text.length > 200)
    .map((p: any) => ({ title: String(p.title || domain).slice(0, 140), url: String(p.url || `https://${domain}/`), text: String(p.text).slice(0, 14000), rendered: true }));
  if (g && !g.error && Array.isArray(g.pages)) {
    return rendered.length ? { ...g, pages: [...rendered, ...g.pages], rendered: true } : g;
  }
  if (rendered.length) {
    return {
      domain, siteBlocked: !!g?.error, rendered: true,
      meta: { title: k?.title || k?.name || domain, description: k?.hero?.sub || '' },
      ld: [], pages: rendered, phones: k?.hero?.phone ? [k.hero.phone] : [], emails: [], detected: [], competitors: [],
      signals: { items: [], socials: [] },
    };
  }
  return null;
}
async function gatherStep(job: Job): Promise<'again' | 'ready' | 'failed'> {
  const st = job.state ?? {};
  if (!st.kitStarted) {
    const s = await kit(`d=${encodeURIComponent(job.domain)}&start=1`);
    if (!s || !s.ok) { await patchJob(job.id, { status: 'failed', error: s?.error || 'site-kit unavailable' }); return 'failed'; }
    st.kitStarted = true; st.have = []; st.parts = {};
    await event(job.id, job.domain, 'gather', { started: true, cached: !!s.cached });
  }
  const deadline = Date.now() + 70_000;
  let status = 'running';
  while (Date.now() < deadline) {
    const p = await kit(`d=${encodeURIComponent(job.domain)}&poll=1&wait=1&have=${(st.have as string[]).join(',')}`);
    if (!p || !p.ok) break;
    for (const [k, v] of Object.entries(p.parts || {})) { st.parts[k] = v; if (!st.have.includes(k)) st.have.push(k); }
    status = p.status;
    if (status !== 'running' && !p.more) break;
  }
  await patchJob(job.id, { state: st });
  if (status === 'running') return 'again';
  const raw = assembleRaw(job.domain, st.parts);
  if (!raw) { await patchJob(job.id, { status: 'failed', error: st.parts?.fail || st.parts?.site?.error || 'unreachable', state: null }); await event(job.id, job.domain, 'failed', { error: 'unreachable' }); return 'failed'; }
  // hand over to the Brain
  const fps = await db('idea_fingerprints?select=*').then((r) => r.ok ? r.json() : []).catch(() => []);
  // how many scans the fingerprints were counted over (all industries; makes the sameness penalty conservative)
  const industryScans = await db('scans?select=domain', { method: 'HEAD', headers: { prefer: 'count=exact' } })
    .then((r) => Number((r.headers.get('content-range') || '').split('/')[1] || 0)).catch(() => 0);
  const cached = await one(`scans?domain=eq.${encodeURIComponent(job.domain)}&select=profile,created_at`);
  const fresh = cached && Date.now() - Date.parse(cached.created_at) < 7 * 864e5 && cached.profile?.aiToday ? cached.profile : undefined;
  const brain = newState({ raw, profile: fresh, state: st.ownerState, ownerSays: st.ownerSays, fingerprints: fps ?? [], scansInIndustry: industryScans });
  await patchJob(job.id, { stage: 'understand', state: { brain, kitStarted: true, ownerState: st.ownerState, ownerSays: st.ownerSays } });
  await event(job.id, job.domain, 'gather', { done: true, pages: raw.pages.length, competitors: raw.competitors?.length ?? 0, blocked: !!raw.siteBlocked });
  return 'ready';
}

// ---------- the Brain: one stage per invocation ----------
async function brainStep(job: Job): Promise<'again' | 'done' | 'failed'> {
  if (!ANTHROPIC) { await patchJob(job.id, { status: 'failed', error: 'not_configured: ANTHROPIC_API_KEY' }); await event(job.id, job.domain, 'failed', { error: 'not_configured' }); return 'failed'; }
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const spend = await db(`events?kind=eq.brain_usage&created_at=gte.${monthStart.toISOString()}&select=detail`).then((r) => r.ok ? r.json() : []).catch(() => []);
  const spent = (spend as any[]).reduce((a, r) => a + Number(r.detail?.usd ?? 0), 0);
  if (spent >= MONTHLY_CAP) { await patchJob(job.id, { status: 'failed', error: 'monthly_cap' }); return 'failed'; }

  const usage: any[] = [];
  const model = anthropicModel({ apiKey: ANTHROPIC, budgetUsd: SCAN_BUDGET - Number(job.state?.spent ?? 0), onUsage: (u) => usage.push(u) });
  let brain = job.state.brain;
  const before = brain.events.length;
  try {
    brain = await runStage(brain, model);
  } catch (e) {
    const msg = String(e).slice(0, 300);
    const retry = (job.attempts ?? 0) < 2 && /rate_limited|http_5|overloaded|timeout/i.test(msg);
    for (const u of usage) await db('events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ kind: 'brain_usage', domain: job.domain, detail: { scanId: job.id, ...u } }) }).then((r) => r.body?.cancel());
    if (retry) { await patchJob(job.id, { attempts: (job.attempts ?? 0) + 1 }); return 'again'; }
    await patchJob(job.id, { status: 'failed', error: msg, state: null });
    await event(job.id, job.domain, 'failed', { stage: job.stage, error: msg.slice(0, 120) });
    return 'failed';
  }
  for (const u of usage) await db('events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ kind: 'brain_usage', domain: job.domain, detail: { scanId: job.id, ...u } }) }).then((r) => r.body?.cancel());
  const spentNow = Number(job.state?.spent ?? 0) + usage.reduce((a, u) => a + u.usd, 0);
  for (const ev of brain.events.slice(before)) await event(job.id, job.domain, ev.stage, ev.payload);

  if (brain.stage !== 'done') {
    await patchJob(job.id, { stage: brain.stage, attempts: 0, state: { ...job.state, brain, spent: spentNow } });
    return 'again';
  }

  // ---------- finish: persist what we keep, drop what we must not ----------
  const out = toOutput(brain);
  const result = { ...siteResult(brain), scanId: job.id, spentUsd: Number(spentNow.toFixed(3)), primitivesVersion: PRIMITIVES.length };
  const raw = brain.input.raw;
  const keptRaw = { ...raw, pages: (raw.pages || []).map((p: any) => ({ ...p, text: String(p.text).slice(0, 1500) })), place: raw.place ? { id: raw.place.id, primaryType: raw.place.primaryType } : undefined, competitors: (raw.competitors || []).map((c: any) => ({ name: c.name, distanceMi: c.distanceMi, tools: c.tools, signals: c.signals })) };
  await db('scans?on_conflict=domain', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ domain: job.domain, raw: keptRaw, profile: out.profile, used_model: true, created_at: new Date().toISOString() }) }).then((r) => r.body?.cancel());
  const selectedIds = new Set(out.selection.selected.map((s) => s.candidate.id));
  const wildId = out.selection.wild?.candidate.id;
  await db('scan_ideas', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(out.scored.map((s) => ({ scan_id: job.id, domain: job.domain, industry: out.profile.industry, candidate: s.candidate, gate: s.gate, score: s.score, selected: selectedIds.has(s.candidate.id), wild: s.candidate.id === wildId }))) }).then((r) => r.body?.cancel());
  for (const f of out.fingerprints) await db('rpc/bump_fingerprint', { method: 'POST', body: JSON.stringify({ p_industry: f.industry, p_power: f.power, p_uses_set: f.uses_set }) }).then((r) => r.body?.cancel()).catch(() => {});
  await patchJob(job.id, { status: 'done', stage: 'done', state: null, result: { ...result, founder_brief: out.founder_brief } });
  await event(job.id, job.domain, 'done', { skills: result.skills.length, wild: !!result.wild, usd: result.spentUsd });
  return 'done';
}

async function advance(id: string) {
  const job = await getJob(id);
  if (!job || job.status !== 'running') return;
  const r = job.stage === 'gather' ? await gatherStep(job) : await brainStep(job);
  if (r === 'again' || r === 'ready') chain(id);
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const u = new URL(req.url);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'not_configured' }, 500);

  // internal: run one stage
  const adv = u.searchParams.get('advance');
  if (adv) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${SB_KEY}`) return json({ ok: false, error: 'forbidden' }, 403);
    EdgeRuntime.waitUntil(advance(adv));
    return json({ ok: true });
  }

  // status / result
  const scan = u.searchParams.get('scan');
  if (scan && !u.searchParams.get('answer')) {
    const job = await getJob(scan);
    if (!job) return json({ ok: false, error: 'no_job' }, 404);
    const events = await db(`scan_events?scan_id=eq.${encodeURIComponent(scan)}&select=stage,payload,at&order=at.asc`).then((r) => r.ok ? r.json() : []).catch(() => []);
    const { founder_brief: _private, ...publicResult } = job.result ?? {};
    return json({ ok: true, scanId: job.id, domain: job.domain, status: job.status, stage: job.stage, error: job.error, events, result: job.status === 'done' ? publicResult : null });
  }

  // owner answers to the Ask step: stored with the result; signals they resolve become "seen" with owner evidence
  if (scan && u.searchParams.get('answer')) {
    const job = await getJob(scan);
    if (!job || job.status !== 'done') return json({ ok: false, error: 'not_done' }, 409);
    const body = await req.json().catch(() => ({}));
    const answers: Record<string, string> = body?.answers && typeof body.answers === 'object' ? body.answers : {};
    const result = job.result ?? {};
    const signals = (result.signals || []).map((s: any) => (answers[s.id] ? { ...s, status: 'seen', evidence: [...(s.evidence || []), { source: 'owner', quote: String(answers[s.id]).slice(0, 200) }], confidence: 0.95 } : s));
    await patchJob(job.id, { result: { ...result, signals, answers: { ...(result.answers || {}), ...answers } } });
    await db(`scans?domain=eq.${encodeURIComponent(job.domain)}`, { method: 'PATCH', body: JSON.stringify({ profile: { ...(result.profile || {}), answers: { ...(result.answers || {}), ...answers } } }) }).then((r) => r.body?.cancel()).catch(() => {});
    await event(job.id, job.domain, 'answers', { count: Object.keys(answers).length });
    return json({ ok: true, answered: Object.keys(answers).length });
  }

  // start
  const d = cleanDomain(u.searchParams.get('d') || '');
  if (!validDomain(d)) return json({ ok: false, error: 'invalid' }, 400);
  if (u.searchParams.get('start') !== '1') return json({ ok: false, error: 'use start=1 or scan=<id>' }, 400);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const recent = await db(`events?kind=eq.scan_run&detail->>ip=eq.${encodeURIComponent(ip)}&created_at=gte.${hourAgo}&select=id`).then((r) => r.ok ? r.json() : []).catch(() => []);
  if ((recent as any[]).length >= PER_IP_HOUR) return json({ ok: false, error: 'rate_limited' }, 429);

  // reuse a running job for the same domain (the Recall screen still plays; progress is real)
  const running = await one(`scan_jobs?domain=eq.${encodeURIComponent(d)}&status=eq.running&order=created_at.desc&select=id,updated_at`);
  if (running && Date.now() - Date.parse(running.updated_at) < 180_000) return json({ ok: true, scanId: running.id, status: 'running', reused: true });

  const id = crypto.randomUUID();
  const ownerState = (u.searchParams.get('state') || '').slice(0, 2).toUpperCase() || undefined;
  const ownerSays = (u.searchParams.get('says') || '').slice(0, 500) || undefined;
  await db('scan_jobs', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ id, domain: d, status: 'running', stage: 'gather', state: { ownerState, ownerSays }, ip }) }).then((r) => r.body?.cancel());
  await db('events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ kind: 'scan_run', domain: d, detail: { ip, scanId: id } }) }).then((r) => r.body?.cancel());
  await event(id, d, 'queued', { domain: d });
  chain(id);
  return json({ ok: true, scanId: id, status: 'running' });
});
