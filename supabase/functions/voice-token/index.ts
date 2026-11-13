// Hands Pip's call page a one-time token for a demo call with an AI teammate.
// The ElevenLabs key never leaves this function. Caps keep a shared link from burning the plan's minutes:
// the agent itself allows 20 calls a day, 2 at once and 3 minutes each; this adds a monthly ceiling.
const KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const EL = "https://api.elevenlabs.io";
const AGENT = Deno.env.get("ELEVENLABS_AGENT_ID") ?? "";
const DAILY_CAP = 20;
const MONTHLY_CAP = 25; // Starter plan: 75 minutes = 25 three-minute calls
// The two house voices. Library voices (Jessica Anne, Josh) need a paid ElevenLabs plan;
// until then the built-in Sarah and Eric stand in.
const VOICES = { f: "EXAVITQu4vr4xnSDxMaL", m: "cjVigY5qzO86Huf0OWal" };
const MAX_SECONDS = 180;

const ORIGIN_OK = (o: string) => /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(o) || /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ORIGIN_OK(o) ? o : "https://pip-plan.lovable.app",
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
