// Shapes for the sidebar presentation. Everything here is written by the model for one business.
import type { IndustryId } from '@/lib/types';
import type { Raw } from '@/lib/server/gather';

export const ICONS = ['night', 'missed', 'quote', 'season', 'review', 'dispatch', 'answers', 'noshow', 'winback', 'briefing', 'paperwork', 'check', 'globe', 'page', 'chip', 'pin', 'store'] as const;
export type IconName = (typeof ICONS)[number];

export const CATEGORIES = ['Leads', 'Bookings', 'Customers', 'Reviews', 'Sales', 'Operations', 'Marketing', 'Admin'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface AiItem {
  /** What it is, e.g. "Housecall Pro booking" or "Phone line". */
  name: string;
  kind: 'ai' | 'tool' | 'manual';
  does: string;
  misses: string;
}

export interface Theme { label: string; count: number; quote?: string; sentiment: 'negative' | 'positive' }
export interface Rival { name: string; rating?: number; distanceMi?: number; edge?: string }

export interface Understanding {
  name: string;
  industry: IndustryId;
  oneLiner: string;
  services: string[];
  customers: string;
  area?: string;
  hours?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  facts: string[];
  aiToday: { score: number; verdict: string; items: AiItem[]; gaps: { area: string; detail: string }[] };
  reviews: { summary: string; themes: Theme[]; sample: number };
  competition: { summary: string; rivals: Rival[] };
  narration: { who: string; ai: string; reviews: string; competition: string };
}

export type Demo =
  | { kind: 'chat'; opener: string; persona: string }
  | { kind: 'flow'; steps: { at: string; text: string }[] }
  | { kind: 'message'; channel: 'text' | 'email'; to: string; subject?: string; body: string }
  | { kind: 'brief'; title: string; lines: string[] };

export interface Skill {
  id: string;
  name: string;
  tagline: string;
  category: Category;
  icon: IconName;
  why: string;
  evidence: { source: 'review' | 'site' | 'competitor' | 'google' | 'owner'; text: string }[];
  how: string[];
  impact: string;
  connects: string[];
  demo: Demo;
  match: number;
  effort: string;
  /** True when the owner asked for it with "Create anything". */
  custom?: boolean;
}

export interface Brief {
  domain: string | null;
  raw: Raw;
  und: Understanding;
  skills: Skill[];
  narration: { upgrades: string; build: string };
  at: string;
}
