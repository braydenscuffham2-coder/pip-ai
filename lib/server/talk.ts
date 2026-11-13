// Model-backed conversations: the live demo receptionist and "Ask Pip". Both fall back to the
// rule-based replies when no model is available or it fails.
import { IND, TYPES } from '../knowledge';
import { previewAnswer, previewReceptionist } from '../preview';
import type { ChatTurn, ModuleType, Profile } from '../types';
import { llm } from './llm';

function businessCard(p: Profile): string {
  const k = p.kit;
  return [
    `Business: ${p.name}${p.site ? ` (${p.site})` : ''}`,
    `What they do: ${k?.summary || p.desc || IND[p.industry].label}`,
    p.services.length ? `Services: ${p.services.join(', ')}` : '',
    p.hours ? `Hours: ${p.hours}` : '',
    p.area ? `Area served: ${p.area}` : '',
    p.phone ? `Phone: ${p.phone}` : '',
    k?.facts?.length ? `Details: ${k.facts.join('; ')}` : '',
    `Pricing questions: ${k?.pricing || IND[p.industry].pricing}`,
    `Openings you can offer: ${(k?.slots || IND[p.industry].slots).join(' or ')}`,
  ].filter(Boolean).join('\n');
}

export async function receptionist(p: Profile, type: ModuleType, messages: ChatTurn[]): Promise<{ reply: string; usedModel: boolean }> {
  const system = `You are the AI front desk for ${p.name}, shown live to the owner as a demo of "${TYPES[type].name}" (${TYPES[type].brief}).
The owner is pretending to be a customer. Answer exactly as this business's front desk would, by text.

${businessCard(p)}

Rules:
- 1 to 2 short sentences. Warm, plain, specific to this business.
- Use only the details above. If you don't know something (a price, a policy, insurance), say a team member will confirm it, and offer to book.
- Offer one of the openings above when booking. Once they pick one, confirm it and say they'll get a text confirmation.
- For anything urgent or unsafe, say you're alerting the on-call team and ask for the best number.
- Never mention being a demo, a model, or Pip.`;
  const reply = await llm({ system, messages, maxTokens: 160, tier: 'fast', timeoutMs: 15000 });
  return reply ? { reply, usedModel: true } : { reply: previewReceptionist(p, type, messages), usedModel: false };
}

const ABOUT = `How the service works (only facts you may state):
- Pip scans a business's website, Google reviews and nearby competitors for free, then shows AI upgrades that fit.
- A person on the team reviews every build before it goes live. Anything risky waits for the owner's OK.
- A build takes about a day. The owner sees it working before committing.
- There's no public price list. It's built free first; if they keep it there's a small pilot fee, then a monthly plan.
- To start, only the website is needed. Later, only what each upgrade needs, removable anytime.
- Nothing to install or learn. The team runs it and sends a plain-English report every month.
- If a pilot doesn't pay off, it gets turned off.`;

export async function askPip(question: string, history: ChatTurn[], p: Profile | null, modules: ModuleType[]): Promise<{ reply: string; usedModel: boolean }> {
  const system = `You are Pip, a small friendly guide presenting AI upgrades to a business owner. Answer their question in 1-3 short sentences, plainly and honestly.
${ABOUT}
${p ? `\nThe business you're presenting:\n${businessCard(p)}\nReview themes: ${p.themes.map(t => `${t.label} (${t.count})`).join(', ') || 'none'}\nCompetitors: ${p.competitors.map(c => `${c.name}${c.note ? ' — ' + c.note : ''}`).join('; ') || 'none found'}` : ''}
${modules.length ? `\nUpgrades in their build: ${modules.map(m => `${TYPES[m].name} (${TYPES[m].brief})`).join('; ')}` : ''}

If you don't know, say a person on the team will answer when they review the build. Never invent prices, numbers, or guarantees.`;
  const reply = await llm({ system, messages: history.length ? history : [{ role: 'user', content: question }], maxTokens: 220, tier: 'fast', timeoutMs: 15000 });
  return reply ? { reply, usedModel: true } : { reply: previewAnswer(question), usedModel: false };
}
