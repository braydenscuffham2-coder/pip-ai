// pip-forge-mcp: the "Pip Forge" connector. A founder-only remote MCP server that lets the Forge Board
// (and Claude, when Brayden asks) see Pip's real order queue, build an order on his Claude plan, save the
// results back, run the API Shelf and tap go-live.
//
// Auth: the connector URL ends in a founder key, /functions/v1/pip-forge-mcp/<key>. Only the key's SHA-256
// is stored (table founder_keys); a wrong or revoked key gets a 404. Rotate by inserting a new hash and
// setting revoked_at on the old one.
//
// Board first: taking an order marks it engine='board' and keeps a heartbeat. The API-key fallback in
// pip-forge only claims jobs for orders older than the fallback window whose Board heartbeat has gone quiet.
// Secret values are never read: the Shelf checks only whether a secret name exists.
// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const H = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' };

async function rows(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text();
  if (!r.ok) {
    let msg = t.slice(0, 300);
    try { const j = JSON.parse(t); msg = j.message || j.hint || msg; } catch { /* keep text */ }
    throw new Error(msg);
  }
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: unknown = {}) => rows(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const patch = (table: string, q: string, body: unknown) => rows(`${table}?${q}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) });
const insert = (table: string, body: unknown) => rows(table, { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(body) });
const now = () => new Date().toISOString();
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function keyOk(key: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return false;
  const h = await sha256(key);
  const r = await rows(`founder_keys?key_hash=eq.${h}&revoked_at=is.null&select=id,last_used_at`);
  const k = r?.[0];
  if (!k) return false;
  if (!k.last_used_at || Date.now() - Date.parse(k.last_used_at) > 3600_000) patch('founder_keys', `id=eq.${k.id}`, { last_used_at: now() }).catch(() => {});
  return true;
}

async function settings() {
  return Object.fromEntries(((await rows('forge_settings?select=key,value')) ?? []).map((s: any) => [s.key, s.value]));
}
const STATUS_MAP: Record<string, string> = { building: 'testing', sandbox: 'sandbox', design_only: 'sandbox', needs_you: 'needs_review', failed: 'needs_review', paused: 'draft' };

// ---------------- the tools ----------------
const T: Record<string, { description: string; inputSchema: any; readOnly?: boolean; run: (a: any) => Promise<unknown> }> = {
  forge_queue: {
    description: 'List Pip orders waiting for the Forge, newest first: code, business, status, which engine has it, when the API-key fallback may take it, each teammate\'s status and how many Shelf needs are open.',
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean', description: 'Also list live orders.' } }, additionalProperties: false },
    readOnly: true,
    async run(a) {
      const st = await settings();
      const fb = Number(st.fallback_hours ?? 6) * 3600_000;
      const filt = a?.include_done ? '' : '&status=neq.live';
      const orders = await rows(`build_orders?select=id,code,domain,status,engine,source,created_at,board_seen_at,brief->business,brief->industry,order->business->name${filt}&order=created_at.desc&limit=30`);
      const ids = (orders ?? []).map((o: any) => o.id);
      const specs = ids.length ? await rows(`skill_specs?order_id=in.(${ids.join(',')})&select=order_id,skill_id,status,forge_stage,brain->agent->name,brain->agent->teammate`) : [];
      const needs = ids.length ? await rows(`api_needs?order_id=in.(${ids.join(',')})&status=eq.open&select=order_id,provider`) : [];
      return {
        settings: { fallback_hours: st.fallback_hours, kill_switch: st.kill_switch, daily_cap_usd: st.daily_cap_usd },
        orders: (orders ?? []).map((o: any) => ({
          id: o.id, code: o.code, business: o.business || o.name || o.domain, industry: o.industry, domain: o.domain, status: o.status, engine: o.engine, source: o.source,
          created_at: o.created_at, board_seen_at: o.board_seen_at, fallback_at: new Date(Date.parse(o.created_at) + fb).toISOString(),
          board_ready: !!o.business, // orders from Pip's Lock it in carry a brief the Board can build from
          agents: (specs ?? []).filter((s: any) => s.order_id === o.id).map((s: any) => ({ id: s.skill_id, name: s.name, teammate: s.teammate?.name, status: s.status, stage: s.forge_stage })),
          needs: [...new Set((needs ?? []).filter((n: any) => n.order_id === o.id).map((n: any) => n.provider))],
        })),
      };
    },
  },
  forge_take: {
    description: 'Take one order onto the Board: marks it as built on Brayden\'s Claude plan (the API-key fallback leaves it alone while the Board keeps a heartbeat) and returns its brief in the Board\'s order format plus each teammate\'s saved status.',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' }, force: { type: 'boolean', description: 'Take it even if the API key already started on it.' } }, required: ['order_id'], additionalProperties: false },
    async run(a) {
      const id = uuid(a?.order_id); if (!id) throw new Error('order_id must be an order id');
      const o = (await rows(`build_orders?id=eq.${id}&select=id,code,engine,status,brief,board`))?.[0];
      if (!o) throw new Error('no such order');
      if (!o.brief?.agents?.length) throw new Error('this order has no brief the Board can build from (it came from an older path); it builds on the API key');
      if (o.engine === 'key' && !a?.force) throw new Error('the API key is already building this order; pass force to take it back');
      await patch('build_orders', `id=eq.${id}`, { engine: 'board', board_seen_at: now(), updated_at: now() });
      const specs = await rows(`skill_specs?order_id=eq.${id}&select=skill_id,status,forge_stage,spec->board`);
      return { order: { ...o.brief, id: o.id, code: o.code }, saved: o.board ?? null, agents: (specs ?? []).map((s: any) => ({ id: s.skill_id, status: s.status, stage: s.forge_stage, board: s.board ?? null })) };
    },
  },
  forge_heartbeat: {
    description: 'Tell Pip the Board is still building this order, so the API-key fallback keeps waiting.',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'], additionalProperties: false },
    async run(a) {
      const id = uuid(a?.order_id); if (!id) throw new Error('order_id must be an order id');
      const r = await patch('build_orders', `id=eq.${id}&engine=eq.board`, { board_seen_at: now() });
      return { ok: true, held: !!r?.length };
    },
  },
  forge_save: {
    description: 'Save the Board\'s result for one teammate (agent_id) or the whole team (no agent_id) back to Pip. status is one of building, sandbox, design_only, needs_you, failed, paused. result is the Board\'s JSON for that teammate or team.',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' }, agent_id: { type: 'string' }, status: { type: 'string', enum: ['building', 'sandbox', 'design_only', 'needs_you', 'failed', 'paused'] }, result: { type: 'object' }, note: { type: 'string' } }, required: ['order_id'], additionalProperties: false },
    async run(a) {
      const id = uuid(a?.order_id); if (!id) throw new Error('order_id must be an order id');
      const result = a?.result && typeof a.result === 'object' ? a.result : {};
      if (JSON.stringify(result).length > 900_000) throw new Error('result too large');
      if (!a?.agent_id) {
        await patch('build_orders', `id=eq.${id}`, { board: { ...result, saved_at: now() }, board_seen_at: now(), updated_at: now() });
        return { ok: true, saved: 'team' };
      }
      const agent = cut(a.agent_id, 60);
      const st = cut(a.status, 20) || 'building';
      const spec = (await rows(`skill_specs?order_id=eq.${id}&skill_id=eq.${encodeURIComponent(agent)}&select=id,spec`))?.[0];
      if (!spec) throw new Error('no such teammate on this order');
      await patch('skill_specs', `id=eq.${spec.id}`, {
        status: STATUS_MAP[st] ?? 'testing', forge_stage: `board:${st}`, updated_at: now(),
        spec: { ...(spec.spec ?? {}), board: { ...result, status: st, saved_at: now(), note: cut(a.note, 500) || undefined } },
        ...(result.tests ? { tests: result.tests } : {}), ...(result.integration ? { quote: { integration: result.integration } } : {}),
      });
      if (['sandbox', 'design_only', 'needs_you'].includes(st)) {
        // the Board finished this teammate: the API-key fallback must not build it again
        await patch('build_jobs', `spec_id=eq.${spec.id}&status=in.(queued,running)`, { status: 'done', locked_by: 'board', updated_at: now(), log: [{ outcome: 'board', status: st, at: now() }] });
      }
      const all = await rows(`skill_specs?order_id=eq.${id}&select=status`);
      if (all?.length && all.every((s: any) => ['sandbox', 'approved', 'live'].includes(s.status))) await patch('build_orders', `id=eq.${id}`, { status: 'awaiting_golive', updated_at: now() });
      await patch('build_orders', `id=eq.${id}`, { board_seen_at: now() });
      await insert('events', { kind: 'board_save', domain: null, detail: { order: id, agent, status: st } }).catch(() => {});
      return { ok: true, saved: agent, status: st };
    },
  },
  forge_release: {
    description: 'Hand an order back from the Board. mode "queue" lets the API-key fallback take it after the window; mode "key" builds it on the API key now (spends API credit, within the caps).',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' }, mode: { type: 'string', enum: ['queue', 'key'] } }, required: ['order_id', 'mode'], additionalProperties: false },
    async run(a) {
      const id = uuid(a?.order_id); if (!id) throw new Error('order_id must be an order id');
      await patch('build_orders', `id=eq.${id}`, { engine: a.mode === 'key' ? 'key' : null, board_seen_at: null, updated_at: now() });
      if (a.mode === 'key') fetch(`${SB_URL}/functions/v1/pip-forge/run`, { method: 'POST' }).then((r) => r.body?.cancel()).catch(() => {});
      return { ok: true, engine: a.mode === 'key' ? 'key' : null };
    },
  },
  forge_golive: {
    description: 'Go live: Brayden\'s tap. Puts one teammate (agent_id) or every sandbox-ready teammate of the order live. Refused, with the list, while anything they need is still missing from the Shelf.',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' }, agent_id: { type: 'string' } }, required: ['order_id'], additionalProperties: false },
    async run(a) {
      const id = uuid(a?.order_id); if (!id) throw new Error('order_id must be an order id');
      const q = a?.agent_id ? `&skill_id=eq.${encodeURIComponent(cut(a.agent_id, 60))}` : '&status=in.(sandbox,approved)';
      const specs = await rows(`skill_specs?order_id=eq.${id}${q}&select=id,skill_id,status`);
      if (!specs?.length) throw new Error('nothing on this order is ready to go live');
      const out: any[] = [];
      for (const s of specs) {
        try { await patch('skill_specs', `id=eq.${s.id}`, { status: 'live', forge_stage: 'live', updated_at: now() }); out.push({ id: s.skill_id, live: true }); }
        catch (e) { out.push({ id: s.skill_id, live: false, why: String((e as Error).message || e).replace(/^shelf: /, '') }); }
      }
      const all = await rows(`skill_specs?order_id=eq.${id}&select=status`);
      if (all?.every((x: any) => x.status === 'live')) await patch('build_orders', `id=eq.${id}`, { status: 'live', updated_at: now() });
      await insert('events', { kind: 'golive', domain: null, detail: { order: id, by: 'founder', result: out } }).catch(() => {});
      return { ok: out.some((x) => x.live), agents: out };
    },
  },
  shelf_status: {
    description: 'The API Shelf: every provider Pip\'s agents can use, whether its key is present (never the value), what it unlocks, its price note, and every open need with the orders waiting on it, plus the budget.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    async run() {
      const shelf = await rows('api_shelf?select=*&order=rank.asc,provider.asc');
      const needs = await rows('api_needs?status=eq.open&select=provider,primitive,agent_id,order_id,created_at,notified_at');
      const oids = [...new Set((needs ?? []).map((n: any) => n.order_id).filter(Boolean))];
      const orders = oids.length ? await rows(`build_orders?id=in.(${oids.join(',')})&select=id,code,brief->business,domain`) : [];
      const prims = await rows('primitives?select=id,label');
      const st = await settings();
      const lab = (id: string) => (prims ?? []).find((p: any) => p.id === id)?.label ?? id;
      return {
        budget: { total_usd: st.budget_total_usd, months: st.budget_months, start: st.budget_start, monthly_caps_usd: (shelf ?? []).filter((s: any) => s.status === 'ready').reduce((t: number, s: any) => t + Number(s.monthly_cap_usd || 0), 0) },
        needs: Object.values((needs ?? []).reduce((m: any, n: any) => {
          const k = n.provider; const o = (orders ?? []).find((x: any) => x.id === n.order_id);
          m[k] = m[k] || { provider: k, unlocks: [], orders: [], teammates: 0, since: n.created_at, notified: !!n.notified_at };
          if (!m[k].unlocks.includes(lab(n.primitive))) m[k].unlocks.push(lab(n.primitive));
          const tag = o ? `${o.code} · ${o.business || o.domain}` : 'no order';
          if (!m[k].orders.includes(tag)) m[k].orders.push(tag);
          m[k].teammates++; return m;
        }, {})),
        shelf: (shelf ?? []).map((s: any) => ({ ...s, has_key: s.secret_name ? !!(Deno.env.get(s.secret_name) ?? '').trim() : null })),
      };
    },
  },
  shelf_funded: {
    description: 'Brayden funded a provider: checks its key exists in Supabase secrets (by name only), runs a small test call where one exists, marks it ready with a monthly cap, and releases every teammate that was waiting on it.',
    inputSchema: { type: 'object', properties: { provider: { type: 'string' }, monthly_cap_usd: { type: 'number', minimum: 0, maximum: 1000 } }, required: ['provider'], additionalProperties: false },
    async run(a) {
      const p = cut(a?.provider, 60);
      const s = (await rows(`api_shelf?provider=eq.${encodeURIComponent(p)}&select=*`))?.[0];
      if (!s) throw new Error('not on the shelf');
      if (!['buy', 'apply'].includes(s.kind)) throw new Error(`${s.label} is ${s.kind === 'via' ? `covered through ${s.via}` : 'not something you fund'}`);
      if (s.secret_name && !(Deno.env.get(s.secret_name) ?? '').trim()) throw new Error(`Paste the key into Supabase secrets as ${s.secret_name} first, then tap Funded again.`);
      const test = s.secret_name ? await probe(p, s.secret_name) : { ran: false };
      if (test.ran && !test.ok) throw new Error(`The key is there but a test call failed (${test.detail}). Check it and try again.`);
      await patch('api_shelf', `provider=eq.${encodeURIComponent(p)}`, { status: s.kind === 'apply' ? 'approved' : 'ready', verified_at: now(), updated_at: now(), ...(typeof a.monthly_cap_usd === 'number' ? { monthly_cap_usd: a.monthly_cap_usd } : {}) });
      const released = await rpc('shelf_refresh_needs').catch(() => 0);
      await insert('events', { kind: 'shelf_funded', domain: null, detail: { provider: p, cap: a.monthly_cap_usd ?? null, test: test.ran ? 'passed' : 'presence only', released } }).catch(() => {});
      return { ok: true, provider: p, test: test.ran ? 'passed' : 'key present (no test call for this provider)', released_needs: released };
    },
  },
  shelf_mark: {
    description: 'Mark an approval-gated or client-plan provider: applied, approved, ready (client-plan path works), paused or not_owned.',
    inputSchema: { type: 'object', properties: { provider: { type: 'string' }, status: { type: 'string', enum: ['applied', 'approved', 'ready', 'paused', 'not_owned'] }, note: { type: 'string' } }, required: ['provider', 'status'], additionalProperties: false },
    async run(a) {
      const p = cut(a?.provider, 60);
      const s = (await rows(`api_shelf?provider=eq.${encodeURIComponent(p)}&select=kind,label`))?.[0];
      if (!s) throw new Error('not on the shelf');
      if (s.kind === 'buy' && ['applied', 'approved'].includes(a.status)) throw new Error('use shelf_funded for providers you buy');
      await patch('api_shelf', `provider=eq.${encodeURIComponent(p)}`, { status: a.status, updated_at: now(), ...(a.note ? { notes: cut(a.note, 500) } : {}) });
      const released = await rpc('shelf_refresh_needs').catch(() => 0);
      return { ok: true, provider: p, status: a.status, released_needs: released };
    },
  },
  forge_settings: {
    description: 'Read or change the Forge\'s safety settings: fallback_hours (how long an order waits for the Board before the API key may build it), kill_switch (stops all API-key builds), daily_cap_usd.',
    inputSchema: { type: 'object', properties: { fallback_hours: { type: 'number', minimum: 0, maximum: 168 }, kill_switch: { type: 'boolean' }, daily_cap_usd: { type: 'number', minimum: 0, maximum: 200 } }, additionalProperties: false },
    async run(a) {
      for (const k of ['fallback_hours', 'kill_switch', 'daily_cap_usd']) {
        if (a?.[k] !== undefined) await rows('forge_settings?on_conflict=key', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: k, value: a[k], updated_at: now() }) });
      }
      const spent = (await rows(`spend_daily?day=eq.${new Date().toISOString().slice(0, 10)}&kind=eq.forge_usd&select=units`))?.[0]?.units ?? 0;
      return { ...(await settings()), spent_today_usd: Number(spent) };
    },
  },
};

// a small, read-only test call with the key, for providers where one is simple; the key value never leaves this function
async function probe(provider: string, secret: string): Promise<{ ran: boolean; ok?: boolean; detail?: string }> {
  const k = (Deno.env.get(secret) ?? '').trim();
  const get = async (url: string, headers: Record<string, string>) => { const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) }); await r.body?.cancel(); return { ran: true, ok: r.ok, detail: `HTTP ${r.status}` }; };
  try {
    if (provider === 'anthropic') return await get('https://api.anthropic.com/v1/models', { 'x-api-key': k, 'anthropic-version': '2023-06-01' });
    if (provider === 'elevenlabs') return await get('https://api.elevenlabs.io/v1/user', { 'xi-api-key': k });
    if (provider === 'resend') return await get('https://api.resend.com/domains', { authorization: `Bearer ${k}` });
    if (provider === 'openai-realtime') return await get('https://api.openai.com/v1/models', { authorization: `Bearer ${k}` });
    if (provider === 'twilio') { const sid = (Deno.env.get('TWILIO_ACCOUNT_SID') ?? '').trim(); if (!sid) return { ran: true, ok: false, detail: 'TWILIO_ACCOUNT_SID is missing' }; return await get(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { authorization: `Basic ${btoa(`${sid}:${k}`)}` }); }
  } catch (e) { return { ran: true, ok: false, detail: String((e as Error).message || e).slice(0, 80) }; }
  return { ran: false };
}

// ---------------- MCP plumbing (stateless Streamable HTTP, JSON responses) ----------------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id', 'Access-Control-Expose-Headers': 'mcp-session-id' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function handle(m: Msg): Promise<unknown | null> {
  const isNote = m.id === undefined || m.id === null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message } });
  if (!m || typeof m !== 'object' || typeof m.method !== 'string') return isNote ? null : err(-32600, 'Invalid request');
  if (isNote) return null;
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion || '');
      return ok({ protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'pip-forge', title: 'Pip Forge', version: '1.0.0' }, instructions: "Pip's founder-only Forge: the real order queue, Board builds on Brayden's Claude plan, the API Shelf and go-live. Never asks for or returns a secret value." });
    }
    case 'ping': return ok({});
    case 'tools/list':
      return ok({ tools: Object.entries(T).map(([name, t]) => ({ name, title: name.replace(/_/g, ' '), description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: !!t.readOnly, destructiveHint: false, idempotentHint: !!t.readOnly, openWorldHint: false } })) });
    case 'tools/call': {
      const name = String(m.params?.name || '');
      const tool = T[name];
      if (!tool) return err(-32602, `Unknown tool: ${name}`);
      try {
        const out = await tool.run((m.params?.arguments || {}) as any);
        return ok({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
      } catch (e) {
        return ok({ isError: true, content: [{ type: 'text', text: String((e as Error).message || e).slice(0, 500) }] });
      }
    }
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default: return err(-32601, `Method not found: ${m.method}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const path = new URL(req.url).pathname;
  const key = (path.match(/pip-forge-mcp\/([^/]+)/) || [])[1] || '';
  if (path.includes('.well-known')) return json({ error: 'not_found' }, 404);
  if (!SB_URL || !SB_KEY || !(await keyOk(key))) return json({ error: 'not_found' }, 404);
  if (req.method !== 'POST') return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } }, 405);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as Msg)))).filter((x) => x !== null);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body as Msg);
  return out === null ? new Response(null, { status: 202, headers: CORS }) : json(out);
});
