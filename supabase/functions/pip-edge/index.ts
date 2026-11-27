// pip-edge: Pip's doors. The ways a business's own world starts a teammate's job without anyone asking Pip.
//
//   POST /hook/<door id>   Another system posts JSON here with the door's secret in the header "x-pip-secret"
//                          (or "Authorization: Bearer <secret>"). The secret is never accepted in the address, so it
//                          never lands in a log. An "Idempotency-Key" header makes a retry safe; without one, the same
//                          body twice counts once.
//   GET  /hook/<door id>   A connection test: with the right secret, says which business and door this is.
//   GET  /feed/<door id>   What teammates left for a connected app (a "zapier" door), newest first, with the secret.
//   GET  /form/<door id>   The public face of a form: its title, its fields and the business's name.
//   POST /form/<door id>   One submission. Only the fields the form declares are kept.
//   POST /mail             Internal (service key): pip-mail-in hands over a message sent to a door's address.
//   POST /make             Internal: make a door for a business. A form is checked first; an outbound address must be
//                          one Pip may post to.
//
// What arrives is data, never instructions: it is cleaned (_shared/edges.ts), capped, stored for 30 days, and handed to
// pip-jobs as the information of a "webhook_received", "email_received" or "form_submitted" event. pip-jobs decides
// which jobs start, and only for a teammate that may act for real (live, or on a TEST business). Limits per door and
// the pause switch (forge_settings 'edges_paused') live in the database function edge_take, in one step.
// An email that says STOP is recorded as an opt-out and starts nothing.
// verify_jwt is off because the senders cannot hold a Supabase sign-in; every route checks for itself.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// deno-lint-ignore-file no-explicit-any
// deno-lint-ignore no-var
declare var EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkForm, checkSubmission, cleanPayload, EDGE_EVENT, type EdgeKind, type FormDef, mailData, outUrlOk, sha256 } from "../_shared/edges.ts";
import { isStopRequest } from "../_shared/optout.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = ["https://www.hirepip.com", "https://hirepip.com"];
const cors = (req: Request): Record<string, string> => { const o = req.headers.get("origin") ?? ""; return ORIGINS.includes(o) || /^https:\/\/pip-[a-z0-9-]+-braydenscuffham2-coders-projects\.vercel\.app$/.test(o) ? { "access-control-allow-origin": o, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" } : {}; };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** Read a JSON object body of at most 64 KB. Null for anything else. */
async function bodyOf(req: Request): Promise<{ raw: string; obj: any } | null> {
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > 64000) return null;
  try { const obj = JSON.parse(raw); return obj && typeof obj === "object" && !Array.isArray(obj) ? { raw, obj } : null; } catch { return null; }
}

/** Hand one accepted knock to pip-jobs and note what became of it. Never throws: the sender already has its answer. */
async function start(t: { event: string; business: string; name: string; kind: EdgeKind }, data: Record<string, any>): Promise<number> {
  let started = 0, status = "no_job", note: string | null = null;
  try {
    const r = await fetch(`${SB_URL}/functions/v1/pip-jobs/event`, { method: "POST", headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ business: t.business, from: "pip", event: EDGE_EVENT[t.kind], key: `${t.name}:${t.event}`.slice(0, 120), data: { door: t.name, ...data } }), signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => ({}));
    started = Number.isInteger(j?.started) ? j.started : 0;
    if (!r.ok) { status = "failed"; note = `jobs ${r.status}`; } else if (started > 0) status = "started";
  } catch { status = "failed"; note = "jobs did not answer"; }
  await db.rpc("edge_done", { p_event: t.event, p_started: started, p_status: status, p_note: note });
  return started;
}
const REFUSED: Record<string, [number, string]> = { not_found: [404, "not_found"], slow_down: [429, "slow_down"], paused: [503, "paused"], bad_request: [400, "bad_request"] };

