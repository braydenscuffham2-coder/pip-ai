import { sanitizeProfile } from '@/lib/engine';
import { askPip } from '@/lib/server/talk';
import { isModuleType } from '@/lib/engine';
import { bad, json, readJson } from '@/lib/server/http';
import { llmEnabled } from '@/lib/server/llm';
import { guard } from '@/lib/server/guard';
import { previewAnswer } from '@/lib/preview';
import type { ChatTurn } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat  { profile?: Profile, modules?: string[], messages: ChatTurn[] }  ->  ChatResponse
 * "Ask Pip anything". Preview implementation answers from a short FAQ.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJson(req); } catch { return bad('bad_request'); }
  const b = (body || {}) as { profile?: unknown; messages?: unknown; modules?: unknown };
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m): m is ChatTurn => !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12);
  const last = messages.filter(m => m.role === 'user').pop();
  if (!last) return bad('no_question');
  const profile = sanitizeProfile(b.profile);
  const modules = (Array.isArray(b.modules) ? b.modules : []).filter(isModuleType).slice(0, 11);
  const history = messages.map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
  // Over the limit, Pip answers from its built-in replies and the model isn't called.
  const allowed = !llmEnabled() || (await guard(req, 'web_llm')).ok;
  const { reply, usedModel } = allowed ? await askPip(last.content.slice(0, 500), history, profile, modules) : { reply: previewAnswer(last.content.slice(0, 500)), usedModel: false };
  return json({ reply, source: usedModel ? 'live' : 'preview' });
}
