import { bad, json, readJson } from '@/lib/server/http';
import { llm, llmEnabled } from '@/lib/server/llm';
import { addMessage, getSpec, history, notify, startConversation } from '@/lib/server/runtime-store';
import { runTurn, type ActionSink, type Llm } from '@/lib/skills/runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  let conv = typeof b.conversation === 'string' && /^[0-9a-f-]{36}$/i.test(b.conversation) ? b.conversation : null;
  if (!conv) conv = await startConversation(id, 'web_chat', typeof b.visitor === 'string' ? b.visitor.slice(0, 80) : null);
  if (!conv) return withCors(bad('store_unavailable', 503));
  const past = (await history(conv)) || [];

  const model: Llm = (system, messages, tier) => llm({ system, messages, tier, maxTokens: 500, timeoutMs: 20000, purpose: `skill:${s.spec.skill_id}`, domain: s.business });
  const sink: ActionSink = async (a, approval) => {
    await notify(id, a.tool, { args: a.args, approval, conversation: conv, business: s.business });
    return { ...a, status: approval === 'owner' ? 'waiting_for_owner' : 'done' };
  };
  const turn = await runTurn({ spec: s.spec, brain: s.brain, history: past, message, llm: model, sink });
  await addMessage(conv, 'user', message);
  await addMessage(conv, 'assistant', turn.reply, turn.actions);
  return withCors(json({ conversation: conv, reply: turn.reply, actions: turn.actions.map(a => ({ tool: a.tool, status: a.status })), live: llmEnabled() }));
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
