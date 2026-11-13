// Signals about the tools a business uses beyond what its web pages load: public DNS records
// (domain verifications, email provider, email-sending services), social profiles, and the way
// the business talks about itself. All public information; nothing here contacts the business.
export interface Signal {
  /** Where we saw it. */
  source: 'dns' | 'email' | 'site_text' | 'social';
  /** Product or company. */
  name: string;
  /** What it means for AI, in plain words. */
  meaning: string;
  /** "confirmed" = in use; "available" = included in something they pay for, use unknown. */
  strength: 'confirmed' | 'available' | 'hint';
  evidence: string;
}

export interface Signals { items: Signal[]; socials: { network: string; url: string }[] }

const TXT: [RegExp, string, string, Signal['strength']][] = [
  [/^openai-domain-verification=/i, 'OpenAI', 'Their domain is verified with OpenAI, usually for ChatGPT Team or Enterprise, or API use', 'confirmed'],
  [/^anthropic-domain-verification/i, 'Anthropic (Claude)', 'Their domain is verified with Anthropic, usually for a Claude team plan or API use', 'confirmed'],
  [/^MS=/i, 'Microsoft 365', 'They use Microsoft 365, which can include Copilot', 'available'],
  [/^facebook-domain-verification=/i, 'Meta Business', 'They run a verified Meta business account (Facebook or Instagram ads and messaging)', 'confirmed'],
  [/^hubspot-developer-verification=/i, 'HubSpot', 'They use HubSpot, which has AI and chatbot features', 'confirmed'],
  [/^atlassian-domain-verification=/i, 'Atlassian', 'They use Atlassian tools (Jira or Confluence)', 'confirmed'],
  [/^ZOOM_verify_/i, 'Zoom', 'They use Zoom, which includes an AI meeting assistant', 'available'],
  [/^docusign=/i, 'DocuSign', 'They send documents for e-signature', 'confirmed'],
  [/^slack-domain-verification=/i, 'Slack', 'Their team uses Slack', 'confirmed'],
  [/^stripe-verification=/i, 'Stripe', 'They take payments online with Stripe', 'confirmed'],
  [/^adobe-idp-site-verification=/i, 'Adobe', 'They use Adobe business tools', 'confirmed'],
  [/^apple-domain-verification=/i, 'Apple Business', 'They use Apple business services', 'confirmed'],
  [/^zapier-domain-verification/i, 'Zapier', 'They connect tools with Zapier automations', 'confirmed'],
];

const SPF: [RegExp, string, string][] = [
  [/sendgrid\.net/i, 'SendGrid', 'Sends automated emails from their software'],
  [/mailgun\.org/i, 'Mailgun', 'Sends automated emails from their software'],
  [/amazonses\.com/i, 'Amazon SES', 'Sends automated emails from their software'],
  [/(mcsv\.net|mandrillapp\.com)/i, 'Mailchimp', 'Sends email campaigns'],
  [/hubspotemail\.net/i, 'HubSpot', 'Sends marketing or sales emails through HubSpot'],
  [/zendesk\.com/i, 'Zendesk', 'Handles customer support email in Zendesk'],
  [/_spf\.salesforce\.com/i, 'Salesforce', 'Sends email from Salesforce'],
  [/klaviyo/i, 'Klaviyo', 'Sends automated marketing emails'],
  [/constantcontact\.com/i, 'Constant Contact', 'Sends email campaigns'],
  [/helpscoutemail\.com/i, 'Help Scout', 'Handles customer support email'],
  [/intercom\.io/i, 'Intercom', 'Sends support or marketing email from Intercom'],
  [/freshdesk\.com/i, 'Freshdesk', 'Handles customer support email in Freshdesk'],
  [/servicetitan/i, 'ServiceTitan', 'Sends job emails from ServiceTitan'],
  [/(jobber|getjobber)/i, 'Jobber', 'Sends job emails from Jobber'],
  [/housecallpro/i, 'Housecall Pro', 'Sends job emails from Housecall Pro'],
];

