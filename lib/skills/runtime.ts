// The runtime: runs one turn of a live skill for any business, from its Skill Spec and business
// brain. The model is passed in, so the same code runs on the server (Claude API) and in the
// sidebar sandbox (the owner's Claude plan). Pure TypeScript: no Node or browser APIs.
import { BLOCKS, type BlockId } from './blocks';
import type { SkillSpec, SpecTest } from './spec';

export type Msg = { role: 'user' | 'assistant'; content: string };
export type Llm = (system: string, messages: Msg[], tier: 'fast' | 'smart') => Promise<string | null>;

export interface Brain {
  business: string;
  /** Everything the scan learned, as plain lines (services, hours, area, facts). */
  facts: string[];
  /** The owner's own answers to Pip's setup questions. */
  qa: { q: string; a: string }[];
}

export interface Action { tool: BlockId; args: Record<string, string> }
export interface ActionResult extends Action { status: 'done' | 'waiting_for_owner' | 'blocked'; note?: string }
export interface Turn { reply: string; actions: ActionResult[]; escalated: boolean; usedModel: boolean }
export type ActionSink = (a: Action, approval: 'none' | 'owner') => Promise<ActionResult>;

const TOOL_ARGS: Partial<Record<BlockId, string>> = {
  capture_lead: '{"name","phone","email","need"} (only what the customer actually gave)',
  request_booking: '{"when": what they asked for, "need", "contact"}; the owner confirms the time',
  notify_owner: '{"summary": one sentence, "urgency": "normal"|"urgent"}',
  handoff: '{"reason"}',
  draft_for_approval: '{"what", "text"}',
};

export function brainText(b: Brain): string {
  return [`Business: ${b.business}`, ...b.facts, ...b.qa.filter(x => x.a.trim()).map(x => `Q: ${x.q}\nA (from the owner): ${x.a}`)].join('\n');
}

export function systemFor(spec: SkillSpec, brain: Brain): string {
  const tools = spec.agent.tools.filter(t => TOOL_ARGS[t]);
  return `${spec.agent.persona}

You are "${spec.name}" for ${brain.business}. Goal: ${spec.goal}

WHAT YOU KNOW (use only this; if something isn't here, say a team member will confirm):
${brainText(brain)}

NEVER: ${spec.guardrails.never.join('; ')}.
If the customer mentions any of these, alert the owner and hand off: ${spec.guardrails.escalate_on.join(', ') || 'nothing listed'}.

TOOLS you may use: ${tools.length ? tools.map(t => `${t} ${TOOL_ARGS[t]}`).join('; ') : 'none'}.

Reply with JSON only: {"reply": what you text the customer (1-3 short sentences, warm and plain), "actions": [{"tool": one of your tools, "args": {...}}]}. Use actions only when they're needed now.`;
}

