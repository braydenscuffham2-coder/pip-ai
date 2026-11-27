// The rules for buying a business's Pip number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { areaCodes, buyForm, canText, hooks, label, localPrice, owned, ownedNumber, pickNumber, pointForm, priceOk } from "./line.ts";

const BIZ = "38794f73-3586-475b-b428-da75f29e6a27";
const BASE = "https://x.supabase.co/functions/v1";
const pricing = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ iso_country: "US", price_unit: "USD", phone_number_prices: rows, ...extra });

test("area codes: only real three-digit codes, at most four, no repeats", () => {
  assert.deepEqual(areaCodes(["208", 986, "208", "12", "abc", "055", "2081"]), ["208", "986"]);
  assert.deepEqual(areaCodes("208"), ["208"]);
  assert.deepEqual(areaCodes(null), []);
  assert.deepEqual(areaCodes(["212", "213", "214", "215", "216"]), ["212", "213", "214", "215"]);
});

test("the price is Twilio's local monthly price in dollars, or nothing", () => {
  assert.equal(localPrice(pricing([{ number_type: "toll free", base_price: "2.15", current_price: "2.15" }, { number_type: "local", base_price: "1.15", current_price: "1.15" }])), 1.15);
  assert.equal(localPrice(pricing([{ number_type: "local", base_price: "1.50", current_price: "1.15" }])), 1.5, "a discount never hides the list price");
  assert.equal(localPrice(pricing([{ number_type: "mobile", base_price: "1.15", current_price: "1.15" }])), null);
  assert.equal(localPrice(pricing([{ number_type: "local", base_price: "", current_price: null }])), null);
  assert.equal(localPrice(pricing([{ number_type: "local", base_price: "1.15", current_price: "1.15" }], { price_unit: "EUR" })), null);
  assert.equal(localPrice(pricing([{ number_type: "local", base_price: "1.15", current_price: "1.15" }], { iso_country: "CA" })), null);
  assert.equal(localPrice(null), null);
  assert.equal(localPrice({}), null);
});

test("buying fails closed: no price, no ceiling, or a price above the ceiling is a no", () => {
  assert.deepEqual(priceOk(1.15, 1.2), { ok: true, reason: null });
  assert.deepEqual(priceOk(1.2, 1.2), { ok: true, reason: null });
  assert.equal(priceOk(1.21, 1.2).reason, "over_ceiling");
  assert.equal(priceOk(null, 1.2).reason, "price_unknown");
  assert.equal(priceOk(0, 1.2).reason, "price_unknown");
  assert.equal(priceOk(1.15, undefined).reason, "no_ceiling");
  assert.equal(priceOk(1.15, "1.2").reason, "no_ceiling");
  assert.equal(priceOk(1.15, 0).reason, "no_ceiling");
  assert.equal(priceOk(1.15, 500).reason, "no_ceiling", "a ceiling that large is a mistake, not a permission");
});

test("the number chosen takes calls and texts and is a US local number", () => {
  const list = { available_phone_numbers: [
    { phone_number: "+12085550101", capabilities: { voice: true, SMS: false } },
    { phone_number: "+442071234567", capabilities: { voice: true, SMS: true } },
    { phone_number: "+12085550102", capabilities: { voice: false, SMS: true } },
    { phone_number: "+12085550103", capabilities: { voice: true, SMS: true, MMS: true } },
    { phone_number: "+12085550104", capabilities: { voice: true, SMS: true } },
  ] };
  assert.equal(pickNumber(list), "+12085550103");
  assert.equal(pickNumber({ available_phone_numbers: [] }), null);
  assert.equal(pickNumber(null), null);
});

