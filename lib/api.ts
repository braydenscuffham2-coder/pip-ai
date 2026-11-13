'use client';
import type { ChatResponse, ChatTurn, LeadResponse, ModuleType, Profile, RecommendResponse, ScanEvent } from './types';

export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    let code = 'request_failed';
    try { code = (await res.json()).error || code; } catch { /* keep default */ }
    throw new ApiError(code, res.status);
  }
  return res.json() as Promise<T>;
}

/** Streams scan events. Resolves when the stream ends. */
export async function scanSite(url: string, onEvent: (e: ScanEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }), signal });
  if (!res.ok || !res.body) {
    let code = 'scan_failed';
    try { code = (await res.json()).error || code; } catch { /* keep default */ }
    throw new ApiError(code, res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line) as ScanEvent); } catch { /* skip a malformed line */ }
    }
  }
  if (buf.trim()) { try { onEvent(JSON.parse(buf) as ScanEvent); } catch { /* ignore */ } }
}

export const getRecommendations = (profile: Profile, signal?: AbortSignal) =>
  post<RecommendResponse>('/api/recommend', { profile }, signal);

export const askPip = (messages: ChatTurn[], profile: Profile | null, modules: ModuleType[]) =>
  post<ChatResponse>('/api/chat', { messages, profile, modules });

export const demoReply = (profile: Profile, module: ModuleType, messages: ChatTurn[]) =>
  post<ChatResponse>('/api/demo', { profile, module, messages });

export const submitLead = (name: string, contact: string, profile: Profile, modules: ModuleType[]) =>
  post<LeadResponse>('/api/leads', { name, contact, profile, modules });
