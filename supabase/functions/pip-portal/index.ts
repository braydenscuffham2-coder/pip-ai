// deno-lint-ignore-file no-explicit-any
// Pip Portal: the implementation layer's server side. Businesses sign in without a password, see their team,
// connect their tools, pause and resume agents, manage people and disconnect everything.
//
// Rules this file keeps:
// - No password, token or other client credential is read, stored or logged here. Composio holds tool sign-ins.
//   The vault endpoint stays closed until an external vault is configured, and refuses any body that carries a secret.
// - Every route except /signin and /hooks/* needs a Supabase Auth session. Roles: owner, staff, founder.
// - Users, connections, the price and Disconnect everything need a sign-in from the last 15 minutes.
// - verify_jwt is off because /signin is public; this file checks the session itself.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { draftWords, priceKeyOf } from "../_shared/price-keys.ts";
import { abilitiesOf } from "../_shared/abilities.ts";
import { checkOperate, operatePlainWords } from "../_shared/operate.ts";
import { checkAsk, mayApprove, mayRevoke } from "../_shared/operate-approval.ts";
import { vaultRefusal } from "../_shared/vault-input.ts";
import { setupOpen } from "../_shared/setup/gate.ts";
import { checkPiece, ownerAdd, ownerUpdate } from "../_shared/piece.ts";
import { dbStore } from "../_shared/piece-store.ts";
import { cleanBasics } from "../_shared/basics.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const COMPOSIO = "https://backend.composio.dev/api/v3.1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
class Fail extends Error {
  constructor(public status: number, public code: string, msg?: string) { super(msg || code); }
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const now = () => new Date().toISOString();
const cut = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function setting(key: string, def: any = null) {
  const { data } = await db.from("forge_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? def;
}
// portal_url is the full address of the Portal page, for example https://example.com/portal.html
const portalUrl = async () => String((await setting("portal_url", "")) || "").replace(/[/?#]+$/, "");

// Primary time zone per state. Owners can change it in the Portal.
const TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York",
  LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago",
  TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
};
const ZONES = new Set([...Object.values(TZ), "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Phoenix", "America/Boise"]);

// ---------------- who is calling ----------------
type User = { id: string; email: string; fresh: boolean };
type Role = { role: "owner" | "staff" | "founder"; admin: boolean };
function claims(tok: string): any {
  try {
    let p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    return JSON.parse(atob(p));
  } catch { return {}; }
}
async function who(req: Request): Promise<User> {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.split(".").length !== 3) throw new Fail(401, "sign_in");
  const { data, error } = await db.auth.getUser(tok);
  if (error || !data?.user?.email) throw new Fail(401, "sign_in");
  const amr = (claims(tok).amr || []).filter((a: any) => a?.method && a.method !== "token_refresh");
  const last = Math.max(0, ...amr.map((a: any) => Number(a.timestamp) || 0));
  return { id: data.user.id, email: data.user.email.toLowerCase(), fresh: Date.now() / 1000 - last < 15 * 60 };
}
async function isAdmin(email: string) {
  const { data } = await db.from("platform_admins").select("email").eq("email", email).maybeSingle();
  return !!data;
}
async function access(u: User, bid: string): Promise<Role> {
  if (!UUID.test(bid)) throw new Fail(404, "not_found");
  const admin = await isAdmin(u.email);
  const { data: m } = await db.from("members").select("id,role,status,user_id").eq("business_id", bid).eq("email", u.email).neq("status", "removed").maybeSingle();
  if (!m && !admin) throw new Fail(404, "not_found");
  if (m && (m.status !== "active" || m.user_id !== u.id)) {
    await db.from("members").update({ status: "active", user_id: u.id, updated_at: now() }).eq("id", m.id);
  }
  return { role: admin ? "founder" : m!.role, admin };
}
const need = (r: Role, ...roles: string[]) => { if (r.role !== "founder" && !roles.includes(r.role)) throw new Fail(403, "owner_only"); };
const needFresh = (u: User) => { if (!u.fresh) throw new Fail(401, "fresh_sign_in", "Sign in again to do this."); };

async function log(bid: string, kind: string, summary: string, x: { spec_id?: string; agent?: string; outcome?: string; actor?: string } = {}) {
  await db.from("activity_log").insert({ business_id: bid, kind, summary: summary.slice(0, 500), outcome: x.outcome ?? "info", spec_id: x.spec_id ?? null, agent: x.agent ?? null, actor: x.actor ?? null });
}
async function firstOrder(bid: string) {
  const { data } = await db.from("build_orders").select("id,code").eq("business_id", bid).order("created_at").limit(1).maybeSingle();
  return data;
}
async function fileAgreement(row: { business_id: string | null; kind: string; party: string; [k: string]: any }) {
  let q = db.from("business_agreements").select("id").eq("kind", row.kind).eq("party", row.party);
  q = row.business_id ? q.eq("business_id", row.business_id) : q.is("business_id", null);
  const { data: ex } = await q.maybeSingle();
  if (ex) await db.from("business_agreements").update({ ...row, updated_at: now() }).eq("id", ex.id);
  else await db.from("business_agreements").insert(row);
}

// ---------------- email ----------------
const wrap = (title: string, body: string, cta?: { href: string; label: string }) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px 20px;color:#0b0d1f">` +
  `<p style="font-size:20px;font-weight:600;margin:0 0 12px">${esc(title)}</p><div style="font-size:15px;line-height:1.55;color:#4b5175">${body}</div>` +
  (cta ? `<p style="margin:22px 0"><a href="${esc(cta.href)}" style="background:#0b0d1f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:600;font-size:15px;display:inline-block">${esc(cta.label)}</a></p>` : "") +
  `<p style="font-size:12.5px;color:#686e92;margin-top:26px">Pip never asks for a password or a code by email or text. If you did not expect this, ignore it.</p></div>`;
const MAIL: Record<string, (d: any) => { subject: string; html: string; text: string }> = {
  signin: (d) => ({ subject: "Your Pip Portal sign-in link", html: wrap("Sign in to your Pip Portal", "This link works once and lasts one hour.", { href: d.link, label: "Sign in" }), text: `Sign in to your Pip Portal (works once, lasts one hour): ${d.link}` }),
  welcome: (d) => ({ subject: "Your Pip team is being built", html: wrap("Your Pip team is being built", `Order ${esc(d.order || "")} is in. Your Portal shows each teammate as it is built and what setup will need. There is no password to create.`, { href: d.link, label: "Open your Portal" }), text: `Your Pip team is being built. Open your Portal: ${d.link}` }),
  invite: (d) => ({ subject: `You were added to ${d.business || "a business"} on Pip`, html: wrap(`You were added to ${d.business || "a business"}`, `${esc(d.by || "The owner")} gave you ${d.role === "owner" ? "owner" : "staff"} access to its Pip Portal.`, { href: d.link, label: "Open the Portal" }), text: `You were added to ${d.business} on Pip. Open the Portal: ${d.link}` }),
  paused: (d) => ({ subject: `${d.agent || "An agent"} paused a job`, html: wrap(`${d.agent || "An agent"} paused`, `${esc(d.why || "It could not continue.")} The rest of your team is still working.`, { href: d.link, label: "See what it needs" }), text: `${d.agent} paused: ${d.why}. ${d.link}` }),
  price_ready: (d) => ({ subject: "Your Pip price is ready to accept", html: wrap("Your price is ready", "Open your Portal to review and accept it. Setup unlocks right after.", { href: d.link, label: "Review your price" }), text: `Your Pip price is ready: ${d.link}` }),
  setup_resignin: (d) => ({ subject: `Sign in to ${d.tool || "your tool"} again`, html: wrap(`Sign in to ${d.tool || "your tool"} again`, `Pip's connection to ${esc(d.tool || "it")} closed. Only the jobs that use it are waiting; the rest of your team is still working. Open your Portal, tap Sign in again, and they pick up where they left off.`, { href: d.link, label: "Open my Portal" }), text: `Pip's connection to ${d.tool || "your tool"} closed. Only the jobs that use it are waiting. Open your Portal and tap Sign in again: ${d.link}` }),
  tool_needs_you: (d) => ({ subject: `${d.tool || "A tool"} needs you`, html: wrap(`${d.tool || "A tool"} needs you`, `${esc(d.why || "Pip could not get in on its own.")} Only the jobs that use it are waiting; the rest of your team is still working. Open your Portal to sort it out.`, { href: d.link, label: "Open my Portal" }), text: `${d.tool || "A tool"} needs you. ${d.why || "Pip could not get in on its own."} Only the jobs that use it are waiting. Open your Portal: ${d.link}` }),
  disconnected: (d) => ({ subject: `Pip is disconnected from ${d.business || "your business"}`, html: wrap("Everything is disconnected", `${esc(d.by || "An owner")} disconnected Pip. Every tool sign-in was revoked and every agent is stopped. One thing only you can undo: call forwarding at your phone company.`), text: `Pip is disconnected from ${d.business}. Tool sign-ins are revoked and agents are stopped. Remember to turn off call forwarding at your phone company.` }),
};
async function sendMail(to: string, template: string, data: any) {
  const key = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const from = Deno.env.get("PORTAL_FROM") ?? Deno.env.get("LEAD_ALERT_FROM") ?? "Pip <onboarding@resend.dev>";
  const m = MAIL[template](data);
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], ...m, headers: { "X-Entity-Ref-ID": crypto.randomUUID() } }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function oneTimeLink(email: string) {
  const base = await portalUrl();
  if (!base) throw new Fail(503, "portal_url_not_set");
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const th = (data as any)?.properties?.hashed_token;
  if (error || !th) throw new Fail(500, "link_failed", error?.message);
  return `${base}#th=${th}`;
}
const doorLink = async (email: string) => `${await portalUrl()}?e=${encodeURIComponent(email)}`;

// ---------------- sign-in (public) ----------------
async function signin(req: Request, body: any) {
  const email = cut(body.email, 120).toLowerCase();
  if (!EMAIL.test(email)) throw new Fail(400, "bad_email");
  const h = await sha(email);
  const ip = cut((req.headers.get("x-forwarded-for") || "").split(",")[0], 60) || null;
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  const a = await db.from("portal_signins").select("id", { count: "exact", head: true }).eq("email_hash", h).gte("at", since);
  const b = ip ? await db.from("portal_signins").select("id", { count: "exact", head: true }).eq("ip", ip).gte("at", since) : { count: 0 };
  await db.from("portal_signins").insert({ email_hash: h, ip });
  // The answer is the same whether or not the email is known, so the form cannot be used to find customers.
  if ((a.count || 0) >= 3 || (b.count || 0) >= 20) return json({ ok: true });
  const m = await db.from("members").select("id", { count: "exact", head: true }).eq("email", email).neq("status", "removed");
  if (!(m.count || 0) && !(await isAdmin(email))) return json({ ok: true });
  try { await sendMail(email, "signin", { link: await oneTimeLink(email) }); }
  catch (e) { await db.from("events").insert({ kind: "portal_error", detail: { where: "signin_mail", error: String((e as Error).message).slice(0, 300) } }); }
  return json({ ok: true });
}

// ---------------- reads ----------------
async function me(u: User) {
  const admin = await isAdmin(u.email);
  const { data: ms } = await db.from("members").select("business_id,role,status,businesses(id,name,status)").eq("email", u.email).neq("status", "removed");
  await db.from("members").update({ status: "active", user_id: u.id, updated_at: now() }).eq("email", u.email).eq("status", "invited");
  return json({ email: u.email, founder: admin, businesses: (ms || []).filter((m: any) => m.businesses).map((m: any) => ({ id: m.businesses.id, name: m.businesses.name, status: m.businesses.status, role: m.role })) });
}
/**
 * Adds to each teammate what it can and cannot do, in plain words. The sentences come from the teammate's own job list
 * and from the same check the runtime uses (see _shared/abilities.ts), never from a model. If anything goes wrong the
 * teammate is shown without the list rather than with a guess.
 */
async function withAbilities(agents: any[], operateOn = false): Promise<any[]> {
  const ids = agents.map((a) => a?.spec_id).filter((x) => typeof x === "string");
  if (!ids.length) return agents;
  try {
    const [specs, mans, steps, tools] = await Promise.all([
      db.from("skill_specs").select("id,spec,brain").in("id", ids),
      db.from("agent_manifests").select("spec_id,manifest").in("spec_id", ids),
      db.from("connection_catalog").select("slot,label,blocks"),
      db.from("tool_catalog").select("*").eq("enabled", true),
    ]);
    const catalog = { steps: (steps.data as any[]) || [], tools: (tools.data as any[]) || [] };
    return agents.map((a) => {
      const s = ((specs.data as any[]) || []).find((x) => x.id === a.spec_id);
      if (!s) return a;
      const m = ((mans.data as any[]) || []).find((x) => x.spec_id === a.spec_id);
      // While the operator lane is on, an operator teammate is marked with its process so the Portal can show its review screen.
      const op = operateOn ? (() => { try { const c = checkOperate(s.spec); return c.ok && c.operate ? c.operate.process : null; } catch { return null; } })() : null;
      try { return { ...a, abilities: abilitiesOf(s.spec, m ?? null, s.brain, catalog), ...(op ? { operator: op } : {}) }; } catch { return op ? { ...a, operator: op } : a; }
    });
  } catch { return agents; }
}
async function business(u: User, bid: string) {
  const r = await access(u, bid);
  const { data: b } = await db.from("businesses").select("id,name,domain,industry,health_lane,state,timezone,status,quote,price_accepted_at,terms_version,terms_accepted_at,alert_prefs,basics,created_at").eq("id", bid).maybeSingle();
  if (!b) throw new Fail(404, "not_found");
  const [cl, ag, people, issues, phone, text, rules, hm, agr, termsUrl] = await Promise.all([
    db.rpc("portal_checklist", { p_business: bid }),
    db.rpc("portal_agents", { p_business: bid }),
    r.role === "staff" ? Promise.resolve({ data: [] }) : db.from("members").select("id,email,role,status").eq("business_id", bid).neq("status", "removed").order("created_at"),
    db.from("portal_issues").select("id,body,status,created_at,opened_by").eq("business_id", bid).neq("status", "resolved").order("created_at", { ascending: false }).limit(20),
    db.from("phone_lines").select("business_number,carrier,pip_number,status").eq("business_id", bid).maybeSingle(),
    db.from("texting_registrations").select("legal_name,business_type,website,status").eq("business_id", bid).maybeSingle(),
    db.from("jurisdiction_rules").select("state,name,recording_consent,outbound_hours,max_attempts_24h,ai_disclosure,biometric,health,telemarketing,reviewed_by_lawyer").in("state", ["US", b.state || "US"]),
    b.health_lane ? db.rpc("portal_health_missing", { p_business: bid }) : Promise.resolve({ data: [] }),
    db.from("business_agreements").select("kind,party,status,version,accepted_at").eq("business_id", bid),
    setting("portal_terms_url", null),
  ]);
  const operateOn = (await db.rpc("portal_flag", { p_key: "operate_lane", p_default: false })).data === true;
  return json({
    role: r.role, business: b, checklist: cl.data || [], agents: await withAbilities((ag.data as any[]) || [], operateOn), operate_on: operateOn, people: (people as any).data || [], issues: issues.data || [],
    phone: phone.data, texting: text.data, rules: rules.data || [], health_missing: (hm as any).data || [], agreements: agr.data || [],
    extra_tools: await extraTools(bid),
    setup_unlocked: !!b.price_accepted_at, terms_url: termsUrl, terms_version: await setting("portal_terms_version", null),
    vault_open: false, connect_on: !!(Deno.env.get("COMPOSIO_API_KEY") ?? "").trim(), fresh: u.fresh,
    setup_on: (await setupGate(r.admin, bid)).open,
    work: r.role === "staff" ? [] : await workList(bid),
    doors: r.role === "staff" ? [] : await doorList(bid),
    pieces: await pieceList(bid),
    notes: r.role === "staff" ? [] : await noteList(bid),
    setups: r.role === "staff" ? [] : ((await db.from("setup_sessions").select("id,tool,state,reason,result,created_at").eq("business_id", bid).order("created_at", { ascending: false }).limit(10)).data || []),
  });
}
// Weekly notes (pip-notes): what each teammate did last week, what went wrong, and at most one change it proposes.
// The owner can answer a proposal with "good idea" or "no thanks". Either answer is only recorded and passed to the
// founder: a proposal never changes a teammate by itself. The evidence (run ids, counts) stays out of the owner's view.
async function noteList(bid: string) {
  const since = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
  const { data } = await db.from("teammate_notes").select("id,spec_id,week_start,teammate,did,wrong,proposal,decision,decided_at").eq("business_id", bid).gte("week_start", since).order("week_start", { ascending: false }).limit(40);
  const seen = new Set<string>(), out = [];
  for (const n of ((data as any[]) || [])) {
    if (seen.has(n.spec_id)) continue; seen.add(n.spec_id);        // the newest note for each teammate
    out.push({ id: n.id, week_start: n.week_start, teammate: n.teammate, did: n.did, wrong: n.wrong, proposal: n.proposal ? { change: n.proposal.change, why: n.proposal.why } : null, decision: n.decision, decided_at: n.decided_at });
  }
  return out;
}
async function noteAction(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner");
  const nid = cut(body.note, 40), decision = cut(body.decision, 20);
  if (!UUID.test(nid) || !["good_idea", "no_thanks"].includes(decision)) throw new Fail(400, "bad_request");
  const { data: n } = await db.from("teammate_notes").select("id,teammate,proposal,spec_id").eq("id", nid).eq("business_id", bid).maybeSingle();
  if (!n || !(n as any).proposal) throw new Fail(404, "not_found");
  await db.from("teammate_notes").update({ decision, decided_by: u.email, decided_at: now() }).eq("id", nid);
  await log(bid, "owner", `${(n as any).teammate}'s suggestion: you said ${decision === "good_idea" ? "good idea" : "no thanks"}. Nothing changes by itself; Pip's builder has been told.`, { actor: u.email, spec_id: (n as any).spec_id });
  await db.from("events").insert({ kind: "note_decision", domain: null, detail: { note: nid, business: bid, decision } });
  return json({ ok: true });
}
// Pieces (pip-piece): small software Pip built for this business. The owner and staff see every record, add one and
// move one between the piece's own stages. Nothing here deletes a record. The rules are the same code the sandbox ran
// (_shared/piece.ts); a stored description is checked again each time it is used.
const PIECE_SEEN = ["staged", "live", "paused"];
async function pieceList(bid: string) {
  const { data } = await db.from("pieces").select("id,name,label,does,status,spec").eq("business_id", bid).in("status", PIECE_SEEN).order("created_at", { ascending: true }).limit(20);
  const out = [];
  for (const p of ((data as any[]) || [])) {
    const c = checkPiece(p.spec); if (!c.ok) continue;
    const { data: recs } = await db.from("piece_records").select("stage").eq("piece_id", p.id).limit(5000);
    const by: Record<string, number> = {}; for (const r of ((recs as any[]) || [])) by[r.stage] = (by[r.stage] ?? 0) + 1;
    out.push({ id: p.id, label: p.label, does: p.does, status: p.status, stages: c.spec.stages, fields: c.spec.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, ...(f.options ? { options: f.options } : {}) })), by_stage: by,
      has_form: !!c.spec.intake, has_page: !!c.spec.page, public_stages: c.spec.page?.stages ?? [], report: c.spec.report ?? null, page: `https://www.hirepip.com/piece.html?p=${p.id}` });
  }
  return out;
}
async function pieceAction(u: User, bid: string, body: any) {
  await access(u, bid);
  const pid = cut(body.piece, 40), action = cut(body.action, 20);
  if (!UUID.test(pid)) throw new Fail(400, "bad_request");
  const { data: p } = await db.from("pieces").select("id,spec,status,label").eq("id", pid).eq("business_id", bid).in("status", PIECE_SEEN).maybeSingle();
  const c = p ? checkPiece((p as any).spec) : null;
  if (!p || !c || !c.ok) throw new Fail(404, "not_found");
  const store = dbStore(db, pid, c.spec.limits);
  if (action === "list") {
    const stage = typeof body.stage === "string" && c.spec.stages.includes(body.stage) ? [body.stage] : null;
    const rows = await store.list(stage, 100, true);
    return json({ ok: true, records: rows.map((r) => ({ id: r.id, ref: r.ref, stage: r.stage, data: r.data, source: r.source, updated_at: r.updated_at })) });
  }
  if ((p as any).status === "paused") throw new Fail(409, "not_now", "This piece is paused.");
  const WORDS: Record<string, string> = { missing: "Fill in at least one field.", bad_value: "One of the values does not fit its field.", bad_stage: "That is not one of this piece's stages.", bad_field: "That is not one of this piece's fields.", slow_down: "This piece has taken as many records as it may today.", full: "This piece is full.", not_found: "That record was not found." };
  if (action === "add") {
    const r = await ownerAdd(c.spec, store, { ...(body.fields && typeof body.fields === "object" ? body.fields : {}), stage: body.stage }, u.email);
    if (!r.ok) throw new Fail(400, r.error, WORDS[r.error] ?? "That could not be added.");
    return json({ ok: true, ref: r.ref });
  }
  if (action === "update") {
    const rid = cut(body.record, 40); if (!UUID.test(rid)) throw new Fail(400, "bad_request");
    const r = await ownerUpdate(c.spec, store, rid, { stage: body.stage, fields: body.fields }, u.email);
    if (!r.ok) throw new Fail(400, r.error, WORDS[r.error] ?? "That could not be changed.");
    return json({ ok: true });
  }
  throw new Fail(400, "bad_request");
}
// Doors (pip-edge): the ways this business's own world starts a teammate's job, and where a teammate may post out.
// The list never carries a secret. The owner reads a webhook's secret (a new one each time, the old one stops) or an
// out door's signing key with a fresh sign-in, once, and Pip keeps only what it must.
const EDGE_FN = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pip-edge`;
async function doorList(bid: string) {
  const { data } = await db.from("edges").select("id,kind,name,label,address,url,enabled,last_at").eq("business_id", bid).order("created_at", { ascending: true }).limit(40);
  return ((data as any[]) || []).map((d) => ({
    id: d.id, kind: d.kind, name: d.name, label: d.label, enabled: d.enabled, last_at: d.last_at,
    ...(d.kind === "email" ? { address: `${d.address}@hirepip.com` } : {}),
    ...(d.kind === "form" ? { page: `https://www.hirepip.com/form.html?f=${d.id}` } : {}),
    ...(d.kind === "webhook" || d.kind === "zapier" ? { post_to: `${EDGE_FN}/hook/${d.id}` } : {}),
    ...(d.kind === "out" ? { host: (() => { try { return new URL(d.url).hostname; } catch { return ""; } })() } : {}),
  }));
}
async function doorAction(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); needFresh(u);
  const id = cut(body.door, 40), action = cut(body.action, 20);
  if (!UUID.test(id)) throw new Fail(400, "bad_request");
  const { data: d } = await db.from("edges").select("id,kind,label,sign_key,enabled").eq("id", id).eq("business_id", bid).maybeSingle();
  if (!d) throw new Fail(404, "not_found");
  if (action === "secret") {
    if ((d as any).kind === "webhook" || (d as any).kind === "zapier") {
      const { data } = await db.rpc("edge_rotate", { p_edge: id });
      if (!(data as any)?.ok) throw new Fail(409, "not_now");
      await log(bid, "owner", `${(d as any).label}: a new secret was made for this door. The old one stopped working.`, { actor: u.email });
      return json({ ok: true, secret: (data as any).secret, header: "x-pip-secret" });
    }
    if ((d as any).kind === "out") return json({ ok: true, secret: (d as any).sign_key, header: "x-pip-signature" });
    throw new Fail(400, "bad_request");
  }
  if (action === "open" || action === "close") {
    await db.from("edges").update({ enabled: action === "open" }).eq("id", id).eq("business_id", bid);
    await log(bid, "owner", `${(d as any).label}: this door was ${action === "open" ? "opened" : "closed"}.`, { actor: u.email });
    return json({ ok: true });
  }
  throw new Fail(400, "bad_request");
}
async function activity(u: User, bid: string, url: URL) {
  await access(u, bid);
  const before = Number(url.searchParams.get("before")) || null;
  let q = db.from("activity_log").select("id,at,kind,summary,outcome,agent,spec_id").eq("business_id", bid).order("id", { ascending: false }).limit(50);
  if (before) q = q.lt("id", before);
  const { data } = await q;
  return json({ items: data || [] });
}

