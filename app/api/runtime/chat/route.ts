import { bad, json, readJson } from '@/lib/server/http';
import { llm, llmEnabled } from '@/lib/server/llm';
import { addMessage, getSpec, history, notify, startConversation } from '@/lib/server/runtime-store';
import { runTurn, type ActionSink, type Llm } from '@/lib/skills/runtime';
import { guard } from '@/lib/server/guard';
import { withAiNotice } from '@/lib/skills/ai-notice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const withCors = (r: Response) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };

/**
 * POST /api/runtime/chat  { skill: <spec id>, conversation?: <id>, message, visitor? }
 *   -> { conversation, reply, actions }
 * Runs one turn of a live skill. Needs ANTHROPIC_API_KEY; without it, the message is saved and the
 * owner is alerted, and the visitor is told a person will reply.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJson(req, 8000); } catch { return withCors(bad('bad_request')); }
  const b = (body || {}) as { skill?: unknown; conversation?: unknown; message?: unknown; visitor?: unknown };
  const id = typeof b.skill === 'string' ? b.skill : '';
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) : '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !message) return withCors(bad('bad_request'));
  const s = await getSpec(id);
  if (!s || !['live', 'approved', 'sandbox'].includes(s.status)) return withCors(bad('not_found', 404));

  // Teammates built on the Forge Board run in pip-turn, which can also act in the owner's connected tools
  // (calendar, sheet, email) under hard limits. The spend guard still decides whether the model may be called.
  if (!s.spec?.agent) {
    const url = process.env.SUPABASE_URL, secret = process.env.PIP_SERVER_SECRET;
    if (!url || !secret) return withCors(bad('store_unavailable', 503));
    const ok = (await guard(req, 'skill_turn')).ok;
    try {
      const res = await fetch(`${url}/functions/v1/pip-turn/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pip-secret': secret },
        body: JSON.stringify({ skill: id, conversation: typeof b.conversation === 'string' ? b.conversation : undefined, message, visitor: typeof b.visitor === 'string' ? b.visitor.slice(0, 80) : undefined, channel: 'web_chat', limited: !ok }),
        signal: AbortSignal.timeout(55000),
      });
      const j = (await res.json()) as { conversation?: string; reply?: string; actions?: { tool: string; status: string }[]; live?: boolean; error?: string };
      if (!res.ok || !j.reply) return withCors(bad(res.status === 404 ? 'not_found' : j.error === 'paused' ? 'paused' : 'store_unavailable', res.status === 404 ? 404 : 503));
      return withCors(json({ conversation: j.conversation, reply: j.reply, actions: (j.actions || []).map(a => ({ tool: a.tool, status: a.status })), live: !!j.live }));
    } catch (e) {
      console.error('[runtime/chat] pip-turn', String(e).slice(0, 160));
      return withCors(bad('store_unavailable', 503));
    }
  }

  let conv = typeof b.conversation === 'string' && /^[0-9a-f-]{36}$/i.test(b.conversation) ? b.conversation : null;
  if (!conv) conv = await startConversation(id, 'web_chat', typeof b.visitor === 'string' ? b.visitor.slice(0, 80) : null);
  if (!conv) return withCors(bad('store_unavailable', 503));
  const past = (await history(conv)) || [];

  // One visitor can't run up a client's teammate: over the limit the model isn't called, the message is still
  // saved and the owner alerted, and the visitor is told a person will reply.
  const allowed = !llmEnabled() || (await guard(req, 'skill_turn')).ok;
  const model: Llm = (system, messages, tier) => !allowed ? Promise.resolve(null) : llm({ system, messages, tier, maxTokens: 500, timeoutMs: 20000, purpose: `skill:${s.spec.skill_id}`, domain: s.business });
  const sink: ActionSink = async (a, approval) => {
    await notify(id, a.tool, { args: a.args, approval, conversation: conv, business: s.business });
    return { ...a, status: approval === 'owner' ? 'waiting_for_owner' : 'done' };
  };
  const turn = await runTurn({ spec: s.spec, brain: s.brain, history: past, message, llm: model, sink });
  // The first reply always says it is an AI, in code, the same as pip-turn does for Forge Board teammates.
  turn.reply = withAiNotice(turn.reply, past.length === 0, '', s.business);
  await addMessage(conv, 'user', message);
  await addMessage(conv, 'assistant', turn.reply, turn.actions);
  return withCors(json({ conversation: conv, reply: turn.reply, actions: turn.actions.map(a => ({ tool: a.tool, status: a.status })), live: llmEnabled() }));
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
