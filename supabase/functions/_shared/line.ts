// A business's Pip phone number: the rules for getting one (Nov 27, 2026).
//
// pip-line buys a number from Twilio with Pip's own account, and only these rules decide what it may buy:
//   - a United States local number that can take calls and texts, and nothing else
//   - never above the monthly price the founder approved (forge_settings 'line_buy'.max_monthly_usd); if Twilio's
//     price cannot be read, the answer is no
//   - a number Pip already owns for the business (found by its label) is used again, never bought twice
// Nothing here talks to Twilio or the database, so every rule is tested without either.
// deno-lint-ignore-file no-explicit-any
export const US_LOCAL = /^\+1[2-9]\d{9}$/;
export const NUMBER_SID = /^PN[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The label Pip puts on a number at Twilio, so a number bought for a business can always be found again. */
export const label = (business: string): string => `pip:${String(business).toLowerCase()}`;

/** Up to four North American area codes, in the order asked. Anything else is dropped. */
export function areaCodes(input: unknown): string[] {
  const list = Array.isArray(input) ? input : input == null ? [] : [input];
  const out: string[] = [];
  for (const x of list) {
    const s = String(x ?? "").trim();
    if (/^[2-9]\d{2}$/.test(s) && !out.includes(s)) out.push(s);
    if (out.length === 4) break;
  }
  return out;
}

/** Twilio's monthly price for a United States local number, from its pricing answer. Null when it cannot be read. */
export function localPrice(pricing: any): number | null {
  if (!pricing || String(pricing.iso_country ?? "").toUpperCase() !== "US") return null;
  if (String(pricing.price_unit ?? "").toUpperCase() !== "USD") return null;
  const rows = Array.isArray(pricing.phone_number_prices) ? pricing.phone_number_prices : [];
  const row = rows.find((r: any) => String(r?.number_type ?? "").toLowerCase() === "local");
  if (!row) return null;
  // The price charged is current_price. Take the dearer of the two when both are there, so a discount never hides a cost.
  const nums = [row.current_price, row.base_price].map((v: unknown) => (typeof v === "string" && v.trim() !== "" || typeof v === "number") ? Number(v) : NaN).filter((n: number) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

/** May Pip buy at this price? Fails closed: an unreadable price or an unreadable ceiling is a no. */
export function priceOk(price: number | null, ceiling: unknown): { ok: boolean; reason: string | null } {
  const max = typeof ceiling === "number" ? ceiling : NaN;
  if (!Number.isFinite(max) || max <= 0 || max > 50) return { ok: false, reason: "no_ceiling" };
  if (price === null || !Number.isFinite(price) || price <= 0) return { ok: false, reason: "price_unknown" };
  return price <= max + 1e-9 ? { ok: true, reason: null } : { ok: false, reason: "over_ceiling" };
}

/** The first number in Twilio's list that is a US local number able to take both calls and texts. */
export function pickNumber(available: any): string | null {
  const rows = Array.isArray(available?.available_phone_numbers) ? available.available_phone_numbers : [];
  for (const r of rows) {
    const n = String(r?.phone_number ?? "");
    if (US_LOCAL.test(n) && r?.capabilities?.voice === true && (r?.capabilities?.SMS === true || r?.capabilities?.sms === true)) return n;
  }
  return null;
}

/** A number Pip already owns for this business, from Twilio's list of the account's numbers. */
export function owned(list: any, business: string): { sid: string; number: string } | null {
  const rows = Array.isArray(list?.incoming_phone_numbers) ? list.incoming_phone_numbers : [];
  const want = label(business);
  for (const r of rows) {
    if (String(r?.friendly_name ?? "") === want && NUMBER_SID.test(String(r?.sid ?? "")) && US_LOCAL.test(String(r?.phone_number ?? ""))) return { sid: r.sid, number: r.phone_number };
  }
  return null;
}

/** One exact number the account already holds, to be used for this business. "taken" when it is labelled for another business. */
export function ownedNumber(list: any, number: string, business: string): { sid: string; number: string } | "taken" | null {
  if (!US_LOCAL.test(number)) return null;
  const rows = Array.isArray(list?.incoming_phone_numbers) ? list.incoming_phone_numbers : [];
  const r = rows.find((x: any) => String(x?.phone_number ?? "") === number && NUMBER_SID.test(String(x?.sid ?? "")));
  if (!r) return null;
  const name = String(r.friendly_name ?? "");
  if (/^pip:/i.test(name) && name.toLowerCase() !== label(business)) return "taken";
  return { sid: r.sid, number: r.phone_number };
}

/** Where Twilio sends a call, a call's end, and a text for a Pip number. `base` is the functions address. */
export function hooks(base: string, fallback?: unknown): Record<string, string> {
  const b = String(base).replace(/\/+$/, "");
  const out: Record<string, string> = {
    VoiceUrl: `${b}/pip-voice/twilio/voice`, VoiceMethod: "POST",
    StatusCallback: `${b}/pip-voice/twilio/status`, StatusCallbackMethod: "POST",
    SmsUrl: `${b}/pip-run/twilio/sms`, SmsMethod: "POST",
  };
  // What a caller hears if pip-voice itself is down: a plain recorded message kept somewhere other than Pip's functions.
  if (typeof fallback === "string" && /^https:\/\/[a-z0-9.-]+\/[\w\-./?=&%]*$/i.test(fallback) && fallback.length <= 300) { out.VoiceFallbackUrl = fallback; out.VoiceFallbackMethod = "POST"; }
  return out;
}

/** The form Pip sends to buy one exact number. Never an area code alone: Pip chooses the number, then buys that one. */
export function buyForm(number: string, business: string, base: string, fallback?: unknown): URLSearchParams | null {
  if (!US_LOCAL.test(number) || !UUID.test(business)) return null;
  return new URLSearchParams({ PhoneNumber: number, FriendlyName: label(business), ...hooks(base, fallback) });
}

/** The form that points a number the account already holds at Pip and labels it for the business. It names no number, so it can never buy one. */
export function pointForm(business: string, base: string, fallback?: unknown): URLSearchParams | null {
  if (!UUID.test(business)) return null;
  return new URLSearchParams({ FriendlyName: label(business), ...hooks(base, fallback) });
}

/** A line can send a text only when it has a number and has been checked end to end. */
export function canText<T extends { pip_number?: string | null; status?: string | null }>(line: T | null | undefined): line is T & { pip_number: string; status: "verified" } {
  return !!line && typeof line.pip_number === "string" && line.pip_number.length > 0 && line.status === "verified";
}
