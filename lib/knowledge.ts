import type { AreaId, Demo, DemoKind, IndustryId, ModuleType, PainId, ToolId } from './types';

export const BRAND = '[Brand Name]';

export const AREAS: Record<AreaId, string> = {
  leads: 'Leads',
  scheduling: 'Scheduling',
  followup: 'Follow-up',
  questions: 'Customer questions',
  reviews: 'Reviews',
  admin: 'Admin',
};

export const TOOLS: Record<ToolId, { label: string; cover: Partial<Record<AreaId, number>>; does: string; limit: string }> = {
  chatbot: { label: 'Website chatbot', cover: { questions: 40, leads: 15 }, does: 'Answers common questions', limit: "Most can't book, follow up, or learn your details" },
  phone: { label: 'AI phone answering', cover: { leads: 40, questions: 20 }, does: "Picks up when you can't", limit: 'Often takes messages instead of booking' },
  chatgpt: { label: 'ChatGPT for writing', cover: { admin: 25, followup: 10 }, does: 'Drafts emails and posts', limit: 'Someone still copies, pastes, and sends' },
  booking: { label: 'Online booking', cover: { scheduling: 45 }, does: 'Customers book themselves', limit: "Doesn't chase no-shows or fill gaps" },
  reviewsTool: { label: 'Review requests', cover: { reviews: 50 }, does: 'Asks customers for reviews', limit: 'Asks everyone, even unhappy customers' },
  emails: { label: 'Automated emails or texts', cover: { followup: 40, scheduling: 15 }, does: 'Sends scheduled messages', limit: 'Same message for everyone' },
  none: { label: 'Nothing yet', cover: {}, does: '', limit: '' },
};

export const PAINS: Record<PainId, { label: string; area: AreaId }> = {
  leads: { label: 'Missed calls & leads', area: 'leads' },
  scheduling: { label: 'Scheduling & no-shows', area: 'scheduling' },
  quotes: { label: 'Quotes & follow-ups', area: 'followup' },
  questions: { label: 'Same questions all day', area: 'questions' },
  reviews: { label: 'Getting reviews', area: 'reviews' },
  admin: { label: 'Admin & paperwork', area: 'admin' },
};

export const OVERLAPS: { a: ToolId; b: ToolId; t: string }[] = [
  { a: 'chatbot', b: 'phone', t: 'Your chatbot and phone AI answer the same questions but were set up separately. One trained system could handle both.' },
  { a: 'chatgpt', b: 'emails', t: 'You write messages in ChatGPT, then send them through another tool. One connected system could do it start to finish.' },
  { a: 'booking', b: 'emails', t: 'Your booking tool and your text tool may both send reminders, so customers can get two.' },
];

export interface ModuleTypeInfo {
  name: string;
  cat: string;
  area: AreaId;
  demo: DemoKind;
  pains: PainId[];
  covers: Partial<Record<ToolId, number>>;
  line: string;
  brief: string;
  pip: string;
  uses: string[];
  impact: (unit: string) => string;
  icon: string;
}

