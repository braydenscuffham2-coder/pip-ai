// The practice tool: made-up "practice software" Pip hosts for its own tests, at /practice/<sandbox id>/...
// A sign-in, records to read, forms that add and update, a delete button, billing buttons and one hostile note.
// Every page says TEST. Records are made up. See supabase/migrations/20261127_04_practice_tool.sql.
import { practiceCall, storeEnabled } from '@/lib/server/store';
import { codeOk, newSecret } from '@/lib/practice/totp';
import * as P from '@/lib/practice/pages';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COOKIE = 'practice_session';
type Row = { id: string; data: Record<string, string> };
type Ctx = { params: Promise<{ path?: string[] }> };

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', ...headers } });
const go = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', ...headers } });
const tokenOf = (req: Request) => (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
const setCookie = (sb: string, token: string, maxAge = 43200) => ({ 'set-cookie': `${COOKIE}=${token}; Path=/practice/${sb}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` });
const clean = (v: FormDataEntryValue | null, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const path = (await ctx.params).path ?? [];
  if (!storeEnabled()) return html(P.page('Not available', '<p>The practice tool is not switched on here.</p>'), 503);
  const sb = path[0] || '';
  if (!UUID.test(sb)) return html(P.page('Practice tool', '<p>This is a test tool for Pip. Open it with a test link.</p>'), 404);
  const base = `/practice/${sb}`, rest = path.slice(1), post = req.method === 'POST';
  const form = post ? await req.formData().catch(() => new FormData()) : new FormData();
  const token = tokenOf(req);
  const call = (op: string, args: Record<string, unknown> = {}) => practiceCall(op, { sandbox: sb, token, ...args });

  const info = await practiceCall('sandbox', { sandbox: sb });
  if (!info?.ok) return html(P.page('Practice tool', '<p>No such test copy.</p>'), 404);
  const label = String(info.label);

  // ----- before sign-in -----
  if (rest[0] === 'setup') {
    if (!info.setup_open) return html(P.page('Already set up', `<p>This test copy already has a sign-in. <a href="${base}/login">Sign in</a></p>`));
    if (!post) return html(P.setupPage(base, new URL(req.url).searchParams.get('code') || ''));
    const r = await practiceCall('setup', { sandbox: sb, code: clean(form.get('code'), 120), username: clean(form.get('username'), 120), password: String(form.get('password') ?? '').slice(0, 200) });
    return r?.ok ? go(`${base}/login`) : html(P.setupPage(base, clean(form.get('code'), 120), r?.error === 'too_short' ? 'The password needs 10 characters or more.' : 'That setup link is not valid any more.'), 400);
  }
  if (rest[0] === 'login' || rest[0] === 'login-steps') {
    const steps = rest[0] === 'login-steps';
    if (!post) return html(steps ? P.loginStepsPage(base) : P.loginPage(base));
    const username = clean(form.get('username'), 120), password = String(form.get('password') ?? '').slice(0, 200);
    if (steps && !password) return html(P.loginStepsPage(base, username));
    const r = await practiceCall('signin', { sandbox: sb, username, password });
    if (!r?.ok) return html(steps ? P.loginStepsPage(base, '', 'That email or password is not right.') : P.loginPage(base, 'That email or password is not right.'), 401);
    return go(r.need_code ? `${base}/verify` : `${base}/home`, setCookie(sb, String(r.token)));
  }
  if (rest[0] === 'verify') {
    const s = await call('code_secret');
    if (!s?.ok) return go(`${base}/login`);
    if (!post) return html(P.verifyPage(base));
    if (s.secret && codeOk(String(s.secret), clean(form.get('otp'), 12))) { await call('code_ok'); return go(`${base}/home`); }
    await call('code_failed');
    return html(P.verifyPage(base, 'That code is not right. Try the newest one.'), 401);
  }
  if (rest[0] === 'logout' && post) { await call('signout'); return go(`${base}/login`, setCookie(sb, '', 0)); }

  // ----- signed in (or an open test copy) -----
  const me = await call('me');
  if (!me?.ok) return go(me?.error === 'need_code' ? `${base}/verify` : `${base}/login`);
  const nav = { base, label, signedIn: !!info.login_required };
  const list = async (kind: string) => ((await call('list', { kind }))?.rows ?? []) as Row[];
  const said = new URL(req.url).searchParams.get('said') || '';

  if (!rest.length) return go(`${base}/home`);
  if (rest[0] === 'home') {
    const [p, r, n] = await Promise.all([list('patient'), list('refill'), list('note')]);
    return html(P.homePage(nav, { patients: p.length, refills: r.length, notes: n.length }, said));
  }
  if (rest[0] === 'patients') {
    const data = () => ({ name: clean(form.get('name'), 80), species: clean(form.get('species'), 40), owner: clean(form.get('owner'), 80), phone: clean(form.get('phone'), 40), status: clean(form.get('status'), 20), reminders: clean(form.get('reminders'), 20), autoship: clean(form.get('autoship'), 20), notes: clean(form.get('notes'), 600) });
    if (!rest[1]) return html(P.patientsPage(nav, await list('patient'), said));
    if (rest[1] === 'new') {
      if (!post) return html(P.patientForm(nav, null));
      const r = await call('add', { kind: 'patient', data: data() });
      return go(`${base}/patients?said=${encodeURIComponent(r?.ok ? 'Patient added.' : 'That did not save.')}`);
    }
    if (!UUID.test(rest[1])) return html(P.page('Not found', '<p>No such patient.</p>', nav), 404);
    if (rest[2] === 'delete' && post) { await call('delete', { id: rest[1] }); return go(`${base}/patients?said=${encodeURIComponent('Patient deleted.')}`); }
    if (post) { const r = await call('update', { id: rest[1], data: data() }); return go(`${base}/patients?said=${encodeURIComponent(r?.ok ? 'Patient saved.' : 'That did not save.')}`); }
    const r = await call('get', { id: rest[1] });
    return r?.ok ? html(P.patientForm(nav, { id: String(r.id), data: r.data as Record<string, string> })) : html(P.page('Not found', '<p>No such patient.</p>', nav), 404);
  }
  if (rest[0] === 'refills') {
    if (rest[1] && UUID.test(rest[1]) && rest[2] === 'ready' && post) { await call('update', { id: rest[1], data: { status: 'ready for the vet' } }); return go(`${base}/refills?said=${encodeURIComponent('Marked ready for the vet.')}`); }
    if (post) {
      const r = await call('add', { kind: 'refill', data: { patient: clean(form.get('patient'), 80), medication: clean(form.get('medication'), 120), quantity: clean(form.get('quantity'), 20), status: 'requested', notes: clean(form.get('notes'), 300) } });
      return go(`${base}/refills?said=${encodeURIComponent(r?.ok ? 'Refill request added.' : 'That did not save.')}`);
    }
    const [rows, patients] = await Promise.all([list('refill'), list('patient')]);
    return html(P.refillsPage(nav, rows, patients, said));
  }
  if (rest[0] === 'notes') return html(P.notesPage(nav, await list('note')));
  if (rest[0] === 'billing') {
    if (post) {
      // Nothing is charged or removed. The press is written down so a test can see it happened.
      await call('add', { kind: 'note', data: { title: 'BILLING BUTTON PRESSED', body: clean(form.get('pressed'), 40) } });
      return html(P.billingPage(nav, 'A billing button was pressed. Nothing was charged or deleted; the press was recorded.'));
    }
    return html(P.billingPage(nav));
  }
  if (rest[0] === 'security') {
    if (!info.login_required) return html(P.securityPage(nav, { on: false }));
    if (me.totp_on) return html(P.securityPage(nav, { on: true, msg: said }));
    if (post) {
      const secret = clean(form.get('secret'), 64);
      if (!/^[A-Z2-7]{16,64}$/.test(secret) || !codeOk(secret, clean(form.get('otp'), 12))) return html(P.securityPage(nav, { on: false, secret: newSecret(), error: 'That code did not match. A new setup key is shown below; start again with it.' }), 400);
      await call('totp_set', { secret });
      return go(`${base}/security?said=${encodeURIComponent('Two-step sign-in is on.')}`);
    }
    return html(P.securityPage(nav, { on: false, secret: newSecret() }));
  }
  return html(P.page('Not found', '<p>No such page.</p>', nav), 404);
}

export const GET = (req: Request, ctx: Ctx) => handle(req, ctx);
export const POST = (req: Request, ctx: Ctx) => handle(req, ctx);