// ---------------- owner actions ----------------
async function setProfile(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner");
  const state = cut(body.state, 2).toUpperCase();
  if (!TZ[state]) throw new Fail(400, "bad_state");
  const tz = ZONES.has(cut(body.timezone, 60)) ? cut(body.timezone, 60) : TZ[state];
  await db.from("businesses").update({ state, timezone: tz, updated_at: now() }).eq("id", bid);
  await log(bid, "owner", `Business location set to ${state}. Local call, text and privacy rules now apply.`, { actor: u.email });
  return json({ ok: true, state, timezone: tz });
}
// What the business tells its team (hours, address, parking and so on). Every teammate is given these on every
// channel (pip-turn), as facts. Only the known fields are kept, cleaned and cut to length (_shared/basics.ts).
async function setBasics(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner");
  const basics = cleanBasics(body?.basics);
  const { error } = await db.from("businesses").update({ basics, updated_at: now() }).eq("id", bid);
  if (error) throw new Fail(500, "not_saved");
  await log(bid, "owner", "You updated what your team knows about the business.", { actor: u.email });
  return json({ ok: true, basics });
}
async function accept(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); needFresh(u);
  const { data: b } = await db.from("businesses").select("quote,price_accepted_at,status").eq("id", bid).single();
  if (!b.quote) throw new Fail(409, "no_price_yet", "Your price has not been sent yet.");
  if (b.price_accepted_at) return json({ ok: true, already: true });
  const termsUrl = await setting("portal_terms_url", null);
  const termsVersion = await setting("portal_terms_version", null);
  if (termsUrl && body.terms !== true) throw new Fail(400, "terms_needed", "Tick the box to agree to the terms.");
  const patch: any = { price_accepted_at: now(), price_accepted_by: u.email, status: "setup", updated_at: now() };
  if (termsUrl) { patch.terms_version = termsVersion; patch.terms_accepted_at = now(); }
  await db.from("businesses").update(patch).eq("id", bid);
  await db.from("compliance_events").insert({ business_id: bid, kind: "price_accepted", detail: { by: u.email, quote_sha: await sha(JSON.stringify(b.quote)) } });
  if (termsUrl) {
    await db.from("compliance_events").insert({ business_id: bid, kind: "terms_accepted", detail: { by: u.email, version: termsVersion, url: termsUrl } });
    await fileAgreement({ business_id: bid, kind: "terms", party: "Pip", version: termsVersion, status: "signed", accepted_by: u.email, accepted_at: now(), document_url: termsUrl });
  }
  await log(bid, "owner", "Price accepted. Setup is unlocked.", { actor: u.email, outcome: "ok" });
  return json({ ok: true });
}