const MX: [RegExp, string, string][] = [
  [/google\.com|googlemail\.com/i, 'Google Workspace', 'Their email runs on Google Workspace, which can include Gemini'],
  [/outlook\.com|protection\.outlook/i, 'Microsoft 365', 'Their email runs on Microsoft 365, which can include Copilot'],
  [/secureserver\.net/i, 'GoDaddy email', 'Their email is hosted by GoDaddy'],
  [/zoho/i, 'Zoho Mail', 'Their email runs on Zoho, which has its own AI assistant'],
];

const AI_WORDS = /\b(ai[- ]powered|artificial intelligence|virtual (assistant|receptionist)|chat ?bot|answering service|24\/7 (online )?(booking|scheduling)|text us|book online|online booking|schedule online)\b/gi;

async function dns(name: string, type: 'TXT' | 'MX'): Promise<string[]> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const j = (await res.json()) as { Answer?: { data?: string }[] };
    return (j.Answer || []).map(a => String(a.data || '').replace(/^"|"$/g, '').replace(/" "/g, ''));
  } catch { return []; }
}

const SOCIAL: [RegExp, string][] = [
  [/https?:\/\/(www\.)?facebook\.com\/(?!sharer|dialog|plugins|tr\b)[\w.\-/%]+/i, 'Facebook'],
  [/https?:\/\/(www\.)?instagram\.com\/[\w.\-]+/i, 'Instagram'],
  [/https?:\/\/(www\.)?yelp\.com\/biz\/[\w\-]+/i, 'Yelp'],
  [/https?:\/\/(www\.)?nextdoor\.com\/[\w\-/]+/i, 'Nextdoor'],
  [/https?:\/\/(www\.)?linkedin\.com\/company\/[\w\-]+/i, 'LinkedIn'],
  [/https?:\/\/(www\.)?tiktok\.com\/@[\w.\-]+/i, 'TikTok'],
  [/https?:\/\/(www\.)?youtube\.com\/(@|channel\/|c\/)[\w\-]+/i, 'YouTube'],
  [/https?:\/\/(www\.)?(bbb\.org)\/[\w\-/]+/i, 'BBB'],
  [/https?:\/\/(www\.)?angi\.com\/[\w\-/]+/i, 'Angi'],
];

export async function findSignals(domain: string, pages: { html?: string; text: string }[]): Promise<Signals> {
  const items: Signal[] = [];
  const [txt, mx] = await Promise.all([dns(domain, 'TXT'), dns(domain, 'MX')]);
  for (const r of txt) {
    for (const [re, name, meaning, strength] of TXT) if (re.test(r)) items.push({ source: 'dns', name, meaning, strength, evidence: 'Domain verification record' });
    if (/^v=spf1/i.test(r)) for (const [re, name, meaning] of SPF) if (re.test(r)) items.push({ source: 'email', name, meaning, strength: 'confirmed', evidence: 'Allowed to send email for their domain' });
  }
  for (const r of mx) for (const [re, name, meaning] of MX) if (re.test(r)) items.push({ source: 'email', name, meaning, strength: 'available', evidence: 'Their email server' });

  const html = pages.map(p => p.html || '').join('\n');
  const socials: Signals['socials'] = [];
  for (const [re, network] of SOCIAL) { const m = html.match(re); if (m && !socials.some(s => s.network === network)) socials.push({ network, url: m[0].replace(/["'<>].*$/, '') }); }

  const text = pages.map(p => p.text).join('\n');
  const found = new Map<string, string>();
  for (const m of text.matchAll(AI_WORDS)) {
    const k = m[0].toLowerCase();
    if (found.has(k)) continue;
    const i = m.index || 0;
    found.set(k, text.slice(Math.max(0, i - 50), i + m[0].length + 50).replace(/\s+/g, ' ').trim());
  }
  for (const [k, ctx] of Array.from(found).slice(0, 5)) items.push({ source: 'site_text', name: `Says "${k}"`, meaning: 'How the business describes itself on its site', strength: 'hint', evidence: ctx });

  // One entry per product, strongest first.
  const rank = { confirmed: 0, available: 1, hint: 2 } as const;
  const seen = new Set<string>();
  const uniq = items.sort((a, b) => rank[a.strength] - rank[b.strength]).filter(s => !seen.has(s.name) && !!seen.add(s.name));
  return { items: uniq.slice(0, 14), socials: socials.slice(0, 6) };
}
