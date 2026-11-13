// Pip's rival deep-read: what each competitor's own homepage says and lets a customer do.
// Started after a scan (the competitor list comes from that scan's saved Google read in site_builds),
// stored as the "rivals" part on the same row, read back with ?poll=1. Pip reaches it through the
// Claude browser (navigate + get_page_text), the same way it reads the scan.
// Public sites only, short timeouts, capped sizes. Only facts the pages themselves contain.
// Google PageSpeed (mobile) for each site uses the PAGESPEED_API_KEY secret, or else the GOOGLE_PLACES_API_KEY
// secret site-kit already uses for its own speed test (PageSpeed is turned on for that key's Google project).

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PipScanner/1.0";
const HTML_MAX = 1_500_000;
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PSI_KEY = Deno.env.get("PAGESPEED_API_KEY") || Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// ---------- the parser (pure, no network) ----------
// Everything it returns is something the page itself contains; claims carry a short quote of their own words.

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", reg: "®", trade: "™", copy: "©" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m: string, e: string) => { try { return e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m; } catch { return m; } });

// the words a visitor can read (no scripts, styles, menus' hidden markup)
function visibleText(html: string) {
  let b = html.slice(Math.max(0, html.search(/<body\b/i)));
  b = b.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  b = b.replace(/<(br|p|div|li|h[1-6]|section|header|footer|tr|td|a|button|span)\b[^>]*>/gi, " ");
  return decode(b.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------- claims, in their own words ----------
const CLAIMS = [
  { id: "open247", label: "24/7", re: /\b24\s*\/\s*7\b|\b24 hours a day\b|\bopen 24 hours\b|\baround[- ]the[- ]clock\b|\b24\/7\/365\b|\b24[- ]?h(ou)?r (emergency )?(service|availability)\b|\b24h availability\b/i },
  { id: "emergency", label: "Emergency service", re: /\bemergency (service|services|repairs?|plumb\w*|dent\w*|care|appointments?|calls?)\b|\bemergencies\b/i },
  { id: "sameDay", label: "Same-day", re: /\bsame[- ]day\b/i },
  { id: "financing", label: "Financing", re: /\bfinancing\b|\bfinance options?\b|\bpayment plans?\b|\b0% (apr|interest)\b|\bcarecredit\b|\bsunbit\b|\bcherry financing\b/i },
  { id: "warranty", label: "Warranty or guarantee", re: /\b(lifetime|\d+[- ](year|yr)|limited|labor|workmanship|our|full|written|extended) warrant(y|ies)\b|\bwarranty on (all|every|our|parts|labor|work)\b|\b(satisfaction|service|work|workmanship|price|money[- ]back|100%) guarantee[ds]?\b|\bguaranteed (work|service|satisfaction)\b|, guaranteed\b/i },
  { id: "family", label: "Family or locally owned", re: /\bfamily[- ](owned|run|operated)\b|\blocally[- ]owned\b/i },
  { id: "licensed", label: "Licensed & insured", re: /\blicensed,? (bonded,? )?(and|&) insured\b|\bfully licensed\b|\blicensed and bonded\b/i },
  { id: "freeEstimates", label: "Free estimates", re: /\bfree (estimates?|quotes?|consultations?|second opinions?)\b/i },
  { id: "upfront", label: "Upfront pricing", re: /\bup-?front pricing\b|\bflat[- ]rate pricing\b|\bno hidden fees\b/i },
  { id: "newPatients", label: "Taking new patients", re: /\b(accepting|welcom(e|ing)) new patients\b|\bnew patients (are )?welcome\b/i },
];
const YEAR = /\b(?:since|established in|established|est\.?|founded in|founded|serving [^.]{0,60}? since|in business since)\s*(?:in\s*)?((?:18|19|20)\d{2})\b/i;
function quoteAround(text: string, idx: number, len: number) {
  let a = Math.max(0, idx - 48), b = Math.min(text.length, idx + len + 48);
  while (a > 0 && /\S/.test(text[a - 1])) a--; while (b < text.length && /\S/.test(text[b])) b++;
  let q = text.slice(a, b).trim(); if (q.length > 120) q = q.slice(0, 117).replace(/\s+\S*$/, "") + "…";
  return (a > 0 ? "…" : "") + q;
}
function claimsOf(text: string, now = new Date()) {
  const out: any[] = [];
  for (const c of CLAIMS) { const m = text.match(c.re); if (m) out.push({ id: c.id, label: c.label, quote: quoteAround(text, m.index ?? 0, m[0].length) }); }
  const y = text.match(YEAR);
  if (y && +y[1] <= now.getFullYear() && +y[1] >= 1850) out.push({ id: "since", label: `Since ${y[1]}`, year: +y[1], quote: quoteAround(text, y.index ?? 0, y[0].length) });
  return out;
}

// ---------- what a customer can do on the site ----------
// cap: answers (chat) · booking · reviews (asks for reviews / manages them)
const VENDORS: [string, string, RegExp][] = [
  // chat
  ["answers", "Podium chat", /podium\.com\/(widget|webchat)|connect\.podium\.com|podium-website-widget/i],
  ["answers", "Birdeye chat", /birdeye\.com\/[^"']*(webchat|widget)|bewebchat|birdeye-webchat/i],
  ["answers", "HubSpot chat", /js\.hs-scripts\.com|js\.usemessages\.com|hubspot-messages/i],
  ["answers", "Intercom", /widget\.intercom\.io|intercomSettings/i],
  ["answers", "Drift", /js\.driftt\.com|drift\.load\(/i],
  ["answers", "Tidio", /code\.tidio\.co/i],
  ["answers", "LiveChat", /cdn\.livechatinc\.com|livechatinc\.com\/tracking/i],
  ["answers", "Tawk.to", /embed\.tawk\.to/i],
  ["answers", "Zendesk chat", /static\.zdassets\.com|zopim/i],
  ["answers", "Olark", /static\.olark\.com/i],
  ["answers", "Crisp", /client\.crisp\.chat/i],
  ["answers", "Freshchat", /wchat\.freshchat\.com|freshworks\.com\/live-chat/i],
  ["answers", "Weave chat", /getweave\.com[^"']*(chat|widget)|weave-webchat/i],
  ["answers", "Smith.ai chat", /smith\.ai\/(chat|widget)/i],
  ["answers", "Chatbase", /chatbase\.co\/embed/i],
  ["answers", "Voiceflow", /cdn\.voiceflow\.com|voiceflow\.chat/i],
  ["answers", "Kenect", /kenect\.com[^"']*(widget|chat)/i],
  ["answers", "Leadferno", /leadferno/i],
  ["answers", "Signpost chat", /signpost\.com[^"']*widget/i],
  ["answers", "ServiceTitan chat", /chat\.servicetitan\.com/i],
  ["answers", "Facebook Messenger chat", /fb-customerchat|customerchat\.js/i],
  // booking
  ["booking", "Housecall Pro", /housecallpro\.com\/(book|embed)|book\.housecallpro\.com|hcp-booking|housecall-pro/i],
  ["booking", "ServiceTitan scheduler", /scheduler\.servicetitan\.com|embed\.scheduler\.servicetitan|st-scheduler/i],
  ["booking", "Schedule Engine", /scheduleengine\.(net|com)|schedule-engine/i],
  ["booking", "Jobber", /clienthub\.getjobber\.com|getjobber\.com\/(request|booking)/i],
  ["booking", "Workiz", /workiz\.com\/(online-booking|booking)/i],
  ["booking", "Calendly", /calendly\.com\//i],
  ["booking", "Acuity", /acuityscheduling\.com/i],
  ["booking", "Square Appointments", /squareup\.com\/appointments|square\.site\/book/i],
  ["booking", "Zocdoc", /zocdoc\.com/i],
  ["booking", "NexHealth", /nexhealth\.com/i],
  ["booking", "LocalMed", /localmed\.com/i],
  ["booking", "Lighthouse 360", /lh360\.com|lighthouse360/i],
  ["booking", "Solutionreach", /solutionreach\.com/i],
  ["booking", "Vagaro", /vagaro\.com/i],
  ["booking", "Mindbody", /mindbodyonline\.com|healcode/i],
  ["booking", "Booksy", /booksy\.com/i],
  ["booking", "Fresha", /fresha\.com/i],
  ["booking", "GlossGenius", /glossgenius\.com/i],
  ["booking", "OpenTable", /opentable\.com\/(widget|restref|r\/)/i],
  ["booking", "Resy", /resy\.com\/(cities|embed)|widgets\.resy\.com/i],
  ["booking", "Tock", /exploretock\.com/i],
  ["booking", "Setmore", /setmore\.com/i],
  ["booking", "SimplyBook", /simplybook\.me/i],
  ["booking", "Booking widget", /book(ing)?-?widget[^"']*\.(js|com)/i],
  // reviews
  ["reviews", "Podium", /podium\.com/i],
  ["reviews", "Birdeye", /birdeye\.com/i],
  ["reviews", "NiceJob", /nicejob\.(co|com)/i],
  ["reviews", "GatherUp", /gatherup\.com|getfivestars/i],
  ["reviews", "Grade.us", /grade\.us/i],
  ["reviews", "Broadly", /broadly\.com/i],
  ["reviews", "Reputation.com", /reputation\.com\/(widgets|reviews)/i],
  ["reviews", "ReviewTrackers", /reviewtrackers\.com/i],
  ["reviews", "Swell", /swellcx\.com/i],
  ["reviews", "Demandforce", /demandforce\.com/i],
  ["reviews", "Weave reviews", /getweave\.com[^"']*review/i],
];
function vendorsOf(html: string) {
  const out: { cap: string; vendor: string }[] = [], seen = new Set<string>();
  for (const [cap, vendor, re] of VENDORS) { if (re.test(html) && !seen.has(cap + vendor)) { seen.add(cap + vendor); out.push({ cap, vendor }); } }
  return out;
}
function actionsOf(html: string, text: string) {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map(m => m[0]);
  const quoteForm = forms.some(f => /type=["']?(email|tel)|name=["'][^"']*(email|phone)/i.test(f) && !/search|newsletter|subscribe/i.test(f.slice(0, 600)));
  return {
    call: /href=["']tel:/i.test(html),
    text: /href=["']sms:/i.test(html),
    form: quoteForm || /request (a |an )?(quote|estimate|appointment|service)|schedule (a |an )?(appointment|service|visit)/i.test(text),
  };
}

// ---------- structured data: hours, founding year, area ----------
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_FULL: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
const toMin = (s: unknown) => { const m = String(s || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
function ldObjects(html: string) {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (x["@graph"]) walk(x["@graph"]); out.push(x); } }; walk(j); } catch { /* ignore broken blocks */ }
  }
  return out;
}
function hoursOf(ld: any[]) {
  // week[d] = [[open, close], ...] in minutes (Monday first); null when the site doesn't say
  const week: number[][][] = Array.from({ length: 7 }, () => []); let said = false;
  for (const o of ld) {
    for (const s of [].concat(o.openingHoursSpecification || []) as any[]) {
      const days = ([].concat(s.dayOfWeek || []) as any[]).map(d => DAY_FULL[String(d).split("/").pop()!.toLowerCase()]).filter(d => d != null);
      const a = toMin(s.opens), b = toMin(s.closes);
      if (a == null || b == null) continue;
      for (const d of days) { week[d].push([a, b === 0 || (a === 0 && b <= 1) ? 1440 : b <= a ? 1440 : b]); said = true; }
    }
    for (const h of [].concat(o.openingHours || []) as any[]) {
      const m = String(h).match(/^([A-Za-z,\- ]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/); if (!m) continue;
      const days = new Set<number>();
      for (const part of m[1].split(",")) { const [x, y] = part.trim().split("-").map(s => DAYS.indexOf(s.trim().slice(0, 2))); if (x < 0) continue; if (y == null || y < 0) days.add(x); else for (let d = x; d !== (y + 1) % 7; d = (d + 1) % 7) days.add(d); }
      const a = toMin(m[2])!, b = toMin(m[3])!;
      for (const d of days) { week[d].push([a, b <= a ? 1440 : b]); said = true; }
    }
  }
  return said ? week : null;
}
function ldFacts(ld: any[]) {
  const biz = ld.filter(o => /business|organization|plumb|dent|hvac|contractor|electric|medical|clinic|restaurant|store|salon|service|physician|attorney|realestate|auto/i.test(([] as any[]).concat(o["@type"] || []).join(" ")));
  const founding = biz.map(o => String(o.foundingDate || "").match(/\b(18|19|20)\d{2}\b/)?.[0]).find(Boolean);
  const area = [...new Set(biz.flatMap(o => ([] as any[]).concat(o.areaServed || [])).map(a => typeof a === "string" ? a : a?.name).filter(Boolean))].slice(0, 12);
  return { founded: founding ? +founding : null, area };
}

// ---------- one homepage ----------
function readSite(html: string, url: string, now = new Date()) {
  const text = visibleText(html);
  const ld = ldObjects(html);
  const vendors = vendorsOf(html);
  const caps: Record<string, string[]> = {}; for (const c of ["answers", "booking", "reviews"]) caps[c] = vendors.filter(v => v.cap === c).map(v => v.vendor);
  const facts = ldFacts(ld);
  const claims = claimsOf(text, now);
  if (facts.founded && !claims.some(c => c.id === "since")) claims.push({ id: "since", label: `Since ${facts.founded}`, year: facts.founded, quote: "From their site's business details", ld: true });
  return { ok: true, url, title: decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim().slice(0, 120), words: text.split(" ").length, claims, caps, actions: actionsOf(html, text), hours: hoursOf(ld), area: facts.area };
}
// from text only (a site that blocks plain readers, read by a real browser during the scan)
function readText(text: string, now = new Date()) {
  return { ok: true, fromText: true, claims: claimsOf(text, now), caps: { answers: [], booking: [], reviews: [] }, actions: { call: /\(\d{3}\)\s?\d{3}-\d{4}/.test(text), text: false, form: /request (a |an )?(quote|estimate|appointment|service)|schedule (a |an )?(appointment|service|visit)/i.test(text) }, hours: null, area: [] };
}

// ---------- fetching (public hostnames only) ----------
function okUrl(u: string): URL | null {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) return null;
    return x;
  } catch { return null; }
}
async function getHtml(url: string, ms = 9000): Promise<{ status: number; url: string; html: string; ms: number } | null> {
  const u = okUrl(url); if (!u) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms); const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: ctl.signal });
    if (!okUrl(r.url)) return null;
    const reader = r.body?.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > HTML_MAX) { await reader.cancel(); break; } chunks.push(value); }
    const bytes = new Uint8Array(Math.min(n, HTML_MAX)); let o = 0; for (const c of chunks) { if (o + c.length > bytes.length) break; bytes.set(c, o); o += c.length; }
    return { status: r.status, url: r.url, html: new TextDecoder().decode(bytes.subarray(0, o)), ms: Date.now() - t0 };
  } catch { return null; } finally { clearTimeout(t); }
}
// Capped at 45 s so the whole read lands well inside the page's ~96 s wait.
async function psi(url: string) {
  if (!PSI_KEY) return null;
  const q = new URLSearchParams({ url, strategy: "mobile", category: "performance", key: PSI_KEY });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: ctl.signal });
    if (!r.ok) return { error: r.status === 429 ? "limit" : "failed" };
    const j: any = await r.json(); const L = j?.lighthouseResult; if (!L) return { error: "failed" };
    const num = (k: string) => { const v = L.audits?.[k]?.numericValue; return typeof v === "number" ? Math.round(v) : null; };
    return { score: typeof L.categories?.performance?.score === "number" ? Math.round(L.categories.performance.score * 100) : null, lcpMs: num("largest-contentful-paint"), fcpMs: num("first-contentful-paint"), siMs: num("speed-index") };
  } catch { return { error: "timeout" }; } finally { clearTimeout(t); }
}

// ---------- the job ----------
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...(init.headers as Record<string, string> || {}) } });
async function getBuild(d: string) {
  const r = await db(`site_builds?domain=eq.${encodeURIComponent(d)}&select=status,parts,created_at,updated_at`);
  if (!r.ok) return null; const j = await r.json(); return j?.[0] ?? null;
}
const put = (d: string, k: string, v: unknown) => db("rpc/site_build_put", { method: "POST", body: JSON.stringify({ d, k, v }) }).then(r => r.body?.cancel()).catch(() => {});

// A bot check instead of the site (big chains often show one to plain readers): "Robot or human?", "Just a moment..."
const BOT_PAGE = /robot or human|are you a (robot|human)|access denied|just a moment(\.\.\.|…)|attention required|verify (that )?you are (a )?human|request (was )?blocked|pardon our interruption|checking your browser|unusual traffic|captcha/i;
const botPage = (r: any, html: string, url: string) => /\/(blocked|captcha|challenge)\b/i.test(url) || BOT_PAGE.test(String(r.title || "")) || (r.words < 150 && BOT_PAGE.test(visibleText(html)));
async function readOne(url: string, fallbackText?: string) {
  const p = await getHtml(url);
  if (p && p.status < 400 && p.html.length > 500) {
    const r: any = readSite(p.html, p.url); r.loadMs = p.ms;
    if (!botPage(r, p.html, p.url)) return r;
    if (fallbackText && fallbackText.length > 200) { const t: any = readText(fallbackText); t.note = "read by a full browser during the scan"; return t; }
    return { ok: false, error: "blocked", botCheck: true };
  }
  if (fallbackText && fallbackText.length > 200) { const r: any = readText(fallbackText); r.note = "read by a full browser during the scan"; return r; }
  return { ok: false, error: !p ? "unreachable" : p.status === 401 || p.status === 403 || p.status === 429 || p.status === 503 ? "blocked" : "unreachable" };
}
async function work(d: string, b: any) {
  const g = b?.parts?.gather, comps = (g?.competitors || []).filter((c: any) => c?.name).slice(0, 6);
  const siteText = (b?.parts?.site?.pages || [])[0]?.text || (g?.pages || []).map((p: any) => p?.text || "").join("\n").slice(0, 30000);
  const meUrl = g?.url || `https://${d}/`;
  const [me, ...rs] = await Promise.all([readOne(meUrl, siteText), ...comps.map((c: any) => c.website ? readOne(c.website) : Promise.resolve({ ok: false, error: "no_website" }))]);
  const out: any = { at: new Date().toISOString(), me: { url: meUrl, ...me }, rivals: comps.map((c: any, i: number) => ({ name: c.name, website: c.website || null, ...rs[i] })), psi: !!PSI_KEY };
  if (PSI_KEY) {
    // not for a competitor whose site showed a bot check: the score would be the bot check's
    const urls = [meUrl, ...comps.map((c: any, i: number) => (rs[i] as any)?.botCheck ? "" : c.website)];
    const sp = await Promise.all(urls.map((u: string) => u && okUrl(u) ? psi(u) : Promise.resolve(null)));
    out.me.speed = sp[0]; out.rivals.forEach((r: any, i: number) => { r.speed = sp[i + 1]; });
  }
  await put(d, "rivals", out);
}

const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
Deno.serve(async (req) => {
  const u = new URL(req.url);
  const d = (u.searchParams.get("d") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return reply({ ok: false, error: "invalid" }, 400);
  if (!SB_URL || !SB_KEY) return reply({ ok: false, error: "not_configured" });
  let b = await getBuild(d);
  if (!b || !b.parts?.gather) return reply({ ok: false, error: "no_scan" });
  const fresh = b.parts.rivals && Date.now() - Date.parse(b.parts.rivals.at || 0) < 7 * 86_400_000;
  // start (or reuse) the read; it returns at once and carries on in the background
  if (u.searchParams.get("start") === "1") {
    if (fresh) return reply({ ok: true, cached: true });
    const at = Date.parse(b.parts.rivals_at || 0);
    if (Date.now() - at < 120_000) return reply({ ok: true, running: true });
    await put(d, "rivals_at", new Date().toISOString());
    EdgeRuntime.waitUntil(work(d, b));
    return reply({ ok: true, started: true });
  }
  // poll: the read when it's there (held up to 12 s with wait=1)
  if (u.searchParams.get("poll") === "1") {
    if (u.searchParams.get("wait") === "1") {
      const until = Date.now() + 12_000;
      while (!(b?.parts?.rivals && (!b.parts.rivals_at || Date.parse(b.parts.rivals.at) >= Date.parse(b.parts.rivals_at) - 1000)) && Date.now() < until) { await new Promise(r => setTimeout(r, 700)); b = await getBuild(d) ?? b; }
    }
    const r = b?.parts?.rivals || null, running = !!b?.parts?.rivals_at && Date.now() - Date.parse(b.parts.rivals_at) < 120_000 && (!r || Date.parse(r.at) < Date.parse(b.parts.rivals_at));
    return reply({ ok: true, status: running ? "running" : r ? "done" : "none", rivals: running ? null : r });
  }
  return reply({ ok: false, error: "missing start or poll" }, 400);
});