function parse(text: string | null): { reply?: string; actions?: { tool?: string; args?: Record<string, unknown> }[] } | null {
  if (!text) return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return { reply: text.trim() };
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return { reply: text.replace(/[{}"]/g, '').trim() }; }
}

/** Words that must always reach a person, checked before the model sees the message. */
export function escalates(spec: SkillSpec, message: string): string | null {
  // A phrase matches when all its words appear, in any order ("gas smell" catches "I smell gas").
  const words = new Set(message.toLowerCase().match(/[a-z0-9']+/g) || []);
  const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');
  const stems = new Set(Array.from(words).map(stem));
  return spec.guardrails.escalate_on.find(p => {
    const need = (p.toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => w.length > 2);
    return need.length > 0 && need.every(w => words.has(w) || stems.has(stem(w)));
  }) || null;
}

const defaultSink: ActionSink = async (a, approval) => ({ ...a, status: approval === 'owner' ? 'waiting_for_owner' : 'done' });

export async function runTurn(opts: { spec: SkillSpec; brain: Brain; history: Msg[]; message: string; llm: Llm; sink?: ActionSink }): Promise<Turn> {
  const { spec, brain, history, message, llm } = opts;
  const sink = opts.sink || defaultSink;
  const hit = escalates(spec, message);
  const msgs: Msg[] = [...history.slice(-16), { role: 'user', content: message.slice(0, 1000) }];
  const out = parse(await llm(systemFor(spec, brain), msgs, spec.agent.model));
  if (!out) {
    // No model available: never leave the customer hanging.
    const results = await Promise.all([
      sink({ tool: 'notify_owner', args: { summary: `New message: ${message.slice(0, 200)}`, urgency: hit ? 'urgent' : 'normal' } }, 'none'),
    ]);
    return { reply: `Thanks for reaching out to ${brain.business}! A team member will get back to you shortly.`, actions: results, escalated: !!hit, usedModel: false };
  }
  const allowed = new Set(spec.agent.tools);
  const wanted: Action[] = (out.actions || [])
    .filter(x => typeof x?.tool === 'string' && allowed.has(x.tool as BlockId))
    .map(x => ({ tool: x.tool as BlockId, args: Object.fromEntries(Object.entries(x.args || {}).map(([k, v]) => [k, String(v ?? '').slice(0, 300)])) }));
  if (hit) {
    if (!wanted.some(w => w.tool === 'notify_owner')) wanted.push({ tool: 'notify_owner', args: { summary: `Customer mentioned "${hit}": ${message.slice(0, 180)}`, urgency: 'urgent' } });
    if (!wanted.some(w => w.tool === 'handoff')) wanted.push({ tool: 'handoff', args: { reason: `Mentioned ${hit}` } });
  }
  const results: ActionResult[] = [];
  for (const w of wanted.slice(0, 4)) {
    if (BLOCKS[w.tool].status !== 'ready') { results.push({ ...w, status: 'blocked', note: `${BLOCKS[w.tool].label} isn't connected yet` }); continue; }
    const approval = spec.actions.find(a => a.tool === w.tool)?.approval || 'owner';
    results.push(await sink(w, approval));
  }
  const reply = (out.reply || '').slice(0, 700) || `Thanks! A team member at ${brain.business} will follow up shortly.`;
  return { reply, actions: results, escalated: !!hit, usedModel: true };
}

/* ---------------- automatic tests ---------------- */

export interface TestResult { test: SpecTest; reply: string; actions: ActionResult[]; pass: boolean; missed: string[] }

export async function runTest(spec: SkillSpec, brain: Brain, test: SpecTest, llm: Llm): Promise<TestResult> {
  const turn = await runTurn({ spec, brain, history: [], message: test.say, llm });
  const judge = await llm(
    'You are a strict QA reviewer for an AI front desk. Judge one reply against a checklist. Return JSON only: {"results":[{"expect": the item, "met": true|false}]}',
    [{ role: 'user', content: `Customer said: ${test.say}\n\nAI replied: ${turn.reply}\nAI actions: ${JSON.stringify(turn.actions.map(a => ({ tool: a.tool, args: a.args })))}\n\nChecklist:\n${test.expect.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nAn item about an action is met if the matching action was taken. Be strict about anything the business must not promise.` }],
    'fast',
  );
  const p = parse(judge) as { results?: { expect?: string; met?: boolean }[] } | null;
  const res = p?.results || [];
  const missed = test.expect.filter((e, i) => !(res[i]?.met ?? res.find(r => r.expect === e)?.met));
  return { test, reply: turn.reply, actions: turn.actions, pass: !!judge && turn.usedModel && missed.length === 0, missed: judge ? missed : test.expect };
}

export async function runTests(spec: SkillSpec, brain: Brain, llm: Llm, onEach?: (r: TestResult, i: number) => void): Promise<TestResult[]> {
  const out: TestResult[] = [];
  for (let i = 0; i < spec.tests.length; i++) { const r = await runTest(spec, brain, spec.tests[i], llm); out.push(r); onEach?.(r, i); }
  return out;
}
