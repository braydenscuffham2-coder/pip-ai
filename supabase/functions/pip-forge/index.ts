// pip-forge: the agent-creating side, as one edge function with routes.
//
//   POST /pip-forge/order            public: owner submits { scanId, owner, chosen[], consent, state? }
//                                    → leads row (your lead-alert fires) + build_order + skill_specs + build_jobs, then the chain starts
//   POST /pip-forge/run              kick the queue: claim one queued job, run its stage, chain. Public on purpose:
//                                    it can only drain work an owner already ordered, never create it. The chain
//                                    calls it after every stage and a pg_cron job calls it every 2 minutes.
//   GET  /pip-forge/console?token=   founder console (FOUNDER_TOKEN secret); POST ...&action=golive|sendback|pause|turn
//   GET  /pip-forge/box/config       box pulls its config (x-box-token); POST /pip-forge/box/uplink events; POST /pip-forge/box/zones
//
// Secrets: ANTHROPIC_API_KEY (compile/test), FOUNDER_TOKEN (console). Optional: OPENAI_API_KEY (review pass).
// deno-lint-ignore-file no-explicit-any
import { buildOrder, checkOrder, runForgeJob, agentTurn, openaiModel, renderConsole, anthropicModel } from './forge.js';
import type { ForgeDb, ForgeJob, SpecRow } from './forge.js';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const OPENAI = Deno.env.get('OPENAI_API_KEY') ?? '';
const FOUNDER = Deno.env.get('FOUNDER_TOKEN') ?? '';
const SELF = `${SB_URL}/functions/v1/pip-forge`;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-box-token', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', ...((init.headers as Record<string, string>) || {}) } });
const rows = async (path: string, init?: RequestInit) => { const r = await db(path, init); if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${(await r.text()).slice(0, 160)}`); const t = await r.text(); return t ? JSON.parse(t) : null; };
const insert = (table: string, body: unknown, returning = false) => rows(`${table}`, { method: 'POST', headers: { prefer: returning ? 'return=representation' : 'return=minimal' }, body: JSON.stringify(body) });
const patch = (table: string, q: string, body: unknown) => rows(`${table}?${q}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(body) });
const tokenOk = (a: string, b: string) => a.length === b.length && a.length > 0 && [...a].every((c, i) => c === b[i]);

function chain() { EdgeRuntime.waitUntil(fetch(`${SELF}/run`, { method: 'POST' }).then((r) => r.body?.cancel()).catch(() => {})); }

// ---------- the DB adapter the stage machine uses ----------
const forgeDb: ForgeDb = {
  async getSpec(id) { const r = await rows(`skill_specs?id=eq.${id}&select=*`); return (r?.[0] as SpecRow) ?? null; },
  async updateSpec(id, p) { await patch('skill_specs', `id=eq.${id}`, { ...p, updated_at: new Date().toISOString() }); },
  async enqueue(j) { await insert('build_jobs', { order_id: j.order_id, spec_id: j.spec_id, stage: j.stage, attempt: j.attempt, status: 'queued', log: j.log ?? [] }); },
  async notify(spec_id, kind, body) { await insert('notifications', { spec_id, kind, body }); },
  async orderAgentsAllAtLeast(order_id, statuses) { const r = await rows(`skill_specs?order_id=eq.${order_id}&select=status`); return Array.isArray(r) && r.length > 0 && r.every((x: any) => statuses.includes(x.status)); },
  async setOrderStatus(order_id, status) { await patch('build_orders', `id=eq.${order_id}`, { status, updated_at: new Date().toISOString() }); },
  async createBox(row) { const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); const r = await insert('boxes', { ...row, uplink_token: token, status: 'ordered' }, true); return r?.[0]?.id ?? ''; },
};

function models() {
  if (!ANTHROPIC) return null;
  const model = anthropicModel({ apiKey: ANTHROPIC, budgetUsd: 6 });
  const reviewer = OPENAI ? openaiModel({ apiKey: OPENAI }) : null;
  return { model, reviewer };
}

