// Shared types for the Pip frontend and its API. The backend must return these shapes.

export type IndustryId = 'home' | 'health' | 'auto' | 'salon' | 'restaurant' | 'realestate' | 'fitness' | 'retail' | 'other';
export type ToolId = 'chatbot' | 'phone' | 'chatgpt' | 'booking' | 'reviewsTool' | 'emails' | 'none';
export type PainId = 'leads' | 'scheduling' | 'quotes' | 'questions' | 'reviews' | 'admin';
export type AreaId = 'leads' | 'scheduling' | 'followup' | 'questions' | 'reviews' | 'admin';
export type ModuleType =
  | 'after' | 'missed' | 'answers' | 'followup' | 'noshow' | 'winback'
  | 'radar' | 'reviews' | 'dispatch' | 'briefing' | 'paperwork';
export type DemoKind = 'chat' | 'phone' | 'timeline' | 'trigger' | 'review' | 'map' | 'brief';

/** "live" = real scan data. "preview" = stand-in data; the UI labels it as such. */
export type DataSource = 'live' | 'preview';

export interface DetectedTool {
  id: ToolId;
  /** Product or widget name as found on the site, e.g. "Chat widget" or a vendor name. */
  vendor?: string;
  /** Where it was found, e.g. "script on homepage". */
  evidence?: string;
}

export interface ReviewTheme {
  label: string;
  count: number;
  quote?: string;
  sentiment: 'negative' | 'positive';
  /** Which area this theme is evidence for. */
  relates?: AreaId;
}

export interface Competitor {
  name: string;
  rating?: number;
  distanceMi?: number;
  /** A capability they have that this business lacks, e.g. "answers after hours". */
  note?: string;
}

export interface Profile {
  name: string;
  site?: string;
  industry: IndustryId;
  desc?: string;
  services: string[];
  hours?: string;
  area?: string;
  phone?: string;
  /** Tools in use. Detected ones plus any the owner confirms. */
  tools: ToolId[];
  detected: DetectedTool[];
  pains: PainId[];
  rating?: number;
  reviewCount?: number;
  themes: ReviewTheme[];
  competitors: Competitor[];
  /** Personalization written for this business from its own site, reviews and market. */
  kit?: Kit;
}

/** Copy Pip writes for one module, grounded in the business's real details. */
export interface ModuleCopy {
  line?: string;
  why?: string;
  demo?: Demo;
}

/** Everything Pip says and shows that is specific to one business. Every field is optional:
 *  the UI falls back to the industry defaults for anything missing. */
export interface Kit {
  /** One sentence describing the business the way its owner would. */
  summary?: string;
  /** Short, true, specific details from the site (e.g. "Family owned since 1987"). */
  facts?: string[];
  /** Two realistic openings the receptionist offers, in the business's own terms. */
  slots?: [string, string];
  /** How the business handles price questions, from its own site. */
  pricing?: string;
  /** What customers actually call about, in their words. */
  asks?: string[];
  /** Pip's narration for the presentation, one line per slide. */
  say?: { report?: string; market?: string; build?: string };
  modules?: Partial<Record<ModuleType, ModuleCopy>>;
}

/** Streamed by POST /api/scan as newline-delimited JSON, one event per line. */
export type ScanEvent =
  | { type: 'meta'; source: DataSource }
  | { type: 'status'; message: string; progress: number }
  | { type: 'page'; url: string; title: string }
  | { type: 'fact'; key: 'name' | 'industry' | 'services' | 'hours' | 'area' | 'phone'; label: string; value: string }
  | { type: 'tech'; tool: DetectedTool; label: string }
  | { type: 'reviews'; rating: number; count: number; themes: ReviewTheme[]; /** How many reviews the themes were read from. */ sample?: number }
  | { type: 'competitor'; competitor: Competitor }
  | { type: 'done'; profile: Profile; source: DataSource }
  | { type: 'kit'; kit: Kit }
  | { type: 'error'; message: string; code?: 'unreachable' | 'invalid_url' | 'blocked' | 'internal' | 'needs_app' };

export type Demo =
  | { kind: 'chat'; c: string; r: string; res: string }
  | { kind: 'phone'; c: string; r: string; res: string }
  | { kind: 'timeline'; steps: string[] }
  | { kind: 'trigger'; trig: string; act: string; res: string }
  | { kind: 'review'; svc: string; rev: string }
  | { kind: 'map'; job: string }
  | { kind: 'brief'; lines: string[] };

export interface Module {
  type: ModuleType;
  name: string;
  line: string;
  /** Evidence for this business, e.g. "9 reviews mention slow callbacks". */
  why?: string;
  /** Something it connects to that the business already uses. */
  worksWith?: string;
  match: number;
  impact: string;
  demo: Demo;
  uses: string[];
}

export interface HaveItem {
  tool: ToolId;
  label: string;
  does: string;
  limit: string;
}

export interface Report {
  score: number;
  areas: Record<AreaId, number>;
  gap: AreaId;
  headline: string;
  insight?: string;
  have: HaveItem[];
  overlap?: string;
  competitorNote?: string;
}

export interface RecommendResponse {
  report: Report;
  modules: Module[];
  source: DataSource;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  source: DataSource;
}

export interface LeadRequest {
  name: string;
  contact: string;
  profile: Profile;
  modules: ModuleType[];
}

export interface LeadResponse {
  ok: boolean;
  id?: string;
  error?: string;
}
