// pip-shelf: the API Shelf's alert.
//
//   POST /pip-shelf/notify   called by the database (trigger on new api_needs + a 30-minute cron), with the
//                            x-pip-alert token from Vault. It:
//                            1. syncs which keys exist (by secret name only; values are never read or sent),
//                            2. closes needs that are now satisfied,
//                            3. emails one digest of open, un-sent needs: what to fund, why, which orders wait on it,
//                               a price read from the provider's page right now, and the budget so far.
//
//                            4. reads how much money is behind each paid API (table api_funds), keeps a reading
//                               history, and emails once a day while any of them is low.
//   POST /pip-shelf/funds    the live funding tracker's data, for the Pip Forge connector (shelf_funds). Called with
//                            x-pip-alert, or server to server with x-pip-internal (the project's service key).
//                            Body: { view: 'providers' | 'history' | 'budget', fresh?: boolean }.
//
// Balances are read with the keys already in Supabase secrets; a key value never leaves this function and never
// appears in an answer. Where a provider has no balance API (Anthropic, Resend, Google Cloud), the tracker shows the
// last balance Brayden read off its billing page, counted down by live spend where that can be read.
//
// Secrets: RESEND_API_KEY, LEAD_ALERT_TO, LEAD_ALERT_FROM. Optional: ANTHROPIC_API_KEY (reads the live price page; without it
// the alert shows the dated price note on the Shelf), ANTHROPIC_ADMIN_KEY (read-only spend for the funding tracker).
// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TO = Deno.env.get('LEAD_ALERT_TO') ?? '';
const FROM = (Deno.env.get('LEAD_ALERT_FROM') ?? 'Pip <onboarding@resend.dev>').replace(/^[^<]*</, 'Pip Shelf <');
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SECRETS_PAGE = `https://supabase.com/dashboard/project/${(SB_URL.match(/https:\/\/([a-z0-9]+)\./) || [])[1] || ''}/functions/secrets`;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const H = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' };
async function rows(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) || {}) } });
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: unknown = {}) => rows(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const patch = (table: string, q: string, body: unknown) => rows(`${table}?${q}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(body) });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// 1. which keys exist. Only presence is checked; the value never leaves Deno.env.
async function syncKeys() {
  const shelf = await rows('api_shelf?select=provider,kind,status,secret_name&secret_name=not.is.null');
  let changed = 0;
  for (const s of shelf ?? []) {
    const has = !!(Deno.env.get(s.secret_name) ?? '').trim();
    if (s.kind === 'buy') {
      const want = has ? 'ready' : s.status === 'paused' ? 'paused' : 'not_owned';
      if (want !== s.status) { await patch('api_shelf', `provider=eq.${encodeURIComponent(s.provider)}`, { status: want, verified_at: has ? new Date().toISOString() : null, updated_at: new Date().toISOString() }); changed++; }
    }
  }
  return changed;
}

// 2. the price, read from the provider's own page right now
async function livePrice(url: string | null): Promise<{ text: string; live: boolean }> {
  if (!url) return { text: '', live: false };
  let page = '';
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (pip-shelf price check)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
    if (!r.ok) return { text: '', live: false };
    page = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  } catch { return { text: '', live: false }; }
  if (page.length < 200) return { text: '', live: false };
  if (ANTHROPIC) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 160, messages: [{ role: 'user', content: `This is the text of a pricing page. In one or two short sentences, say the free tier (if any), the cheapest paid plan and any per-unit price that matters for a small business. Use only what the page says, with its own numbers. If it shows no prices, answer exactly: none\n\n<page>${page.slice(0, 14000)}</page>` }] }),
      });
      if (r.ok) { const j = await r.json(); const t = String(j?.content?.[0]?.text ?? '').trim(); if (t && t.toLowerCase() !== 'none') return { text: t.slice(0, 400), live: true }; }
    } catch { /* fall through to the plain read */ }
  }
  // Without a model the page can't be read reliably, so the stored, dated note stands.
  return { text: '', live: false };
}

async function digest() {
  const open = await rows('api_needs?status=eq.open&notified_at=is.null&select=id,provider,primitive,options,order_id,agent_id,created_at&order=created_at.asc&limit=200');
  if (!open?.length) return { sent: 0 };
  const providers = [...new Set<string>(open.map((n: any) => n.provider))];
  const orderIds = [...new Set<string>(open.map((n: any) => n.order_id).filter(Boolean))];
  const shelf = await rows(`api_shelf?provider=in.(${providers.map((p) => `"${p}"`).join(',')})&select=*`);
  const orders = orderIds.length ? await rows(`build_orders?id=in.(${orderIds.join(',')})&select=id,code,domain,brief,order`) : [];
  const prims = await rows(`primitives?id=in.(${[...new Set<string>(open.map((n: any) => `"${n.primitive}"`))].join(',')})&select=id,label`);
  const funded = await rows('api_shelf?status=eq.ready&monthly_cap_usd=not.is.null&select=provider,monthly_cap_usd');
  const settings = Object.fromEntries(((await rows('forge_settings?select=key,value')) ?? []).map((s: any) => [s.key, s.value]));
  const capSum = (funded ?? []).reduce((a: number, s: any) => a + Number(s.monthly_cap_usd || 0), 0);
  const total = Number(settings.budget_total_usd ?? 1000), months = Number(settings.budget_months ?? 3), start = String(settings.budget_start ?? '');
  const label = (id: string) => (prims ?? []).find((p: any) => p.id === id)?.label ?? id;
  const ord = (id: string) => (orders ?? []).find((o: any) => o.id === id);
  const bizOf = (o: any) => o?.brief?.business || o?.order?.business?.name || o?.domain || 'an order';

  const blocks: { s: any; price: { text: string; live: boolean }; orders: string[]; prims: string[]; agents: number }[] = [];
  for (const p of providers) {
    const s = (shelf ?? []).find((x: any) => x.provider === p) ?? { provider: p, label: p, kind: 'buy' };
    const mine = open.filter((n: any) => n.provider === p);
    const price = await livePrice(s.pricing_url);
    if (price.live) await patch('api_shelf', `provider=eq.${encodeURIComponent(p)}`, { price_note: price.text, price_checked_at: new Date().toISOString() }).catch(() => {});
    blocks.push({ s, price, orders: [...new Set<string>(mine.map((n: any) => { const o = ord(n.order_id); return o ? `${o.code} · ${bizOf(o)}` : 'unassigned'; }))], prims: [...new Set<string>(mine.map((n: any) => label(n.primitive)))], agents: new Set<string>(mine.map((n: any) => `${n.order_id}|${n.agent_id}`)).size });
  }
  blocks.sort((a, b) => b.orders.length - a.orders.length || (a.s.rank ?? 50) - (b.s.rank ?? 50));

  const kindLine = (s: any) => s.kind === 'apply' ? 'Apply: approval-gated, so start now' : s.kind === 'client_plan' ? "Client's plan: goes in the pricing email, not your bill" : 'Buy: you can fund this on the spot';
  const howTo = (s: any) => s.kind === 'client_plan' ? `The client needs it on their own plan. Mention it in their pricing email.`
    : s.secret_name ? `Sign up, then paste the key into Supabase secrets as <b>${esc(s.secret_name)}</b> yourself (no model ever handles it). Then tap <b>Funded</b> on the Board's Shelf and set a monthly cap.`
    : `Apply, then mark it <b>Applied</b> on the Board's Shelf. Mark it <b>Approved</b> when they say yes.`;
  const priceLine = (b: typeof blocks[number]) => b.price.live ? `${esc(b.price.text)} <span style="color:#8a857a">(read from their page just now)</span>`
    : b.s.price_note ? `${esc(b.s.price_note)} <span style="color:#8a857a">(as of ${esc(String(b.s.price_checked_at || '').slice(0, 10) || 'last check')}; their page couldn't be read just now)</span>`
    : `<span style="color:#8a857a">Their page couldn't be read just now; check it before you buy.</span>`;

  const subject = blocks.length === 1
    ? `Pip needs ${blocks[0].s.label}${blocks[0].orders.length ? ` (${blocks[0].orders.length} order${blocks[0].orders.length > 1 ? 's' : ''} waiting)` : ''}`
    : `Pip needs ${blocks.length} APIs for waiting orders`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b17;max-width:620px">
  <h2 style="margin:0 0 6px;font-size:20px">The Shelf: ${blocks.length === 1 ? 'one API to fund' : `${blocks.length} APIs to fund`}</h2>
  <p style="margin:0 0 18px;color:#6b665b">Agents in these orders still build to sandbox. Nothing goes live until what they need is funded.</p>
  ${blocks.map((b) => `<div style="border:1px solid #e6e1d6;border-radius:12px;padding:14px 16px;margin:0 0 12px">
    <p style="margin:0 0 2px;font-size:16px"><b>${esc(b.s.label)}</b> <span style="color:#8a857a;font-size:13px">· ${esc(kindLine(b.s))}</span></p>
    <p style="margin:0 0 8px;color:#4a463d">Unlocks: ${esc(b.prims.join(', '))}${b.s.unlocks ? ` (${esc(b.s.unlocks)})` : ''}</p>
    <p style="margin:0 0 6px"><b>Waiting:</b> ${b.agents} teammate${b.agents === 1 ? '' : 's'} in ${esc(b.orders.join('; ') || 'no order yet')}</p>
    <p style="margin:0 0 6px"><b>Price:</b> ${priceLine(b)}</p>
    ${b.s.lead_time ? `<p style="margin:0 0 6px"><b>Lead time:</b> ${esc(b.s.lead_time)}</p>` : ''}
    ${b.s.notes ? `<p style="margin:0 0 6px;color:#4a463d">${esc(b.s.notes)}</p>` : ''}
    <p style="margin:8px 0 0">${howTo(b.s)}</p>
    <p style="margin:8px 0 0">${b.s.signup_url ? `<a href="${esc(b.s.signup_url)}">Sign up or apply</a>` : ''}${b.s.pricing_url ? ` · <a href="${esc(b.s.pricing_url)}">Pricing</a>` : ''}${b.s.secret_name ? ` · <a href="${esc(SECRETS_PAGE)}">Supabase secrets</a>` : ''}</p>
  </div>`).join('')}
  <p style="margin:16px 0 0;color:#6b665b">Budget: ${usd(total)} for ${months} months${start ? ` from ${esc(start)}` : ''}. Monthly caps set so far: ${usd(capSum)} a month${capSum ? ` (${usd(capSum * months)} over ${months} months)` : ''}.</p>
</div>`;
  const text = [`The Shelf: ${blocks.length} API${blocks.length === 1 ? '' : 's'} to fund`, '', ...blocks.flatMap((b) => [
    `${b.s.label} — ${kindLine(b.s)}`, `Unlocks: ${b.prims.join(', ')}`, `Waiting: ${b.agents} teammate(s) in ${b.orders.join('; ') || 'no order yet'}`,
    `Price: ${b.price.live ? `${b.price.text} (read just now)` : b.s.price_note ? `${b.s.price_note} (as of ${String(b.s.price_checked_at || '').slice(0, 10)})` : 'check their page'}`,
    ...(b.s.lead_time ? [`Lead time: ${b.s.lead_time}`] : []), ...(b.s.secret_name ? [`Key: paste into Supabase secrets as ${b.s.secret_name}, then tap Funded on the Board's Shelf.`] : []),
    ...(b.s.signup_url ? [`Sign up: ${b.s.signup_url}`] : []), '']), `Budget: ${usd(total)} for ${months} months. Monthly caps set so far: ${usd(capSum)}.`].join('\n');

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey || !TO) return { sent: 0, waiting: 'RESEND_API_KEY or LEAD_ALERT_TO is not set' };
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [TO], subject, html, text }) });
  if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
  await patch('api_needs', `id=in.(${open.map((n: any) => n.id).join(',')})`, { notified_at: new Date().toISOString() });
  await rows('events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ kind: 'shelf_alert', domain: null, detail: { providers, needs: open.length, orders: orderIds.length } }) }).catch(() => {});
  return { sent: 1, providers, needs: open.length };
}

