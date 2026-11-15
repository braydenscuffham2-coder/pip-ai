// Hands Pip's call page a one-time token for a demo call with an AI teammate.
// The ElevenLabs key never leaves this function. Caps keep a shared link from burning the plan's minutes:
// the agent itself allows 20 calls a day, 2 at once and 3 minutes each; this adds a monthly ceiling.
// A call also needs a pass, which a visitor gets by giving an email before "Your team" (see pip-reader).
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
// A visitor who gives an email before "Your team" gets a pass: a signed note that says "this visitor is a lead"
// and when it runs out. The expensive demos (a live call) ask for it. Only this project can sign or check one.
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(`pip-pass-v1|${SB_KEY}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)))).slice(0, 32);
}
async function passOk(t: unknown) {
  if (typeof t !== "string" || t.length > 120 || !SB_KEY) return false;
  const [v, exp, id, sig] = t.split(".");
  if (v !== "p1" || !/^\d{9,11}$/.test(exp || "") || !/^[A-Za-z0-9_-]{10}$/.test(id || "") || Number(exp) * 1000 < Date.now()) return false;
  const want = await sign(`${exp}.${id}`), got = sig || "";
  let diff = want.length ^ got.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
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
  if (!(await passOk(body?.pass))) return json(req, { error: "needs_email" }, 401);
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
  return json(req, { token: j.token, voices: VOICES, maxSeconds: MAX_SECONDS, left: { today: d < 0 ? null : DAILY_CAP - d - 1, month: m < 0 ? null : MONTHLY_CAP - m - 1 } });
});
