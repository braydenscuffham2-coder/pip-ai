// Finds the customer-facing tools a site already runs, from script tags, iframes and links.
import type { DetectedTool, ToolId } from '../types';

const SIGS: { id: ToolId; vendor: string; re: RegExp }[] = [
  // Chat widgets and AI chat
  { id: 'chatbot', vendor: 'Intercom', re: /widget\.intercom\.io|intercomSettings/i },
  { id: 'chatbot', vendor: 'Drift', re: /js\.driftt\.com|drift\.load/i },
  { id: 'chatbot', vendor: 'Tawk.to', re: /embed\.tawk\.to/i },
  { id: 'chatbot', vendor: 'LiveChat', re: /cdn\.livechatinc\.com/i },
  { id: 'chatbot', vendor: 'Crisp', re: /client\.crisp\.chat/i },
  { id: 'chatbot', vendor: 'Tidio', re: /code\.tidio\.co/i },
  { id: 'chatbot', vendor: 'Zendesk chat', re: /static\.zdassets\.com|zopim/i },
  { id: 'chatbot', vendor: 'HubSpot chat', re: /js\.usemessages\.com|hs-scripts\.com/i },
  { id: 'chatbot', vendor: 'Olark', re: /static\.olark\.com/i },
  { id: 'chatbot', vendor: 'Podium webchat', re: /connect\.podium\.com|podium-widget/i },
  { id: 'chatbot', vendor: 'Birdeye webchat', re: /birdeye\.com\/embed|birdeye-webchat/i },
  { id: 'chatbot', vendor: 'Freshchat', re: /wchat\.freshchat\.com/i },
  { id: 'chatbot', vendor: 'Gorgias chat', re: /config\.gorgias\.chat/i },
  { id: 'chatbot', vendor: 'Facebook Messenger chat', re: /connect\.facebook\.net\/[^"']+\/sdk\/xfbml\.customerchat/i },
  { id: 'chatbot', vendor: 'Chatbase', re: /chatbase\.co\/embed/i },
  { id: 'chatbot', vendor: 'Voiceflow', re: /cdn\.voiceflow\.com/i },
  { id: 'chatbot', vendor: 'GoHighLevel chat', re: /widgets\.leadconnectorhq\.com|msgsndr\.com/i },
  { id: 'chatbot', vendor: 'Weave webchat', re: /getweave\.com\/.*(chat|widget)/i },
  // AI or answering phone services
  { id: 'phone', vendor: 'Smith.ai', re: /smith\.ai/i },
  { id: 'phone', vendor: 'Ruby', re: /ruby\.com\/(chat|receptionist)/i },
  { id: 'phone', vendor: 'Goodcall', re: /goodcall\.com/i },
  { id: 'phone', vendor: 'Rosie', re: /heyrosie\.com/i },
  // Online booking
  { id: 'booking', vendor: 'Calendly', re: /calendly\.com/i },
  { id: 'booking', vendor: 'Acuity', re: /acuityscheduling\.com|as\.me\//i },
  { id: 'booking', vendor: 'Square Appointments', re: /squareup\.com\/appointments|square\.site\/book/i },
  { id: 'booking', vendor: 'Vagaro', re: /vagaro\.com/i },
  { id: 'booking', vendor: 'Mindbody', re: /mindbodyonline\.com|healcode\.com/i },
  { id: 'booking', vendor: 'Booksy', re: /booksy\.com/i },
  { id: 'booking', vendor: 'Fresha', re: /fresha\.com/i },
  { id: 'booking', vendor: 'Housecall Pro', re: /housecallpro\.com/i },
  { id: 'booking', vendor: 'ServiceTitan', re: /servicetitan\.com|scheduler\.servicetitan/i },
  { id: 'booking', vendor: 'Jobber', re: /getjobber\.com|clienthub\.getjobber/i },
  { id: 'booking', vendor: 'OpenTable', re: /opentable\.com/i },
  { id: 'booking', vendor: 'Resy', re: /resy\.com/i },
  { id: 'booking', vendor: 'Tock', re: /exploretock\.com/i },
  { id: 'booking', vendor: 'Zocdoc', re: /zocdoc\.com/i },
  { id: 'booking', vendor: 'NexHealth', re: /nexhealth\.com/i },
  { id: 'booking', vendor: 'LocalMed', re: /localmed\.com/i },
  { id: 'booking', vendor: 'Setmore', re: /setmore\.com/i },
  { id: 'booking', vendor: 'SimplyBook', re: /simplybook\.(me|it)/i },
  { id: 'booking', vendor: 'Booker', re: /booker\.com/i },
  { id: 'booking', vendor: 'Schedulicity', re: /schedulicity\.com/i },
  { id: 'booking', vendor: 'Glofox', re: /glofox\.com/i },
  { id: 'booking', vendor: 'Toast online ordering', re: /order\.toasttab\.com/i },
  { id: 'booking', vendor: 'ShowingTime', re: /showingtime\.com/i },
  { id: 'booking', vendor: 'Tekmetric', re: /tekmetric\.com/i },
  // Review requests
  { id: 'reviewsTool', vendor: 'Birdeye', re: /birdeye\.com/i },
  { id: 'reviewsTool', vendor: 'Podium', re: /podium\.com/i },
  { id: 'reviewsTool', vendor: 'NiceJob', re: /nicejob\.(co|com)/i },
  { id: 'reviewsTool', vendor: 'Grade.us', re: /grade\.us/i },
  { id: 'reviewsTool', vendor: 'Trustpilot', re: /widget\.trustpilot\.com/i },
  { id: 'reviewsTool', vendor: 'Elfsight reviews', re: /elfsight.*(review|google)/i },
  { id: 'reviewsTool', vendor: 'Yotpo', re: /yotpo\.com/i },
  { id: 'reviewsTool', vendor: 'Judge.me', re: /judge\.me/i },
  // Automated email and texts
  { id: 'emails', vendor: 'Mailchimp', re: /chimpstatic\.com|list-manage\.com|mailchimp/i },
  { id: 'emails', vendor: 'Klaviyo', re: /klaviyo\.com/i },
  { id: 'emails', vendor: 'Constant Contact', re: /constantcontact\.com|ctctcdn\.com/i },
  { id: 'emails', vendor: 'ActiveCampaign', re: /activehosted\.com|trackcmp\.net/i },
  { id: 'emails', vendor: 'HubSpot forms', re: /js\.hsforms\.net/i },
  { id: 'emails', vendor: 'Mailerlite', re: /mailerlite\.com/i },
];

/** Finds known tools in the raw HTML of the crawled pages. One entry per vendor. */
export function detectTools(pages: { url: string; html: string }[]): DetectedTool[] {
  const out: DetectedTool[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const path = (() => { try { return new URL(p.url).pathname; } catch { return '/'; } })();
    const where = path === '/' ? 'homepage' : path.replace(/\/$/, '');
    for (const s of SIGS) {
      if (seen.has(s.vendor) || !s.re.test(p.html)) continue;
      // A link to a big platform is weaker than its script; say which we saw.
      const asScript = new RegExp(`<script[^>]+(?:${s.re.source})`, 'i').test(p.html) || new RegExp(`<iframe[^>]+(?:${s.re.source})`, 'i').test(p.html);
      seen.add(s.vendor);
      out.push({ id: s.id, vendor: s.vendor, evidence: `${asScript ? 'widget' : 'link'} on ${where}` });
    }
  }
  // Podium and Birdeye count once each: keep the review tool and the chat entry, nothing more.
  return out.slice(0, 8);
}
