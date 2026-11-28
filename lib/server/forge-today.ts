// What the Forge can deliver today, told to the Brain.
//
// The Brain (the Pip page) imagines teammates out of building blocks. Until Nov 27, 2026 it had no way to know which
// blocks have anything behind them: of the 20 teammates it had imagined, 15 needed at least one that did not. The
// list lives in the database (public.capabilities, read through capability_list()). This file turns it into a short
// section and puts it into the Brain's own prompt, right after the list of building blocks.
//
// It is added here, on the server, and not in the page: the page is a built file that is replaced whenever the Brain
// is exported again, and a change made there would be lost. The Brain is still told to imagine freely. What changes
// is that it knows, and that an owner can always start with something that works this week.
//
// Nothing here can stop the Brain: with no list (the database did not answer), the prompt goes through unchanged.

export type Standing = 'proven' | 'built' | 'blocked' | 'not_built';
type Turn = { role: string; content: string };

const MARK = '</building_blocks>';
const ID = /^[a-z][a-z0-9_]{1,40}$/;

/** The section, or '' when there is nothing trustworthy to say. Only well-formed ids and known standings are used. */
export function forgeTodayText(list: unknown): string {
  if (!list || typeof list !== 'object' || Array.isArray(list)) return '';
  const by: Record<Standing, string[]> = { proven: [], built: [], blocked: [], not_built: [] };
  for (const [k, v] of Object.entries(list as Record<string, unknown>)) if (ID.test(k) && typeof v === 'string' && v in by) by[v as Standing].push(k);
  const works = [...by.proven, ...by.built].sort();
  if (!works.length) return '';
  return `
<forge_today>
What Pip's Forge can deliver today, by block id. This is a fact about Pip, never about the business, and it is never shown to the owner.
- Works now: ${works.join(', ')}
${by.blocked.length ? `- Built, and waiting on something outside Pip: ${by.blocked.sort().join(', ')}\n` : ''}${by.not_built.length ? `- Not built yet: ${by.not_built.sort().join(', ')}\n` : ''}A block id that is not named here is not built yet.

Do not shrink or drop an idea because one of its blocks is not built yet. The Forge builds to order and this list grows.
But the owner must be able to start this week. So at least 3 of your ideas must use only blocks that work now, and those 3 must be as specific to this business as every other idea. Say nothing about any of this in an idea's own words.
</forge_today>`;
}

/** The same turns, with the section placed once after the building blocks of any prompt that has them. */
export function withForgeToday<T extends Turn>(turns: T[], list: unknown): T[] {
  const text = forgeTodayText(list);
  if (!text) return turns;
  return turns.map((t) => (t.role === 'user' && t.content.includes(MARK) && !t.content.includes('<forge_today>') ? { ...t, content: t.content.replace(MARK, MARK + '\n' + text) } : t));
}

/** True when a prompt is the Brain designing a team (the only prompts the list is fetched for). */
export const asksForATeam = (turns: Turn[]) => turns.some((t) => t.role === 'user' && t.content.includes(MARK));

let cache: { at: number; list: unknown } | null = null;
/** The list from the database, kept for five minutes. Null when the database did not answer in two seconds. */
export async function loadForgeToday(now = Date.now()): Promise<unknown> {
  if (cache && now - cache.at < 300_000) return cache.list;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/capability_list`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` }, body: '{}', signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const list = await r.json();
    cache = { at: now, list };
    return list;
  } catch { return null; }
}
