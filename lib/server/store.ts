// Supabase storage through locked-down database functions. Every call needs PIP_SERVER_SECRET,
// so the public key alone can't read or write anything. All functions fail soft.
import type { Profile } from '../types';
import type { Raw } from './gather';

const URL_ = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_ANON_KEY;
const SECRET = () => process.env.PIP_SERVER_SECRET;
export const storeEnabled = () => !!(URL_() && KEY() && SECRET());

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!storeEnabled()) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${URL_()}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY()!, authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({ p_secret: SECRET(), ...args }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[store]', fn, res.status, (await res.text()).slice(0, 200)); return null; }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (e) {
    console.error('[store]', fn, String(e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface Cached { raw: Raw; profile: Profile; used_model: boolean; created_at: string }

export const getScan = (domain: string, maxAgeHours = 168) => rpc<Cached>('pip_scan_get', { p_domain: domain, p_max_age_hours: maxAgeHours });
export const putScan = (domain: string, raw: Raw, profile: Profile, usedModel: boolean) =>
  rpc<null>('pip_scan_put', { p_domain: domain, p_raw: raw, p_profile: profile, p_used_model: usedModel });
export const addLead = (name: string, contact: string, profile: Profile, modules: string[]) =>
  rpc<string>('pip_lead_add', { p_name: name, p_contact: contact, p_business: profile.name, p_site: profile.site || null, p_modules: modules, p_profile: profile });
export const logEvent = (kind: string, domain: string | null, detail: Record<string, unknown> = {}) =>
  rpc<null>('pip_event', { p_kind: kind, p_domain: domain, p_detail: detail });