// ---------- routes ----------
async function routeOrder(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.scanId !== 'string' || !b.owner?.name || !Array.isArray(b.chosen) || !b.chosen.length) return json({ ok: false, error: 'need scanId, owner.name, chosen[]' }, 400);
  const scan = (await rows(`scan_jobs?id=eq.${encodeURIComponent(b.scanId)}&select=id,domain,status,result`))?.[0];
  if (!scan || scan.status !== 'done' || !scan.result) return json({ ok: false, error: 'scan not finished' }, 409);
  const order_id = crypto.randomUUID();
  const lead_id = crypto.randomUUID();
  const owner = { name: String(b.owner.name).slice(0, 80), email: b.owner.email ? String(b.owner.email).slice(0, 120) : undefined, phone: b.owner.phone ? String(b.owner.phone).slice(0, 40) : undefined, best_time: b.owner.best_time ? String(b.owner.best_time).slice(0, 80) : undefined, timezone: b.owner.timezone, message: b.owner.message ? String(b.owner.message).slice(0, 2000) : undefined };
  const order = buildOrder({ order_id, lead_id, domain: scan.domain, scan_id: scan.id, result: scan.result, owner, chosen: b.chosen.map(String), consent: { ai_disclosure_ack: !!b.consent?.ai_disclosure_ack, tos_version: String(b.consent?.tos_version ?? '') }, state: b.state });
  const errors = checkOrder(order);
  if (errors.length) return json({ ok: false, error: 'invalid order', errors }, 422);
  const agents = [...order.package.agents, ...(order.package.wild ? [order.package.wild] : [])];

  // 1. the lead (your existing lead-alert trigger emails you from this row)
  await insert('leads', { id: lead_id, name: owner.name, contact: owner.email || owner.phone || owner.name, email: owner.email ?? null, phone: owner.phone ?? null, best_time: owner.best_time ?? null, message: owner.message ?? null, business: order.business.name, site: scan.domain, modules: agents.map((a) => a.agent_id), profile: order.business.profile, stage: 'plan', source: 'pip-brain', plan: { business: order.business.name, team: agents.map((a) => ({ name: `${a.teammate?.name ?? ''} · ${a.name}`, tagline: a.presented?.tagline ?? '' })), problems: (order.business.profile?.aiToday?.gaps ?? []).map((g: any) => ({ area: g.area, real: true })), have: (order.business.profile?.aiToday?.items ?? []).map((i: any) => i.name), asked: Object.keys(scan.result.answers ?? {}) } });
  // 2. the order
  await insert('build_orders', { id: order_id, lead_id, domain: scan.domain, order, status: 'received', budget_usd: 20 });
  // 3. one spec row + one compile job per agent
  for (const a of agents) {
    const spec = await insert('skill_specs', { business: order.business.name, domain: scan.domain, skill_id: a.agent_id, version: 1, status: 'draft', spec: {}, brain: { facts: order.business.brain.facts, qa: order.business.brain.qa, agent: a, lane: a.lane }, order_id, forge_stage: 'queued' }, true);
    const spec_id = spec?.[0]?.id;
    if (spec_id) await insert('build_jobs', { order_id, spec_id, stage: 'compile', attempt: 1, status: 'queued', log: [] });
  }
  await patch('build_orders', `id=eq.${order_id}`, { status: 'building' });
  chain();
  return json({ ok: true, orderId: order_id, leadId: lead_id, agents: agents.map((a) => ({ id: a.agent_id, lane: a.lane })) });
}

async function routeRun() {
  const m = models();
  if (!m) {
    // Nothing is claimed, so the queue waits intact until the key exists; the next kick drains it.
    const q = await rows('build_jobs?status=eq.queued&select=id&limit=100');
    return json({ ok: true, idle: 'ANTHROPIC_API_KEY not set', queued: Array.isArray(q) ? q.length : 0 });
  }
  EdgeRuntime.waitUntil((async () => {
    const claimed = await rows('rpc/claim_build_job', { method: 'POST', body: JSON.stringify({}) }).catch(() => null);
    const job = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!job || !job.id) return;
    try {
      const r = await runForgeJob(job as ForgeJob, { model: m.model, reviewer: m.reviewer, db: forgeDb });
      await patch('build_jobs', `id=eq.${job.id}`, { status: r.outcome === 'founder' ? 'needs_founder' : 'done', log: [...(job.log ?? []), { outcome: r.outcome, detail: r.detail, at: new Date().toISOString() }], updated_at: new Date().toISOString() });
      await insert('events', { kind: 'forge', domain: null, detail: { job: job.id, stage: job.stage, attempt: job.attempt, outcome: r.outcome, detail: r.detail } });
    } catch (e) {
      const msg = String(e).slice(0, 300);
      await patch('build_jobs', `id=eq.${job.id}`, { status: 'failed', log: [...(job.log ?? []), { error: msg }] });
      await forgeDb.updateSpec(job.spec_id, { status: 'needs_review', forge_stage: 'error' });
      await forgeDb.notify(job.spec_id, 'needs_founder', { stage: job.stage, error: msg });
    }
    chain(); // keep draining; returns at once when the queue is empty
  })());
  return json({ ok: true });
}