// ---------------- 4. Funds: how much money is behind each paid API ----------------
type Reading = {
  source: 'live' | 'estimate' | 'manual' | 'none';
  balance_usd?: number | null;
  credits_left?: number | null;
  credits_limit?: number | null;
  credit_unit?: string | null;
  resets_at?: string | null;
  spend_7d_usd?: number | null;
  note?: string | null;
  error?: string | null;
};
const env = (n: string) => (Deno.env.get(n) ?? '').trim();
const num = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r2 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const enc = encodeURIComponent;
const DAY = 86_400_000;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Boise' });

async function getJson(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  const t = await r.text();
  let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* not json */ }
  if (!r.ok) {
    const m = j?.error?.message || j?.message || j?.detail?.message || (typeof j?.detail === 'string' ? j.detail : '') || j?.status_message || '';
    throw new Error(`${new URL(url).host} answered ${r.status}${m ? `: ${String(m).slice(0, 120)}` : ''}`);
  }
  return j;
}

// The balance Brayden read off a billing page, for providers with no balance API.
function manual(f: any, extra = ''): Reading {
  if (f.balance_usd === null || f.balance_usd === undefined) {
    return { source: 'none', note: `No balance API. Read it on their billing page and tell Pip, and the tracker will hold it.${extra}` };
  }
  return { source: 'manual', balance_usd: num(f.balance_usd), note: `What you read on ${shortDate(f.balance_at)}; they have no balance API.${extra}` };
}

