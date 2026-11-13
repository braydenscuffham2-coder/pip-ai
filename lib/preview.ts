// Stand-in data used until the real backend is connected. Everything produced here is
// marked source: 'preview' and labeled "Preview data" in the UI.
import { IND } from './knowledge';
import type { ChatTurn, Competitor, DetectedTool, IndustryId, ModuleType, Profile, ReviewTheme, ScanEvent, ToolId } from './types';

export function normalizeDomain(raw: string): string | null {
  const v = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(v) ? v : null;
}

export function guessIndustry(text: string): IndustryId {
  const t = text.toLowerCase();
  for (const id of Object.keys(IND) as IndustryId[]) if (IND[id].hints.some(h => t.includes(h))) return id;
  return 'other';
}

const SPLIT_WORDS = ['heating', 'cooling', 'plumbing', 'electric', 'roofing', 'hvac', 'air', 'dental', 'salon', 'spa', 'studio', 'auto', 'repair', 'motors', 'tire', 'realty', 'homes', 'fitness', 'yoga', 'gym', 'cafe', 'grill', 'kitchen', 'bakery', 'pizza', 'boutique', 'shop', 'co', 'services', 'group', 'line', 'and'];
export function nameFromDomain(domain: string): string {
  let base = domain.split('.')[0].replace(/-/g, ' ');
  if (!base.includes(' ')) {
    for (const w of SPLIT_WORDS.sort((a, b) => b.length - a.length)) {
      const i = base.indexOf(w);
      if (i > 0 && w.length >= 3) { base = base.slice(0, i) + ' ' + base.slice(i); break; }
    }
  }
  return base.split(' ').filter(Boolean).map(w => (w === 'hvac' ? 'HVAC' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

interface Pack {
  services: string[]; hours: string; area: string;
  detected: DetectedTool[]; rating: number; reviewCount: number;
  themes: ReviewTheme[]; competitors: Competitor[];
}

const PACKS: Record<IndustryId, Pack> = {
  health: { services: ['Cleanings & exams', 'Fillings', 'Whitening', 'Emergency visits'], hours: 'Mon–Thu, 7:30 AM–5 PM', area: 'Families across town',
    detected: [{ id: 'booking', vendor: 'Online booking', evidence: 'booking link on homepage' }], rating: 4.6, reviewCount: 212,
    themes: [{ label: 'Hard to get through on the phone', count: 11, quote: 'Called three times before anyone picked up.', sentiment: 'negative', relates: 'leads' },
      { label: 'Gentle with kids', count: 34, quote: 'So patient with my daughter.', sentiment: 'positive' }],
    competitors: [{ name: 'Lakeside Family Dental', rating: 4.8, distanceMi: 1.6, note: 'answer after hours' }] },
  home: { services: ['Furnace repair', 'AC installs', 'Tune-ups', 'Water heaters'], hours: 'Mon–Fri, 7 AM–6 PM', area: '14 towns nearby',
    detected: [{ id: 'chatbot', vendor: 'Chat widget', evidence: 'script on homepage' }], rating: 4.6, reviewCount: 212,
    themes: [{ label: 'Slow callbacks', count: 9, quote: 'Left a message and waited two days.', sentiment: 'negative', relates: 'leads' },
      { label: 'Hard to book', count: 5, quote: 'Had to call three times to get on the schedule.', sentiment: 'negative', relates: 'scheduling' },
      { label: 'Friendly techs', count: 31, quote: 'Tech was on time and explained everything.', sentiment: 'positive' }],
    competitors: [{ name: 'Summit Comfort Co.', rating: 4.8, distanceMi: 2.1, note: 'answer after hours' }, { name: 'Bayside Plumbing & Air', rating: 4.5, distanceMi: 3.4, note: 'answer after hours' }, { name: 'Ridge Mechanical', rating: 4.2, distanceMi: 5.0 }] },
  auto: { services: ['Brakes', 'Oil changes', 'Diagnostics', 'Tires'], hours: 'Mon–Sat, 8 AM–6 PM', area: 'Downtown and the east side',
    detected: [{ id: 'booking', vendor: 'Online booking widget', evidence: 'booking page' }], rating: 4.4, reviewCount: 156,
    themes: [{ label: 'No updates on repairs', count: 7, quote: "Had to call twice to find out my car's status.", sentiment: 'negative', relates: 'questions' },
      { label: 'Slow callbacks', count: 4, quote: 'Nobody called me back about the estimate.', sentiment: 'negative', relates: 'leads' },
      { label: 'Honest pricing', count: 28, quote: "They told me what I didn't need.", sentiment: 'positive' }],
    competitors: [{ name: 'Precision Auto Works', rating: 4.7, distanceMi: 1.6, note: 'text repair updates' }, { name: 'Quick Lane Garage', rating: 4.3, distanceMi: 2.8, note: 'text repair updates' }] },
  salon: { services: ['Cuts', 'Color', 'Balayage', 'Extensions'], hours: 'Tue–Sat, 9 AM–7 PM', area: 'Midtown',
    detected: [{ id: 'booking', vendor: 'Booking widget', evidence: 'book now button' }], rating: 4.8, reviewCount: 340,
    themes: [{ label: 'Hard to get an appointment', count: 11, quote: 'Booked out for weeks, then a slot opened and nobody told me.', sentiment: 'negative', relates: 'scheduling' },
      { label: 'Messages go unanswered', count: 5, quote: 'DMed twice about a color fix, no reply.', sentiment: 'negative', relates: 'leads' },
      { label: 'Love my stylist', count: 52, quote: 'Maya is a magician with color.', sentiment: 'positive' }],
    competitors: [{ name: 'Gloss & Co.', rating: 4.9, distanceMi: 0.8, note: 'run a waitlist' }, { name: 'Studio Nine', rating: 4.6, distanceMi: 1.9 }] },
  restaurant: { services: ['Dinner', 'Brunch', 'Catering', 'Private events'], hours: 'Daily, 11 AM–10 PM', area: 'Old Town',
    detected: [{ id: 'booking', vendor: 'Reservation widget', evidence: 'reserve button' }], rating: 4.5, reviewCount: 890,
    themes: [{ label: 'Phone always busy', count: 14, quote: 'Called five times to ask about a large party.', sentiment: 'negative', relates: 'leads' },
      { label: 'No-shows and waits', count: 6, quote: 'Waited 40 minutes even with a reservation.', sentiment: 'negative', relates: 'scheduling' },
      { label: 'Great food', count: 120, quote: 'Best carbonara in town.', sentiment: 'positive' }],
    competitors: [{ name: 'Harbor Table', rating: 4.6, distanceMi: 0.5, note: 'take orders by text' }, { name: 'Ember & Oak', rating: 4.4, distanceMi: 1.2 }] },
  realestate: { services: ['Buying', 'Selling', 'Home valuations', 'Relocation'], hours: 'Daily, 9 AM–7 PM', area: 'The metro area',
    detected: [{ id: 'chatbot', vendor: 'Chat widget', evidence: 'script on homepage' }, { id: 'emails', vendor: 'Email newsletter', evidence: 'signup form' }], rating: 4.9, reviewCount: 74,
    themes: [{ label: 'Slow to respond', count: 4, quote: 'Took a day to hear back about a showing.', sentiment: 'negative', relates: 'leads' },
      { label: 'Knows the market', count: 22, quote: 'Priced our home perfectly.', sentiment: 'positive' }],
    competitors: [{ name: 'Keystone Realty Group', rating: 4.8, distanceMi: 1.1, note: 'answer after hours' }, { name: 'Northgate Homes', rating: 4.5, distanceMi: 3.0 }] },
  fitness: { services: ['Group classes', 'Personal training', 'Intro sessions'], hours: 'Mon–Sat, 5:30 AM–8 PM', area: 'Southside',
    detected: [{ id: 'booking', vendor: 'Class booking app', evidence: 'schedule page' }, { id: 'emails', vendor: 'Email reminders', evidence: 'signup form' }], rating: 4.7, reviewCount: 188,
    themes: [{ label: 'Class waitlists', count: 8, quote: 'Always waitlisted, never hear if a spot opens.', sentiment: 'negative', relates: 'scheduling' },
      { label: 'Billing questions', count: 5, quote: 'Took a week to get an answer about freezing.', sentiment: 'negative', relates: 'questions' },
      { label: 'Great coaches', count: 47, quote: 'Coaches actually remember your name.', sentiment: 'positive' }],
    competitors: [{ name: 'Forge Strength', rating: 4.8, distanceMi: 1.4, note: 'fill waitlist spots automatically' }, { name: 'Pulse Cycle', rating: 4.5, distanceMi: 2.2 }] },
  retail: { services: ['In-store shopping', 'Online orders', 'Local pickup'], hours: 'Mon–Sat, 10 AM–8 PM', area: 'Ships nationwide',
    detected: [{ id: 'chatbot', vendor: 'Chat widget', evidence: 'script on homepage' }], rating: 4.6, reviewCount: 410,
    themes: [{ label: 'No answer about stock', count: 9, quote: 'Asked if a size was in, never heard back.', sentiment: 'negative', relates: 'questions' },
      { label: 'Slow email replies', count: 5, quote: 'Took four days to answer about a return.', sentiment: 'negative', relates: 'leads' },
      { label: 'Great selection', count: 64, quote: 'Always find something unique here.', sentiment: 'positive' }],
    competitors: [{ name: 'Linen & Lark', rating: 4.7, distanceMi: 0.9, note: 'answer stock questions instantly' }, { name: 'Common Thread', rating: 4.4, distanceMi: 2.5 }] },
  other: { services: ['Consultations', 'Projects', 'Ongoing support'], hours: 'Mon–Fri, 9 AM–5 PM', area: 'Local and remote',
    detected: [], rating: 4.7, reviewCount: 38,
    themes: [{ label: 'Slow to respond', count: 3, quote: 'Took a few days to hear back.', sentiment: 'negative', relates: 'leads' },
      { label: 'Professional', count: 19, quote: 'Clear, fast, and easy to work with.', sentiment: 'positive' }],
    competitors: [{ name: 'Brightpath Partners', rating: 4.8, distanceMi: 2.0, note: 'book calls online' }] },
};

export const EXAMPLE_PROFILE: Profile = {
  name: 'Harbor Line Heating & Air', site: 'harborlinehvac.com', industry: 'home',
  services: PACKS.home.services, hours: PACKS.home.hours, area: '14 towns around Harbor Line', phone: '(555) 014-2290',
  tools: ['chatbot'], detected: PACKS.home.detected, pains: ['leads'],
  rating: PACKS.home.rating, reviewCount: PACKS.home.reviewCount, themes: PACKS.home.themes, competitors: PACKS.home.competitors,
};

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Stand-in for the real crawler. Streams believable events for any domain. */
export async function* previewScan(domain: string): AsyncGenerator<ScanEvent> {
  const harbor = domain.includes('harborline');
  const industry = harbor ? 'home' : guessIndustry(domain);
  const pack = PACKS[industry];
  const name = harbor ? EXAMPLE_PROFILE.name : nameFromDomain(domain);
  yield { type: 'meta', source: 'preview' };
  yield { type: 'status', message: `Opening ${domain}`, progress: 6 };
  await wait(500);
  const pages = [['/', 'Home'], ['/services', 'Services'], ['/contact', 'Contact'], ['/about', 'About us']];
  for (const [path, title] of pages) {
    yield { type: 'page', url: domain + (path === '/' ? '' : path), title: `${title} · ${name}` };
    await wait(380);
  }
  yield { type: 'status', message: 'Reading your pages', progress: 30 };
  yield { type: 'fact', key: 'name', label: 'Business', value: name };
  await wait(300);
  yield { type: 'fact', key: 'industry', label: 'Industry', value: IND[industry].label };
  await wait(300);
  yield { type: 'fact', key: 'services', label: 'Services', value: pack.services.join(', ') };
  await wait(300);
  yield { type: 'fact', key: 'hours', label: 'Hours', value: pack.hours };
  await wait(300);
  yield { type: 'fact', key: 'area', label: 'Service area', value: harbor ? EXAMPLE_PROFILE.area! : pack.area };
  await wait(300);
  yield { type: 'status', message: 'Checking the tools on your site', progress: 50 };
  await wait(400);
  if (!pack.detected.length) yield { type: 'status', message: 'No chat, booking, or AI tools found on your site', progress: 56 };
  for (const t of pack.detected) {
    yield { type: 'tech', tool: t, label: t.vendor || t.id };
    await wait(350);
  }
  yield { type: 'status', message: 'Reading your Google reviews', progress: 66 };
  await wait(700);
  yield { type: 'reviews', rating: pack.rating, count: pack.reviewCount, themes: pack.themes };
  await wait(500);
  yield { type: 'status', message: 'Checking nearby competitors', progress: 84 };
  await wait(500);
  for (const c of pack.competitors) {
    yield { type: 'competitor', competitor: c };
    await wait(350);
  }
  const tools: ToolId[] = pack.detected.map(d => d.id);
  const profile: Profile = harbor ? { ...EXAMPLE_PROFILE, pains: [] } : {
    name, site: domain, industry, services: pack.services, hours: pack.hours, area: pack.area,
    tools: tools.length ? tools : [], detected: pack.detected, pains: [],
    rating: pack.rating, reviewCount: pack.reviewCount, themes: pack.themes, competitors: pack.competitors,
  };
  yield { type: 'status', message: 'Done', progress: 100 };
  yield { type: 'done', profile, source: 'preview' };
}

/* ---------- Ask Pip (stand-in) ---------- */
const FAQ: [RegExp, string][] = [
  [/(price|cost|how much|expensive|charge|fee|pay|budget)/i, "There's no price sheet to compare. We build it free first, then you decide. If you keep it, there's a small pilot fee and then a monthly plan."],
  [/(safe|mistake|wrong|trust|error|accura|hallucinat)/i, 'A person checks every build before it goes live, and anything risky waits for your OK.'],
  [/(how long|time|fast|quick|when|soon)/i, "About a day to build. You'll see it working on your business before you commit to anything."],
  [/(access|data|privacy|password|secure|security)/i, 'To start, just your website. Later, only what each module needs, and you can remove access anytime.'],
  [/(learn|hard|tech|install|set ?up|complicated)/i, 'Nothing to install or learn. We run it and send you a plain-English report every month.'],
  [/(cancel|contract|commit|stop)/i, "If the pilot doesn't pay off, we turn it off."],
  [/(who are you|what are you|pip|robot|human|real person)/i, "I'm Pip, a small guide that finds the AI your business is missing. A real team builds it and runs it for you."],
];
export function previewAnswer(q: string): string {
  for (const [re, a] of FAQ) if (re.test(q)) return a;
  return 'Good question. A person on our team will answer it when they review your build. Want to send it over?';
}

/* ---------- Live demo receptionist (stand-in) ---------- */
export function previewReceptionist(p: Profile, type: ModuleType, messages: ChatTurn[]): string {
  const ind = IND[p.industry];
  const last = (messages.filter(m => m.role === 'user').pop()?.content || '').toLowerCase();
  const userTurns = messages.filter(m => m.role === 'user').length;
  const offered = messages.some(m => m.role === 'assistant' && m.content.includes(ind.slots[0]));
  const svc = (p.services[0] || 'that').toLowerCase();
  if (/(emergency|urgent|leak|flood|no heat|smoke|broken down|asap|right now)/.test(last))
    return `I'm sorry, that sounds urgent. I'm alerting our on-call team right now. What's the best number to reach you?`;
  const booked = messages.some(m => m.role === 'assistant' && m.content.startsWith("You're all set"));
  if (booked && !/(change|resched|move|cancel|different|another)/.test(last) && /(first|second|one|works|yes|sure|ok|okay|that|\d|am|pm|morning|afternoon)/.test(last))
    return `You're already booked. ${p.name} has it, and you'll get a text the day before. Anything else I can help with?`;
  if (offered && /(first|earlier|second|later|works|that one|\d|am|pm|morning|afternoon|tonight|yes|sure|perfect|great)/.test(last)) {
    const pick = /(second|later|afternoon|\b4\b|\b1\b|7:45|2 pm|1 pm)/.test(last) ? ind.slots[1] : ind.slots[0];
    return `You're all set for ${pick}. You'll get a text confirmation, and ${p.name} will see it first thing. Anything else?`;
  }
  if (/(price|cost|how much|quote|estimate|charge|rate)/.test(last))
    return `Good question. Pricing depends on the details, so ${ind.pricing}. Want me to book a time?`;
  if (/(where|area|serve|come out|located|address|town|city|near)/.test(last))
    return p.area ? `Yes! We serve ${p.area}. Want me to get you on the schedule?` : `Tell me your town and I'll check. Want me to book a time too?`;
  if (/(hour|open|close|weekend|sunday|saturday)/.test(last))
    return `We're open ${p.hours || 'during regular business hours'}, and I can book you even when we're closed. Want a time?`;
  if (/(book|schedule|appointment|available|availability|tomorrow|today|tonight|soon|come|visit|table|reserve|class|showing)/.test(last))
    return `I can do that. I have ${ind.slots[0]} or ${ind.slots[1]}. Which works better?`;
  if (/(thank|thanks|bye|that's all|thats all)/.test(last)) return `Anytime! Talk soon from ${p.name}.`;
  if (userTurns <= 1)
    return `Hi, thanks for reaching out to ${p.name}! I can help with ${svc}, questions, or booking a time. What do you need?`;
  return `Got it. I can help with that, or book you in: ${ind.slots[0]} or ${ind.slots[1]}. Which is better?`;
}
