// pip-shelf: the API Shelf's alert.
//
//   POST /pip-shelf/notify   called by the database (trigger on new api_needs + a 30-minute cron), with the
//                            x-pip-alert token from Vault. It:
//                            1. syncs which keys exist (by secret name only; values are never read or sent),
//                            2. closes needs that are now satisfied,
//                            3. emails one digest of open, un-sent needs: what to fund, why, which orders wait on it,
//                               a price read from the provider's page right now, and the budget so far.
//
// Secrets: RESEND_API_KEY, LEAD_ALERT_TO, LEAD_ALERT_FROM. Optional: ANTHROPIC_API_KEY (reads the live price page; without it
// the alert shows the dated price note on the Shelf).
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

Deno.serve(async (req) => {
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'not_configured' }, 500);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-shelf/, '');
  if (path !== '/notify' || req.method !== 'POST') return json({ ok: false, error: 'POST /notify only' }, 404);
  const given = req.headers.get('x-pip-alert') ?? '';
  const ok = given ? await rpc('lead_alert_token_ok', { t: given }).catch(() => false) : false;
  if (!ok) return json({ ok: false, error: 'not_found' }, 404);
  try {
    const synced = await syncKeys();
    const closed = await rpc('shelf_refresh_needs').catch(() => 0);
    const d = await digest();
    return json({ ok: true, synced, closed, ...d });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
