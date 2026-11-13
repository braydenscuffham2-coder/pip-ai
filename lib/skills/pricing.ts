// Pricing logic from the playbook. Internal only: Pip shows a quote after the owner has tried
// their skills, never on the public site. Prices are starting guesses to test with early clients.
export const TIERS = {
  1: { name: 'Answer', low: 49, high: 99, included: '500 conversations a month' },
  2: { name: 'Act', low: 149, high: 299, included: '1,000 messages a month' },
  3: { name: 'Voice / multi-system', low: 300, high: 500, included: '300 call minutes a month' },
} as const;

export type Tier = keyof typeof TIERS;

/** Bundle discount d: 0% for 1-2 skills, 15% for 3-4, 25% for 5 or more. */
export const discountFor = (n: number) => (n >= 5 ? 0.25 : n >= 3 ? 0.15 : 0);

export interface QuoteLine { name: string; tier: Tier; tierName: string; price: number }
export interface Quote { lines: QuoteLine[]; subtotal: number; discount: number; monthly: number; pilotDays: number; pilotSkills: number }

/** `point` 0..1 picks where in each tier's range to price (0 = low end). */
export function quote(skills: { name: string; tier: Tier }[], point = 0): Quote {
  const lines = skills.map(k => ({ name: k.name, tier: k.tier, tierName: TIERS[k.tier].name, price: Math.round(TIERS[k.tier].low + (TIERS[k.tier].high - TIERS[k.tier].low) * point) }));
  const subtotal = lines.reduce((a, l) => a + l.price, 0);
  const d = discountFor(lines.length);
  return { lines, subtotal, discount: Math.round(subtotal * d), monthly: Math.round(subtotal * (1 - d)), pilotDays: 30, pilotSkills: 2 };
}
