// The Skill Spec: the one format every skill compiles into, and the validator that keeps a spec
// inside the building blocks the runtime can actually run.
import { BLOCKS, ofKind, type Block, type BlockId } from './blocks';

export type SpecStatus = 'draft' | 'testing' | 'needs_review' | 'sandbox' | 'approved' | 'live' | 'paused';
export type Approval = 'none' | 'owner';

export interface SpecTest { say: string; expect: string[] }

export interface SkillSpec {
  skill_id: string;
  name: string;
  business: string;
  version: number;
  status: SpecStatus;
  goal: string;
  channels: BlockId[];
  triggers: BlockId[];
  connections: BlockId[];
  knowledge: string[];
  agent: { model: 'fast' | 'smart'; persona: string; tools: BlockId[]; opener?: string };
  actions: { tool: BlockId; approval: Approval }[];
  guardrails: { never: string[]; escalate_on: string[] };
  handoff: { to: 'owner'; how: 'notify' };
  tests: SpecTest[];
  metrics: string[];
}

export interface Validation {
  ok: boolean;
  errors: string[];
  spec: SkillSpec | null;
  /** Blocks this spec uses that aren't runnable today, with what each needs. */
  waitingOn: { id: BlockId; label: string; setup?: string }[];
  tier: 1 | 2 | 3;
}

const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** Cleans a model-written spec and lists every problem in words the model can fix. */
export function validateSpec(input: unknown, business: string): Validation {
  const errors: string[] = [];
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const pick = (field: string, kind: Block['kind'], v: unknown): BlockId[] => {
    const allowed = ofKind(kind) as string[];
    const out: BlockId[] = [];
    for (const x of list(v)) {
      if (typeof x !== 'string') continue;
      if (allowed.includes(x)) out.push(x as BlockId);
      else errors.push(`${field}: "${x}" is not an allowed ${kind}. Use only: ${allowed.join(', ')}.`);
    }
    return Array.from(new Set(out));
  };
  const name = s(o.name, 60), goal = s(o.goal, 200);
  if (!name) errors.push('name is required.');
  if (!goal) errors.push('goal is required.');
  const channels = pick('channels', 'channel', o.channels);
  const triggers = pick('triggers', 'trigger', o.triggers);
  const connections = pick('connections', 'connection', o.connections);
  if (!channels.length) errors.push('channels needs at least one channel.');
  if (!triggers.length) errors.push('triggers needs at least one trigger.');
  const a = (o.agent && typeof o.agent === 'object' ? o.agent : {}) as Record<string, unknown>;
  const persona = s(a.persona, 4000);
  if (persona.length < 80) errors.push('agent.persona must fully describe the role, what it knows, how it talks and what it must never do (80+ characters).');
  const tools = pick('agent.tools', 'action', a.tools);
  const actions = list(o.actions).map(x => {
    const y = (x || {}) as Record<string, unknown>;
    const tool = typeof y.tool === 'string' && (ofKind('action') as string[]).includes(y.tool) ? (y.tool as BlockId) : null;
    if (!tool) { errors.push(`actions: "${String(y.tool)}" is not an allowed action.`); return null; }
    return { tool, approval: (y.approval === 'none' ? 'none' : 'owner') as Approval };
  }).filter((x): x is { tool: BlockId; approval: Approval } => !!x);
  for (const t of tools) if (!actions.some(x => x.tool === t)) actions.push({ tool: t, approval: t === 'draft_for_approval' ? 'owner' : 'none' });
  const g = (o.guardrails && typeof o.guardrails === 'object' ? o.guardrails : {}) as Record<string, unknown>;
  const never = list(g.never).map(x => s(x, 120)).filter(Boolean).slice(0, 12);
  const escalate = list(g.escalate_on).map(x => s(x, 60)).filter(Boolean).slice(0, 16);
  if (!never.length) errors.push('guardrails.never needs at least one rule (for example: never quote prices that are not in the knowledge).');
  const tests = list(o.tests).map(x => {
    const y = (x || {}) as Record<string, unknown>;
    return { say: s(y.say, 300), expect: list(y.expect).map(e => s(e, 120)).filter(Boolean).slice(0, 5) };
  }).filter(t => t.say && t.expect.length).slice(0, 8);
  if (tests.length < 3) errors.push('tests needs at least 3 test conversations, each with "say" and "expect" lists, including one where the customer asks for something the business must not promise.');

  const used = [...channels, ...triggers, ...connections, ...tools];
  const waitingOn = Array.from(new Set(used)).filter(id => BLOCKS[id].status !== 'ready').map(id => ({ id, label: BLOCKS[id].label, setup: (BLOCKS[id] as Block).setup }));
  const tier = Math.max(1, ...used.map(id => BLOCKS[id].tier)) as 1 | 2 | 3;
  const spec: SkillSpec = {
    skill_id: (s(o.skill_id, 40) || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name, business, version: Math.max(1, Math.round(Number(o.version) || 1)), status: 'draft', goal,
    channels, triggers, connections,
    knowledge: list(o.knowledge).map(x => s(x, 60)).filter(Boolean).slice(0, 12),
    agent: { model: a.model === 'smart' ? 'smart' : 'fast', persona, tools, opener: s(a.opener, 200) || undefined },
    actions,
    guardrails: { never, escalate_on: escalate },
    handoff: { to: 'owner', how: 'notify' },
    tests,
    metrics: list(o.metrics).map(x => s(x, 40)).filter(Boolean).slice(0, 6),
  };
  return { ok: errors.length === 0, errors, spec: name && goal ? spec : null, waitingOn, tier };
}
