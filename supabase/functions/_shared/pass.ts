// The visitor pass: a signed note that says "this visitor gave an email" (level 1) or "this visitor typed the code we
// emailed them" (level 2), and when it runs out. pip-reader hands out level 1 the moment an email is given, so the
// reveal never waits. A live demo call costs real minutes, so it asks for level 2.
//
// Signed with PIP_PASS_SECRET, a secret used for nothing else. Until that secret is set, and for passes handed out
// before it was, the project's service key still signs and checks them, so nothing breaks on the day it changes.

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** The signing keys, newest first. Read on every call so a test or a secret change takes effect at once. */
function keys(): string[] {
  const own = (Deno.env.get("PIP_PASS_SECRET") ?? "").trim();
  const old = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  return [own, old].filter(Boolean).map((k) => `pip-pass-v1|${k}`);
}
async function sign(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))).slice(0, 32);
}
const same = (a: string, b: string) => { let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
// Level 1 keeps the message it always had, so passes already handed out still check.
const message = (level: 1 | 2, exp: number, id: string) => (level === 1 ? `${exp}.${id}` : `2.${exp}.${id}`);

/** The pass id: 10 characters of the email's SHA-256. The email itself is never in a pass. */
export async function passId(email: string) {
  return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(email.trim().toLowerCase())))).slice(0, 10);
}

export async function mintPass(level: 1 | 2, id: string, exp: number): Promise<string> {
  const [key] = keys();
  if (!key) throw new Error("no pass key");
  return `p${level}.${exp}.${id}.${await sign(key, message(level, exp, id))}`;
}

export interface Pass { level: 1 | 2; exp: number; id: string }

export async function checkPass(t: unknown, now = Date.now()): Promise<Pass | null> {
  if (typeof t !== "string" || t.length > 120) return null;
  const [v, exp, id, sig] = t.split(".");
  const level = v === "p1" ? 1 : v === "p2" ? 2 : 0;
  if (!level || !/^\d{9,11}$/.test(exp || "") || !/^[A-Za-z0-9_-]{10}$/.test(id || "") || Number(exp) * 1000 < now) return null;
  for (const key of keys()) if (same(await sign(key, message(level as 1 | 2, Number(exp), id)), sig || "")) return { level: level as 1 | 2, exp: Number(exp), id };
  return null;
}

/** A six-digit code, and the only form of it Pip keeps: a hash tied to the pass id. */
export function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}
export async function codeHash(id: string, code: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`pip-code|${id}|${code}`)));
}

// Throwaway inboxes. A pass for one of these would let anyone farm demo calls without a real address.
export const THROWAWAY = new Set([
  "example.com", "example.org", "example.net", "test.com", "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamailblock.com",
  "sharklasers.com", "grr.la", "yopmail.com", "yopmail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "10minutemail.com",
  "10minutemail.net", "20minutemail.com", "throwawaymail.com", "trashmail.com", "trashmail.de", "getnada.com", "nada.email", "maildrop.cc",
  "dispostable.com", "mintemail.com", "mohmal.com", "emailondeck.com", "fakeinbox.com", "spamgourmet.com", "mailnesia.com", "mytemp.email",
  "tempinbox.com", "burnermail.io", "inboxkitten.com", "moakt.com", "tempmailo.com", "tmpmail.org", "tmpmail.net", "emailfake.com",
  "fakemail.net", "mailcatch.com", "spambox.us", "discard.email", "minuteinbox.com", "luxusmail.org", "1secmail.com", "1secmail.net",
]);
export const throwaway = (email: string) => THROWAWAY.has(email.split("@").pop()?.toLowerCase() ?? "");
