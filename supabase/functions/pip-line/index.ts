// pip-line: gets a business its Pip phone number, on Pip's own Twilio account.
//
//   POST /buy   {business, area_codes?: ["208"], number?: "+12085550100", spec?: <teammate id>, dry?: true}
//               Internal: Pip's service key, or a founder's short-lived test ticket for a business on the TEST list.
//               Finds a United States local number that takes calls and texts, checks Twilio's monthly price against
//               the founder's ceiling, buys that one number with Pip's three addresses already set on it, and writes
//               it on the business's line. With dry: true it does everything except claim and buy.
//               With `number`, nothing is bought: that number must already be on Pip's Twilio account (bought in
//               Twilio's console), and it is pointed at Pip, labelled for the business and written on the line.
//
// A number costs money every month, so every way this can spend twice is closed:
//   - the database decides (line_claim): the switch 'line_buy'.on, one number per business, the cap on numbers, and
//     one buy at a time
//   - a number Pip already owns for the business (found at Twilio by its label "pip:<business id>") is used again
//   - a buy whose answer never arrived is not tried again for three minutes, and the next try looks for the number
//     at Twilio before buying anything
//   - Twilio is asked for one exact number, never "any number in this area code"
// The rules themselves are in _shared/line.ts and are tested there. This file never logs or returns a credential.
// verify_jwt is off because the founder ticket is not a JWT; the function checks the service key or the ticket itself.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { areaCodes, buyForm, label, localPrice, NUMBER_SID, owned, ownedNumber, pickNumber, pointForm, priceOk, US_LOCAL } from "../_shared/line.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TW = (Deno.env.get("TWILIO_BASE_URL") || "https://api.twilio.com").replace(/\/+$/, "");
const TW_PRICE = (Deno.env.get("TWILIO_PRICING_URL") || "https://pricing.twilio.com").replace(/\/+$/, "");
const FUNCS = `${SB_URL}/functions/v1`;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

async function setting(key: string): Promise<any> { const { data } = await db.from("forge_settings").select("value").eq("key", key).maybeSingle(); return data?.value; }
async function ticketOk(ticket: string | null): Promise<boolean> {
  if (!ticket || ticket.length < 24 || ticket.length > 200) return false;
  const v = await setting("run_ticket");
  if (!v?.hash || !v.expires || new Date(v.expires).getTime() <= Date.now()) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket));
  return same([...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""), String(v.hash));
}
async function onTestList(business: unknown): Promise<boolean> {
  const list = await setting("act_sandbox_businesses");
  return typeof business === "string" && UUID.test(business) && Array.isArray(list) && list.includes(business);
}

type Tw = { status: number; j: any };
/** One request to Twilio. status 0 means no answer arrived: for a buy, that is "unknown", never "failed". */
async function twilio(method: "GET" | "POST", url: string, form?: URLSearchParams): Promise<Tw> {
  const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim(), token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  try {
    const r = await fetch(url.replace("{sid}", sid), {
      method, signal: AbortSignal.timeout(15000),
      headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body: form ? form.toString() : undefined,
    });
    return { status: r.status, j: await r.json().catch(() => null) };
  } catch { return { status: 0, j: null }; }
}
const acct = `${TW}/2010-04-01/Accounts/{sid}`;