export const TYPES: Record<ModuleType, ModuleTypeInfo> = {
  after: { name: 'Night Shift', cat: 'Leads', area: 'leads', demo: 'chat', pains: ['leads'], covers: { chatbot: 0.3, phone: 0.3 }, icon: 'night',
    line: "Books after-hours leads while you're closed.", brief: 'books leads that arrive after hours into real openings',
    pip: 'Leads that show up after hours get booked, not left waiting until morning.', uses: ['Your hours', 'Your real openings'], impact: u => `+12 ${u}/mo` },
  missed: { name: 'Missed-Call Rescue', cat: 'Leads', area: 'leads', demo: 'phone', pains: ['leads'], covers: { phone: 0.6 }, icon: 'missed',
    line: 'Texts back every missed call within seconds.', brief: 'texts back every missed call within seconds and books it',
    pip: 'Every missed call gets a text back in seconds, before they try someone else.', uses: ['Your main line', 'Your services'], impact: u => `+8 ${u}/mo` },
  answers: { name: 'Instant Answers', cat: 'Customers', area: 'questions', demo: 'chat', pains: ['questions'], covers: { chatbot: 0.6 }, icon: 'answers',
    line: 'Answers customer questions from your real details.', brief: "answers customer questions from the business's own details, any hour",
    pip: 'Customers get correct answers from your own info, any hour. No hold music.', uses: ['Your website', 'Your policies'], impact: () => '−9 hrs/wk' },
  followup: { name: 'Quote Chaser', cat: 'Sales', area: 'followup', demo: 'timeline', pains: ['quotes'], covers: { emails: 0.4 }, icon: 'quote',
    line: 'Follows up on every quote until you hear yes or no.', brief: 'follows up on quotes or proposals until yes or no',
    pip: "Every open quote gets friendly follow-ups until there's an answer.", uses: ['Your open quotes', 'Your tone'], impact: u => `+5 ${u} won/mo` },
  noshow: { name: 'No-Show Shield', cat: 'Scheduling', area: 'scheduling', demo: 'timeline', pains: ['scheduling'], covers: { booking: 0.4, emails: 0.3 }, icon: 'noshow',
    line: 'Reminds, reschedules by text, and fills empty slots.', brief: 'reminders, reschedules by text, fills empty slots from a waitlist',
    pip: 'Reminders go out, reschedules happen by text, and empty slots get filled from a waitlist.', uses: ['Your calendar', 'Your waitlist'], impact: () => '−40% no-shows' },
  winback: { name: 'Win-Back', cat: 'Growth', area: 'followup', demo: 'timeline', pains: ['leads'], covers: { emails: 0.3 }, icon: 'winback',
    line: "Brings back customers who haven't returned.", brief: "brings back customers who haven't returned in a while",
    pip: 'Customers who drifted away get a friendly nudge at just the right time.', uses: ['Past customers', 'Visit history'], impact: u => `+15 ${u}/mo` },
  radar: { name: 'Demand Radar', cat: 'Growth', area: 'leads', demo: 'trigger', pains: ['leads'], covers: {}, icon: 'season',
    line: 'Spots busy moments early and fills your calendar first.', brief: 'watches for demand spikes (weather, seasons, events, market news) and fills the calendar first',
    pip: 'Most owners never think of this one. I watch for the moment demand spikes and fill your calendar first.', uses: ['Local signals', 'Past customers'], impact: u => `+30 ${u}/season` },
  reviews: { name: 'Review Engine', cat: 'Reputation', area: 'reviews', demo: 'review', pains: ['reviews'], covers: { reviewsTool: 0.6 }, icon: 'review',
    line: 'Asks happy customers for reviews. Unhappy ones come to you.', brief: 'asks happy customers for reviews and routes unhappy ones to the owner',
    pip: 'Happy customers get asked for a review. Unhappy ones come to you first, privately.', uses: ['Finished work', 'Your Google profile'], impact: () => '+20 reviews/mo' },
  dispatch: { name: 'Dispatch Brain', cat: 'Operations', area: 'scheduling', demo: 'map', pains: ['scheduling'], covers: {}, icon: 'dispatch',
    line: 'Sends urgent jobs to the closest available tech.', brief: 'sends urgent jobs to the nearest available field tech',
    pip: 'Urgent jobs go straight to the closest available tech. No phone tag.', uses: ['Tech locations', 'Job urgency'], impact: () => '−35 min response' },
  briefing: { name: 'Morning Briefing', cat: 'Operations', area: 'admin', demo: 'brief', pains: ['admin'], covers: {}, icon: 'briefing',
    line: 'One 7 AM text with everything you need today.', brief: 'a 7 AM text summarizing today, new leads, and what needs the owner',
    pip: "Every morning you get one text: today's schedule, new leads, and what needs you.", uses: ['Your calendar', 'Overnight activity'], impact: () => '−3 hrs/wk' },
  paperwork: { name: 'Paperwork Autopilot', cat: 'Admin', area: 'admin', demo: 'timeline', pains: ['admin'], covers: { chatgpt: 0.4 }, icon: 'paperwork',
    line: 'Turns notes into invoices, docs, and follow-up emails.', brief: 'turns notes into invoices, documents and follow-up emails',
    pip: 'Notes become invoices and emails automatically. You just approve them.', uses: ['Your notes', 'Your templates'], impact: () => '−6 hrs/wk' },
};

type DemoMap = Partial<Record<ModuleType, Demo>>;

export interface IndustryInfo {
  label: string;
  unit: string;
  cands: ModuleType[];
  demo: DemoMap;
  /** Two example openings used by the live receptionist demo. */
  slots: [string, string];
  /** How the receptionist handles price questions. */
  pricing: string;
  /** Words that hint at this industry in a domain or page text. */
  hints: string[];
}