const READERS: Record<string, (f: any) => Promise<Reading>> = {
  async dataforseo() {
    const login = env('DATAFORSEO_LOGIN');
    if (!login) throw new Error('DATAFORSEO_LOGIN is missing');
    const j = await getJson('https://api.dataforseo.com/v3/appendix/user_data', { headers: { authorization: `Basic ${btoa(`${login}:${env('DATAFORSEO_PASSWORD')}`)}` } });
    const m = j?.tasks?.[0]?.result?.[0]?.money;
    if (!m) throw new Error(String(j?.tasks?.[0]?.status_message || 'no balance in the answer').slice(0, 120));
    return { source: 'live', balance_usd: num(m.balance), note: num(m.total) !== null ? `Prepaid; $${Number(m.total).toFixed(2)} deposited in all.` : 'Prepaid.' };
  },
  async elevenlabs() {
    const j = await getJson('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': env('ELEVENLABS_API_KEY') } });
    const used = num(j?.character_count), lim = num(j?.character_limit), reset = num(j?.next_character_count_reset_unix);
    const over = j?.max_credit_limit_extension;
    const tier = String(j?.tier || '').replace(/_/g, ' ');
    return {
      source: 'live', credits_left: used !== null && lim !== null ? Math.max(0, lim - used) : null, credits_limit: lim, credit_unit: 'credits',
      resets_at: reset ? new Date(reset * 1000).toISOString() : null,
      note: `${tier ? `${tier[0].toUpperCase()}${tier.slice(1)} plan` : 'Plan'} credits for this period.${over && over !== 0 ? ' Usage-based overage is on, so calls keep working past the limit and bill extra.' : ''}`,
    };
  },
  async composio(f) {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
    const j = await getJson('https://backend.composio.dev/api/v3.1/project/usage/summary', {
      method: 'POST', headers: { 'x-api-key': env('COMPOSIO_API_KEY'), 'content-type': 'application/json' },
      body: JSON.stringify({ from: start.getTime(), to: Date.now(), entity_types: ['tool_calls'] }),
    });
    const used = num(j?.entities?.tool_calls?.total_quantity) ?? 0;
    const lim = num(f.allowance);
    return {
      source: 'live', credits_left: lim !== null ? Math.max(0, lim - used) : null, credits_limit: lim, credit_unit: f.allowance_unit || 'tool calls', resets_at: next.toISOString(),
      note: `${used.toLocaleString('en-US')} tool calls this calendar month. The free plan stops at its limit.`,
    };
  },
  async twilio() {
    const sid = env('TWILIO_ACCOUNT_SID');
    if (!sid) throw new Error('TWILIO_ACCOUNT_SID is missing');
    const j = await getJson(`https://api.twilio.com/2010-04-01/Accounts/${enc(sid)}/Balance.json`, { headers: { authorization: `Basic ${btoa(`${sid}:${env('TWILIO_AUTH_TOKEN')}`)}` } });
    const usdOk = String(j?.currency || '').toUpperCase() === 'USD';
    return { source: 'live', balance_usd: usdOk ? num(j?.balance) : null, note: usdOk ? 'Prepaid balance.' : `Balance is in ${j?.currency || 'another currency'}.` };
  },
  async firecrawl() {
    const j = await getJson('https://api.firecrawl.dev/v2/team/credit-usage', { headers: { authorization: `Bearer ${env('FIRECRAWL_API_KEY')}` } });
    const d = j?.data ?? {};
    return { source: 'live', credits_left: num(d.remainingCredits), credits_limit: num(d.planCredits), credit_unit: 'credits', resets_at: d.billingPeriodEnd ?? null, note: 'Plan credits; top-up credits count on top.' };
  },
  // Anthropic has no balance API. With a read-only admin key the cost report gives daily spend, which counts down from
  // the balance Brayden last read off the billing page.
  async anthropic(f) {
    const admin = env('ANTHROPIC_ADMIN_KEY');
    if (!admin) return manual(f, ' Add ANTHROPIC_ADMIN_KEY to count it down by live spend.');
    const since = new Date(Date.now() - 30 * DAY); since.setUTCHours(0, 0, 0, 0);
    const j = await getJson(`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${enc(since.toISOString())}&bucket_width=1d&limit=31`, { headers: { 'x-api-key': admin, 'anthropic-version': '2023-06-01' } });
    // amounts are decimal strings in cents, per Anthropic's Usage & Cost API guide
    const days = (j?.data ?? []).map((b: any) => ({ start: Date.parse(b.starting_at), usd: (b.results ?? []).reduce((t: number, x: any) => t + (Number(x.amount) || 0), 0) / 100 }));
    const spend7 = days.filter((d: any) => d.start >= Date.now() - 7 * DAY).reduce((t: number, d: any) => t + d.usd, 0);
    if (f.balance_usd === null || f.balance_usd === undefined) {
      return { source: 'live', spend_7d_usd: spend7, note: 'Spend is live; the balance isn\'t. Read it on the billing page and tell Pip to count it down.' };
    }
    const base = Date.parse(f.balance_at);
    const since0 = days.reduce((t: number, d: any) => {
      if (d.start + DAY <= base) return t;                                  // the whole day was before the reading
      const part = d.start >= base ? 1 : (d.start + DAY - base) / DAY;       // the day the reading was taken counts in part
      return t + d.usd * part;
    }, 0);
    return { source: 'estimate', balance_usd: Number(f.balance_usd) - since0, spend_7d_usd: spend7, note: `Your reading of $${Number(f.balance_usd).toFixed(2)} on ${shortDate(f.balance_at)}, minus live spend since.` };
  },
  // The Setup Agent's hosted browser. Proves the key works and the project it points at exists, and reads minutes used.
  async browserbase() {
    const key = env('BROWSERBASE_API_KEY');
    if (!key) throw new Error('BROWSERBASE_API_KEY is missing');
    const h = { headers: { 'X-BB-API-Key': key } };
    const list = await getJson('https://api.browserbase.com/v1/projects', h);
    const projects = Array.isArray(list) ? list : (list?.projects ?? list?.data ?? []);
    const want = env('BROWSERBASE_PROJECT_ID');
    const pick = want ? projects.find((x: any) => x?.id === want) : projects[0];
    if (want && !pick) throw new Error(`the key works, but BROWSERBASE_PROJECT_ID is not one of its ${projects.length} project(s)`);
    if (!pick?.id) throw new Error('the key works, but it has no project');
    const u = await getJson(`https://api.browserbase.com/v1/projects/${enc(pick.id)}/usage`, h);
    const mins = num(u?.browserMinutes);
    return { source: 'live', credits_left: null, credits_limit: null, credit_unit: 'browser minutes',
      note: `Key works. Project ${want ? 'set and found' : 'not set, so the first of ' + projects.length + ' is used'}${pick.concurrency ? `, ${pick.concurrency} browsers at once` : ''}. ${mins ?? 0} browser minutes used this period.` };
  },
  // The vault for client logins. Proves the service account token signs in; never reads an item.
  async onepassword() {
    const token = env('OP_SERVICE_ACCOUNT_TOKEN');
    if (!token) throw new Error('OP_SERVICE_ACCOUNT_TOKEN is missing. Create the service account, then add it in Supabase secrets');
    const sdk = (await import('npm:@1password/sdk@0')).default;
    const client = await sdk.createClient({ auth: token, integrationName: 'Pip Shelf', integrationVersion: '1.0.0' });
    const vaults = await client.vaults.list();
    const pip = vaults.filter((v: any) => String(v?.title ?? '').startsWith('Pip · ')).length;
    return { source: 'live', note: `Token works. It can see ${vaults.length} vault(s), ${pip} of them client vaults Pip made.` };
  },
  async none(f) { return manual(f); },
};