async function hook(req: Request, id: string) {
  const secret = secretOf(req);
  if (!UUID.test(id) || secret.length < 16 || secret.length > 200) return json({ ok: false, error: "not_found" }, 404);
  const b = await bodyOf(req);
  if (!b) return json({ ok: false, error: "bad_request", message: "Send a JSON object of at most 64 KB." }, 400);
  const given = (req.headers.get("idempotency-key") ?? req.headers.get("x-idempotency-key") ?? "").trim();
  const key = /^[\w.:-]{1,100}$/.test(given) ? `k:${given}` : `h:${(await sha256(b.raw)).slice(0, 48)}`;
  const { data: t, error } = await db.rpc("edge_take", { p_edge: id, p_address: null, p_kind: "webhook", p_secret: secret, p_key: key, p_data: cleanPayload(b.obj) });
  if (error) return json({ ok: false, error: "server" }, 500);
  if (!t?.ok) { const [s, e] = REFUSED[t?.error] ?? [400, "bad_request"]; return json({ ok: false, error: e }, s); }
  if (t.duplicate) return json({ ok: true, duplicate: true });
  // Answer at once. The job may take many seconds; whoever knocked should not have to wait for it, and a sender that
  // times out would knock again. (Found live: a customer's form sat on "Sending" for the whole run.)
  EdgeRuntime.waitUntil(start(t, cleanPayload(b.obj)));
  return json({ ok: true, id: t.event, received: true });
}