async function composio(path: string, init: RequestInit = {}) {
  const key = (Deno.env.get("COMPOSIO_API_KEY") ?? "").trim();
  if (!key) throw new Fail(503, "connect_off", "Tool sign-ins are not switched on yet.");
  const r = await fetch(`${COMPOSIO}${path}`, { ...init, headers: { "x-api-key": key, "content-type": "application/json" }, signal: AbortSignal.timeout(20000) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* not json */ }
  if (!r.ok) throw new Fail(502, "connect_failed", `Composio answered ${r.status}: ${cut(j?.error?.message || j?.message || t, 200)}`);
  return j;
}
// Which Composio sign-in config a tool uses, in this order:
// 1. One the founder chose in forge_settings.sign_in_configs, for example Pip's own Google app: { "gmail": "ac_..." }.
// 2. Composio's own one-step sign-in, when the tool has one.
// 3. For tools that work with an API key, a bearer token or an API username and password instead: a config that makes
//    Composio's own page ask the owner for it. It goes from the owner straight to Composio. Pip, and every model,
//    never see it. (Decided November 17: Composio's page is acceptable custody, the same as a sign-in. Website logins
//    with no API are a different route and never come through here.)
const KEY_SCHEMES = ["API_KEY", "BEARER_TOKEN", "BASIC"];
async function composioAuthConfig(slug: string): Promise<string> {
  const { data: pick } = await db.from("forge_settings").select("value").eq("key", "sign_in_configs").maybeSingle();
  const chosen = (pick?.value as any)?.[slug];
  if (typeof chosen === "string" && /^ac_[A-Za-z0-9_-]{6,40}$/.test(chosen)) return chosen;
  const list = await composio(`/auth_configs?toolkit_slug=${encodeURIComponent(slug)}&limit=20`);
  const mine = (list?.items ?? []).filter((c: any) => c?.toolkit?.slug === slug && (!c?.status || c.status === "ENABLED"));
  const managed = mine.find((c: any) => c?.is_composio_managed !== false);
  if (managed?.id) return managed.id;
  try {
    const made = await composio("/auth_configs", { method: "POST", body: JSON.stringify({ toolkit: { slug }, auth_config: { type: "use_composio_managed_auth" } }) });
    if (made?.auth_config?.id) return made.auth_config.id;
  } catch { /* this tool has no one-step sign-in; try a key below */ }
  const keyed = mine.find((c: any) => KEY_SCHEMES.includes(String(c?.auth_scheme || c?.authScheme || "").toUpperCase()));
  if (keyed?.id) return keyed.id;
  const kit = await composio(`/toolkits/${encodeURIComponent(slug)}`);
  const modes: string[] = (kit?.auth_config_details ?? []).map((d: any) => String(d?.mode || "").toUpperCase());
  const scheme = KEY_SCHEMES.find((k) => modes.includes(k));
  if (!scheme) throw new Fail(502, "no_managed_sign_in");
  let made: any = null;
  for (const field of ["authScheme", "auth_scheme"]) {
    try { made = await composio("/auth_configs", { method: "POST", body: JSON.stringify({ toolkit: { slug }, auth_config: { type: "use_custom_auth", [field]: scheme, name: `${slug} key from owner`, credentials: {} } }) }); if (made?.auth_config?.id) break; }
    catch { /* try the other spelling */ }
  }
  if (!made?.auth_config?.id) throw new Fail(502, "no_managed_sign_in");
  return made.auth_config.id;
}
async function connect(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner");
  const slot = cut(body.slot, 40), toolkit = cut(body.toolkit, 60).toLowerCase();
  const { data: b } = await db.from("businesses").select("price_accepted_at,composio_user_id,status").eq("id", bid).single();
  if (!b.price_accepted_at && r.role !== "founder") throw new Fail(409, "setup_locked", "Setup unlocks when you accept your price.");
  if (["disconnected", "cancelled"].includes(b.status)) throw new Fail(409, "disconnected");
  const { data: bc } = await db.from("business_connections").select("id,slot,status,connected_account_id,detail").eq("business_id", bid).eq("slot", slot).maybeSingle();
  const { data: cat } = await db.from("connection_catalog").select("kind,choices,label").eq("slot", slot).maybeSingle();
  if (!bc || !cat || cat.kind !== "owner_oauth") throw new Fail(400, "bad_slot");
  if (!(cat.choices as any[]).some((c) => c.toolkit && c.toolkit === toolkit)) throw new Fail(400, "bad_choice");
  const order = await firstOrder(bid);
  if (!order || !b.composio_user_id) throw new Fail(409, "no_order");
  const auth = await composioAuthConfig(toolkit);
  const back = `${await portalUrl()}?b=${bid}&connected=${slot}`;
  let link: any;
  try { link = await composio("/connected_accounts/link", { method: "POST", body: JSON.stringify({ auth_config_id: auth, user_id: b.composio_user_id, callback_url: back }) }); }
  catch { link = await composio("/connected_accounts/link", { method: "POST", body: JSON.stringify({ auth_config_id: auth, user_id: b.composio_user_id }) }); }
  if (!link?.redirect_url) throw new Fail(502, "connect_failed");
  const acct = cut(link.connected_account_id, 80) || null;
  await db.from("client_connections").insert({ order_id: order.id, business_id: bid, toolkit, composio_user_id: b.composio_user_id, connected_account_id: acct, status: "link_made", link_expires_at: link.expires_at || null });
  const detail = { ...((bc.detail as any) || {}) };
  if (bc.status === "active" && bc.connected_account_id && acct) {
    // Signing in again on a step that works: the current sign-in stays in use until the new one is finished.
    // A second attempt replaces the first one, which is removed so no half-made sign-in is left behind.
    const before = detail.pending?.account;
    if (before && before !== acct && before !== bc.connected_account_id) await retire(before);
    detail.pending = { account: acct, toolkit, at: now() };
    await db.from("business_connections").update({ detail, updated_at: now() }).eq("id", bc.id);
    await log(bid, "connection", `${cat.label}: signing in again started. The current sign-in keeps working until the new one is finished.`, { actor: u.email });
    return json({ ok: true, url: link.redirect_url, again: true });
  }
  // A sign-in that was never finished, or stopped working, is replaced. It is removed once the new one works.
  delete detail.pending;
  if (bc.connected_account_id && bc.connected_account_id !== acct) detail.replaces = [...new Set([...(detail.replaces || []), bc.connected_account_id])].slice(-5); else if (!detail.replaces?.length) delete detail.replaces;
  await db.from("business_connections").update({ status: "link_made", choice: toolkit, connected_account_id: acct, link_expires_at: link.expires_at || null, detail, updated_at: now() }).eq("id", bc.id);
  await log(bid, "connection", `${cat.label}: sign-in started.`, { actor: u.email });
  return json({ ok: true, url: link.redirect_url });
}
const MAP: Record<string, string> = { ACTIVE: "active", INITIATED: "link_made", INITIALIZING: "link_made", EXPIRED: "expired", FAILED: "failed", INACTIVE: "revoked" };
// Remove a sign-in that has been replaced, so nothing older and wider than the current one stays behind.
async function retire(account: string): Promise<boolean> {
  let gone = false;
  try { await composio(`/connected_accounts/${encodeURIComponent(account)}`, { method: "DELETE" }); gone = true; }
  catch (e) { gone = /404|not.?found/i.test(String((e as Error).message)); }
  if (gone) await db.from("client_connections").update({ status: "revoked", updated_at: now() }).eq("connected_account_id", account);
  return gone;
}
// Read each sign-in's state from Composio. A sign-in that stops working pauses only the agents that use it.
async function refresh(bid: string, actor: string) {
  const { data: b } = await db.from("businesses").select("composio_user_id,name").eq("id", bid).single();
  const { data: rows } = await db.from("business_connections").select("id,slot,status,connected_account_id,agents,detail,choice").eq("business_id", bid).not("connected_account_id", "is", null);
  const { data: extra } = await db.from("client_connections").select("id,toolkit,status,connected_account_id,created_at").eq("business_id", bid).not("connected_account_id", "is", null).in("status", ["link_made", "active"]);
  if ((!rows?.length && !extra?.length) || !b?.composio_user_id) return { changed: 0 };
  const live = await composio(`/connected_accounts?user_ids=${encodeURIComponent(b.composio_user_id)}&limit=100`);
  const by = new Map<string, any>((live?.items ?? []).map((i: any) => [i.id, i]));
  let changed = 0;
  const stateOf = (acct: string, fallback: string) => MAP[String(by.get(acct)?.status || "").toUpperCase()] ?? (by.has(acct) ? fallback : "revoked");
  // A step being signed in again: switch to the new sign-in once it works, then remove the old one.
  for (const row of rows || []) {
    const d = { ...((row.detail as any) || {}) }, p = d.pending;
    if (!p?.account) continue;
    const st = stateOf(p.account, "link_made");
    const stale = Date.now() - Date.parse(p.at || 0) > 2 * 3600 * 1000;
    if (st === "link_made" && !stale) continue;
    delete d.pending;
    const { data: cat } = await db.from("connection_catalog").select("label").eq("slot", row.slot).single();
    if (st === "active") {
      const old = row.connected_account_id!;
      d.replaces = [...new Set([...(d.replaces || []), old])].slice(-5);
      // If the earlier sign-in stopped working in the meantime, the usual "is connected" handling below takes over.
      const keep = row.status === "active" ? "active" : "link_made";
      await db.from("business_connections").update({ connected_account_id: p.account, choice: p.toolkit || row.choice, status: keep, detail: d, checked_at: now(), updated_at: now() }).eq("id", row.id);
      await db.from("client_connections").update({ status: "active", updated_at: now() }).eq("connected_account_id", p.account);
      if (keep === "active") await log(bid, "connection", `${cat!.label} was signed in again. The earlier sign-in is being removed.`, { actor, outcome: "ok" });
      row.connected_account_id = p.account; row.status = keep; row.detail = d; changed++;
    } else {
      // The second sign-in was not finished. Nothing changes for the step; the unfinished one is removed.
      await db.from("business_connections").update({ detail: d, updated_at: now() }).eq("id", row.id);
      await retire(p.account); row.detail = d;
    }
  }
  // Sign-ins that a working step replaced are removed here, and tried again next time if that fails.
  for (const row of rows || []) {
    const d = { ...((row.detail as any) || {}) }, list: string[] = (d.replaces || []).filter((a: string) => a && a !== row.connected_account_id);
    if (!d.replaces?.length || stateOf(row.connected_account_id!, row.status) !== "active") continue;
    const left: string[] = [];
    for (const a of list) if (!(await retire(a))) left.push(a);
    if (left.length) d.replaces = left; else delete d.replaces;
    await db.from("business_connections").update({ detail: d }).eq("id", row.id); row.detail = d;
  }
  for (const row of rows || []) {
    const st = MAP[String(by.get(row.connected_account_id!)?.status || "").toUpperCase()] ?? (by.has(row.connected_account_id!) ? row.status : "revoked");
    if (st === row.status || row.status === "revoked") { await db.from("business_connections").update({ checked_at: now() }).eq("id", row.id); continue; }
    changed++;
    await db.from("business_connections").update({ status: st, checked_at: now(), updated_at: now() }).eq("id", row.id);
    await db.from("client_connections").update({ status: st, updated_at: now() }).eq("connected_account_id", row.connected_account_id);
    const { data: cat } = await db.from("connection_catalog").select("label").eq("slot", row.slot).single();
    if (st === "active") await log(bid, "connection", `${cat!.label} is connected.`, { actor, outcome: "ok" });
    else if (row.status === "active") {
      await log(bid, "connection", `${cat!.label} stopped working (${st}). Agents that use it are paused until it is reconnected.`, { actor: "pip", outcome: "paused" });
      const { data: specs } = await db.from("skill_specs").select("id,skill_id,status,order_id,build_orders!inner(business_id)").eq("build_orders.business_id", bid).in("skill_id", row.agents || []);
      for (const s of specs || []) await pauseSpec(bid, s, "expired_access", `${cat!.label} needs to be reconnected.`, "pip");
      const { data: owners } = await db.from("members").select("email").eq("business_id", bid).eq("role", "owner").neq("status", "removed");
      for (const o of owners || []) await db.from("portal_outbox").insert({ business_id: bid, to_email: o.email, template: "paused", data: { agent: cat!.label, why: `${cat!.label} needs to be reconnected.` } });
    }
  }
  const inSteps = new Set((rows || []).map((r: any) => r.connected_account_id));
  const waiting = new Set((rows || []).map((r: any) => (r.detail as any)?.pending?.account).filter(Boolean));
  for (const x of extra || []) {
    if (inSteps.has(x.connected_account_id) || waiting.has(x.connected_account_id)) continue;
    // A sign-in that was started and never finished is removed after a day, so it does not sit around half-made.
    if (x.status === "link_made" && stateOf(x.connected_account_id!, "link_made") === "link_made" && Date.now() - Date.parse(x.created_at) > 24 * 3600 * 1000) { if (await retire(x.connected_account_id!)) changed++; continue; }
    const st = MAP[String(by.get(x.connected_account_id!)?.status || "").toUpperCase()] ?? (by.has(x.connected_account_id!) ? x.status : "revoked");
    if (st === x.status) continue;
    changed++;
    // A sign-in that ran out or failed before it ever worked was never connected. Remove it, so the owner is not
    // told to "reconnect" something that was never there. If the removal fails it is tried again next time.
    if (x.status === "link_made" && st !== "active") { await retire(x.connected_account_id!); continue; }
    await db.from("client_connections").update({ status: st, updated_at: now() }).eq("id", x.id);
    if (st === "active") {
      await log(bid, "connection", `${x.toolkit} is connected. Pip will add it to your team.`, { actor, outcome: "ok" });
      await db.rpc("portal_notify", { p_business: bid, p_to: "founder", p_subject: `An owner connected ${x.toolkit}`, p_title: "A new tool was connected",
        p_lines: [`Business: ${b.name}`, `Tool: ${x.toolkit}`, `Teammates get nothing there until it is reviewed: each action needs a tool_catalog row (block any_tool, with record and level) and a teammate job that lists kit:${x.toolkit}.`, "Anything more (reading, changing, sending) needs its own reviewed rows."] });
    }
  }
  return { changed };
}
async function refreshRoute(u: User, bid: string) {
  await access(u, bid);
  return json({ ok: true, ...(await refresh(bid, u.email)) });
}

// ---------------- any other tool ----------------
// An owner can connect a tool that has no setup step. Connecting stores only Composio's ids and a status.
// A teammate cannot use the tool until the founder adds what it may do there to the tool catalog.
async function extraTools(bid: string) {
  const [{ data: steps }, { data: all }] = await Promise.all([
    db.from("business_connections").select("connected_account_id").eq("business_id", bid),
    db.from("client_connections").select("toolkit,status,connected_account_id,created_at").eq("business_id", bid).neq("status", "revoked").order("created_at", { ascending: false }).limit(60),
  ]);
  const inSteps = new Set((steps || []).map((r: any) => r.connected_account_id).filter(Boolean));
  const seen = new Set<string>(); const out: any[] = [];
  for (const r of all || []) {
    if (inSteps.has(r.connected_account_id) || seen.has(r.toolkit)) continue;
    seen.add(r.toolkit); out.push({ toolkit: r.toolkit, status: r.status });
  }
  // A step's own tool (Google Calendar for the Calendar step) is not listed again here.
  const { data: stepTools } = await db.from("business_connections").select("choice").eq("business_id", bid).not("choice", "is", null);
  const used = new Set((stepTools || []).map((r: any) => r.choice));
  return out.filter((t) => !used.has(t.toolkit)).slice(0, 20);
}
async function toolSearch(u: User, bid: string, url: URL) {
  await access(u, bid);
  const q = cut(url.searchParams.get("q"), 40);
  if (q.length < 2) return json({ tools: [] });
  const r = await composio(`/toolkits?search=${encodeURIComponent(q)}&limit=8`);
  const tools = (r?.items ?? []).filter((t: any) => /^[a-z0-9_]{2,60}$/.test(String(t?.slug))).slice(0, 8)
    .map((t: any) => ({ toolkit: t.slug, name: cut(t.name || t.slug, 60), about: cut(t.meta?.description, 140) }));
  return json({ tools });
}
async function connectTool(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); await unlocked(bid, r);
  const toolkit = cut(body.toolkit, 60).toLowerCase(), name = cut(body.name, 60) || toolkit;
  if (!/^[a-z0-9_]{2,60}$/.test(toolkit)) throw new Fail(400, "bad_choice");
  const { data: b } = await db.from("businesses").select("composio_user_id").eq("id", bid).single();
  const order = await firstOrder(bid);
  if (!order || !b.composio_user_id) throw new Fail(409, "no_order");
  let link: any = null;
  try {
    const auth = await composioAuthConfig(toolkit);
    const back = `${await portalUrl()}?b=${bid}&connected=tool`;
    try { link = await composio("/connected_accounts/link", { method: "POST", body: JSON.stringify({ auth_config_id: auth, user_id: b.composio_user_id, callback_url: back }) }); }
    catch { link = await composio("/connected_accounts/link", { method: "POST", body: JSON.stringify({ auth_config_id: auth, user_id: b.composio_user_id }) }); }
  } catch (e) { if ((e as Fail).code === "connect_off") throw e; }
  if (!link?.redirect_url) {
    // No one-step sign-in exists for this tool yet. Pip is told, and the owner is not left guessing.
    await db.from("api_needs").insert({ provider: toolkit.replace(/_/g, "-").slice(0, 40), primitive: "client_tool", options: [], order_id: order.id, agent_id: "" }).then(() => {}, () => {});
    await db.from("portal_issues").insert({ business_id: bid, opened_by: u.email, body: `Wants to connect ${name}, which has no one-step sign-in yet.` });
    await log(bid, "owner", `${name}: Pip was asked to add this tool.`, { actor: u.email });
    throw new Fail(409, "needs_pip", `${name} needs one setup step from Pip first. Pip has been told and will follow up.`);
  }
  await db.from("client_connections").insert({ order_id: order.id, business_id: bid, toolkit, composio_user_id: b.composio_user_id, connected_account_id: cut(link.connected_account_id, 80) || null, status: "link_made", link_expires_at: link.expires_at || null });
  await log(bid, "connection", `${name}: sign-in started.`, { actor: u.email });
  return json({ ok: true, url: link.redirect_url });
}

