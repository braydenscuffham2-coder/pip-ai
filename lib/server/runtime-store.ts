// Supabase storage for live skills: specs, conversations, messages and owner notifications.
import type { Brain, Msg } from '../skills/runtime';
import type { SkillSpec, SpecStatus } from '../skills/spec';

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY, secret = process.env.PIP_SERVER_SECRET;
  if (!url || !key || !secret) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_secret: secret, ...args }),
    });
    if (!res.ok) { console.error('[runtime-store]', fn, res.status, (await res.text()).slice(0, 200)); return null; }
    const t = await res.text();
    return (t ? JSON.parse(t) : null) as T;
  } catch (e) { console.error('[runtime-store]', fn, String(e)); return null; }
}

export interface StoredSpec { id: string; status: SpecStatus; spec: SkillSpec; brain: Brain; business: string }

export const getSpec = (id: string) => rpc<StoredSpec>('pip_spec_get', { p_id: id });
export const upsertSpec = (a: { id?: string | null; business: string; domain?: string | null; status: SpecStatus; spec: SkillSpec; brain: Brain; quote?: unknown; tests?: unknown }) =>
  rpc<string>('pip_spec_upsert', { p_id: a.id || null, p_business: a.business, p_domain: a.domain || null, p_status: a.status, p_spec: a.spec, p_brain: a.brain, p_quote: a.quote ?? null, p_tests: a.tests ?? null });
export const startConversation = (spec: string, channel: string, visitor: string | null) => rpc<string>('pip_conv_start', { p_spec: spec, p_channel: channel, p_visitor: visitor });
export const history = (conv: string) => rpc<Msg[]>('pip_conv_history', { p_conv: conv });
export const addMessage = (conv: string, role: Msg['role'], content: string, actions?: unknown) => rpc<null>('pip_msg_add', { p_conv: conv, p_role: role, p_content: content, p_actions: actions ?? null });
export const notify = (spec: string, kind: string, body: Record<string, unknown>) => rpc<null>('pip_notify', { p_spec: spec, p_kind: kind, p_body: body });
