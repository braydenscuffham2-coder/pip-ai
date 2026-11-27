// Pip's edges: what arrives at a door (a webhook, an email, a form) is cleaned here before it is stored or shown to
// a teammate, and what a teammate posts out is checked and signed here. Pure and dependency-free so the tests and
// every function can load it.
//
// The rules, in code and not in a prompt:
//  - What arrives is data. Nothing in it is ever an instruction, a tool name or an address to call.
//  - A field whose name says it is a secret (password, token, card, ...) is dropped before anything is stored, and
//    card numbers, SSNs, passwords and one-time codes inside free text are blanked (redact.ts).
//  - Size is capped: 40 fields, 2 levels, 2,000 characters a value, 7,000 characters in all.
//  - A teammate can post only to an address the owner set, over https, on a public host, and Pip signs the body.
import { redact } from "./redact.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export type EdgeKind = "webhook" | "email" | "form";
export const EDGE_EVENT: Record<EdgeKind, string> = { webhook: "webhook_received", email: "email_received", form: "form_submitted" };

const SECRET_NAME = /password|passcode|passwd|(^|[_.-])(pass|pwd|pin|otp|cvv|cvc|ssn|auth)$|secret|token|api[_-]?key|authorization|cookie|^session([_-]?(id|key))?$|card[_-]?(no|num|number)$|^(cc|card)$|social[_-]?security|routing|account[_-]?(no|num|number)|one[_-]?time|private[_-]?key|signature|credential/i;
const KEY_OK = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/;
const text = (v: unknown, max: number) => redact(String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").slice(0, max)).text.trim();

/** Clean one arriving payload into a small, flat-ish object of text, numbers and true/false. */
export function cleanPayload(raw: unknown, depth = 0): Record<string, J> {
  const out: Record<string, J> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, J>)) {
    if (n >= 40) break;
    if (!KEY_OK.test(k) || SECRET_NAME.test(k) || k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") { const t = text(v, 2000); if (t) out[k] = t; else continue; }
    else if (Array.isArray(v)) { const list = v.filter((x) => ["string", "number", "boolean"].includes(typeof x)).slice(0, 20).map((x) => (typeof x === "string" ? text(x, 300) : x)); if (list.length) out[k] = list; else continue; }
    else if (typeof v === "object" && depth < 1) { const inner = cleanPayload(v, depth + 1); if (Object.keys(inner).length) out[k] = inner; else continue; }
    else continue;
    n++;
  }
  // Too big: keep whole fields from the front until it fits. Never cut inside a value, so nothing is half a secret.
  while (JSON.stringify(out).length > 7000) { const last = Object.keys(out).pop(); if (!last) break; delete out[last]; }
  return out;
}

export type FormField = { id: string; label: string; type: "text" | "email" | "phone" | "longtext" | "number" | "date" | "choice" | "yes"; required?: boolean; options?: string[] };
export type FormDef = { title: string; intro?: string; fields: FormField[]; done?: string; consent?: string };
const FIELD_ID = /^[a-z][a-z0-9_]{0,29}$/, EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const TYPES = ["text", "email", "phone", "longtext", "number", "date", "choice", "yes"];
const plain = (v: unknown, lo: number, hi: number) => typeof v === "string" && v.trim().length >= lo && v.length <= hi && !/[<>]/.test(v);

