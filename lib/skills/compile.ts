// Turning a designed skill into a runnable Skill Spec, and the setup questions Pip asks the owner.
// The model is passed in, like the runtime, so this runs on the server or in the sidebar.
import { blocksForPrompt } from './blocks';
import type { Brain, Llm, TestResult } from './runtime';
import { validateSpec, type SkillSpec, type Validation } from './spec';

export interface DesignedSkill { name: string; tagline: string; why?: string; how: string[]; demo?: unknown; category?: string }
export interface SetupQuestion { id: string; q: string; why: string; example: string }

function json<T>(text: string | null): T | null {
  if (!text) return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)) as T; } catch { return null; }
}

/** About 8 questions only the owner can answer, aimed at the skills they picked. */
export async function setupQuestions(llm: Llm, brain: Brain, skills: DesignedSkill[]): Promise<SetupQuestion[]> {
  const reply = await llm(
    'You set up AI skills for small businesses. Ask only what the website and reviews cannot tell you and the skills truly need. Plain words, one thing per question. Return JSON only.',
    [{ role: 'user', content: `WHAT WE ALREADY KNOW\n${brain.facts.join('\n')}\n\nSKILLS TO SET UP\n${skills.map(k => `- ${k.name}: ${k.tagline}. Steps: ${k.how.join('; ')}`).join('\n')}\n\nReturn {"questions":[{"id": short_snake_id, "q": the question to the owner, "why": which skill needs it and why (under 12 words), "example": a short example answer for this business}]} with 6 to 8 questions. Always include: how they want urgent issues handled and who gets alerted (with the best phone or email), how price questions should be answered, and anything the AI must never say or promise.` }],
    'smart',
  );
  const out = json<{ questions?: SetupQuestion[] }>(reply)?.questions || [];
  return out.filter(q => q && q.q).slice(0, 8).map((q, i) => ({ id: String(q.id || `q${i}`).slice(0, 40), q: String(q.q).slice(0, 200), why: String(q.why || '').slice(0, 100), example: String(q.example || '').slice(0, 160) }));
}

function compilePrompt(skill: DesignedSkill, brain: Brain, fix?: { errors: string[]; failed: TestResult[]; previous: SkillSpec | null }): string {
  return `Compile this AI skill into a Skill Spec the runtime can execute for ${brain.business}.

THE SKILL (as presented to the owner)
${JSON.stringify(skill)}

THE BUSINESS BRAIN
${brain.facts.join('\n')}
${brain.qa.filter(x => x.a.trim()).map(x => `Owner on "${x.q}": ${x.a}`).join('\n')}

BUILDING BLOCKS (use only these ids; never use a block marked NOT available, unless the skill cannot work at all without it, in which case still include it so the team sees what is missing)
${blocksForPrompt()}

Return JSON only:
{
  "skill_id": short-kebab-id, "name": the skill's name, "version": 1,
  "goal": one sentence,
  "channels": [channel ids], "triggers": [trigger ids], "connections": [connection ids],
  "knowledge": ["scan:services", "owner:<question id>", ...],
  "agent": {"model": "fast" or "smart" (smart only if it must reason hard), "persona": full instructions for the agent: role, tone, what it knows, step by step how it handles a conversation for THIS business, when to use each tool, what it must never do (150-400 words), "tools": [action ids it may call], "opener": its first message if it greets visitors},
  "actions": [{"tool": action id, "approval": "none" or "owner" (owner for anything that commits the business)}],
  "guardrails": {"never": [rules], "escalate_on": [short words or phrases that must reach a person]},
  "tests": [4 to 6 {"say": a realistic customer message, "expect": [2-4 checkable behaviors]}] including one asking for something it must not promise and one that should escalate,
  "metrics": [what to count]
}${fix ? `

YOUR PREVIOUS VERSION FAILED. Fix exactly these problems and return the full corrected spec.
${fix.errors.length ? `Validation errors:\n- ${fix.errors.join('\n- ')}` : ''}
${fix.failed.length ? `Failed tests:\n${fix.failed.map(f => `- Customer: "${f.test.say}" -> AI: "${f.reply}". Missed: ${f.missed.join('; ')}`).join('\n')}` : ''}
Previous spec: ${JSON.stringify(fix.previous)}` : ''}`;
}

export async function compileSpec(llm: Llm, skill: DesignedSkill, brain: Brain, fix?: { errors: string[]; failed: TestResult[]; previous: SkillSpec | null }): Promise<Validation> {
  const reply = await llm('You are a senior engineer who writes precise, safe Skill Specs for AI agents. Return JSON only.', [{ role: 'user', content: compilePrompt(skill, brain, fix) }], 'smart');
  const raw = json<Record<string, unknown>>(reply);
  if (!raw) return { ok: false, errors: ['The reply was not valid JSON.'], spec: null, waitingOn: [], tier: 1 };
  return validateSpec(raw, brain.business);
}
