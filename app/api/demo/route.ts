import { isModuleType, sanitizeProfile } from '@/lib/engine';
import { receptionist } from '@/lib/server/talk';
import { bad, json, readJson } from '@/lib/server/http';
import { llmEnabled } from '@/lib/server/llm';
import { guard, isBot } from '@/lib/server/guard';
import { previewReceptionist } from '@/lib/preview';
import type { ChatTurn } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/demo  { profile: Profile, module: ModuleType, messages: ChatTurn[] }  ->  ChatResponse
 * The "Try it live" receptionist: answers as the business. Preview implementation is rule-based.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJson(req); } catch { return bad('bad_request'); }
  const b = (body || {}) as { profile?: unknown; module?: unknown; messages?: unknown };
  const profile = sanitizeProfile(b.profile);
  if (!profile) return bad('invalid_profile');
  const type = isModuleType(b.module) ? b.module : 'after';
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m): m is ChatTurn => !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 500) }))
    .slice(-16);
  if (!messages.some(m => m.role === 'user')) return bad('no_message');
  // Over the limit, the front desk answers from its built-in replies and the model isn't called.
  const allowed = !llmEnabled() || (!(await isBot()) && (await guard(req, 'web_llm')).ok);
  const { reply, usedModel } = allowed ? await receptionist(profile, type, messages) : { reply: previewReceptionist(profile, type, messages), usedModel: false };
  return json({ reply, source: usedModel ? 'live' : 'preview' });
}
