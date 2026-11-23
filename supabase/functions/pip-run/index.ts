// pip-run: the scheduled and inbound work behind the Pip Portal.
// 1. POST /hooks/billing  Runs every 10 minutes. Asks the database what billing work is due (portal_billing_tick),
//                         does it at Stripe, and reports back (portal_billing_report). The rules live in the database:
//                         charging starts on go-live day, usage beyond the plan is added to the next invoice,
//                         usage never pauses a client, and only an unpaid invoice past the grace period does.
//                         The answer also says whether the Stripe account can take live charges yet.
// 2. POST /twilio/sms     Twilio calls this when someone texts a business's Pip number. It checks the request really
//                         came from Twilio, honors STOP at once, records consent, and lets the live teammate answer
//                         through pip-turn (the same brain as website chat, with the same tools and limits).
// It never stores a phone number in the clear: contacts are kept as one-way codes plus their last four digits.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: STRIPE_SECRET_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const twiml = (inner = "") =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "content-type": "text/xml" } });

// ---------- Stripe ----------
const STRIPE_VERSION = "2025-09-30.clover";
async function stripe(method: string, path: string, params?: Record<string, string>, idem?: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("no_key");
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": STRIPE_VERSION,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idem ? { "idempotency-key": idem } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
    signal: AbortSignal.timeout(15000),
  });
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe ${r.status} ${String(j?.error?.code ?? j?.error?.type ?? "")}`.trim());
  return j;
}

async function productId(): Promise<string> {
  const { data } = await db.from("forge_settings").select("value").eq("key", "stripe_product_id").maybeSingle();
  if (typeof data?.value === "string" && data.value.startsWith("prod_")) return data.value;
  const p = await stripe("POST", "/products", { name: "Pip", "metadata[app]": "pip" }, "pip-product-1");
  await db.from("forge_settings").upsert({ key: "stripe_product_id", value: p.id });
  return p.id;
}

/** Which kind of key is saved and whether the account behind it can charge cards. Never the key itself. */
async function stripeAccount() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const mode = key.startsWith("sk_test_") || key.startsWith("rk_test_") ? "test" : key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "unknown";
  try {
    const a = await stripe("GET", "/account");
    return { mode, name: a?.settings?.dashboard?.display_name ?? a?.business_profile?.name ?? null, charges_enabled: !!a?.charges_enabled, details_submitted: !!a?.details_submitted };
  } catch (e) {
    return { mode, error: String((e as Error).message).slice(0, 80) };
  }
}

async function billingRun() {
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return { ran: false, waiting: "STRIPE_SECRET_KEY is not set" };
  // A business that left is dealt with first: its subscription is set to end with the month already paid, and it is
  // taken out of billing before anything below could start or re-check it. See 20261120_08_billing_stops_on_disconnect.sql.
  let stopped = 0; const stopErrors: string[] = [];
  const { data: stops } = await db.rpc("portal_billing_stops");
  // deno-lint-ignore no-explicit-any
  for (const w of (Array.isArray(stops) ? stops : []) as any[]) {
    try {
      const cur = await stripe("GET", `/subscriptions/${w.subscription}`).catch(() => null);
      // Already over in Stripe (cancelled, or gone): nothing more to ask for.
      if (cur && cur.status !== "canceled" && cur.cancel_at_period_end !== true) await stripe("POST", `/subscriptions/${w.subscription}`, { cancel_at_period_end: "true" }, `pip-stop-${w.business}`);
      if (cur) { await db.rpc("portal_billing_stopped", { p_business: w.business }); stopped++; }
      else stopErrors.push("stop: could not read the subscription");
    } catch (e) { if (stopErrors.length < 5) stopErrors.push(`stop: ${String((e as Error).message).slice(0, 80)}`); }
  }
  const { data: work, error } = await db.rpc("portal_billing_tick");
  if (error) return { ran: false, waiting: "not_ready" };
  const out = { ran: true, stopped, started: 0, itemized: 0, checked: 0, failed: stopErrors.length, errors: stopErrors, account: await stripeAccount() };
  let product: string | null = null;
  // deno-lint-ignore no-explicit-any
  for (const w of (Array.isArray(work) ? work : []) as any[]) {
    try {
      if (w.do === "start") {
        product ??= await productId();
        const p: Record<string, string> = {
          customer: w.customer,
          "items[0][price_data][currency]": "usd",
          "items[0][price_data][product]": product,
          "items[0][price_data][recurring][interval]": "month",
          "items[0][price_data][unit_amount]": String(w.monthly_cents),
          off_session: "true",
          "metadata[app]": "pip",
          "metadata[business_id]": w.business,
        };
        if (Number(w.setup_cents) > 0) {
          p["add_invoice_items[0][price_data][currency]"] = "usd";
          p["add_invoice_items[0][price_data][product]"] = product;
          p["add_invoice_items[0][price_data][unit_amount]"] = String(w.setup_cents);
        }
        const s = await stripe("POST", "/subscriptions", p, `pip-sub-${w.business}`);
        await db.rpc("portal_billing_report", { p_business: w.business, p_event: "started", p_data: { subscription: s.id, status: s.status } });
        out.started++;
      } else if (w.do === "overage") {
        await stripe("POST", "/invoiceitems", {
          customer: w.customer,
          amount: String(w.amount_cents),
          currency: "usd",
          description: `Usage beyond your plan, period starting ${w.period_start}`,
          "metadata[app]": "pip",
          "metadata[business_id]": w.business,
        }, `pip-ovg-${w.business}-${w.period_start}-${w.already_cents}`);
        await db.rpc("portal_billing_report", {
          p_business: w.business, p_event: "itemized",
          p_data: { period_start: w.period_start, amount_usd: Number(w.amount_cents) / 100, value_usd: w.value_usd, included_usd: w.included_usd },
        });
        if (w.invoice_now) {
          // A large run past the plan is invoiced now so Pip is not carrying it until the end of the month.
          await stripe("POST", "/invoices", {
            customer: w.customer, auto_advance: "true", collection_method: "charge_automatically",
            pending_invoice_items_behavior: "include", "metadata[app]": "pip",
          }, `pip-inv-${w.business}-${w.period_start}-${w.already_cents}`).catch(() => null);
        }
        out.itemized++;
      } else if (w.do === "check") {
        const s = await stripe("GET", `/subscriptions/${w.subscription}`);
        await db.rpc("portal_billing_report", { p_business: w.business, p_event: "status", p_data: { status: s.status } });
        out.checked++;
      }
    } catch (e) {
      out.failed++;
      if (out.errors.length < 5) out.errors.push(`${w.do}: ${String((e as Error).message).slice(0, 80)}`);
    }
  }
  return out;
}

// ---------- Twilio texting ----------
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"];
const STOP_PHRASE = /\b(stop (texting|messaging|contacting) me|take me off|remove me from|do not (text|contact) me|don'?t (text|contact) me)\b/i;

async function fromTwilio(req: Request, url: string, params: URLSearchParams): Promise<boolean> {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const sig = req.headers.get("x-twilio-signature");
  if (!token || !sig) return false;
  let data = url;
  for (const k of [...new Set(params.keys())].sort()) data += k + (params.get(k) ?? "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  const mine = btoa(String.fromCharCode(...mac));
  if (mine.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function sendText(from: string, to: string, body: string): Promise<boolean> {
  const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim(), token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  if (!sid || !token) return false;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  await r.body?.cancel();
  return r.ok;
}

// deno-lint-ignore no-explicit-any
async function answerText(line: any, r: any, from: string, to: string, text: string) {
  let reply = "";
  try {
    // The teammate answers in pip-turn. It adds the AI notice to a first reply and saves both messages.
    const res = await fetch(`${SB_URL}/functions/v1/pip-turn/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ skill: line.spec, conversation: r.conversation, message: text, channel: "sms" }),
      signal: AbortSignal.timeout(55000),
    });
    const j = await res.json();
    reply = String(j?.reply ?? "").trim();
  } catch { /* handled just below */ }
  if (!reply) {
    // pip-turn could not be reached at all, so it alerted nobody. Never leave a texter with silence:
    // tell the owner, and tell the texter a person will reply.
    await db.from("notifications").insert({ spec_id: line.spec, kind: "notify_owner", body: { args: { summary: `A text message could not be answered by ${line.teammate ?? "the teammate"}: "${text.slice(0, 160)}"`, urgency: "urgent" }, approval: "none", conversation: r.conversation, business: line.name, channel: "sms" } });
    reply = `This is an AI assistant for ${String(line.name ?? "the business").replace(/\s*[(\[][^)\]]*[)\]]/g, "").trim()}. We got your message and a team member will reply soon.`;
  }
  // The first reply to a texter says it is an AI (pip-turn guarantees that line) and how to opt out.
  if (r.first) reply += " Reply STOP to opt out.";
  reply = reply.slice(0, 1200);
  if (await sendText(to, from, reply)) {
    // One call counts the segments for billing and writes the "sent" record that cites the consent_ledger row relied on.
    // The texter's number goes in only so the database can hash it; it is never stored.
    await db.rpc("portal_sms_out", {
      p_business: line.business, p_spec: line.spec, p_segments: Math.max(1, Math.ceil(text.length / 153)) + Math.ceil(reply.length / 153),
      p_to: from, p_ai_disclosed: r.first === true, p_opt_out_offered: r.first === true,
    });
  }
}