async function slotOf(bid: string, slot: string, kinds: string[]) {
  const { data: bc } = await db.from("business_connections").select("id,status,connection_catalog!inner(kind,label)").eq("business_id", bid).eq("slot", slot).maybeSingle();
  if (!bc || !kinds.includes((bc as any).connection_catalog.kind)) throw new Fail(400, "bad_slot");
  return bc as any;
}
async function unlocked(bid: string, r: Role) {
  const { data: b } = await db.from("businesses").select("price_accepted_at,status").eq("id", bid).single();
  if (!b.price_accepted_at && r.role !== "founder") throw new Fail(409, "setup_locked", "Setup unlocks when you accept your price.");
  if (["disconnected", "cancelled"].includes(b.status)) throw new Fail(409, "disconnected");
}
async function phone(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); await unlocked(bid, r);
  const bc = await slotOf(bid, "phone", ["number"]);
  const num = cut(body.business_number, 20).replace(/[^\d+]/g, "");
  if (num.replace(/\D/g, "").length < 10) throw new Fail(400, "bad_number");
  await db.from("phone_lines").upsert({ business_id: bid, business_number: num, carrier: cut(body.carrier, 60) || null, status: "requested", updated_at: now() });
  await db.from("business_connections").update({ status: "submitted", detail: { carrier: cut(body.carrier, 60) || null }, updated_at: now() }).eq("id", bc.id);
  await log(bid, "owner", "Phone line details saved. Pip will assign your number and send the forwarding step for your phone company.", { actor: u.email });
  return json({ ok: true });
}
async function texting(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); await unlocked(bid, r);
  const bc = await slotOf(bid, "texting", ["registration"]);
  // A tax ID is never accepted here. It is asked for only at the moment carriers open the registration.
  if ("ein" in body || "tax_id" in body || "ssn" in body) throw new Fail(400, "no_tax_id_here");
  const type = cut(body.business_type, 30);
  if (!["sole_proprietor", "llc", "corporation", "partnership", "nonprofit", "other"].includes(type)) throw new Fail(400, "bad_type");
  const legal = cut(body.legal_name, 160); if (legal.length < 2) throw new Fail(400, "bad_name");
  await db.from("texting_registrations").upsert({ business_id: bid, legal_name: legal, business_type: type, website: cut(body.website, 200) || null,
    address: { line1: cut(body.line1, 120), city: cut(body.city, 80), state: cut(body.state, 2).toUpperCase(), zip: cut(body.zip, 10) }, status: "waiting_pip", updated_at: now() });
  await db.from("business_connections").update({ status: "submitted", updated_at: now() }).eq("id", bc.id);
  await log(bid, "owner", "Texting registration details saved. Carriers review these before any text can be sent.", { actor: u.email });
  return json({ ok: true });
}
async function ack(u: User, bid: string, body: any) {
  // Steps Pip finishes with the owner: website chat line, camera box, anything waiting on Pip.
  const r = await access(u, bid); need(r, "owner"); await unlocked(bid, r);
  const bc = await slotOf(bid, cut(body.slot, 40), ["snippet", "hardware", "pip_side"]);
  await db.from("business_connections").update({ status: "submitted", detail: { note: cut(body.note, 300) || null, web_person: EMAIL.test(cut(body.web_person, 120)) ? cut(body.web_person, 120).toLowerCase() : null }, updated_at: now() }).eq("id", bc.id);
  await log(bid, "owner", `${bc.connection_catalog.label}: you asked Pip to finish this step with you.`, { actor: u.email });
  return json({ ok: true });
}
// ---------------- the Setup Agent ----------------
// The owner connects a tool with Pip's help: Pip opens the tool's sign-in page in a secure cloud browser, the owner
// signs in while watching (password through the key box, codes and captchas on the page), and Pip finishes the setup.
// The steps run in setup-run; the password goes only to vault-writer. This route starts, steers and reports.
const SETUP_OPEN = ["queued", "consent", "composio", "opening", "find_login", "owner_control", "verify", "configuring", "testing", "saving", "paused"];
async function setupRun(path: string, setup_id: string) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/setup-run${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ setup_id }), signal: AbortSignal.timeout(path === "/step" ? 5000 : 20000) }).catch(() => null);
  return r ? await r.json().catch(() => null) : null;
}
// ---------------- background work ----------------
// What Pip did for this business with nobody watching (pip-work), in plain words, and the two things only the owner
// can do: say yes or no to a job that is waiting to save something, and tell Pip to carry on after they signed in again.
async function workList(bid: string) {
  const { data } = await db.from("work_jobs").select("id,kind,title,status,outcome,summary,created_at,finished_at,plan").eq("business_id", bid).order("created_at", { ascending: false }).limit(12);
  return ((data as any[]) || []).map((j) => ({
    id: j.id, kind: j.kind, title: j.title, status: j.status, outcome: j.outcome, summary: j.summary, created_at: j.created_at, finished_at: j.finished_at,
    // Only what the owner needs to decide: the button Pip wants to press and the values it filled in. Never the rest of the plan.
    pending: j.status === "waiting_approval" && j.plan?.pending ? { label: cut(j.plan.pending.label, 80), form: j.plan.pending.form && typeof j.plan.pending.form === "object" ? j.plan.pending.form : {} } : null,
  }));
}
async function workAction(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner");
  const jid = cut(body.job, 40); if (!UUID.test(jid)) throw new Fail(400, "bad_job");
  const { data: j } = await db.from("work_jobs").select("id,title,status").eq("id", jid).eq("business_id", bid).maybeSingle();
  if (!j) throw new Fail(404, "not_found");
  const action = cut(body.action, 20);
  if (action === "approve" || action === "decline") {
    const { data: answer } = await db.rpc("work_approve", { p_job: jid, p_ok: action === "approve", p_by: u.email });
    if (answer !== "approved" && answer !== "declined") throw new Fail(409, "not_now", "This is not waiting for an answer any more.");
    return json({ ok: true, answer });
  }
  if (action === "resume") {
    const { data: ok } = await db.rpc("work_resume", { p_job: jid });
    if (ok !== true) throw new Fail(409, "not_now", "This is not waiting for you any more.");
    return json({ ok: true });
  }
  if (action === "shot") {
    // The masked screenshot Pip took just before asking: what it filled in, as the model saw it.
    const { data: st } = await db.from("work_steps").select("shot").eq("job_id", jid).eq("did", "approval_needed").not("shot", "is", null).order("seq", { ascending: false }).limit(1).maybeSingle();
    return json({ ok: true, shot: (st as any)?.shot ?? null });
  }
  if (action === "stop") {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pip-work/stop`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ job: jid }), signal: AbortSignal.timeout(20000) }).then((x) => x.body?.cancel()).catch(() => {});
    await log(bid, "owner", `${j.title}: you stopped it.`, { actor: u.email });
    return json({ ok: true });
  }
  throw new Fail(400, "bad_action");
}

// Open to every owner once setup_agent_on is true. Until then, only the founder on a TEST business (see gate.ts).
async function setupGate(admin: boolean, bid: string) {
  return setupOpen({ flag: await setting("setup_agent_on", false), admin, business: bid, sandbox: await setting("act_sandbox_businesses", []) });
}
async function setupAction(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); await unlocked(bid, r);
  if (!(await setupGate(r.admin, bid)).open) throw new Fail(409, "setup_off", "Pip's setup help is not switched on yet.");
  const action = cut(body.action, 20);
  if (action === "start") {
    needFresh(u);
    const no = vaultRefusal(body); if (no) throw new Fail(400, no.code, no.message);
    const tool = cut(body.tool_name, 80); if (tool.length < 2) throw new Fail(400, "bad_tool");
    const login = cut(body.login_url, 300);
    if (!/^https:\/\//.test(login)) throw new Fail(400, "bad_link", "Add the tool's sign-in page, starting with https://.");
    const key = tool.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "tool";
    const steps = Array.isArray(body.steps) ? body.steps.map((x: unknown) => cut(x, 200)).filter(Boolean).slice(0, 12) : [];
    const { data, error } = await db.from("setup_sessions").insert({ business_id: bid, tool, tool_key: key, login_url: login, mode: "browser", plan: { steps }, created_by: u.email }).select("id").single();
    if (error || !data) throw new Fail(409, "setup_open", "A setup for this tool is already open. Continue that one.");
    await log(bid, "owner", `${tool}: Pip's setup help started. You sign in yourself; Pip never sees your password.`, { actor: u.email });
    await setupRun("/step", data.id);
    return json({ ok: true, setup_id: data.id });
  }
  const sid = cut(body.setup_id, 40); if (!UUID.test(sid)) throw new Fail(400, "bad_setup");
  const { data: s } = await db.from("setup_sessions").select("id,tool,state,reason,result,plan,owner_taps,login_url").eq("id", sid).eq("business_id", bid).maybeSingle();
  if (!s) throw new Fail(404, "not_found");
  const tap = (patch: Record<string, unknown>) => db.from("setup_sessions").update({ ...patch, owner_taps: (s.owner_taps || 0) + 1, updated_at: now() }).eq("id", sid);
  if (action === "status") {
    const watch = ["find_login", "owner_control", "verify", "configuring", "testing"].includes(s.state);
    const live = watch ? (await setupRun("/live", sid))?.url ?? null : null;
    return json({ ok: true, setup: { id: s.id, tool: s.tool, state: s.state, reason: s.reason, result: s.result, keybox: !!s.plan?.keybox, live, interactive: s.state === "owner_control" } });
  }
  if (action === "consent") {
    if (s.state !== "consent") throw new Fail(409, "not_now");
    const { data: b } = await db.from("businesses").select("terms_version").eq("id", bid).single();
    await db.from("consent_ledger").insert({ business_id: bid, contact_hash: await sha(u.email), contact_hint: u.email.slice(0, 1) + "••••", contact_kind: "email", channel: "any", purpose: "setup_signin", status: "granted", method: "portal",
      proof: { tool: s.tool, setup_id: sid, login_url: s.login_url, terms_version: b?.terms_version ?? null, said: `Pip may sign in to ${s.tool} in a secure browser while I watch. I type my own password and codes.` }, recorded_by: u.email });
    await tap({ consent_at: now() });
    await setupRun("/step", sid);
    return json({ ok: true });
  }
  if (action === "ticket") {
    if (s.state !== "owner_control" || !s.plan?.keybox) throw new Fail(409, "not_now");
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const ticket = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await db.from("setup_tickets").insert({ hash: await sha(ticket), setup_id: sid, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    return json({ ok: true, ticket, url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/vault-writer/keys` });
  }
  if (action === "signed_in") {
    if (s.state !== "owner_control") throw new Fail(409, "not_now");
    await tap({ state: "verify", reason: null });
    await setupRun("/step", sid);
    return json({ ok: true });
  }
  if (action === "resume") {
    if (!["paused", "failed"].includes(s.state)) throw new Fail(409, "not_now");
    await tap({ state: "opening", reason: null, result: null, step: 0 });
    await setupRun("/step", sid);
    return json({ ok: true });
  }
  if (action === "stop") {
    if (!SETUP_OPEN.includes(s.state)) return json({ ok: true, already: true });
    await setupRun("/stop", sid);
    await log(bid, "owner", `${s.tool}: setup stopped.`, { actor: u.email });
    return json({ ok: true });
  }
  throw new Fail(400, "bad_action");
}

async function vault(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); await unlocked(bid, r);
  // Closed until an external vault and its login service exist. Nothing secret is accepted, stored or logged.
  // Field names, values, and the link: a password typed anywhere, or a link with a sign-in in it, is refused.
  const no = vaultRefusal(body); if (no) throw new Fail(400, no.code, no.message);
  const tool = cut(body.tool_name, 120); if (tool.length < 2) throw new Fail(400, "bad_tool");
  const order = await firstOrder(bid);
  await db.from("portal_issues").insert({ business_id: bid, opened_by: u.email, body: `Password-only tool to connect when the vault opens: ${tool}${body.login_url ? ` (${cut(body.login_url, 200)})` : ""}` });
  await db.from("api_needs").insert({ provider: "vault", primitive: "vault_login", options: [tool.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)], order_id: order?.id ?? null, agent_id: "" }).then(() => {}, () => {});
  await log(bid, "owner", `${tool}: saved for the vault. No password was taken.`, { actor: u.email });
  return json({ ok: true, vault_open: false });
}
async function unsupported(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner", "staff");
  const tool = cut(body.tool_name, 120); if (tool.length < 2) throw new Fail(400, "bad_tool");
  const slot = cut(body.slot, 40) || null;
  const order = await firstOrder(bid);
  const slug = tool.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unknown";
  await db.from("api_needs").insert({ provider: slug, primitive: slot || "client_tool", options: [], order_id: order?.id ?? null, agent_id: "" }).then(() => {}, () => {});
  await db.from("portal_issues").insert({ business_id: bid, opened_by: u.email, body: `Uses a tool Pip cannot connect yet: ${tool}${body.what_for ? `. For: ${cut(body.what_for, 300)}` : ""}` });
  if (slot) await db.from("business_connections").update({ status: "unsupported", detail: { tool }, updated_at: now() }).eq("business_id", bid).eq("slot", slot).in("status", ["needed", "failed", "unsupported"]);
  await log(bid, "owner", `${tool}: Pip was asked to add this tool. The rest of your team can still go live.`, { actor: u.email });
  return json({ ok: true });
}

async function specOf(bid: string, sid: string) {
  if (!UUID.test(sid)) throw new Fail(404, "not_found");
  const { data: s } = await db.from("skill_specs").select("id,skill_id,status,order_id,build_orders!inner(business_id)").eq("id", sid).eq("build_orders.business_id", bid).maybeSingle();
  if (!s) throw new Fail(404, "not_found");
  return s as any;
}
async function pauseSpec(bid: string, s: any, reason: string, detail: string | null, by: string) {
  const { data: open } = await db.from("agent_pauses").select("id").eq("spec_id", s.id).is("job", null).is("resumed_at", null).limit(1);
  if (!open?.length) await db.from("agent_pauses").insert({ business_id: bid, spec_id: s.id, reason, detail, prior_status: s.status, paused_by: by });
  if (s.status === "live") await db.from("skill_specs").update({ status: "paused", updated_at: now() }).eq("id", s.id);
}
async function pause(u: User, bid: string, sid: string, body: any) {
  const r = await access(u, bid); need(r, "owner", "staff");
  const s = await specOf(bid, sid);
  await pauseSpec(bid, s, r.role === "staff" ? "staff" : r.role === "founder" ? "founder" : "owner", cut(body.why, 300) || null, u.email);
  await log(bid, "pause", `${s.skill_id} was paused by ${u.email}.`, { spec_id: s.id, agent: s.skill_id, actor: u.email, outcome: "paused" });
  return json({ ok: true });
}
// ---- operators: what one does in plain words, and the owner's approvals ----
// The whole surface is dark while operate_lane is off, so it cannot be reached or probed before the lane ships.
async function operatorSpec(bid: string, sid: string) {
  const { data: on } = await db.rpc("portal_flag", { p_key: "operate_lane", p_default: false });
  if (on !== true) throw new Fail(404, "not_found");
  const s = await specOf(bid, sid);
  const { data } = await db.from("skill_specs").select("spec").eq("id", s.id).maybeSingle();
  return { s, spec: data?.spec };
}
async function operatorView(u: User, bid: string, sid: string) {
  await access(u, bid);
  const { s, spec } = await operatorSpec(bid, sid);
  const c = checkOperate(spec);
  if (!c.ok || !c.operate) throw new Fail(404, "not_found");
  const [{ data: rows }, { data: ok }] = await Promise.all([
    db.from("operator_approvals").select("id,kind,subject,status,version,voice,approved_at,revoked_at").eq("spec_id", s.id).order("id"),
    db.rpc("operator_approved_current", { p_spec: s.id }),
  ]);
  // What this operator needs approved before it posts anything, so the Portal can ask for exactly that and nothing else.
  const asks = { brand_voice: !!(c.operate as any).approvals?.brand_voice, accounts: ((c.operate as any).approvals?.accounts ?? []) as string[] };
  return json({ ok: true, process: c.operate.process, words: operatePlainWords(c.operate), approvals: rows ?? [], approved: ok === true, asks });
}
// What an operator has open and what it finished in the last seven days, for the Portal's review screen. Counts, stages
// and times only: never who the customer is, never the case key, never the words kept for the message.
async function operatorCases(u: User, bid: string, sid: string) {
  await access(u, bid);
  const { s, spec } = await operatorSpec(bid, sid);
  const c = checkOperate(spec);
  if (!c.ok || !c.operate) throw new Fail(404, "not_found");
  const cols = "id,stage,touches,next_at,status,closed_reason,opened_at,closed_at,last_touch_at";
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [open, closed] = await Promise.all([
    db.from("operator_cases").select(cols).eq("spec_id", s.id).eq("business_id", bid).eq("status", "open").order("next_at").limit(50),
    db.from("operator_cases").select(cols).eq("spec_id", s.id).eq("business_id", bid).neq("status", "open").gte("closed_at", weekAgo).order("closed_at", { ascending: false }).limit(50),
  ]);
  const slim = (x: any) => ({ ref: String(x.id).slice(0, 8), stage: x.stage ?? null, touches: Number(x.touches) || 0, next_at: x.next_at ?? null, status: x.status, closed_reason: x.closed_reason ?? null, opened_at: x.opened_at ?? null, closed_at: x.closed_at ?? null, last_touch_at: x.last_touch_at ?? null });
  const o = ((open.data as any[]) || []).slice(0, 50).map(slim), d = ((closed.data as any[]) || []).slice(0, 50).map(slim);
  return json({ ok: true, process: c.operate.process, max_touches: (c.operate as any).touches?.max ?? null, open: o, closed: d, more: o.length === 50 || d.length === 50 });
}
async function operatorApproval(u: User, bid: string, sid: string, body: any) {
  const r = await access(u, bid);
  const { s, spec } = await operatorSpec(bid, sid);
  const ask = checkAsk(spec, body);
  if (!ask.ok) throw new Fail(400, "bad_request", ask.why);
  if (ask.do === "request") {
    need(r, "owner"); // the owner, or the founder asking on the owner's behalf; staff cannot
    const { data: id } = await db.rpc("operator_approval_request", { p_spec: s.id, p_kind: ask.kind, p_subject: ask.subject, p_voice: ask.voice });
    if (!id) throw new Fail(409, "cannot_request");
    await log(bid, "approval", `${s.skill_id}: ${ask.kind === "brand_voice" ? "its brand voice" : `the ${ask.subject} account`} is waiting for the owner to approve.`, { spec_id: s.id, agent: s.skill_id, actor: u.email, outcome: "info" });
    return json({ ok: true, id });
  }
  // The approval has to be one of THIS teammate's, for this business.
  const { data: row } = await db.from("operator_approvals").select("id,kind,subject").eq("id", ask.id).eq("spec_id", s.id).eq("business_id", bid).maybeSingle();
  if (!row) throw new Fail(404, "not_found");
  if (ask.do === "approve") {
    if (!mayApprove(r.role, r.admin)) throw new Fail(403, "owner_only", "Only the owner can approve this.");
    needFresh(u);
    const { data: done } = await db.rpc("operator_approval_approve", { p_id: ask.id, p_by: u.email });
    if (done !== true) throw new Fail(409, "cannot_approve", "That approval is not waiting for you any more.");
    await log(bid, "approval", `${u.email} approved ${row.kind === "brand_voice" ? "the brand voice" : `the ${row.subject} account`} for ${s.skill_id}.`, { spec_id: s.id, agent: s.skill_id, actor: u.email, outcome: "ok" });
    return json({ ok: true });
  }
  if (!mayRevoke(r.role)) throw new Fail(403, "owner_only");
  const { data: gone } = await db.rpc("operator_approval_revoke", { p_id: ask.id, p_by: u.email });
  if (gone !== true) throw new Fail(409, "cannot_revoke", "That approval is already taken back.");
  await log(bid, "approval", `${u.email} took back ${row.kind === "brand_voice" ? "the brand voice" : `the ${row.subject} account`} approval for ${s.skill_id}. ${s.skill_id} stops posting until it is approved again.`, { spec_id: s.id, agent: s.skill_id, actor: u.email, outcome: "paused" });
  return json({ ok: true });
}
async function resume(u: User, bid: string, sid: string) {
  const r = await access(u, bid); need(r, "owner");
  const s = await specOf(bid, sid);
  const { data: open } = await db.from("agent_pauses").select("id,prior_status").eq("spec_id", s.id).is("resumed_at", null);
  const wasLive = (open || []).some((p: any) => p.prior_status === "live");
  if (s.status === "paused" && wasLive) {
    // The go-live gate runs again here, so a broken connection or a missing agreement still blocks a resume.
    const { error } = await db.from("skill_specs").update({ status: "live", updated_at: now() }).eq("id", s.id);
    if (error) throw new Fail(409, "cannot_resume", error.message.replace(/^portal: |^health: |^camera: |^shelf: /, ""));
  }
  await db.from("agent_pauses").update({ resumed_at: now(), resumed_by: u.email }).eq("spec_id", s.id).is("resumed_at", null);
  await log(bid, "resume", `${s.skill_id} was resumed by ${u.email}.`, { spec_id: s.id, agent: s.skill_id, actor: u.email, outcome: "ok" });
  return json({ ok: true });
}
async function issue(u: User, bid: string, body: any) {
  await access(u, bid);
  const text = cut(body.body, 2000); if (text.length < 3) throw new Fail(400, "say_more");
  const sid = UUID.test(cut(body.spec_id, 40)) ? cut(body.spec_id, 40) : null;
  await db.from("portal_issues").insert({ business_id: bid, spec_id: sid, log_id: Number(body.log_id) || null, opened_by: u.email, body: text });
  await log(bid, "owner", "A problem was reported to Pip.", { actor: u.email, spec_id: sid ?? undefined });
  return json({ ok: true });
}
async function addPerson(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); needFresh(u);
  const email = cut(body.email, 120).toLowerCase(); if (!EMAIL.test(email)) throw new Fail(400, "bad_email");
  const role = body.role === "owner" ? "owner" : "staff";
  const { data: b } = await db.from("businesses").select("name").eq("id", bid).single();
  const { error } = await db.from("members").upsert({ business_id: bid, email, role, status: "invited", invited_by: u.email, updated_at: now() }, { onConflict: "business_id,email" });
  if (error) throw new Fail(500, "save_failed");
  await db.from("portal_outbox").insert({ business_id: bid, to_email: email, template: "invite", data: { business: b.name, role, by: u.email } });
  await log(bid, "owner", `${email} was added as ${role}.`, { actor: u.email });
  return json({ ok: true });
}
async function removePerson(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); needFresh(u);
  const id = cut(body.member_id, 40); if (!UUID.test(id)) throw new Fail(400, "bad_member");
  const { data: m } = await db.from("members").select("id,email,role").eq("id", id).eq("business_id", bid).maybeSingle();
  if (!m) throw new Fail(404, "not_found");
  if (m.role === "owner") {
    const c = await db.from("members").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("role", "owner").neq("status", "removed");
    if ((c.count || 0) <= 1) throw new Fail(409, "last_owner", "A business needs at least one owner.");
  }
  await db.from("members").update({ status: "removed", updated_at: now() }).eq("id", id);
  await log(bid, "owner", `${m.email} was removed.`, { actor: u.email });
  return json({ ok: true });
}
async function alerts(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner");
  const mobile = cut(body.mobile, 20).replace(/[^\d+]/g, "");
  const prefs = { mobile: mobile.replace(/\D/g, "").length >= 10 ? mobile : null, mobile_verified: false, by_email: body.by_email !== false,
    quiet_from: /^\d\d:\d\d$/.test(body.quiet_from) ? body.quiet_from : "21:00", quiet_to: /^\d\d:\d\d$/.test(body.quiet_to) ? body.quiet_to : "07:00" };
  await db.from("businesses").update({ alert_prefs: prefs, updated_at: now() }).eq("id", bid);
  return json({ ok: true, alert_prefs: prefs });
}
async function disconnect(u: User, bid: string, body: any) {
  const r = await access(u, bid); need(r, "owner"); needFresh(u);
  const { data: b } = await db.from("businesses").select("name,status").eq("id", bid).single();
  if (cut(body.confirm, 200).toLowerCase() !== b.name.trim().toLowerCase()) throw new Fail(400, "type_the_name", "Type the business name exactly to confirm.");
  const { data: rows } = await db.from("business_connections").select("id,connected_account_id").eq("business_id", bid);
  const { data: others } = await db.from("client_connections").select("connected_account_id").eq("business_id", bid).not("connected_account_id", "is", null).neq("status", "revoked");
  const accounts = [...new Set([...(rows || []), ...(others || [])].map((r: any) => r.connected_account_id).filter(Boolean))] as string[];
  let revoked = 0; const failed: string[] = [];
  for (const acct of accounts) {
    try { await composio(`/connected_accounts/${encodeURIComponent(acct)}`, { method: "DELETE" }); revoked++; }
    catch (e) { if ((e as Fail).code !== "connect_off") failed.push(acct); }
  }
  await db.from("business_connections").update({ status: "revoked", updated_at: now() }).eq("business_id", bid);
  await db.from("client_connections").update({ status: "revoked", updated_at: now() }).eq("business_id", bid);
  await db.from("vault_items").update({ status: "deleted" }).eq("business_id", bid);
  const { data: specs } = await db.from("skill_specs").select("id,skill_id,status,build_orders!inner(business_id)").eq("build_orders.business_id", bid);
  for (const s of specs || []) await pauseSpec(bid, s, "disconnect", "The owner disconnected everything.", u.email);
  await db.from("businesses").update({ status: "disconnected", updated_at: now() }).eq("id", bid);
  await log(bid, "owner", `${u.email} disconnected everything. ${revoked} tool sign-in(s) revoked and every agent stopped.`, { actor: u.email, outcome: failed.length ? "failed" : "ok" });
  if (failed.length) await db.from("portal_issues").insert({ business_id: bid, opened_by: "pip", body: `Disconnect: ${failed.length} tool sign-in(s) could not be revoked automatically and need a manual check.` });
  const { data: owners } = await db.from("members").select("email").eq("business_id", bid).eq("role", "owner").neq("status", "removed");
  for (const o of owners || []) await db.from("portal_outbox").insert({ business_id: bid, to_email: o.email, template: "disconnected", data: { business: b.name, by: u.email } });
  return json({ ok: true, revoked, needs_manual_check: failed.length, remember: "Turn off call forwarding at your phone company. Pip cannot do that for you." });
}

// ---------------- founder ----------------
async function founder(u: User, action: string, body: any) {
  if (!(await isAdmin(u.email))) throw new Fail(404, "not_found");
  if (action === "businesses") {
    const { data } = await db.from("businesses").select("id,name,domain,industry,state,status,health_lane,price_accepted_at,quote,created_at").order("created_at", { ascending: false }).limit(200);
    const { data: st } = await db.from("forge_settings").select("key,value").in("key", ["portal_invites", "portal_golive_gate", "portal_url", "portal_terms_url", "portal_terms_version"]);
    const { data: vend } = await db.from("business_agreements").select("kind,party,status").is("business_id", null).order("party");
    const { data: iss } = await db.from("portal_issues").select("id,business_id,body,status,created_at,opened_by").neq("status", "resolved").order("created_at", { ascending: false }).limit(50);
    return json({ businesses: data || [], settings: Object.fromEntries((st || []).map((s: any) => [s.key, s.value])), vendor_agreements: vend || [], issues: iss || [] });
  }
  const bid = cut(body.business_id, 40);
  if (action === "quote_draft") {
    // The founder's pricing draft. One price-book line per teammate, picked from what its jobs do, priced by quote().
    // Nothing is saved on the business and the owner sees nothing: the page only fills the founder's three boxes.
    if (!UUID.test(bid)) throw new Fail(400, "bad_business");
    const { data: orders } = await db.from("build_orders").select("id").eq("business_id", bid);
    const ids = (orders ?? []).map((o: any) => o.id);
    const { data: specs } = ids.length ? await db.from("skill_specs").select("skill_id,spec,quote,status").in("order_id", ids).neq("status", "retired").order("created_at") : { data: [] };
    const mates = (specs ?? []).slice(0, 30).map((x: any) => ({ name: cut(x.spec?.board?.teammate?.name || x.spec?.board?.name || x.skill_id, 60), key: priceKeyOf(x.spec, x.quote?.lane) }));
    if (!mates.length) throw new Fail(409, "no_teammates", "This business has no teammates to price yet.");
    const { data: conns } = await db.from("client_connections").select("toolkit,status").eq("business_id", bid);
    const connections = [...new Set((conns ?? []).filter((c: any) => c.status === "active" || c.status === "connected").map((c: any) => cut(c.toolkit, 40)))].slice(0, 20).map((tool) => ({ tool, kind: "api" }));
    const { data, error } = await db.rpc("quote", { p_agents: mates.map((m: any) => ({ key: m.key })), p_connections: connections, p_opts: { caller: "portal", business_id: bid } });
    if (error || !data) throw new Fail(400, "bad_quote", String(error?.message || "quote failed").replace(/^quote: /, ""));
    return json({ ok: true, ...draftWords(data, mates), quote_id: data.quote_id ?? null, teammates: mates.length });
  }
  if (action === "quote") {
    if (!UUID.test(bid)) throw new Fail(400, "bad_business");
    const { data: b } = await db.from("businesses").select("price_accepted_at,status").eq("id", bid).single();
    if (b.price_accepted_at) throw new Fail(409, "already_accepted", "This price was already accepted. A change needs a new acceptance.");
    // The price comes from quote() (the price book), the same function the pricing email uses, so the two cannot
    // disagree. Send { agents, connections?, opts? }. A hand-made { quote } is still taken, for prices set before it.
    let q = body.quote;
    if (Array.isArray(body.agents)) {
      const opts = { ...(body.opts && typeof body.opts === "object" ? body.opts : {}), caller: "portal", business_id: bid };
      const { data, error } = await db.rpc("quote", { p_agents: body.agents, p_connections: Array.isArray(body.connections) ? body.connections : [], p_opts: opts });
      if (error || !data) throw new Fail(400, "bad_quote", String(error?.message || "quote failed").replace(/^quote: /, ""));
      q = data;
    }
    if (!q || typeof q !== "object" || JSON.stringify(q).length > 15000) throw new Fail(400, "bad_quote");
    await db.from("businesses").update({ quote: q, status: "priced", updated_at: now() }).eq("id", bid);
    await log(bid, "system", "Your price is ready to review.", { actor: u.email });
    return json({ ok: true });
  }
  if (action === "link") {
    // A one-time sign-in link for the founder to send himself, the same way client_connect works today.
    const email = cut(body.email, 120).toLowerCase();
    const m = await db.from("members").select("id", { count: "exact", head: true }).eq("email", email).neq("status", "removed");
    if (!(m.count || 0)) throw new Fail(404, "not_a_member");
    return json({ ok: true, link: await oneTimeLink(email), note: "Works once and lasts one hour. Send it to the owner yourself." });
  }
  if (action === "agreement") {
    const kind = cut(body.kind, 30), party = cut(body.party, 120), status = cut(body.status, 12) || "signed";
    if (!["baa_client", "baa_vendor", "dpa", "camera_signoff", "login_authorization", "terms", "privacy", "sms_terms"].includes(kind) || !party) throw new Fail(400, "bad_agreement");
    if (!["missing", "requested", "signed", "expired"].includes(status)) throw new Fail(400, "bad_status");
    await fileAgreement({ business_id: UUID.test(bid) ? bid : null, kind, party, status, document_url: cut(body.document_url, 300) || null, accepted_by: u.email, accepted_at: status === "signed" ? now() : null });
    return json({ ok: true });
  }
  if (action === "setting") {
    const key = cut(body.key, 40);
    if (!["portal_invites", "portal_golive_gate"].includes(key) || typeof body.value !== "boolean") throw new Fail(400, "bad_setting");
    await db.from("forge_settings").upsert({ key, value: body.value, updated_at: now() });
    return json({ ok: true });
  }
  if (action === "resolve") {
    await db.from("portal_issues").update({ status: "resolved", resolved_at: now(), resolution: cut(body.resolution, 500) || null }).eq("id", Number(body.issue_id) || 0);
    return json({ ok: true });
  }
  throw new Fail(404, "not_found");
}

// ---------------- hooks (no session; they only move queued work forward) ----------------
async function flushOutbox() {
  const { data: rows } = await db.from("portal_outbox").select("id,business_id,to_email,template,data,tries").eq("status", "pending").order("created_at").limit(10);
  let sent = 0;
  for (const r of rows || []) {
    try {
      const door = await doorLink(r.to_email);
      const link = r.business_id && r.template !== "disconnected" ? `${door}&b=${r.business_id}` : door;
      await sendMail(r.to_email, r.template, { ...(r.data || {}), link });
      await db.from("portal_outbox").update({ status: "sent", sent_at: now() }).eq("id", r.id); sent++;
    } catch (e) {
      await db.from("portal_outbox").update({ tries: r.tries + 1, status: r.tries + 1 >= 3 ? "failed" : "pending", error: String((e as Error).message).slice(0, 300) }).eq("id", r.id);
    }
  }
  return json({ sent, seen: rows?.length || 0 });
}
async function healthSweep() {
  if (!(Deno.env.get("COMPOSIO_API_KEY") ?? "").trim()) return json({ checked: 0, note: "connect_off" });
  const { data: rows } = await db.from("business_connections").select("business_id").not("connected_account_id", "is", null).in("status", ["active", "link_made"]);
  // Tools connected outside the setup steps are watched too.
  const { data: more } = await db.from("client_connections").select("business_id").not("connected_account_id", "is", null).not("business_id", "is", null).in("status", ["active", "link_made"]);
  const ids = [...new Set([...(rows || []), ...(more || [])].map((r: any) => r.business_id))].slice(0, 100);
  let changed = 0;
  for (const id of ids) { try { changed += (await refresh(id, "pip")).changed; } catch { /* next */ } }
  return json({ checked: ids.length, changed });
}

// ---------------- router ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const p = parts.slice(parts.indexOf("pip-portal") + 1);
    let body: any = {};
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw.length > 20000) throw new Fail(413, "too_large");
      try { body = raw ? JSON.parse(raw) : {}; } catch { throw new Fail(400, "bad_json"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Fail(400, "bad_json");
    } else if (req.method !== "GET") throw new Fail(405, "method");

    if (p[0] === "hooks" && req.method === "POST") {
      if (p[1] === "outbox") return await flushOutbox();
      if (p[1] === "health") return await healthSweep();
    }
    if (p[0] === "signin" && req.method === "POST") return await signin(req, body);
    if (p[0] === "config" && req.method === "GET") return json({ ok: true, terms_url: await setting("portal_terms_url", null) });

    const u = await who(req);
    if (p[0] === "me") return await me(u);
    if (p[0] === "founder" && p[1]) return await founder(u, p[1], body);
    if (p[0] === "business" && p[1]) {
      const bid = p[1], a = p[2];
      if (!a && req.method === "GET") return await business(u, bid);
      if (a === "activity" && req.method === "GET") return await activity(u, bid, url);
      if (a === "tools" && req.method === "GET") return await toolSearch(u, bid, url);
      if (a === "agents" && p[3] && p[4] === "operator" && req.method === "GET") return await operatorView(u, bid, p[3]);
      if (a === "agents" && p[3] && p[4] === "operator-cases" && req.method === "GET") return await operatorCases(u, bid, p[3]);
      if (req.method !== "POST") throw new Fail(405, "method");
      if (a === "profile") return await setProfile(u, bid, body);
      if (a === "basics") return await setBasics(u, bid, body);
      if (a === "accept") return await accept(u, bid, body);
      if (a === "connect") return await connect(u, bid, body);
      if (a === "connect-tool") return await connectTool(u, bid, body);
      if (a === "refresh") return await refreshRoute(u, bid);
      if (a === "phone") return await phone(u, bid, body);
      if (a === "texting") return await texting(u, bid, body);
      if (a === "ack") return await ack(u, bid, body);
      if (a === "vault") return await vault(u, bid, body);
      if (a === "setup") return await setupAction(u, bid, body);
      if (a === "work") return await workAction(u, bid, body);
      if (a === "door") return await doorAction(u, bid, body);
      if (a === "piece") return await pieceAction(u, bid, body);
      if (a === "note") return await noteAction(u, bid, body);
      if (a === "unsupported") return await unsupported(u, bid, body);
      if (a === "issue") return await issue(u, bid, body);
      if (a === "people") return await addPerson(u, bid, body);
      if (a === "remove-person") return await removePerson(u, bid, body);
      if (a === "alerts") return await alerts(u, bid, body);
      if (a === "disconnect") return await disconnect(u, bid, body);
      if (a === "agents" && p[3] && p[4] === "pause") return await pause(u, bid, p[3], body);
      if (a === "agents" && p[3] && p[4] === "resume") return await resume(u, bid, p[3]);
      if (a === "agents" && p[3] && p[4] === "operator-approval") return await operatorApproval(u, bid, p[3], body);
    }
    throw new Fail(404, "not_found");
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.code, message: e.message !== e.code ? e.message : undefined }, e.status);
    console.error("pip-portal", (e as Error)?.message);
    return json({ error: "server_error" }, 500);
  }
});
