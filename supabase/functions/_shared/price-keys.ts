// Which line of Pip's price book a teammate is priced on (Nov 27, 2026). quote() prices a list of price-book keys;
// this picks one key per teammate from what its jobs actually do, so the founder's pricing draft comes from the same
// function as the pricing email and cannot disagree with it. A teammate is priced on the dearest thing it does.
// Used only for the founder's draft and for billing. Nothing here is ever sent to the Marketplace.
// deno-lint-ignore no-explicit-any
type J = any;
export const PRICE_KEYS = ["phone_agent", "camera_count", "text_followup", "calendar_booking", "review_replies", "content_posting", "email_followup", "web_chat", "owner_alerts"] as const;
export type PriceKey = typeof PRICE_KEYS[number];

/** Every price-book line a teammate touches, dearest first. Never empty: a teammate that only tells the owner things is owner_alerts. */
export function priceKeysOf(spec: J, lane?: string | null): PriceKey[] {
  const jobs: J[] = Array.isArray(spec?.jobs) ? spec.jobs : [], hit = new Set<PriceKey>();
  const text = JSON.stringify([spec?.board?.uses ?? [], spec?.board?.tagline ?? "", spec?.board?.power ?? ""]).toLowerCase();
  for (const j of jobs) {
    for (const t of Array.isArray(j?.triggers) ? j.triggers : []) {
      if (t?.type === "message") for (const c of t.channels ?? []) { if (c === "voice") hit.add("phone_agent"); if (c === "sms") hit.add("text_followup"); if (c === "web_chat") hit.add("web_chat"); if (c === "email") hit.add("email_followup"); }
      if (t?.type === "event" && t.event === "missed_call") hit.add("phone_agent");
      if (t?.type === "event" && t.event === "count_changed") hit.add("camera_count");
    }
    for (const g of Array.isArray(j?.tools) ? j.tools : []) {
      const tool = String(g?.tool ?? ""), rec = String(g?.records ?? ""), can: string[] = Array.isArray(g?.can) ? g.can : [];
      if (tool === "calendar" && can.includes("add")) hit.add("calendar_booking");
      if (tool === "email" && (can.includes("add") || can.includes("update"))) hit.add("email_followup");
      if (tool === "pip" && rec === "outbound_text") hit.add("text_followup");
      if (rec === "review" || tool === "google_profile") hit.add("review_replies");
      if (rec === "post" || tool === "social") hit.add("content_posting");
      if (rec === "count") hit.add("camera_count");
    }
  }
  if (lane === "onprem" || /\bcamera|people_count|rf-?detr/.test(text)) hit.add("camera_count");
  if (!jobs.length) { // an older teammate with no declared jobs: go by what its card says it uses
    if (/realtime_voice|phone/.test(text)) hit.add("phone_agent");
    if (/send_text|\bsms\b/.test(text)) hit.add("text_followup");
    if (/calendar|request_booking/.test(text)) hit.add("calendar_booking");
    if (/google_profile|review/.test(text)) hit.add("review_replies");
    if (/"email"/.test(text)) hit.add("email_followup");
    if (/web_chat/.test(text)) hit.add("web_chat");
  }
  const out = PRICE_KEYS.filter((k) => hit.has(k));
  return out.length ? out : ["owner_alerts"];
}
/** The one line a teammate is priced on. */
export const priceKeyOf = (spec: J, lane?: string | null): PriceKey => priceKeysOf(spec, lane)[0];

/** The founder's draft, from quote()'s answer: the two numbers for the price card and plain lines to edit. Costs and margins stay out of the words. */
export function draftWords(q: J, mates: { name: string; key: string }[]): { monthly_usd: number; setup_usd: number; summary: string; flags: string[] } {
  const usd = (n: unknown) => "$" + (Math.round(Number(n ?? 0) * 100) / 100).toString();
  const lines: string[] = (Array.isArray(q?.agents) ? q.agents : []).map((a: J, i: number) => `${mates[i]?.name ?? a.label}: ${String(a.label ?? a.key).toLowerCase()}, ${usd(a.after_discount ?? a.price)} a month`);
  const r = q?.rates ?? {};
  const parts = [
    ...lines,
    q?.base_fee ? `Pip base: ${usd(q.base_fee)} a month` : null,
    q?.included_usd != null ? `Includes ${usd(q.included_usd)} of usage a month` : null,
    r.conversation != null || r.sms != null || r.voice_minute != null ? `Past that: ${[r.conversation != null ? `${usd(r.conversation)} a conversation` : null, r.sms != null ? `${usd(r.sms)} a text` : null, r.voice_minute != null ? `${usd(r.voice_minute)} a voice minute` : null].filter(Boolean).join(", ")}` : null,
    Number(q?.setup_usd) > 0 ? `One-time setup: ${usd(q.setup_usd)}` : null,
    q?.hardware_usd != null ? `Camera box: ${usd(q.hardware_usd)}` : null,
  ].filter(Boolean);
  return { monthly_usd: Number(q?.monthly_usd ?? 0), setup_usd: Number(q?.setup_usd ?? 0), summary: parts.join(". ") + ".", flags: Array.isArray(q?.flags) ? q.flags.map(String) : [] };
}
