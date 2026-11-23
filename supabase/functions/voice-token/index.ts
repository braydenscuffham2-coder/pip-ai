// Hands Pip's call page a one-time token for a demo call with an AI teammate.
// The ElevenLabs key never leaves this function. Caps keep a shared link from burning the plan's minutes:
// the agent itself allows 20 calls a day, 2 at once and 3 minutes each; this adds a monthly ceiling.
// A call also needs a pass, which a visitor gets by giving an email before "Your team" (see pip-reader).
import { checkPass, codeHash, mintPass, type Pass } from "../_shared/pass.ts";

const KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const EL = "https://api.elevenlabs.io";
const AGENT = Deno.env.get("ELEVENLABS_AGENT_ID") ?? "";
const DAILY_CAP = 20;
const MONTHLY_CAP = 25; // Starter plan: 75 minutes = 25 three-minute calls
// The two house voices. Library voices (Jessica Anne, Josh) need a paid ElevenLabs plan;
// until then the built-in Sarah and Eric stand in.
const VOICES = { f: "EXAVITQu4vr4xnSDxMaL", m: "cjVigY5qzO86Huf0OWal" };
const MAX_SECONDS = 180;

// ---------- the pass ----------
// A visitor who gives an email before "Your team" gets a pass (../_shared/pass.ts). A call costs real minutes, so it
// also needs the six-digit code Pip emailed them: the first call sends it with the pass, and gets back a level-2 pass
// the page keeps for the rest of the visit. Only the code's hash is stored, and five wrong tries end it.
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...((init.headers as Record<string, string>) || {}) }, signal: AbortSignal.timeout(8000) });
const MAX_TRIES = 5;

/** Turns a level-1 pass plus the emailed code into a level-2 pass, or says why not. */
async function verify(p: Pass, code: unknown): Promise<{ pass?: string; error?: string }> {
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) return { error: "needs_code" };
  const row = await db(`email_codes?pass_id=eq.${encodeURIComponent(p.id)}&select=code_hash,expires_at,tries,verified_at`).then((r) => (r.ok ? r.json() : [])).then((r) => r?.[0]).catch(() => null);
  if (!row || Date.parse(row.expires_at) < Date.now() || row.tries >= MAX_TRIES) return { error: "code_expired" };
  if (row.code_hash !== (await codeHash(p.id, code.trim()))) {
    await db(`email_codes?pass_id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ tries: row.tries + 1 }) }).then((r) => r.body?.cancel()).catch(() => {});
    return { error: "wrong_code" };
  }
  await db(`email_codes?pass_id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ verified_at: new Date().toISOString() }) }).then((r) => r.body?.cancel()).catch(() => {});
  return { pass: await mintPass(2, p.id, p.exp) };
}

// Pip's own call page lives on Pip's Vercel site (pip-ai and its previews). The old Lovable page stays allowed
// until it is unpublished, so links already sent keep working.
const ORIGIN_OK = (o: string) => /^https:\/\/pip-ai[a-z0-9-]*\.vercel\.app$/.test(o) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(o) || /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ORIGIN_OK(o) ? o : "https://pip-ai-drab.vercel.app",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
  };
}
const json = (req: Request, o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors(req), "content-type": "application/json" } });

async function callsSince(unix: number) {
  let n = 0, cursor = "";
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${EL}/v1/convai/conversations?agent_id=${AGENT}&page_size=100&call_start_after_unix=${unix}${cursor ? `&cursor=${cursor}` : ""}`, { headers: { "xi-api-key": KEY } });
    if (!r.ok) return -1;
    const j = await r.json();
    n += (j.conversations ?? []).length;
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  if (!KEY || !AGENT) return json(req, { error: "not_configured" }, 503);
  // A call is for a visitor who gave an email on "Your team": the page sends the pass that step handed out.
  const body = await req.json().catch(() => ({}));
  const p = await checkPass(body?.pass);
  if (!p) return json(req, { error: "needs_email" }, 401);
  let upgraded: string | undefined;
  if (p.level < 2) {
    const v = await verify(p, body?.code);
    if (!v.pass) return json(req, { error: v.error }, 401);
    upgraded = v.pass;
  }
  const now = new Date();
  const month = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const [m, d] = await Promise.all([callsSince(month), callsSince(day)]);
  if (m >= MONTHLY_CAP) return json(req, { error: "monthly_cap" }, 429);
  if (d >= DAILY_CAP) return json(req, { error: "daily_cap" }, 429);
  const r = await fetch(`${EL}/v1/convai/conversation/token?agent_id=${AGENT}`, { headers: { "xi-api-key": KEY } });
  if (!r.ok) {
    const t = await r.text();
    const quota = /quota|limit|credits|payment/i.test(t);
    return json(req, { error: quota ? "out_of_minutes" : "unavailable" }, quota ? 429 : 502);
  }
  const j = await r.json();
  return json(req, { token: j.token, voices: VOICES, maxSeconds: MAX_SECONDS, left: { today: d < 0 ? null : DAILY_CAP - d - 1, month: m < 0 ? null : MONTHLY_CAP - m - 1 }, ...(upgraded ? { pass: upgraded } : {}) });
});