let lastSnapCheck = 0;
async function funds(opts: { fresh?: boolean; snapshot?: boolean } = {}) {
  const list = (await rows('api_funds?active=eq.true&select=*&order=sort.asc')) ?? [];
  const now = Date.now();
  const read = await Promise.all(list.map(async (f: any) => {
    const has = f.secret_name ? !!env(f.secret_name) : true;
    if (!has) return { f, has, rd: { source: 'none', note: `Not set up: no ${f.secret_name} in Supabase secrets.` } as Reading, fresh: false };
    const cached = !opts.fresh && f.last_reading && f.last_read_at && now - Date.parse(f.last_read_at) < 60_000;
    if (cached) return { f, has, rd: f.last_reading as Reading, fresh: false };
    let rd: Reading;
    try { rd = await (READERS[f.reader] ?? READERS.none)(f); }
    catch (e) {
      const m = manual(f);
      rd = { ...m, error: String((e as Error).message || e).slice(0, 160) };
    }
    await patch('api_funds', `provider=eq.${enc(f.provider)}`, { last_reading: rd, last_read_at: new Date().toISOString() }).catch(() => {});
    return { f, has, rd, fresh: true };
  }));

  // history: one reading per provider at most every 25 minutes
  if (opts.snapshot !== false && now - lastSnapCheck > 60_000) {
    lastSnapCheck = now;
    const recent = (await rows(`api_fund_snaps?at=gte.${new Date(now - 25 * 60_000).toISOString()}&select=provider`).catch(() => [])) ?? [];
    const seen = new Set(recent.map((s: any) => s.provider));
    const snaps = read.filter((x) => x.fresh && !seen.has(x.f.provider) && (x.rd.balance_usd != null || x.rd.credits_left != null))
      .map((x) => ({ provider: x.f.provider, source: x.rd.source, balance_usd: x.rd.balance_usd ?? null, credits_left: x.rd.credits_left ?? null, credits_limit: x.rd.credits_limit ?? null, spend_usd: x.rd.spend_7d_usd ?? null }));
    if (snaps.length) await rows('api_fund_snaps', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(snaps) }).catch(() => {});
  }

  const burn = Object.fromEntries(((await rpc('fund_burn', { p_days: 7 }).catch(() => [])) ?? []).map((b: any) => [b.provider, b]));
  return read.map(({ f, has, rd, fresh }) => {
    const b = burn[f.provider];
    const span = num(b?.span_days) ?? 0;
    const bal = num(rd.balance_usd), left = num(rd.credits_left), lim = num(rd.credits_limit);
    const pct = left !== null && lim ? Math.max(0, Math.min(100, (left / lim) * 100)) : null;
    const burnUsd = rd.spend_7d_usd != null ? rd.spend_7d_usd / 7 : span >= 0.5 ? (num(b?.usd_drop) ?? 0) / span : null;
    const burnCredits = span >= 0.5 ? (num(b?.credit_drop) ?? 0) / span : null;
    let daysLeft: number | null = null;
    if (bal !== null && burnUsd && burnUsd > 0) daysLeft = Math.max(0, bal / burnUsd);
    else if (left !== null && burnCredits && burnCredits > 0) daysLeft = Math.max(0, left / burnCredits);
    const resetIn = rd.resets_at ? (Date.parse(rd.resets_at) - now) / DAY : null;
    const runsOutFirst = daysLeft !== null && (resetIn === null || daysLeft < resetIn);
    const status = !has ? 'not_set_up'
      : rd.error ? 'error'
      : bal === null && left === null ? 'unknown'
      : (bal !== null && bal <= 0) || (left !== null && left <= 0) ? 'empty'
      : (bal !== null && bal < Number(f.low_usd)) || (pct !== null && pct < Number(f.low_pct)) || (runsOutFirst && (daysLeft as number) < 7) ? 'low'
      : 'ok';
    return {
      provider: f.provider, label: f.label, pays_for: f.pays_for, status, reading: has ? rd.source : 'none',
      balance_usd: r2(bal), credits_left: left, credits_limit: lim, credit_unit: rd.credit_unit ?? null, pct_left: pct === null ? null : Math.round(pct),
      burn_per_day_usd: r2(burnUsd), burn_per_day_credits: burnCredits === null ? null : Math.round(burnCredits),
      days_left: daysLeft === null ? null : Math.round(daysLeft * 10) / 10, resets_at: rd.resets_at ?? null, spend_7d_usd: r2(rd.spend_7d_usd),
      note: rd.note ?? null, error: rd.error ?? null, topup_url: f.topup_url, topup_label: f.topup_label,
      low_usd: num(f.low_usd), low_pct: num(f.low_pct), checked_at: fresh || !f.last_read_at ? new Date().toISOString() : f.last_read_at,
      sort: f.sort, alert_at: f.alert_at,
    };
  });
}