export const IND: Record<IndustryId, IndustryInfo> = {
  home: { label: 'Home services', unit: 'jobs', cands: ['after', 'missed', 'followup', 'radar', 'dispatch', 'reviews', 'answers', 'briefing'],
    slots: ['8–10 AM tomorrow', '1–3 PM tomorrow'], pricing: 'a tech gives you an exact quote on-site before any work starts',
    hints: ['hvac', 'heating', 'cooling', 'air', 'plumb', 'roof', 'electric', 'furnace', 'drain', 'pest', 'clean', 'handyman', 'landscap', 'garage'],
    demo: {
      after: { kind: 'chat', c: "Furnace is out and it's 28° tonight. Anyone tomorrow?", r: 'So sorry! A tech can be there 8–10 AM tomorrow. Book it?', res: 'Booked · Tomorrow 8–10 AM' },
      missed: { kind: 'phone', c: 'Water heater is leaking', r: 'Our on-call tech can be there by 7:30 PM. Okay?', res: 'Job booked · On-call' },
      followup: { kind: 'timeline', steps: ['Estimate sent · New furnace', 'Day 2 · "Any questions?"', 'Day 7 · Shares financing option', 'Day 9 · Accepted'] },
      radar: { kind: 'trigger', trig: 'Thursday low: 19°F', act: 'Texting customers due for a tune-up', res: '47 tune-ups booked' },
      dispatch: { kind: 'map', job: 'Water leak' },
      reviews: { kind: 'review', svc: 'Furnace repair', rev: 'Fast, friendly, fixed in an hour.' },
      answers: { kind: 'chat', c: 'Do you come out to Millbrook?', r: 'Yes, Millbrook is in our area. I can book a visit Thursday. Want it?', res: 'Answered in 4 sec' },
      briefing: { kind: 'brief', lines: ['6 jobs today, first at 8 AM', '2 leads booked overnight', '1 estimate needs your OK'] },
    } },
  health: { label: 'Health & dental', unit: 'patients', cands: ['noshow', 'after', 'answers', 'missed', 'reviews', 'winback', 'briefing', 'paperwork'],
    slots: ['8:30 AM Thursday', '3:15 PM Thursday'], pricing: 'it depends on your coverage, and our front desk checks your insurance before your visit',
    hints: ['dental', 'dentist', 'ortho', 'clinic', 'medical', 'chiro', 'physio', 'therapy', 'pediatric', 'derma', 'optom', 'vet', 'health', 'smile', 'family practice'],
    demo: {
      noshow: { kind: 'timeline', steps: ['Reminder 2 days before', 'Patient asks to move it', 'Moved to Friday 9 AM', 'Open chair filled from waitlist'] },
      after: { kind: 'chat', c: 'Cracked a tooth at dinner. Can I come in tomorrow?', r: "I'm sorry! We keep time for emergencies. 8:30 AM or 3:15 PM tomorrow?", res: 'Booked · 8:30 AM' },
      answers: { kind: 'chat', c: 'Do you take Delta Dental?', r: "Yes, we're in network with Delta Dental. Want to book a cleaning?", res: 'Answered in 3 sec' },
      missed: { kind: 'phone', c: 'Calling to book a cleaning', r: 'Happy to help! We have Thursday at 8:30 or 3:15. Which is better?', res: 'Visit booked' },
      reviews: { kind: 'review', svc: 'Cleaning & exam', rev: 'Gentle, on time, and so kind to my kids.' },
      winback: { kind: 'timeline', steps: ['Last cleaning: 7 months ago', '"Time for your checkup" text', 'Patient picks Tuesday', 'Booked'] },
      briefing: { kind: 'brief', lines: ['22 patients today, first at 7:30', '2 cancellations already refilled', '3 insurance checks need review'] },
      paperwork: { kind: 'timeline', steps: ['Visit finished', 'Notes turned into a summary', 'Insurance form drafted', 'Sent for your OK'] },
    } },
  auto: { label: 'Auto repair', unit: 'repairs', cands: ['after', 'missed', 'followup', 'winback', 'radar', 'reviews', 'noshow', 'answers'],
    slots: ['9 AM Saturday', '11:30 AM Saturday'], pricing: 'we diagnose it first and call you with an exact price before any work',
    hints: ['auto', 'motor', 'tire', 'brake', 'muffler', 'collision', 'car', 'truck', 'lube', 'transmission'],
    demo: {
      after: { kind: 'chat', c: 'Check engine light came on. Can you look Saturday?', r: 'Yes! We have 9 AM or 11:30 AM Saturday. Which works?', res: 'Booked · Sat 9 AM' },
      missed: { kind: 'phone', c: 'Brakes are grinding', r: 'We can fit you in tomorrow at 8 AM for a brake check. Okay?', res: 'Repair booked' },
      followup: { kind: 'timeline', steps: ['Estimate sent · Brake job', 'Day 2 · "Any questions?"', 'Day 5 · Offers a loaner car', 'Day 6 · Approved'] },
      winback: { kind: 'timeline', steps: ['Last oil change: 5 months ago', 'Friendly reminder text', 'Customer picks Tuesday', 'Booked'] },
      radar: { kind: 'trigger', trig: 'First snow forecast Friday', act: 'Texting customers due for winter tires', res: '38 tire swaps booked' },
      reviews: { kind: 'review', svc: 'Brake repair', rev: 'Honest, quick, and fair. Will be back.' },
      noshow: { kind: 'timeline', steps: ['Reminder sent the day before', 'Customer asks to move it', 'Moved to Thursday 10 AM', 'Open bay filled from waitlist'] },
      answers: { kind: 'chat', c: 'Do you work on hybrids?', r: 'We do! Our techs service most hybrid models. Want to book an inspection?', res: 'Answered in 3 sec' },
    } },
  salon: { label: 'Salon & spa', unit: 'bookings', cands: ['noshow', 'winback', 'after', 'reviews', 'radar', 'missed', 'answers', 'briefing'],
    slots: ['10 AM Saturday', '2 PM Saturday'], pricing: 'it depends on length and service, and your stylist confirms it at your consult',
    hints: ['salon', 'spa', 'hair', 'nail', 'beauty', 'lash', 'brow', 'barber', 'skin', 'wax', 'massage'],
    demo: {
      noshow: { kind: 'timeline', steps: ['Reminder sent the day before', 'Client asks to move it', 'Moved to Friday 3 PM', 'Empty chair filled from waitlist'] },
      winback: { kind: 'timeline', steps: ['Last cut: 7 weeks ago', '"Time for a refresh?" text', 'Client picks Saturday', 'Booked with Maya'] },
      after: { kind: 'chat', c: 'Can I get a balayage this Saturday?', r: 'Yes! Maya has 10 AM or 2 PM Saturday. Want one?', res: 'Booked · Sat 10 AM' },
      reviews: { kind: 'review', svc: 'Balayage', rev: 'Obsessed with my color. Maya is the best.' },
      radar: { kind: 'trigger', trig: 'Prom is 3 weeks away', act: 'Texting past updo clients', res: '26 appointments booked' },
      missed: { kind: 'phone', c: 'Need a cut before Friday', r: 'We have Thursday at 5:30 with Jess. Want it?', res: 'Appointment booked' },
      answers: { kind: 'chat', c: 'Do you do lash extensions?', r: 'We do! A full set takes about 2 hours. Want to see open times?', res: 'Answered in 3 sec' },
      briefing: { kind: 'brief', lines: ['14 appointments today', '2 cancellations already refilled', 'Low on toner: reorder?'] },
    } },
  restaurant: { label: 'Restaurant or café', unit: 'reservations', cands: ['after', 'noshow', 'answers', 'reviews', 'radar', 'missed', 'winback', 'briefing'],
    slots: ['7:15 tonight', '7:45 tonight'], pricing: 'our full menu with prices is on our site, and I can send you the link',
    hints: ['cafe', 'grill', 'kitchen', 'pizza', 'restaurant', 'bistro', 'bar', 'diner', 'bakery', 'taco', 'sushi', 'eats', 'coffee', 'brew'],
    demo: {
      after: { kind: 'chat', c: 'Table for 6 tonight around 7?', r: 'We have 7:15 on the patio or 7:30 inside. Which one?', res: 'Reserved · 7:15 PM' },
      noshow: { kind: 'timeline', steps: ['Reminder sent at noon', 'Guest confirms party of 4', 'Late cancel at 5 PM', 'Table refilled from waitlist'] },
      answers: { kind: 'chat', c: 'Do you have gluten-free options?', r: 'Yes! Our pasta and pizza both come gluten-free. Want a table?', res: 'Answered in 3 sec' },
      reviews: { kind: 'review', svc: 'Dinner for 4', rev: 'Best carbonara in town. Great service.' },
      radar: { kind: 'trigger', trig: 'Big game on Sunday', act: 'Texting regulars about catering trays', res: '19 catering orders' },
      missed: { kind: 'phone', c: 'Can I order for pickup?', r: "Of course! Here's our menu link. Want it ready by 6:30?", res: 'Order placed' },
      winback: { kind: 'timeline', steps: ['Last visit: 2 months ago', '"We miss you" offer text', 'Guest books Friday', 'Reserved'] },
      briefing: { kind: 'brief', lines: ['86 covers booked tonight', 'Patio fully reserved', '2 reviews need a reply'] },
    } },
  realestate: { label: 'Real estate', unit: 'showings', cands: ['after', 'missed', 'followup', 'radar', 'answers', 'reviews', 'briefing', 'paperwork'],
    slots: ['11 AM Saturday', '1 PM Saturday'], pricing: 'the listing price and details are on the listing page, and I can send it over',
    hints: ['realty', 'realtor', 'homes', 'properties', 'estate', 'realestate', 'broker', 'listings'],
    demo: {
      after: { kind: 'chat', c: 'Is the house on Maple St still available?', r: 'It is! I can book a showing Saturday at 11 or 1. Which works?', res: 'Showing booked · Sat 11 AM' },
      missed: { kind: 'phone', c: 'Thinking about selling my home', r: 'Great! Can I book a free home value call tomorrow at 10?', res: 'Consult booked' },
      followup: { kind: 'timeline', steps: ['Showing done · 42 Maple St', 'Day 1 · "What did you think?"', 'Day 4 · Sends similar listings', 'Day 6 · Second showing booked'] },
      radar: { kind: 'trigger', trig: 'Rates dropped 0.4% this week', act: 'Texting buyers who were waiting', res: '12 consults booked' },
      answers: { kind: 'chat', c: 'Is Maple St in the Lincoln school district?', r: "Yes, it's in Lincoln Elementary's area. Want to see it this week?", res: 'Answered in 4 sec' },
      reviews: { kind: 'review', svc: 'Home purchase', rev: 'Made our first home easy. Highly recommend.' },
      briefing: { kind: 'brief', lines: ['3 showings today', '5 new leads overnight, 2 hot', '1 offer deadline at 5 PM'] },
      paperwork: { kind: 'timeline', steps: ['Offer accepted', 'Checklist and dates drafted', 'Docs sent for signature', 'Signed in 1 day'] },
    } },
  fitness: { label: 'Fitness studio', unit: 'sign-ups', cands: ['winback', 'after', 'noshow', 'radar', 'missed', 'answers', 'reviews', 'briefing'],
    slots: ['6:30 AM tomorrow', '9 AM tomorrow'], pricing: 'your first class is free, and a coach walks you through membership options after',
    hints: ['fit', 'gym', 'yoga', 'pilates', 'crossfit', 'barre', 'cycle', 'boxing', 'martial', 'dance', 'strength'],
    demo: {
      winback: { kind: 'timeline', steps: ['Last visit: 3 weeks ago', '"We saved your spot" text', 'Member books Monday', 'Back in class'] },
      after: { kind: 'chat', c: 'Do you have a beginner class tomorrow?', r: 'Yes! Intro Strength at 6:30 or 9 AM. First class is free. Book it?', res: 'Booked · 9 AM class' },
      noshow: { kind: 'timeline', steps: ['Reminder 2 hours before', 'Member cancels late', 'Spot offered to waitlist', 'Class full again'] },
      radar: { kind: 'trigger', trig: 'January 1 is 2 weeks away', act: "Texting trial members who didn't join", res: '31 memberships started' },
      missed: { kind: 'phone', c: 'Do you have personal training?', r: 'We do! Coach Ana has a free intro session Thursday at 5. Want it?', res: 'Intro booked' },
      answers: { kind: 'chat', c: 'Can I freeze my membership?', r: 'Yes, up to 2 months a year. Want me to set it up?', res: 'Answered in 3 sec' },
      reviews: { kind: 'review', svc: 'HIIT class', rev: 'Best coaches. I actually look forward to 6 AM.' },
      briefing: { kind: 'brief', lines: ['9 classes today, 2 waitlisted', '4 trials booked overnight', '3 members at risk of quitting'] },
    } },
  retail: { label: 'Retail shop', unit: 'orders', cands: ['answers', 'after', 'winback', 'radar', 'reviews', 'missed', 'briefing', 'paperwork'],
    slots: ['pickup at 10 AM tomorrow', 'pickup at 4 PM tomorrow'], pricing: 'prices are listed on each product page, and I can send you the link',
    hints: ['shop', 'boutique', 'store', 'goods', 'supply', 'outfitters', 'market', 'gifts', 'wear', 'apparel'],
    demo: {
      answers: { kind: 'chat', c: 'Do you have the blue linen shirt in medium?', r: 'Yes, 2 left in medium! Want one held for pickup today?', res: 'Held for pickup' },
      after: { kind: 'chat', c: 'Can I pick up a gift tonight after 8?', r: 'We close at 8, but I can have it ready at 9 AM tomorrow. Okay?', res: 'Pickup scheduled' },
      winback: { kind: 'timeline', steps: ['Last purchase: 3 months ago', 'New arrivals in their size', 'Customer clicks through', 'Order placed'] },
      radar: { kind: 'trigger', trig: 'Holiday weekend ahead', act: 'Texting VIPs about early access', res: '64 orders placed' },
      reviews: { kind: 'review', svc: 'Online order', rev: 'Great quality, shipped fast. Love it.' },
      missed: { kind: 'phone', c: 'Is my order ready?', r: 'It is! Pick it up anytime before 8 PM today.', res: 'Question solved' },
      briefing: { kind: 'brief', lines: ['Yesterday: 41 orders', '3 items low on stock', '1 return needs your OK'] },
      paperwork: { kind: 'timeline', steps: ['Order shipped', 'Tracking email sent', 'Thank-you note with care tips', 'Repeat order in 30 days'] },
    } },
  other: { label: 'Something else', unit: 'clients', cands: ['after', 'missed', 'followup', 'answers', 'reviews', 'briefing', 'paperwork', 'radar'],
    slots: ['2 PM tomorrow', '4 PM tomorrow'], pricing: 'it depends on what you need, and we can go over it on a quick call',
    hints: [],
    demo: {
      after: { kind: 'chat', c: 'Can someone call me back about getting started?', r: 'Absolutely. I can book a call at 2 PM or 4 PM tomorrow. Which works?', res: 'Call booked · 2 PM' },
      missed: { kind: 'phone', c: 'Question about your services', r: 'Happy to help! Want a quick call at 3 PM today?', res: 'Call booked' },
      followup: { kind: 'timeline', steps: ['Proposal sent', 'Day 2 · "Any questions?"', 'Day 6 · Shares a client story', 'Day 8 · Signed'] },
      answers: { kind: 'chat', c: 'How long does onboarding take?', r: 'Usually about a week. Want me to book a quick intro call?', res: 'Answered in 4 sec' },
      reviews: { kind: 'review', svc: 'Project wrap-up', rev: 'Easy to work with and fast. Recommend.' },
      briefing: { kind: 'brief', lines: ['4 calls today, first at 9', '3 new inquiries overnight', '1 invoice is overdue'] },
      paperwork: { kind: 'timeline', steps: ['Project marked done', 'Invoice drafted from notes', 'Sent with payment link', 'Paid in 3 days'] },
      radar: { kind: 'trigger', trig: 'Slow season starts next month', act: 'Texting past clients a check-in offer', res: '18 consults booked' },
    } },
};

export const GENERIC_DEMO: DemoMap = {
  noshow: { kind: 'timeline', steps: ['Reminder sent the day before', 'Customer asks to move it', 'Rebooked by text', 'Empty slot filled from waitlist'] },
  winback: { kind: 'timeline', steps: ['No visit in 3 months', 'Friendly check-in text', 'Customer picks a time', 'Booked'] },
  dispatch: { kind: 'map', job: 'Urgent job' },
};

export const INDUSTRY_IDS = Object.keys(IND) as IndustryId[];
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
export const PAIN_IDS = Object.keys(PAINS) as PainId[];
export const MODULE_TYPES = Object.keys(TYPES) as ModuleType[];