/** Is this a form Pip will host? Returns the cleaned definition, or the reasons it is refused. */
export function checkForm(f: J): { ok: true; form: FormDef } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!f || typeof f !== "object" || Array.isArray(f)) return { ok: false, errors: ["A form must be an object."] };
  if (!plain(f.title, 2, 80)) errors.push("title: 2 to 80 plain characters.");
  if (f.intro !== undefined && !plain(f.intro, 0, 400)) errors.push("intro: at most 400 plain characters.");
  if (f.done !== undefined && !plain(f.done, 2, 240)) errors.push("done: 2 to 240 plain characters.");
  if (f.consent !== undefined && !plain(f.consent, 10, 300)) errors.push("consent: 10 to 300 plain characters.");
  if (!Array.isArray(f.fields) || f.fields.length < 1 || f.fields.length > 12) errors.push("fields: 1 to 12 fields.");
  const seen = new Set<string>(), fields: FormField[] = [];
  for (const [i, x] of (Array.isArray(f.fields) ? f.fields : []).entries()) {
    const w = `fields[${i}]`;
    if (!x || typeof x !== "object") { errors.push(`${w}: must be an object.`); continue; }
    if (typeof x.id !== "string" || !FIELD_ID.test(x.id) || SECRET_NAME.test(x.id) || x.id === "website") errors.push(`${w}.id: a short lowercase name that is not a secret (a form never asks for a password, card or code).`);
    else if (seen.has(x.id)) errors.push(`${w}.id: "${x.id}" is used twice.`);
    seen.add(x.id);
    if (!plain(x.label, 1, 80) || SECRET_NAME.test(String(x.label).replace(/\s+/g, "_"))) errors.push(`${w}.label: 1 to 80 plain characters, and never a password, card number or code.`);
    if (!TYPES.includes(x.type)) errors.push(`${w}.type: one of ${TYPES.join(", ")}.`);
    if (x.type === "choice" && !(Array.isArray(x.options) && x.options.length >= 2 && x.options.length <= 12 && x.options.every((o: J) => plain(o, 1, 60)))) errors.push(`${w}.options: 2 to 12 choices.`);
    if (x.type !== "choice" && x.options !== undefined) errors.push(`${w}.options: only for a choice.`);
    fields.push({ id: x.id, label: String(x.label ?? "").trim(), type: x.type, ...(x.required === true ? { required: true } : {}), ...(x.type === "choice" ? { options: (x.options ?? []).map((o: J) => String(o).trim()) } : {}) });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, form: { title: f.title.trim(), ...(f.intro ? { intro: f.intro.trim() } : {}), fields, ...(f.done ? { done: f.done.trim() } : {}), ...(f.consent ? { consent: f.consent.trim() } : {}) } };
}

/**
 * Check one submission against the form it claims to be for. Only declared fields are kept. The hidden "website"
 * field is a trap: a person never sees it, so anything in it means a bot, and the answer is a quiet "thanks".
 */
export function checkSubmission(form: FormDef, body: J): { ok: true; data: Record<string, J> } | { ok: false; error: "bot" | "missing" | "bad_value"; field?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "bad_value" };
  if (typeof body.website === "string" && body.website.trim()) return { ok: false, error: "bot" };
  if (form.consent && body.consent !== true) return { ok: false, error: "missing", field: "consent" };
  const data: Record<string, J> = {};
  for (const f of form.fields) {
    const raw = body[f.id];
    const empty = raw == null || (typeof raw === "string" && !raw.trim()) || (f.type === "yes" && raw !== true);
    if (empty) { if (f.required) return { ok: false, error: "missing", field: f.id }; continue; }
    if (f.type === "yes") { data[f.id] = true; continue; }
    if (f.type === "number") { const n = typeof raw === "number" ? raw : Number(String(raw).trim()); if (!Number.isFinite(n) || Math.abs(n) > 1e12) return { ok: false, error: "bad_value", field: f.id }; data[f.id] = n; continue; }
    if (typeof raw !== "string") return { ok: false, error: "bad_value", field: f.id };
    const v = raw.trim();
    if (v.length > (f.type === "longtext" ? 2000 : 200)) return { ok: false, error: "bad_value", field: f.id };
    if (f.type === "email" && !EMAIL.test(v)) return { ok: false, error: "bad_value", field: f.id };
    if (f.type === "phone" && !/^\+?[0-9 ().-]{7,24}$/.test(v)) return { ok: false, error: "bad_value", field: f.id };
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "bad_value", field: f.id };
    if (f.type === "choice" && !(f.options ?? []).includes(v)) return { ok: false, error: "bad_value", field: f.id };
    const t = text(v, 2000);
    if (t) data[f.id] = t;
  }
  if (form.consent) data.consent = true;
  return { ok: true, data };
}