async function fundsView(view: string, fresh: boolean) {
  if (view === 'history') {
    const labels = Object.fromEntries(((await rows('api_funds?select=provider,label')) ?? []).map((f: any) => [f.provider, f.label]));
    const h = (await rpc('fund_history', { p_days: 30 })) ?? [];
    return { rows: h.map((x: any) => ({ provider: x.provider, label: labels[x.provider] ?? x.provider, day: x.day, balance_usd: r2(num(x.balance_usd)), credits_left: num(x.credits_left), credits_limit: num(x.credits_limit) })) };
  }
  const list = (await funds({ fresh })).map(({ alert_at: _a, ...r }) => r);
  if (view === 'budget') {
    const st = Object.fromEntries(((await rows('forge_settings?select=key,value')) ?? []).map((s: any) => [s.key, s.value]));
    const set = list.filter((r) => r.status !== 'not_set_up');
    const prepaid = set.reduce((t, r) => t + (r.balance_usd ?? 0), 0);
    const weekly = set.reduce((t, r) => t + (r.burn_per_day_usd ?? 0) * 7, 0);
    return { rows: [{
      budget_total_usd: Number(st.budget_total_usd ?? 1000), budget_months: Number(st.budget_months ?? 3), budget_start: st.budget_start ?? null,
      prepaid_usd: r2(prepaid), spend_7d_usd: r2(weekly), apis_funded: set.length,
      apis_low: set.filter((r) => ['low', 'empty', 'error'].includes(r.status)).length,
      apis_unreadable: set.filter((r) => r.status === 'unknown').length, checked_at: new Date().toISOString(),
    }] };
  }
  return { rows: list };
}

