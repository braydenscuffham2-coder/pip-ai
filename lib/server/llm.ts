// The one place Pip talks to a model. Server builds use the Anthropic API when ANTHROPIC_API_KEY
// is set. The sidebar build swaps this file for one that uses the viewer's Claude subscription.
import { logEvent } from './store';

export interface LlmTurn { role: 'user' | 'assistant'; content: string }
export interface LlmCall { system: string; messages: LlmTurn[]; maxTokens?: number; tier?: 'fast' | 'smart'; timeoutMs?: number; /** Label for cost logging, e.g. "scan:understand". */ purpose?: string; domain?: string }

export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const MODEL = { fast: process.env.PIP_FAST_MODEL || 'claude-haiku-5-5', smart: process.env.PIP_SMART_MODEL || 'claude-opus-5-5' };

/** USD per million tokens (input, output), from the Claude API pricing page on 2026-10-21. */
const PRICE: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50], 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5], 'claude-haiku-4-5-20251001': [1, 5],
};
export const costOf = (model: string, inTok: number, outTok: number) => { const p = PRICE[model] || [4, 20]; return (inTok * p[0] + outTok * p[1]) / 1e6; };

/** Returns the model's text, or null on any failure (callers always have a fallback). */
export async function llm({ system, messages, maxTokens = 1200, tier = 'fast', timeoutMs = 45000, purpose = 'other', domain }: LlmCall): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      // The system prompt is cached: repeat turns for the same business pay the cached rate.
      body: JSON.stringify({ model: MODEL[tier], max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[llm]', res.status, (await res.text()).slice(0, 300)); return null; }
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    const u = data.usage || {};
    const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * (/opus|sonnet/.test(MODEL[tier]) ? 0.05 : 0.1);
    void logEvent('llm', domain || null, { purpose, model: MODEL[tier], input: u.input_tokens, output: u.output_tokens, cache_read: u.cache_read_input_tokens, cache_write: u.cache_creation_input_tokens, usd: Math.round(costOf(MODEL[tier], inTok, u.output_tokens || 0) * 1e5) / 1e5 });
    return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim() || null;
  } catch (e) {
    console.error('[llm]', String(e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

export { parseJson } from './llm-parse';
