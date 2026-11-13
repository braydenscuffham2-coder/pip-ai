import { isModuleType, sanitizeProfile } from '@/lib/engine';
import { bad, json, readJson } from '@/lib/server/http';
import { addLead, storeEnabled } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads  { name, contact, profile, modules }  ->  LeadResponse
 * Preview implementation logs the lead. The real backend stores it and notifies the team.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJson(req); } catch { return bad('bad_request'); }
  const b = (body || {}) as { name?: unknown; contact?: unknown; profile?: unknown; modules?: unknown };
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  const contact = typeof b.contact === 'string' ? b.contact.trim().slice(0, 120) : '';
  const okContact = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact) || contact.replace(/\D/g, '').length >= 10;
  const profile = sanitizeProfile(b.profile);
  if (!name) return bad('missing_name');
  if (!okContact) return bad('invalid_contact');
  if (!profile) return bad('invalid_profile');
  const modules = (Array.isArray(b.modules) ? b.modules : []).filter(isModuleType).slice(0, 11);
  if (storeEnabled()) {
    const id = await addLead(name, contact, profile, modules);
    if (!id) return bad('save_failed', 503);
    await notify(name, contact, profile.name, profile.site, modules);
    return json({ ok: true, id });
  }
  const id = 'lead_' + Math.random().toString(36).slice(2, 10);
  console.log('[lead:preview]', JSON.stringify({ id, name, contact, business: profile.name, site: profile.site, modules }));
  return json({ ok: true, id });
}

/** Optional: posts new leads to a webhook (Slack, Zapier, email relay). */
async function notify(name: string, contact: string, business: string, site: string | undefined, modules: string[]) {
  const url = process.env.LEAD_NOTIFY_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `New Pip lead: ${name} (${contact}) for ${business}${site ? ` · ${site}` : ''}. Build: ${modules.join(', ') || 'none'}` }) });
  } catch { /* the lead is saved either way */ }
}