// once a day while any funded API is low, empty or failing to read
async function fundsAlert() {
  const list = await funds({ fresh: true });
  const bad = list.filter((r) => ['low', 'empty'].includes(r.status));
  const okAgain = list.filter((r) => !['low', 'empty'].includes(r.status) && r.alert_at);
  if (okAgain.length) await patch('api_funds', `provider=in.(${okAgain.map((r) => `"${r.provider}"`).join(',')})`, { alert_at: null }).catch(() => {});
  const due = bad.filter((r) => !r.alert_at || Date.now() - Date.parse(r.alert_at) > DAY);
  if (!due.length) return { funds_alert: 0 };
  const resendKey = env('RESEND_API_KEY');
  if (!resendKey || !TO) return { funds_alert: 0, waiting: 'RESEND_API_KEY or LEAD_ALERT_TO is not set' };
  const st = Object.fromEntries(((await rows('forge_settings?select=key,value')) ?? []).map((s: any) => [s.key, s.value]));
  const tracker = typeof st.funds_tracker_url === 'string' ? st.funds_tracker_url : '';
  const left = (r: any) => r.balance_usd !== null ? `$${Number(r.balance_usd).toFixed(2)} left`
    : r.credits_left !== null ? `${Number(r.credits_left).toLocaleString('en-US')}${r.credits_limit ? ` of ${Number(r.credits_limit).toLocaleString('en-US')}` : ''} ${r.credit_unit || 'credits'} left` : 'balance unknown';
  const when = (r: any) => r.status === 'empty' ? 'Empty now.' : r.days_left !== null ? `About ${r.days_left < 1 ? 'less than a day' : `${Math.round(r.days_left)} day${Math.round(r.days_left) === 1 ? '' : 's'}`} at this week's pace.` : '';
  const subject = due.length === 1 ? `Pip's ${due[0].label} is ${due[0].status === 'empty' ? 'out of funds' : 'running low'}` : `${due.length} of Pip's APIs are running low`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b17;max-width:620px">
  <h2 style="margin:0 0 6px;font-size:20px">${esc(subject)}</h2>
  <p style="margin:0 0 16px;color:#6b665b">Top up before agents start failing. Each link goes to that provider's billing page.</p>
  ${due.map((r) => `<div style="border:1px solid #e6e1d6;border-radius:12px;padding:12px 16px;margin:0 0 10px">
    <p style="margin:0 0 4px;font-size:16px"><b>${esc(r.label)}</b> · ${esc(left(r))}</p>
    <p style="margin:0 0 6px;color:#4a463d">${esc(when(r))} Pays for: ${esc(r.pays_for || '')}</p>
    ${r.topup_url ? `<p style="margin:0"><a href="${esc(r.topup_url)}">${esc(r.topup_label || 'Add funds')}</a></p>` : ''}
  </div>`).join('')}
  ${tracker ? `<p style="margin:14px 0 0"><a href="${esc(tracker)}">Open the funding tracker</a></p>` : ''}
</div>`;
  const text = [subject, '', ...due.flatMap((r) => [`${r.label}: ${left(r)}. ${when(r)}`, ...(r.topup_url ? [`${r.topup_label || 'Add funds'}: ${r.topup_url}`] : []), '']), ...(tracker ? [`Tracker: ${tracker}`] : [])].join('\n');
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [TO], subject, html, text }) });
  if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text()).slice(0, 200)}`);
  await patch('api_funds', `provider=in.(${due.map((r) => `"${r.provider}"`).join(',')})`, { alert_at: new Date().toISOString() });
  await rows('events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ kind: 'funds_alert', domain: null, detail: { providers: due.map((r) => r.provider) } }) }).catch(() => {});
  // keep about four months of readings
  await rows(`api_fund_snaps?at=lt.${new Date(Date.now() - 120 * DAY).toISOString()}`, { method: 'DELETE' }).catch(() => {});
  return { funds_alert: 1, providers: due.map((r) => r.provider) };
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'not_configured' }, 500);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-shelf/, '');
  if (!['/notify', '/funds'].includes(path) || req.method !== 'POST') return json({ ok: false, error: 'not_found' }, 404);
  const given = req.headers.get('x-pip-alert') ?? '';
  const internal = sameSecret(req.headers.get('x-pip-internal') ?? '', SB_KEY);
  const ok = internal || (given ? await rpc('lead_alert_token_ok', { t: given }).catch(() => false) : false);
  if (!ok) return json({ ok: false, error: 'not_found' }, 404);
  if (path === '/funds') {
    let body: any = {}; try { body = await req.json(); } catch { /* empty body */ }
    const view = ['providers', 'history', 'budget'].includes(body?.view) ? body.view : 'providers';
    try { return json(await fundsView(view, body?.fresh === true)); }
    catch (e) { return json({ ok: false, error: String(e).slice(0, 300) }, 500); }
  }
  try {
    const synced = await syncKeys();
    const closed = await rpc('shelf_refresh_needs').catch(() => 0);
    const d = await digest().catch((e) => ({ sent: 0, digest_error: String(e).slice(0, 200) }));
    const f = await fundsAlert().catch((e) => ({ funds_alert: 0, funds_error: String(e).slice(0, 200) }));
    return json({ ok: !('digest_error' in d), synced, closed, ...d, ...f });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