async function sms(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!(await fromTwilio(req, `${SB_URL}/functions/v1/pip-run/twilio/sms`, params))) return new Response("forbidden", { status: 403 });
  const from = params.get("From") ?? "", to = params.get("To") ?? "", text = (params.get("Body") ?? "").trim().slice(0, 1000);
  if (!from || !to) return twiml();
  const { data: line } = await db.rpc("portal_line_ctx", { p_to: to });
  if (!line?.ok || line.status === "disconnected" || line.status === "cancelled") return twiml();
  if (!line.spec) {
    // A TEST business has no live teammate. Its line names the teammate that answers (phone_lines.spec_id), and the
    // database gives it back only for a business on the test list whose name starts with TEST.
    const { data: t } = await db.rpc("voice_line_ctx", { p_to: to });
    if (t?.ok && t.test === true && t.spec && t.business === line.business) { line.spec = t.spec; line.teammate = t.teammate; }
  }
  const word = text.toUpperCase().replace(/[^A-Z]/g, "");
  // Twilio answers HELP and INFO itself and normally does not pass them on. Replying here too would send two texts.
  // The wording of Twilio's answer is set on the Messaging Service (Advanced Opt-Out), not in this code.
  if (word === "HELP" || word === "INFO") return twiml();
  const kind = STOP_WORDS.includes(word) || STOP_PHRASE.test(text) ? "stop" : (word === "START" || word === "UNSTOP") ? "start" : "message";
  const { data: r } = await db.rpc("portal_sms_in", { p_business: line.business, p_spec: line.spec ?? null, p_from: from, p_kind: kind });
  if (!r?.allowed || !text) return twiml();
  // Twilio wants an answer within seconds, so reply to Twilio now and send the teammate's text when it is ready.
  const work = answerText(line, r, from, to, text).catch(() => undefined);
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return twiml();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-run/, "") || "/";
  try {
    if (path === "/hooks/billing") return json(await billingRun());
    if (path === "/twilio/sms") return await sms(req);
    return json({ error: "not_found" }, 404);
  } catch (_e) {
    return json({ error: "server" }, 500);
  }
});