async function routeConsole(req: Request, u: URL) {
  if (!FOUNDER) return html('<p style="font-family:sans-serif">Set the <code>FOUNDER_TOKEN</code> secret on this function, then open <code>/pip-forge/console?token=…</code>.</p>', 503);
  if (!tokenOk(u.searchParams.get('token') || '', FOUNDER)) return html('<p style="font-family:sans-serif">Not found.</p>', 404);
  const action = u.searchParams.get('action');
  if (req.method === 'POST' && action) {
    const b = await req.json().catch(() => ({}));
    const specId = u.searchParams.get('spec') || '';
    const orderId = u.searchParams.get('order') || '';
    const spec = await forgeDb.getSpec(specId);
    if (!spec) return json({ ok: false, error: 'no such agent' }, 404);
    if (action === 'golive') {
      const m = models();
      const r = await runForgeJob({ id: 0, order_id: orderId || (spec as any).order_id, spec_id: specId, stage: 'golive', attempt: 1, status: 'queued', log: [] }, { model: m?.model ?? (async () => '{}'), reviewer: null, db: forgeDb });
      await insert('events', { kind: 'golive', domain: spec.domain, detail: { spec: specId, by: 'founder', note: String(b.note ?? '').slice(0, 500) } });
      return json({ ok: true, outcome: r.outcome });
    }
    if (action === 'pause') { await forgeDb.updateSpec(specId, { status: 'paused', forge_stage: 'paused' }); return json({ ok: true }); }
    if (action === 'sendback') {
      await forgeDb.updateSpec(specId, { status: 'draft', forge_stage: 'sent_back' });
      await forgeDb.enqueue({ order_id: orderId || (spec as any).order_id, spec_id: specId, stage: 'compile', attempt: 1, log: [{ errors: [`founder: ${String(b.note ?? 'please revise').slice(0, 500)}`], failed: [], previous: spec.spec }] });
      chain();
      return json({ ok: true });
    }
    if (action === 'turn') {
      const m = models();
      if (!m) return json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, 503);
      if (!spec.spec?.agent) return json({ ok: false, error: 'no compiled spec yet' }, 409);
      const history = Array.isArray(b.history) ? b.history.slice(-12).map((t: any) => ({ role: t.role === 'agent' ? 'agent' : 'customer', text: String(t.text).slice(0, 500) })) : [];
      const r = await agentTurn(spec.spec, { facts: spec.brain?.facts ?? [], qa: spec.brain?.qa ?? [] }, history, String(b.say ?? '').slice(0, 500), m.model);
      await insert('events', { kind: 'sandbox_turn', domain: spec.domain, detail: { spec: specId, say: String(b.say ?? '').slice(0, 200), reply: r.reply.slice(0, 300), actions: r.actions.map((a) => a.tool), escalate: r.escalate } });
      return json({ ok: true, reply: r.reply, actions: r.actions.map((a) => a.tool), escalate: r.escalate });
    }
    return json({ ok: false, error: 'unknown action' }, 400);
  }
  const orders = await rows('build_orders?select=id,domain,status,created_at,order&order=created_at.desc&limit=50');
  const specs = await rows('skill_specs?order_id=not.is.null&select=id,order_id,skill_id,status,forge_stage,spec,tests,review,quote,brain&order=created_at.asc');
  const page = (orders ?? []).map((o: any) => ({ ...o, specs: (specs ?? []).filter((s: any) => s.order_id === o.id) }));
  return html(renderConsole(page, FOUNDER));
}

async function routeBox(req: Request, u: URL) {
  const token = req.headers.get('x-box-token') || '';
  if (!token) return json({ ok: false, error: 'x-box-token required' }, 401);
  const box = (await rows(`boxes?uplink_token=eq.${encodeURIComponent(token)}&select=id,config,status,domain,agent_id`))?.[0];
  if (!box) return json({ ok: false, error: 'unknown box' }, 403);
  const sub = u.pathname.split('/box/')[1] || '';
  if (sub === 'config' && req.method === 'GET') {
    await patch('boxes', `id=eq.${box.id}`, { last_seen_at: new Date().toISOString(), status: box.status === 'shipped' || box.status === 'flashed' ? 'online' : box.status });
    return json({ ok: true, box: box.id, status: box.status, config: box.config });
  }
  if (sub === 'zones' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const zones = Array.isArray(b.zones) ? b.zones.slice(0, 64) : [];
    await patch('boxes', `id=eq.${box.id}`, { config: { ...(box.config ?? {}), zones }, status: zones.length ? 'calibrated' : box.status, updated_at: new Date().toISOString() });
    return json({ ok: true, zones: zones.length });
  }
  if (sub === 'uplink' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const events = Array.isArray(b.events) ? b.events.slice(0, 500) : [];
    // counts and times only; the box never sends frames, faces or identities
    const clean = events.map((e: any) => ({ box_id: box.id, table_id: String(e.table ?? '').slice(0, 40), event: ['seated', 'open', 'count', 'heartbeat'].includes(e.event) ? e.event : 'count', party_size: Number.isFinite(e.party_size) ? Math.max(0, Math.min(40, Math.round(e.party_size))) : null, value: Number.isFinite(e.value) ? e.value : null, at: typeof e.at === 'string' ? e.at : new Date().toISOString() }));
    if (clean.length) await insert('box_events', clean);
    await patch('boxes', `id=eq.${box.id}`, { last_seen_at: new Date().toISOString() });
    return json({ ok: true, stored: clean.length });
  }
  return json({ ok: false, error: 'unknown box route' }, 404);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const u = new URL(req.url);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'not_configured' }, 500);
  const path = u.pathname.replace(/^\/pip-forge/, '');
  try {
    if (path === '/order' && req.method === 'POST') return await routeOrder(req);
    if (path === '/run' && req.method === 'POST') return await routeRun();
    if (path === '/console') return await routeConsole(req, u);
    if (path.startsWith('/box/')) return await routeBox(req, u);
    return json({ ok: false, error: 'routes: POST /order, POST /run, GET /console?token=, /box/*' }, 404);
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
