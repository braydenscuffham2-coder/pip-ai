// Review history beyond the five Google shows, through DataForSEO (business_data/google/reviews).
// Inactive until DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are set on the project: every call then
// answers "not_configured" and nothing else in the scan depends on it.
// Reached as /api/gather?part=reviews so the existing reader connector can call it.
//   start=1&own=<placeId>&rivals=<placeId,placeId>   orders the reviews, newest first
//   poll=1&id=<task id>                              returns one finished set, or "pending"
// Reviewer names, profile links and photos are never returned.

const API = 'https://api.dataforseo.com/v3/business_data/google/reviews';
const OWN_DEPTH = 300;
const RIVAL_DEPTH = 120;
const PLACE_ID = /^[A-Za-z0-9_-]{16,80}$/;
const TASK_ID = /^[a-f0-9-]{30,40}$/;

export const reviewsEnabled = () => !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD;

interface DfsTask { id?: string; status_code?: number; status_message?: string; data?: { tag?: string }; result?: DfsResult[] | null }
interface DfsResult { title?: string; rating?: { value?: number }; reviews_count?: number; items?: DfsItem[] | null }
interface DfsItem { rating?: { value?: number }; review_text?: string | null; timestamp?: string | null; time_ago?: string | null; owner_answer?: string | null; owner_timestamp?: string | null; local_guide?: boolean | null }

async function dfs(path: string, body?: unknown): Promise<{ tasks?: DfsTask[] } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: 'Basic ' + btoa(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[reviews]', path.split('/')[1], res.status); return null; }
    return (await res.json()) as { tasks?: DfsTask[] };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function start(own: string, rivals: string[]) {
  const targets = [...(own ? [{ tag: 'own', placeId: own, depth: OWN_DEPTH }] : []), ...rivals.slice(0, 4).map((placeId, i) => ({ tag: `rival${i}`, placeId, depth: RIVAL_DEPTH }))];
  if (!targets.length) return { ok: false, error: 'no_places' };
  const r = await dfs('/task_post', targets.map(x => ({ keyword: `place_id:${x.placeId}`, location_code: 2840, language_code: 'en', depth: x.depth, sort_by: 'newest', priority: 2, tag: x.tag })));
  if (!r?.tasks) return { ok: false, error: 'unavailable' };
  return {
    ok: true,
    tasks: r.tasks.map((t, i) => ({ tag: t.data?.tag || targets[i]?.tag || '', placeId: targets[i]?.placeId || '', id: t.status_code === 20100 ? t.id : undefined, error: t.status_code === 20100 ? undefined : String(t.status_message || t.status_code || 'failed').slice(0, 80) })),
  };
}

async function poll(id: string) {
  const r = await dfs(`/task_get/${id}`);
  const t = r?.tasks?.[0];
  if (!t) return { ok: false, error: 'unavailable' };
  // 40601 and 40602 mean the task is handed over or still in the queue.
  if (t.status_code === 40601 || t.status_code === 40602 || (t.status_code === 20000 && !t.result)) return { ok: true, status: 'pending' };
  if (t.status_code !== 20000) return { ok: true, status: 'error', error: String(t.status_message || t.status_code).slice(0, 80) };
  const res = t.result?.[0];
  const reviews = (res?.items ?? [])
    .filter(x => x && (x.review_text || x.rating?.value))
    .map(x => ({ rating: x.rating?.value ?? 0, text: String(x.review_text || '').slice(0, 500), at: x.timestamp || undefined, ago: x.time_ago || undefined, replied: !!x.owner_answer, repliedAt: x.owner_timestamp || undefined }));
  return { ok: true, status: 'ready', title: res?.title, rating: res?.rating?.value, total: res?.reviews_count, reviews };
}

/** Handles /api/gather?part=reviews. Always answers with JSON and never throws. */
export async function reviewsPart(q: URLSearchParams): Promise<Response> {
  const reply = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
  try {
    if (!reviewsEnabled()) return reply({ ok: false, error: 'not_configured' });
    if (q.get('start') === '1') {
      const own = PLACE_ID.test(q.get('own') || '') ? String(q.get('own')) : '';
      const rivals = (q.get('rivals') || '').split(',').filter(x => PLACE_ID.test(x));
      return reply(await start(own, rivals));
    }
    if (q.get('poll') === '1') {
      const id = q.get('id') || '';
      return reply(TASK_ID.test(id) ? await poll(id) : { ok: false, error: 'bad_id' });
    }
    return reply({ ok: false, error: 'bad_request' });
  } catch (e) {
    console.error('[reviews] failed', String(e).slice(0, 120));
    return reply({ ok: false, error: 'unavailable' });
  }
}
