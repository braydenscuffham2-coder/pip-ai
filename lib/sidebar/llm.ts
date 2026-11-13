// Sidebar build only: replaces lib/server/llm.ts. Runs the same prompts on the viewer's own
// Claude plan through the artifact `sample` capability, so no API key is needed while testing.
import type { LlmCall } from '../server/llm';
export { parseJson } from '../server/llm-parse';

type Sample = ((input: { role: 'user' | 'assistant'; content: string }[], opts?: { modelTier?: 'quick' | 'default' | 'complex'; signal?: AbortSignal; cache?: boolean }) => Promise<{ text: string }>);

let samplePromise: Promise<Sample | null> | null = null;
function getSample(): Promise<Sample | null> {
  const c = (globalThis as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return Promise.resolve(null);
  samplePromise ??= c.use('sample').then(s => (s as Sample) || null).catch(() => null);
  return samplePromise;
}

export const llmEnabled = () => true;

export async function llm({ system, messages, tier = 'fast', timeoutMs = 60000 }: LlmCall): Promise<string | null> {
  const sample = await getSample();
  if (!sample || !messages.length) return null;
  // sample() has no system slot, so the instructions ride in front of the first message.
  const turns = messages.map((m, i) => (i === 0 ? { role: m.role, content: `${system}\n\n---\n\n${m.content}` } : m));
  if (turns[0].role !== 'user') turns.unshift({ role: 'user', content: system });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await sample(turns, { modelTier: tier === 'smart' || messages.some(m => m.content.length > 6000) ? 'default' : 'quick', signal: ctl.signal, cache: false });
    return r.text?.trim() || null;
  } catch (e) {
    console.warn('[pip] sample failed', (e as { code?: string })?.code || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}