/** What a teammate is told about one received email: who it is from, the subject and the first of the text. Never the raw headers or attachments. */
export function mailData(mail: J): Record<string, J> {
  const addr = (v: unknown) => (String(v ?? "").match(/[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/i)?.[0] ?? "").toLowerCase().slice(0, 200);
  const body = typeof mail?.text === "string" && mail.text.trim() ? mail.text : String(mail?.html ?? "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return cleanPayload({ from: addr(mail?.from), subject: String(mail?.subject ?? "").slice(0, 200), text: body.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 2000) });
}
/** The door an email is for: the first recipient that is a Pip door address ("in-…@hirepip.com"), or "". */
export function doorAddress(mail: J): string {
  const all = ([] as unknown[]).concat(mail?.to ?? [], mail?.received_for ?? [], mail?.cc ?? []);
  for (const v of all) { const m = String(v ?? "").toLowerCase().match(/\b(in-[a-z0-9-]{6,48})@hirepip\.com\b/); if (m) return m[1]; }
  return "";
}

/** May Pip post to this address? https only, a named public host, no sign-in inside the address. */
export function outUrlOk(url: unknown): boolean {
  if (typeof url !== "string" || url.length > 400) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes(".") || /^[0-9.]+$/.test(h)) return false; // no bare names, no IP addresses
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(h)) return false;
  if (/(^|\.)(hirepip\.com|supabase\.co|supabase\.in|vercel\.app)$/.test(h)) return false;  // never Pip's own systems
  if (u.port && !["443", "8443"].includes(u.port)) return false;
  return true;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
/** The signature Pip puts on a post: HMAC-SHA256 over "<unix seconds>.<body>", as hex. */
export async function sign(key: string, at: number, body: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${at}.${body}`)));
}
export async function sha256(s: string): Promise<string> { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }

export type OutDeps = {
  take: (name: string, key: string, data: Record<string, J>) => Promise<{ ok: boolean; error?: string; duplicate?: boolean; event?: string; url?: string; sign_key?: string; feed?: boolean }>;
  post: (url: string, headers: Record<string, string>, body: string) => Promise<{ status: number }>;
  done: (event: string, status: "sent" | "failed" | "refused", note: string) => Promise<void>;
  now?: () => number;
};
/** A teammate posts to one of the owner's out doors. Returns words for the teammate; never the address or the key. */
export async function sendOut(d: OutDeps, a: { name: unknown; key: string; fields: unknown; meta: Record<string, string> }): Promise<{ ok: boolean; text: string }> {
  if (typeof a.name !== "string" || !/^[a-z][a-z0-9_]{1,39}$/.test(a.name)) return { ok: false, text: "Blocked: name the outbound door exactly as the job lists it. Nothing was sent." };
  let fields: unknown = a.fields;
  if (typeof fields === "string") { try { fields = JSON.parse(fields); } catch { fields = { text: fields }; } }
  const data = cleanPayload(fields);
  if (!Object.keys(data).length) return { ok: false, text: "Blocked: there was nothing to send. Nothing was sent." };
  const t = await d.take(a.name, a.key, data);
  if (!t.ok) return { ok: false, text: t.error === "slow_down" ? "Blocked: this door has reached its limit for now. Nothing was sent." : t.error === "paused" ? "Blocked: outbound doors are paused. Nothing was sent." : "Blocked: this business has no outbound door by that name. Nothing was sent." };
  if (t.duplicate) return { ok: true, text: "Already sent once. Nothing was sent again." };
  if (t.feed) return { ok: true, text: "Left for the connected app to pick up." }; // a zapier door: nothing is pushed; the app reads its feed
  if (!outUrlOk(t.url) || !t.sign_key) { await d.done(t.event!, "refused", "address not allowed"); return { ok: false, text: "Blocked: the address the owner set is not one Pip may post to. Nothing was sent." }; }
  const at = Math.floor((d.now?.() ?? Date.now()) / 1000), body = JSON.stringify({ id: t.event, sent_at: new Date(at * 1000).toISOString(), ...a.meta, data });
  try {
    const r = await d.post(t.url!, { "content-type": "application/json", "user-agent": "Pip-Edge/1", "x-pip-event": String(t.event), "x-pip-timestamp": String(at), "x-pip-signature": `sha256=${await sign(t.sign_key, at, body)}` }, body);
    const fine = r.status >= 200 && r.status < 300;
    await d.done(t.event!, fine ? "sent" : "failed", `status ${r.status}`);
    return fine ? { ok: true, text: "Sent." } : { ok: false, text: `The owner's system answered ${r.status}. It may not have been received.` };
  } catch { await d.done(t.event!, "failed", "no answer"); return { ok: false, text: "The owner's system did not answer. It was not received." }; }
}
