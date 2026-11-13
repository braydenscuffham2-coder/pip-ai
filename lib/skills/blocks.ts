// The building blocks every skill is made from. A Skill Spec may only use blocks listed here.
// `status` says whether the runtime can run it today:
//   ready        - works now, no outside account needed beyond the owner's contact details
//   needs_setup  - built, but the owner or you must connect or register something first
//   coming_soon  - not built yet; skills that need it are queued, never promised
export type BlockKind = 'channel' | 'trigger' | 'connection' | 'action' | 'knowledge';
export type BlockStatus = 'ready' | 'needs_setup' | 'coming_soon';

export interface Block {
  kind: BlockKind;
  label: string;
  status: BlockStatus;
  /** Pricing tier this block pushes a skill into (1 Answer, 2 Act, 3 Voice / multi-system). */
  tier: 1 | 2 | 3;
  /** What the owner (or you) must do before it runs. */
  setup?: string;
}

export const BLOCKS = {
  // channels
  web_chat: { kind: 'channel', label: 'Web chat widget', status: 'ready', tier: 1, setup: 'Paste one line onto the website' },
  sms: { kind: 'channel', label: 'Text messages', status: 'coming_soon', tier: 2, setup: 'Texting number and US carrier registration' },
  email: { kind: 'channel', label: 'Email', status: 'coming_soon', tier: 2, setup: 'Verify the sending domain' },
  voice: { kind: 'channel', label: 'Phone calls', status: 'coming_soon', tier: 3, setup: 'Forward missed calls to a new number' },
  // triggers
  inbound_message: { kind: 'trigger', label: 'A customer writes in', status: 'ready', tier: 1 },
  schedule: { kind: 'trigger', label: 'On a schedule', status: 'coming_soon', tier: 2 },
  record_change: { kind: 'trigger', label: 'Something changes in their software', status: 'coming_soon', tier: 2, setup: 'Connect their booking or job software' },
  outside_signal: { kind: 'trigger', label: 'Weather, dates or local events', status: 'coming_soon', tier: 2 },
  // connections
  calendar: { kind: 'connection', label: 'Calendar', status: 'coming_soon', tier: 2, setup: 'Sign in to Google Calendar or Outlook' },
  field_service: { kind: 'connection', label: 'Booking / job software', status: 'coming_soon', tier: 2, setup: 'Connect Housecall Pro, Jobber, ServiceTitan or Square' },
  google_profile: { kind: 'connection', label: 'Google Business Profile', status: 'coming_soon', tier: 2, setup: 'Sign in to Google Business Profile' },
  sheets: { kind: 'connection', label: 'Google Sheet', status: 'coming_soon', tier: 2, setup: 'Share a sheet' },
  // actions (also the tools an agent may call)
  capture_lead: { kind: 'action', label: 'Save a lead', status: 'ready', tier: 1 },
  request_booking: { kind: 'action', label: 'Ask for a time (owner confirms)', status: 'ready', tier: 1 },
  notify_owner: { kind: 'action', label: 'Alert the owner', status: 'ready', tier: 1, setup: "Owner's email or phone" },
  handoff: { kind: 'action', label: 'Hand the conversation to a person', status: 'ready', tier: 1 },
  draft_for_approval: { kind: 'action', label: 'Draft for the owner to approve', status: 'ready', tier: 1 },
  create_job: { kind: 'action', label: 'Create a job in their software', status: 'coming_soon', tier: 2, setup: 'Connect their job software' },
  send_text: { kind: 'action', label: 'Send a text', status: 'coming_soon', tier: 2, setup: 'Texting number' },
  // knowledge
  brain: { kind: 'knowledge', label: 'Business brain', status: 'ready', tier: 1 },
} as const satisfies Record<string, Block>;

export type BlockId = keyof typeof BLOCKS;
export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];
export const ofKind = (k: BlockKind) => BLOCK_IDS.filter(id => BLOCKS[id].kind === k);
export const TOOL_IDS = ofKind('action');

/** Short list for prompts: what the model may build with, and what's not available yet. */
export function blocksForPrompt(): string {
  return BLOCK_IDS.map(id => { const b: Block = BLOCKS[id]; return `- ${id} (${b.kind}): ${b.label}. ${b.status === 'ready' ? 'Available now.' : b.status === 'needs_setup' ? `Available after setup: ${b.setup}.` : 'NOT available yet.'}`; }).join('\n');
}
