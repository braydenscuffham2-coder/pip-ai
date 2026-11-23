// Takes card numbers, Social Security numbers, passwords, one-time codes and bank numbers out of what a customer
// types, before anything is stored, shown to a model or copied into an owner alert. Code, not a prompt: a teammate's
// "pii_scrub" tool is only a name the model may declare, so this is the step that actually removes them.
// Pure and dependency-free so every function (and the tests) can use it.

export type RedactKind = "card" | "ssn" | "secret" | "code" | "bank";
export interface Redacted { text: string; kinds: RedactKind[] }

// Luhn check: the checksum every real card number passes. Keeps order numbers and phone numbers out of the net.
function luhn(digits: string): boolean {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

// 13 to 19 digits, optionally split by single spaces or hyphens (4111 1111 1111 1111, 4111-1111-1111-1111).
const CARD = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;
// SSN written the usual way (123-45-6789, 123 45 6789), or any 9 digits right after the words that name one.
const SSN_SPLIT = /(?<!\d)\d{3}[- ]\d{2}[- ]\d{4}(?!\d)/g;
const SSN_NAMED = /\b(ssn|social security(?: number| no\.?)?)(\s*(?:#|number|no\.?)?\s*(?:is|:|=)?\s*)(\d[\d -]{7,10}\d)/gi;
// "my password is hunter2", "passcode: 1234", "pin = 0000". The label stays so the meaning survives.
const SECRET = /\b(password|passcode|pass code|passwd|pwd|pin(?: number)?)(\s*(?:is|:|=)\s*|\s+is\s+)("[^"]{1,128}"|'[^']{1,128}'|\S{1,128})/gi;
// "the code is 482913", "verification code: 482913"
// A ZIP, area, promo, gate, order or job code is not a secret, so a bare "code" after one of those words is left alone.
const CODE = /\b((?:verification|security|login|sign[- ]in|one[- ]time|confirmation|2fa|mfa|otp|auth(?:entication)?)\s+code|(?<!\b(?:zip|postal|area|promo|coupon|discount|gate|door|order|job|booking|reference|ref|tracking|model|part|error)\s)code)(\s*(?:is|:|=)?\s*)(\d{4,8})\b/gi;
// "account number 12345678", "routing number: 021000021"
// A plain "account number" is usually the customer's account with the business (which the teammate needs to look them
// up), so it is removed only when the message is about a bank: it says bank, checking, savings, routing, ACH or wire.
const BANK = /\b(account(?: number| no\.?| #)?|acct(?: number| no\.?| #)?|routing(?: number| no\.?| #)?)(\s*(?:is|:|=)?\s*)(\d{6,17})\b/gi;
const BANK_TALK = /\b(bank|checking|savings|routing|ach|wire|direct deposit)\b/i;

export function redact(input: string): Redacted {
  if (typeof input !== "string" || !input) return { text: typeof input === "string" ? input : "", kinds: [] };
  const kinds = new Set<RedactKind>();
  let text = input;
  text = text.replace(CARD, (m) => { const d = m.replace(/[ -]/g, ""); if (!luhn(d)) return m; kinds.add("card"); return "[card number removed]"; });
  text = text.replace(SSN_NAMED, (_m, label, gap) => { kinds.add("ssn"); return `${label}${gap}[SSN removed]`; });
  text = text.replace(SSN_SPLIT, () => { kinds.add("ssn"); return "[SSN removed]"; });
  text = text.replace(SECRET, (m, label, gap, value) => { if (/^\[.*removed\]$/.test(value)) return m; kinds.add("secret"); return `${label}${gap}[removed]`; });
  if (BANK_TALK.test(input)) text = text.replace(BANK, (_m, label, gap) => { kinds.add("bank"); return `${label}${gap}[number removed]`; });
  text = text.replace(CODE, (_m, label, gap) => { kinds.add("code"); return `${label}${gap}[code removed]`; });
  return { text, kinds: [...kinds] };
}

/** The same, for text where only the cleaned words matter (history, alerts, replies). */
export const clean = (s: string) => redact(s).text;