const secretOf = (req: Request) => (req.headers.get("x-pip-secret") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")).trim();
async function who(req: Request, id: string) {
  const secret = secretOf(req);
  if (!UUID.test(id) || secret.length < 16 || secret.length > 200) return json({ ok: false, error: "not_found" }, 404);
  const { data } = await db.rpc("edge_who", { p_edge: id, p_secret: secret });
  return data?.ok ? json({ ok: true, business: data.business, door: data.door }) : json({ ok: false, error: "not_found" }, 404);
}
async function feed(req: Request, id: string) {
  const secret = secretOf(req);
  if (!UUID.test(id) || secret.length < 16 || secret.length > 200) return json({ ok: false, error: "not_found" }, 404);
  const { data } = await db.rpc("edge_feed", { p_edge: id, p_secret: secret, p_limit: 50 });
  if (!data?.ok) return json({ ok: false, error: data?.error === "paused" ? "paused" : "not_found" }, data?.error === "paused" ? 503 : 404);
  return json({ ok: true, items: data.items });
}
async function formGet(req: Request, id: string) {
  if (!UUID.test(id)) return json({ ok: false, error: "not_found" }, 404, cors(req));
  const { data } = await db.rpc("edge_form", { p_edge: id });
  return data?.form ? json({ ok: true, form: { id: data.id, business: data.business, ...data.form } }, 200, cors(req)) : json({ ok: false, error: "not_found" }, 404, cors(req));
}
async function formPost(req: Request, id: string) {
  const h = cors(req);
  if (!UUID.test(id)) return json({ ok: false, error: "not_found" }, 404, h);
  const b = await bodyOf(req);
  if (!b) return json({ ok: false, error: "bad_request" }, 400, h);
  const { data: f } = await db.rpc("edge_form", { p_edge: id });
  if (!f?.form) return json({ ok: false, error: "not_found" }, 404, h);
  const sub = checkSubmission(f.form as FormDef, b.obj);
  // A bot gets the same quiet thanks a person does, and nothing is stored or started.
  if (!sub.ok) return sub.error === "bot" ? json({ ok: true }, 200, h) : json({ ok: false, error: sub.error, field: sub.field }, 400, h);
  const nonce = typeof b.obj.nonce === "string" && /^[\w-]{8,64}$/.test(b.obj.nonce) ? b.obj.nonce : "";
  const key = nonce ? `n:${nonce}` : `h:${(await sha256(JSON.stringify(sub.data))).slice(0, 48)}`;
  const { data: t, error } = await db.rpc("edge_take", { p_edge: id, p_address: null, p_kind: "form", p_secret: null, p_key: key, p_data: sub.data });
  if (error) return json({ ok: false, error: "server" }, 500, h);
  if (!t?.ok) { const [s, e] = REFUSED[t?.error] ?? [400, "bad_request"]; return json({ ok: false, error: e }, s, h); }
  if (!t.duplicate) EdgeRuntime.waitUntil(start(t, sub.data));
  return json({ ok: true }, 200, h);
}

async function mail(b: any) {
  const address = typeof b?.address === "string" ? b.address.toLowerCase() : "", id = typeof b?.id === "string" ? b.id : "";
  if (!/^in-[a-z0-9-]{6,48}$/.test(address) || !/^[\w-]{6,80}$/.test(id)) return json({ ok: false, error: "bad_request" }, 400);
  const data = mailData(b.mail);
  const { data: t, error } = await db.rpc("edge_take", { p_edge: null, p_address: address, p_kind: "email", p_secret: null, p_key: `m:${id}`, p_data: data });
  if (error) return json({ ok: false, error: "server" }, 500);
  if (!t?.ok) return json({ ok: false, error: t?.error ?? "bad_request" }, t?.error === "not_found" ? 404 : 400);
  if (t.duplicate) return json({ ok: true, duplicate: true });
  // "STOP" by email is an opt-out, recorded for this business and this sender, and it starts nothing.
  const stop = isStopRequest(`${data.subject ?? ""}\n${data.text ?? ""}`) || isStopRequest(String(data.text ?? ""));
  if (typeof data.from === "string" && data.from) {
    const { data: ein } = await db.rpc("portal_email_in", { p_business: t.business, p_spec: null, p_from: data.from, p_kind: stop ? "stop" : "message" });
    if (stop) { await db.rpc("edge_done", { p_event: t.event, p_started: 0, p_status: "received", p_note: "opt-out recorded; nothing started" }); return json({ ok: true, opted_out: true }); }
    if (ein?.allowed === false) data.sender_opted_out = true;
  }
  const started = await start(t, data);
  return json({ ok: true, id: t.event, started });
}

async function make(b: any) {
  if (typeof b?.business !== "string" || !UUID.test(b.business)) return json({ ok: false, error: "bad_request" }, 400);
  let form: FormDef | null = null;
  if (b.kind === "form") { const c = checkForm(b.form); if (!c.ok) return json({ ok: false, error: "bad_form", errors: c.errors }, 400); form = c.form; }
  if (b.kind === "out" && !outUrlOk(b.url)) return json({ ok: false, error: "bad_url", message: "An outbound address must be https, on a named public host, and not one of Pip's own." }, 400);
  const { data, error } = await db.rpc("edge_make", { p_business: b.business, p_kind: b.kind, p_name: b.name, p_label: b.label, p_form: form, p_url: b.kind === "out" ? b.url : null, p_by: typeof b.by === "string" ? b.by : "forge" });
  if (error) return json({ ok: false, error: "server" }, 500);
  return json(data ?? { ok: false, error: "server" }, data?.ok ? 200 : 400);
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/^.*\/pip-edge/, "") || "/";
  const m = path.match(/^\/(hook|form|feed)\/([^/]+)$/);
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (m?.[1] === "form" && req.method === "GET") return await formGet(req, m[2]);
    if (m?.[1] === "hook" && req.method === "GET") return await who(req, m[2]);
    if (m?.[1] === "feed" && req.method === "GET") return await feed(req, m[2]);
    if (req.method !== "POST") return json({ ok: false, error: "not_found" }, 404);
    if (m?.[1] === "hook") return await hook(req, m[2]);
    if (m?.[1] === "form") return await formPost(req, m[2]);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer || !same(bearer, SERVICE)) return json({ ok: false, error: "not_found" }, 404);
    const b = await req.json().catch(() => ({}));
    if (path === "/mail") return await mail(b);
    if (path === "/make") return await make(b);
    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error("[edge]", String((e as Error)?.message ?? e).slice(0, 160)); // never a body: what arrives may hold personal details
    return json({ ok: false, error: "server" }, 500);
  }
});