async function buy(b: any) {
  const business = String(b?.business ?? "").toLowerCase();
  if (!UUID.test(business)) return json({ ok: false, error: "bad_request" }, 400);
  if (b?.spec != null && !(typeof b.spec === "string" && UUID.test(b.spec))) return json({ ok: false, error: "bad_request" }, 400);
  if (!(Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim() || !Deno.env.get("TWILIO_AUTH_TOKEN")) return json({ ok: false, error: "not_configured" }, 503);
  const named = b?.number == null ? null : String(b.number);
  if (named !== null && !US_LOCAL.test(named)) return json({ ok: false, error: "bad_request" }, 400);
  const dry = b?.dry === true, codes = areaCodes(b?.area_codes);
  const cfg = await setting("line_buy");
  if (cfg?.on !== true) return json({ ok: false, error: "off" }, 409);

  let price: number | null = null, mine: { sid: string; number: string } | null = null;
  if (named) {
    // A number the account already holds. Nothing is bought on this path, so there is no price to check.
    const got = await twilio("GET", `${acct}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(named)}&PageSize=20`);
    if (got.status !== 200) return json({ ok: false, error: "twilio", step: "owned", twilio_status: got.status }, 502);
    const o = ownedNumber(got.j, named, business);
    if (o === "taken") return json({ ok: false, error: "taken" }, 409);
    if (!o) return json({ ok: false, error: "not_on_account" }, 404);
    mine = o;
  } else {
    // 1. The price, before anything else. An unreadable price is a no.
    const pr = await twilio("GET", `${TW_PRICE}/v1/PhoneNumbers/Countries/US`);
    price = pr.status === 200 ? localPrice(pr.j) : null;
    const okPrice = priceOk(price, cfg?.max_monthly_usd);
    if (!okPrice.ok) return json({ ok: false, error: okPrice.reason, monthly_usd: price, ceiling_usd: typeof cfg?.max_monthly_usd === "number" ? cfg.max_monthly_usd : null, twilio_status: pr.status }, 409);

    // 2. A number Pip already owns for this business is used again.
    const have = await twilio("GET", `${acct}/IncomingPhoneNumbers.json?FriendlyName=${encodeURIComponent(label(business))}&PageSize=20`);
    if (have.status !== 200) return json({ ok: false, error: "twilio", step: "owned", twilio_status: have.status }, 502);
    mine = owned(have.j, business);
  }

  // 3. Otherwise find one to buy.
  let pick: string | null = null, tried: string[] = [];
  if (!mine) {
    for (const code of (codes.length ? codes : [""])) {
      const q = new URLSearchParams({ VoiceEnabled: "true", SmsEnabled: "true", ExcludeAllAddressRequired: "true", PageSize: "10" });
      if (code) q.set("AreaCode", code);
      const av = await twilio("GET", `${acct}/AvailablePhoneNumbers/US/Local.json?${q}`);
      tried.push(code || "any");
      if (av.status !== 200) return json({ ok: false, error: "twilio", step: "search", twilio_status: av.status }, 502);
      pick = pickNumber(av.j);
      if (pick) break;
    }
    if (!pick) return json({ ok: false, error: "none_available", tried }, 409);
  }
  if (dry) return json({ ok: true, dry: true, monthly_usd: price, ceiling_usd: cfg.max_monthly_usd, would: mine ? "use_owned" : "buy", number: mine?.number ?? pick, tried });

  // 4. The database decides whether a buy may start.
  const { data: claim, error: ce } = await db.rpc("line_claim", { p_business: business });
  if (ce || !claim) return json({ ok: false, error: "server" }, 500);
  if (!claim.ok) return json({ ok: false, error: claim.reason, number: claim.number ?? null, have: claim.have ?? null, max: claim.max ?? null }, claim.reason === "no_business" ? 404 : 409);
  if (!mine && !priceOk(price, claim.max_monthly_usd).ok) { await db.rpc("line_unclaim", { p_business: business }); return json({ ok: false, error: "over_ceiling", monthly_usd: price }, 409); }

  // 5. Buy the one number, or point the owned one at Pip.
  let number = mine?.number ?? "", sid = mine?.sid ?? "", bought = false;
  const fallback = (await setting("voice"))?.fallback_url;
  if (mine) {
    const point = pointForm(business, FUNCS, fallback);
    const up = point ? await twilio("POST", `${acct}/IncomingPhoneNumbers/${mine.sid}.json`, point) : { status: 0, j: null };
    if (up.status !== 200) { await db.rpc("line_unclaim", { p_business: business }); return json({ ok: false, error: "twilio", step: "point", twilio_status: up.status }, 502); }
  } else {
    const form = buyForm(pick!, business, FUNCS, fallback);
    if (!form) { await db.rpc("line_unclaim", { p_business: business }); return json({ ok: false, error: "server" }, 500); }
    const r = await twilio("POST", `${acct}/IncomingPhoneNumbers.json`, form);
    if (r.status === 201 && US_LOCAL.test(String(r.j?.phone_number ?? "")) && NUMBER_SID.test(String(r.j?.sid ?? ""))) { number = r.j.phone_number; sid = r.j.sid; bought = true; }
    else if (r.status >= 400 && r.status < 500) {
      // Twilio plainly said no, so nothing was bought and another try is safe.
      await db.rpc("line_unclaim", { p_business: business });
      return json({ ok: false, error: "twilio_refused", twilio_status: r.status, twilio_code: typeof r.j?.code === "number" ? r.j.code : null }, 502);
    } else {
      // No answer, or one that cannot be read: the number may have been bought. The claim stays, so nothing buys again
      // for three minutes, and the next try looks at Twilio first (step 2).
      console.error("[line] buy unknown", r.status);
      return json({ ok: false, error: "unknown", twilio_status: r.status, retry_after_s: 180 }, 502);
    }
  }

  // 6. Write it on the line.
  const { data: done, error: ae } = await db.rpc("line_assign", { p_business: business, p_number: number, p_sid: sid, p_spec: b?.spec ?? null });
  if (ae || !done?.ok) {
    console.error("[line] assign", String(ae?.message ?? done?.reason ?? "").slice(0, 120));
    return json({ ok: false, error: "bought_not_written", number, reason: done?.reason ?? null }, 500);   // the next call finds it by its label
  }
  return json({ ok: true, number, bought, monthly_usd: price, spec: done.spec ?? null, texting: "A new number cannot send texts until it is registered with the carriers." });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/^.*\/pip-line/, "") || "/";
  try {
    if (req.method !== "POST" || path !== "/buy") return json({ ok: false, error: "not_found" }, 404);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const b = await req.json().catch(() => ({}));
    if (!bearer || !same(bearer, SERVICE)) {
      if (!(await ticketOk(req.headers.get("x-pip-ticket"))) || !(await onTestList(String(b?.business ?? "").toLowerCase()))) return json({ ok: false, error: "not_found" }, 404);
    }
    return await buy(b);
  } catch (e) {
    console.error("[line]", String((e as Error)?.message ?? e).slice(0, 160));
    return json({ ok: false, error: "server" }, 500);
  }
});
