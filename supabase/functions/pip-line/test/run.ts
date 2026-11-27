// Runs the real pip-line against stand-ins for the database and Twilio. No real number is ever bought here.
//   DENO_NO_PACKAGE_JSON=1 deno run -A supabase/functions/pip-line/test/run.ts
// deno-lint-ignore-file no-explicit-any
const MOCK = 9131, FN = 9132, SERVICE = "test-service-key", TOKEN = "test-twilio-token";
const BIZ = "38794f73-3586-475b-b428-da75f29e6a27", OTHER = "11111111-2222-4333-8444-555555555555", SPEC = "3b5b8524-c712-4cee-82ec-97e1565f33ff";
const SID = "PN" + "c".repeat(32), TICKET = "t".repeat(40);
const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TICKET)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const w: any = {};
const reset = () => Object.assign(w, {
  cfg: { on: true, max_monthly_usd: 1.2, max_lines: 1 }, price: "1.15", priceStatus: 200, avail: { "208": ["+12085550103"], "": ["+13125550199"] } as Record<string, string[]>,
  ownedAtTwilio: [] as any[], buy: "ok" as "ok" | "refuse" | "silent", line: null as any, claims: 0, unclaims: 0, buys: [] as any[], points: [] as any[], assigns: [] as any[], searches: [] as string[], auth: [] as string[],
  ticketExpires: new Date(Date.now() + 60000).toISOString(), testList: [BIZ], claimAnswer: null as any, priceAsks: 0,
});
Deno.serve({ port: MOCK, hostname: "127.0.0.1", onListen() {} }, async (req) => {
  const u = new URL(req.url), p = u.pathname, j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (p === "/rest/v1/forge_settings") {
    const k = u.searchParams.get("key");
    return j(k === "eq.line_buy" ? (w.cfg ? { value: w.cfg } : null) : k === "eq.run_ticket" ? { value: { hash, expires: w.ticketExpires } } : k === "eq.act_sandbox_businesses" ? { value: w.testList } : k === "eq.voice" ? { value: { agent_id: "agent_x" } } : null);
  }
  if (p === "/rest/v1/rpc/line_claim") {
    w.claims++;
    if (w.claimAnswer) return j(w.claimAnswer);
    if (w.line?.pip_number) return j({ ok: false, reason: "has_number", number: w.line.pip_number });
    if (w.line?.buying) return j({ ok: false, reason: "in_progress" });
    w.line = { buying: true }; return j({ ok: true, max_monthly_usd: w.cfg.max_monthly_usd, name: "TEST Fork" });
  }
  if (p === "/rest/v1/rpc/line_unclaim") { w.unclaims++; if (w.line) w.line.buying = false; return j(null); }
  if (p === "/rest/v1/rpc/line_assign") { const a = await req.json(); w.assigns.push(a); w.line = { pip_number: a.p_number }; return j({ ok: true, number: a.p_number, spec: a.p_spec }); }
  if (p.startsWith("/v1/PhoneNumbers/Countries/") || p.startsWith("/2010-04-01/")) w.auth.push(req.headers.get("authorization") ?? "");
  if (p === "/v1/PhoneNumbers/Countries/US") w.priceAsks = (w.priceAsks ?? 0) + 1;
  if (p === "/v1/PhoneNumbers/Countries/US") return w.priceStatus === 200 ? j({ iso_country: "US", price_unit: "USD", phone_number_prices: [{ number_type: "local", base_price: w.price, current_price: w.price }, { number_type: "toll free", base_price: "2.15", current_price: "2.15" }] }) : j({ code: 20003 }, w.priceStatus);
  if (p === "/2010-04-01/Accounts/ACtest/IncomingPhoneNumbers.json" && req.method === "GET") return j({ incoming_phone_numbers: w.ownedAtTwilio.filter((n: any) => u.searchParams.has("PhoneNumber") ? n.phone_number === u.searchParams.get("PhoneNumber") : n.friendly_name === u.searchParams.get("FriendlyName")) });
  if (p === "/2010-04-01/Accounts/ACtest/AvailablePhoneNumbers/US/Local.json") {
    const code = u.searchParams.get("AreaCode") ?? ""; w.searches.push(code + "|" + u.searchParams.get("VoiceEnabled") + "|" + u.searchParams.get("SmsEnabled"));
    return j({ available_phone_numbers: (w.avail[code] ?? []).map((n: string) => ({ phone_number: n, capabilities: { voice: true, SMS: true, MMS: true } })) });
  }
  if (p === "/2010-04-01/Accounts/ACtest/IncomingPhoneNumbers.json" && req.method === "POST") {
    const f = Object.fromEntries(new URLSearchParams(await req.text())); w.buys.push(f);
    if (w.buy === "refuse") return j({ code: 21452, message: "not available" }, 400);
    if (w.buy === "silent") { w.ownedAtTwilio.push({ sid: SID, phone_number: f.PhoneNumber, friendly_name: f.FriendlyName }); return new Response("upstream timeout", { status: 504 }); }
    w.ownedAtTwilio.push({ sid: SID, phone_number: f.PhoneNumber, friendly_name: f.FriendlyName });
    return j({ sid: SID, phone_number: f.PhoneNumber, friendly_name: f.FriendlyName }, 201);
  }
  if (p === `/2010-04-01/Accounts/ACtest/IncomingPhoneNumbers/${SID}.json` && req.method === "POST") { w.points.push(Object.fromEntries(new URLSearchParams(await req.text()))); return j({ sid: SID }); }
  return j({ error: "unexpected " + req.method + " " + p }, 500);
});