test("a number Pip already owns for the business is found by its label, and only by its label", () => {
  const sid = "PN" + "a".repeat(32);
  const list = { incoming_phone_numbers: [
    { sid: "PN" + "b".repeat(32), phone_number: "+12085550111", friendly_name: "pip:00000000-0000-4000-8000-000000000000" },
    { sid, phone_number: "+12085550112", friendly_name: label(BIZ) },
  ] };
  assert.deepEqual(owned(list, BIZ), { sid, number: "+12085550112" });
  assert.deepEqual(owned(list, BIZ.toUpperCase()), { sid, number: "+12085550112" });
  assert.equal(owned({ incoming_phone_numbers: [{ sid: "nope", phone_number: "+12085550112", friendly_name: label(BIZ) }] }, BIZ), null);
  assert.equal(owned({}, BIZ), null);
});

test("the buy form names one exact number, Pip's three addresses and the label; nothing else", () => {
  const f = buyForm("+12085550103", BIZ, BASE + "/")!;
  assert.deepEqual(Object.fromEntries(f), {
    PhoneNumber: "+12085550103", FriendlyName: label(BIZ),
    VoiceUrl: BASE + "/pip-voice/twilio/voice", VoiceMethod: "POST",
    StatusCallback: BASE + "/pip-voice/twilio/status", StatusCallbackMethod: "POST",
    SmsUrl: BASE + "/pip-run/twilio/sms", SmsMethod: "POST",
  });
  assert.equal(f.has("AreaCode"), false, "Twilio is never left to pick the number");
  assert.equal(buyForm("+442071234567", BIZ, BASE), null);
  assert.equal(buyForm("+12085550103", "not-a-business", BASE), null);
});

test("a backup address is used only when it is a plain https address", () => {
  assert.equal(hooks(BASE, "https://handler.example.com/twiml/EH123").VoiceFallbackUrl, "https://handler.example.com/twiml/EH123");
  for (const bad of ["http://handler.example.com/x", "javascript:alert(1)", "https://a b/c", 7, null, "https://x.example/" + "a".repeat(400)]) assert.equal("VoiceFallbackUrl" in hooks(BASE, bad), false, String(bad));
});

test("a line can text only once it has a number and has been checked", () => {
  assert.equal(canText({ pip_number: "+12085550103", status: "verified" }), true);
  for (const s of ["requested", "number_assigned", "forwarding_set", "released", "active", null]) assert.equal(canText({ pip_number: "+12085550103", status: s }), false, String(s));
  assert.equal(canText({ pip_number: null, status: "verified" }), false);
  assert.equal(canText(null), false);
});

test("a number the account already holds can be named, unless it is labelled for another business", () => {
  const sid = "PN" + "d".repeat(32);
  const list = (name: string) => ({ incoming_phone_numbers: [{ sid, phone_number: "+12082487311", friendly_name: name }, { sid: "PN" + "e".repeat(32), phone_number: "+12085550111", friendly_name: "x" }] });
  assert.deepEqual(ownedNumber(list("(208) 248-7311"), "+12082487311", BIZ), { sid, number: "+12082487311" });
  assert.deepEqual(ownedNumber(list(label(BIZ)), "+12082487311", BIZ), { sid, number: "+12082487311" });
  assert.equal(ownedNumber(list("pip:00000000-0000-4000-8000-000000000000"), "+12082487311", BIZ), "taken");
  assert.equal(ownedNumber(list("x"), "+12085559999", BIZ), null, "a number the account does not hold");
  assert.equal(ownedNumber(list("x"), "2082487311", BIZ), null);
  assert.equal(ownedNumber(null, "+12082487311", BIZ), null);
});

test("pointing a held number at Pip names no number, so it cannot buy one", () => {
  const f = pointForm(BIZ, BASE)!;
  assert.equal(f.has("PhoneNumber"), false); assert.equal(f.has("AreaCode"), false);
  assert.equal(f.get("FriendlyName"), label(BIZ)); assert.equal(f.get("VoiceUrl"), BASE + "/pip-voice/twilio/voice"); assert.equal(f.get("SmsUrl"), BASE + "/pip-run/twilio/sms");
  assert.equal(pointForm("nope", BASE), null);
});