const here = new URL("../index.ts", import.meta.url).pathname;
const child = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", here], stdout: "null", stderr: Deno.env.get("SHOW") ? "inherit" : "null",
  env: { DENO_NO_PACKAGE_JSON: "1", SUPABASE_URL: `http://127.0.0.1:${MOCK}`, SUPABASE_SERVICE_ROLE_KEY: SERVICE, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_BASE_URL: `http://127.0.0.1:${MOCK}`, TWILIO_PRICING_URL: `http://127.0.0.1:${MOCK}`, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN}` },
}).spawn();
for (let i = 0; i < 100; i++) { try { await (await fetch(`http://127.0.0.1:${FN}/pip-line/x`)).body?.cancel(); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

async function call(body: unknown, how: "service" | "ticket" | "none" | "bad-ticket" = "service", path = "/buy", method = "POST") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (how === "service") headers.authorization = `Bearer ${SERVICE}`;
  if (how === "ticket") headers["x-pip-ticket"] = TICKET;
  if (how === "bad-ticket") headers["x-pip-ticket"] = "x".repeat(40);
  const r = await fetch(`http://127.0.0.1:${FN}/functions/v1/pip-line${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) as any };
}
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d: unknown = "") => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (d ? "  -> " + (typeof d === "string" ? d : JSON.stringify(d)) : "")); } };
const twilioTouched = () => w.auth.length;

// ---------- who may ask ----------
reset();
let r = await call({ business: BIZ }, "none");
ok("nobody without the service key or a ticket gets an answer", r.status === 404 && twilioTouched() === 0 && w.claims === 0, r);
r = await call({ business: BIZ }, "bad-ticket");
ok("a wrong ticket is refused", r.status === 404 && twilioTouched() === 0);
r = await call({ business: OTHER }, "ticket");
ok("a ticket works only for a business on the TEST list", r.status === 404 && twilioTouched() === 0 && w.claims === 0);
w.ticketExpires = new Date(Date.now() - 1000).toISOString();
r = await call({ business: BIZ }, "ticket");
ok("an expired ticket is refused", r.status === 404 && twilioTouched() === 0);
r = await call({ business: BIZ }, "service", "/buy", "GET");
ok("only POST /buy exists", r.status === 404);
r = await call({ business: "nope" });
ok("a business id must be an id", r.status === 400 && twilioTouched() === 0);
r = await call({ business: BIZ, spec: "nope" });
ok("a teammate id must be an id", r.status === 400 && twilioTouched() === 0);

// ---------- the switch and the price ----------
reset(); w.cfg = { on: false, max_monthly_usd: 1.2, max_lines: 1 };
r = await call({ business: BIZ }, "ticket");
ok("with the switch off nothing is asked of Twilio", r.status === 409 && r.j.error === "off" && twilioTouched() === 0 && w.buys.length === 0, r);
reset(); w.cfg = null;
r = await call({ business: BIZ });
ok("with no setting at all the answer is off", r.j.error === "off" && w.buys.length === 0);
reset(); w.price = "1.50";
r = await call({ business: BIZ, area_codes: ["208"] });
ok("a price above the ceiling buys nothing and claims nothing", r.status === 409 && r.j.error === "over_ceiling" && r.j.monthly_usd === 1.5 && w.buys.length === 0 && w.claims === 0, r);
reset(); w.priceStatus = 503;
r = await call({ business: BIZ, area_codes: ["208"] });
ok("an unreadable price buys nothing", r.j.error === "price_unknown" && w.buys.length === 0 && w.claims === 0, r);
reset(); w.cfg = { on: true, max_lines: 1 };
r = await call({ business: BIZ, area_codes: ["208"] });
ok("no ceiling buys nothing", r.j.error === "no_ceiling" && w.buys.length === 0, r);

// ---------- a dry run ----------
reset();
r = await call({ business: BIZ, area_codes: ["208"], dry: true }, "ticket");
ok("a dry run names the number and the price and buys nothing", r.status === 200 && r.j.dry === true && r.j.would === "buy" && r.j.number === "+12085550103" && r.j.monthly_usd === 1.15 && w.buys.length === 0 && w.claims === 0 && w.assigns.length === 0, r);

// ---------- a real buy ----------
reset();
r = await call({ business: BIZ, area_codes: ["986", "208"], spec: SPEC }, "ticket");
ok("the buy succeeds", r.status === 200 && r.j.ok === true && r.j.number === "+12085550103" && r.j.bought === true && r.j.monthly_usd === 1.15, r);
ok("area codes are tried in the order asked, for numbers that take calls and texts", w.searches.join(",") === "986|true|true,208|true|true", w.searches);
ok("exactly one number is bought, and it is the one that was chosen", w.buys.length === 1 && w.buys[0].PhoneNumber === "+12085550103" && !("AreaCode" in w.buys[0]), w.buys);
ok("the number is labelled for the business", w.buys[0]?.FriendlyName === "pip:" + BIZ);
ok("calls, call endings and texts point at Pip", w.buys[0]?.VoiceUrl === `http://127.0.0.1:${MOCK}/functions/v1/pip-voice/twilio/voice` && w.buys[0]?.StatusCallback === `http://127.0.0.1:${MOCK}/functions/v1/pip-voice/twilio/status` && w.buys[0]?.SmsUrl === `http://127.0.0.1:${MOCK}/functions/v1/pip-run/twilio/sms` && w.buys[0]?.VoiceMethod === "POST", w.buys[0]);
ok("the number, Twilio's id for it and the teammate are written on the line", w.assigns.length === 1 && w.assigns[0].p_business === BIZ && w.assigns[0].p_number === "+12085550103" && w.assigns[0].p_sid === SID && w.assigns[0].p_spec === SPEC, w.assigns);
ok("the database was asked before the buy", w.claims === 1);
ok("Twilio is asked with Pip's account and nothing about it comes back", w.auth.every((a: string) => a === "Basic " + btoa("ACtest:" + TOKEN)) && !JSON.stringify(r.j).includes(TOKEN) && !JSON.stringify(r.j).includes("ACtest"));
const before = w.buys.length;
r = await call({ business: BIZ, area_codes: ["208"] }, "ticket");
ok("asking again never buys a second number", r.status === 409 && r.j.error === "has_number" && r.j.number === "+12085550103" && w.buys.length === before, r);

// ---------- no number to be had ----------
reset(); w.avail = {};
r = await call({ business: BIZ, area_codes: ["208"] });
ok("no number available buys nothing and claims nothing", r.j.error === "none_available" && w.buys.length === 0 && w.claims === 0, r);
reset();
r = await call({ business: BIZ });
ok("with no area code any US local number will do", r.j.ok === true && r.j.number === "+13125550199", r);

// ---------- the database says no ----------
for (const reason of ["cap", "in_progress", "closed", "off"]) {
  reset(); w.claimAnswer = { ok: false, reason, have: 1, max: 1 };
  r = await call({ business: BIZ, area_codes: ["208"] });
  ok(`the database's "${reason}" buys nothing`, r.status === 409 && r.j.error === reason && w.buys.length === 0 && w.assigns.length === 0, r);
}
reset(); w.claimAnswer = { ok: true, max_monthly_usd: 1.0, name: "TEST Fork" };
r = await call({ business: BIZ, area_codes: ["208"] });
ok("the database's own ceiling is checked again, and the claim is given back", r.j.error === "over_ceiling" && w.buys.length === 0 && w.unclaims === 1, r);

// ---------- Twilio says no, or says nothing ----------
reset(); w.buy = "refuse";
r = await call({ business: BIZ, area_codes: ["208"] });
ok("a plain refusal from Twilio writes nothing and frees the claim for another try", r.status === 502 && r.j.error === "twilio_refused" && r.j.twilio_code === 21452 && w.assigns.length === 0 && w.unclaims === 1, r);
reset(); w.buy = "silent";
r = await call({ business: BIZ, area_codes: ["208"] });
ok("a buy with no clear answer is 'unknown', and the claim is kept so nothing buys again", r.status === 502 && r.j.error === "unknown" && w.unclaims === 0 && w.assigns.length === 0 && w.buys.length === 1, r);
r = await call({ business: BIZ, area_codes: ["208"] });
ok("a second try while the first is unsettled buys nothing", r.j.error === "in_progress" && w.buys.length === 1, r);
w.line = null; w.buy = "ok";                                  // three minutes later the claim has lapsed
r = await call({ business: BIZ, area_codes: ["208"], spec: SPEC });
ok("the next try finds the number Twilio did sell and uses it, without buying another", r.j.ok === true && r.j.bought === false && r.j.number === "+12085550103" && w.buys.length === 1 && w.searches.length === 1, r);
ok("the found number is pointed at Pip and written on the line", w.points.length === 1 && w.points[0].VoiceUrl.endsWith("/pip-voice/twilio/voice") && w.points[0].SmsUrl.endsWith("/pip-run/twilio/sms") && !("PhoneNumber" in w.points[0]) && w.assigns.length === 1 && w.assigns[0].p_sid === SID, w.points);

// ---------- a number labelled for another business is never taken ----------
reset(); w.ownedAtTwilio = [{ sid: SID, phone_number: "+12085550177", friendly_name: "pip:" + OTHER }];
r = await call({ business: BIZ, area_codes: ["208"], dry: true });
ok("another business's number is not used", r.j.would === "buy" && r.j.number === "+12085550103", r);

// ---------- a number bought by hand in Twilio's console ----------
const HAND = "+12082487311";
reset(); w.ownedAtTwilio = [{ sid: SID, phone_number: HAND, friendly_name: "(208) 248-7311" }];
r = await call({ business: BIZ, number: HAND, spec: SPEC, dry: true }, "ticket");
ok("a dry run on a held number changes nothing", r.j.ok === true && r.j.would === "use_owned" && r.j.number === HAND && w.points.length === 0 && w.claims === 0, r);
r = await call({ business: BIZ, number: HAND, spec: SPEC }, "ticket");
ok("a number already on the account is used without buying", r.status === 200 && r.j.ok === true && r.j.number === HAND && r.j.bought === false && w.buys.length === 0 && w.searches.length === 0 && w.priceAsks === 0, r);
ok("it is pointed at Pip and labelled for the business", w.points.length === 1 && w.points[0].FriendlyName === "pip:" + BIZ && w.points[0].VoiceUrl.endsWith("/pip-voice/twilio/voice") && w.points[0].StatusCallback.endsWith("/pip-voice/twilio/status") && w.points[0].SmsUrl.endsWith("/pip-run/twilio/sms") && !("PhoneNumber" in w.points[0]), w.points);
ok("it is written on the line with the teammate", w.assigns.length === 1 && w.assigns[0].p_number === HAND && w.assigns[0].p_sid === SID && w.assigns[0].p_spec === SPEC && w.claims === 1, w.assigns);
reset();
r = await call({ business: BIZ, number: HAND });
ok("a number that is not on the account is refused, and nothing is bought in its place", r.status === 404 && r.j.error === "not_on_account" && w.buys.length === 0 && w.claims === 0 && w.searches.length === 0, r);
reset(); w.ownedAtTwilio = [{ sid: SID, phone_number: HAND, friendly_name: "pip:" + OTHER }];
r = await call({ business: BIZ, number: HAND });
ok("a number labelled for another business is refused", r.status === 409 && r.j.error === "taken" && w.points.length === 0 && w.claims === 0, r);
reset();
r = await call({ business: BIZ, number: "208-248-7311" });
ok("a named number must be written in full", r.status === 400 && twilioTouched() === 0, r);
reset(); w.ownedAtTwilio = [{ sid: SID, phone_number: HAND, friendly_name: "x" }]; w.cfg = { on: false, max_monthly_usd: 1.2, max_lines: 1 };
r = await call({ business: BIZ, number: HAND });
ok("the switch covers held numbers too", r.j.error === "off" && w.points.length === 0, r);
reset(); w.ownedAtTwilio = [{ sid: SID, phone_number: HAND, friendly_name: "x" }]; w.claimAnswer = { ok: false, reason: "cap", have: 1, max: 1 };
r = await call({ business: BIZ, number: HAND });
ok("so does the cap on numbers", r.j.error === "cap" && w.points.length === 0 && w.assigns.length === 0, r);

console.log(`\n${pass} passed, ${fail} failed`);
child.kill(); await child.status.catch(() => undefined);
Deno.exit(fail ? 1 : 0);
