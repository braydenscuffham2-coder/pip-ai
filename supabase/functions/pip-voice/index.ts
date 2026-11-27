// pip-voice: phone calls for a business's Pip number.
// ElevenLabs does the listening and the speaking. The thinking stays in pip-turn, so a caller gets the same
// teammate, the same rules and the same hard limits as on chat. This function sits between the two.
//
//   POST /twilio/voice          Twilio asks this when someone calls a Pip number. Checks the request came from Twilio,
//                               finds the business and teammate, opens the conversation, and asks ElevenLabs to join.
//                               If ElevenLabs cannot join, the caller hears a plain message and the owner is alerted.
//   POST /llm/chat/completions  ElevenLabs asks this for every thing the caller says. Only a request carrying this
//                               call's one-time pass is answered. The caller's words go to pip-turn; the reply is
//                               streamed back. A short holding phrase is spoken if the reply takes a moment.
//   POST /twilio/after          Twilio asks this when the speaking side closes: transfer to a person, hang up,
//                               or (when nobody chose to end the call) say sorry and alert the owner.
//   POST /twilio/dialed         The result of a transfer. If nobody picked up, the caller is told and the owner alerted.
//   POST /twilio/status         Twilio reports the call ended and how long it ran. Billed once, per started minute.
//   POST /hooks/sweep           Every 15 minutes: bills any call Twilio never reported, from Twilio's own record.
//   POST /diag                  Founder testing: which keys are present and whether the vendors accept them. Never a key.
//
// Decided in code here, never by a model: the AI and note-taking notice in the greeting, the 911 line, whether a call
// may be transferred (the owner's hours, in the database), when a call ends, and what is billed.
// No audio is recorded. A caller's number is kept only as a one-way code and its last four digits.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY, TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID.
// Setting: forge_settings 'voice' = {"agent_id":"agent_..."} (the ElevenLabs agent that speaks; not a secret).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const SELF = `${SB_URL}/functions/v1/pip-voice`;
const EL = (Deno.env.get("ELEVENLABS_BASE_URL") || "https://api.elevenlabs.io").replace(/\/+$/, "");
const TW = (Deno.env.get("TWILIO_BASE_URL") || "https://api.twilio.com").replace(/\/+$/, "");
const WORDING = "v1-strict"; // the greeting below. Lane 10 supplies wording per state; until then this one everywhere.
const HOLD_MS = 700; // how long the caller waits in silence before a holding phrase
const HOLD = ["One moment.", "Let me check.", "Okay, one second.", "Sure, just a moment."];
const TURN_TIMEOUT_MS = 20000;
// deno-lint-ignore no-explicit-any
type J = any;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const esc = (s: unknown) => String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const twiml = (inner = "") =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "content-type": "text/xml", "cache-control": "no-store" } });
const say = (text: string) => `<Say>${esc(text)}</Say>`;
const sayBye = (text: string) => twiml(`${say(text)}<Hangup/>`);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))); }
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const later = (p: Promise<unknown>) => {
  const q = p.catch((e) => console.error("[voice] later", String(e).slice(0, 160)));
  const rt = (globalThis as J).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(q);
  return q;
};

// ---------- who is asking ----------
/** True only when Twilio signed this exact request with the account's token. */
async function fromTwilio(req: Request, url: string, params: URLSearchParams): Promise<boolean> {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN"), sig = req.headers.get("x-twilio-signature");
  if (!token || !sig) return false;
  let data = url;
  for (const k of [...new Set(params.keys())].sort()) data += k + (params.get(k) ?? "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return same(btoa(String.fromCharCode(...mac)), sig);
}
async function founder(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && same(bearer, SERVICE)) return true;
  const ticket = req.headers.get("x-pip-ticket");
  if (!ticket) return false;
  const { data } = await db.from("forge_settings").select("value").eq("key", "run_ticket").maybeSingle();
  const v = data?.value as { hash?: string; expires?: string } | null;
  return !!(v?.hash && v.expires && new Date(v.expires).getTime() > Date.now() && same(await sha256(ticket), v.hash));
}

let cfgAt = 0, cfg: { agent_id?: string } = {};
async function settings() {
  if (Date.now() - cfgAt < 60000) return cfg;
  const { data } = await db.from("forge_settings").select("value").eq("key", "voice").maybeSingle();
  const v = (data?.value ?? {}) as J;
  cfg = { agent_id: typeof v.agent_id === "string" && /^agent_[a-z0-9]{10,60}$/.test(v.agent_id) ? v.agent_id : undefined };
  cfgAt = Date.now();
  return cfg;
}

// ---------- what a caller hears before and without the teammate ----------
const greeting = (teammate: string, name: string) =>
  `Hi, this is ${teammate}, an AI assistant for ${name}. I keep written notes of this call so the team can follow up. How can I help?`;
const DOWN = (name: string) => `Thanks for calling ${name}. This is an automated message. Our phone assistant is not available right now. Please call back in a few minutes.`;
const CLOSED = (name: string) => `Thanks for calling ${name}. This is an automated message. Nobody can take your call on this line right now. Please try again later.`;
const NO_LINE = "This is an automated message. This number is not in service.";
const CUT_OFF = "Sorry, we got cut off. Please call back. The team has been told you called.";
const NO_PICKUP = "Sorry, nobody could pick up right now. The team has been told you called and will get back to you.";
const SAY_911 = "If this is an emergency, please hang up and dial 911 right now. I am an AI assistant and cannot help with an emergency.";
const SAY_988 = "If you or someone else is in danger, please hang up and dial 911 right now. You can also call or text 988, the Suicide and Crisis Lifeline, at any time. I am an AI assistant and cannot help with an emergency.";
const DANGER_FIRST = "If anyone is in danger, please hang up and dial 911.";
// Clear danger to a person: answered with the 911 line only, and no model is asked anything.
const DANGER = /\b(call(ing)? 9 ?1 ?1|need 9 ?1 ?1|nine one one|can'?t breathe|cannot breathe|not breathing|stopped breathing|chok(ing|ed)|chest pains?|heart attack|having a stroke|overdos\w*|unconscious|passed out|not responding|unresponsive|bleeding (badly|a lot|heavily|out)|won'?t stop bleeding|seizure|is dying|going to die|been shot|been stabbed|gas leak|smell(s|ing)? (of )?gas|carbon monoxide|house is on fire|building is on fire|(it'?s|is|there'?s a) (on )?fire)\b/i;
const SELF_HARM = /\b(suicid\w*|kill (myself|himself|herself|themselves)|end my life|hurt myself|want to die)\b/i;
// The bare word is common in ordinary calls ("emergency plumber"), so the teammate still answers, after the 911 line.
const MAYBE_DANGER = /\b(emergenc(y|ies)|9 ?1 ?1)\b/i;
const WANTS_PERSON = /\b((speak|talk|spoken|talking) (to|with) (a |an |the |your )?(real |live |actual )?(person|human|someone|somebody|manager|owner|representative|rep|operator|staff|receptionist)|(real|live|actual) (person|human)|(human|operator|representative|receptionist),? please|transfer me|put me through)\b/i;
const GOODBYE = /^(ok(ay)?|alright|great|perfect|no|nope)?[,.! ]*(that'?s (all|it)|that will be all|i'?m (all set|good))?[,.! ]*(thanks?( you)?( so much| very much)?)?[,.! ]*(good ?bye|bye( bye)?|have a (good|great|nice) (one|day|night|evening|weekend)|talk (to you )?(soon|later))[,.! ]*(bye)?[.! ]*$/i;
/** Makes a chat reply fit to be read aloud: no markup, no bare links. */
const speakable = (s: string) => s.replace(/https?:\/\/\S+/g, "the website").replace(/[*_#`>|]+/g, "").replace(/\s+/g, " ").trim();

// ---------- Twilio: a call comes in ----------
async function incoming(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!(await fromTwilio(req, `${SELF}/twilio/voice`, params))) return new Response("forbidden", { status: 403 });
  const sid = params.get("CallSid") ?? "", from = params.get("From") ?? "", to = params.get("To") ?? "";
  const { data: line } = await db.rpc("voice_line_ctx", { p_to: to });
  if (!line?.ok) return sayBye(line?.reason === "closed" ? CLOSED("us") : NO_LINE);
  // A name is spoken, so anything in brackets ("TEST Fork (end-to-end check)") is left out of it.
  const spoken = String(line.name ?? "").replace(/\s*[(\[][^)\]]*[)\]]/g, "").trim().slice(0, 120) || "the business";
  if (!line.spec) return sayBye(CLOSED(spoken));
  const pass = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hello = greeting(String(line.teammate || "the assistant").slice(0, 60), spoken);
  const { data: start, error } = await db.rpc("voice_call_start", { p_to: to, p_from: from, p_call_sid: sid, p_pass_hash: await sha256(pass), p_greeting: hello, p_wording: WORDING });
  if (error || !start?.ok) {
    if (error) console.error("[voice] start", error.message.slice(0, 160));
    return sayBye(start?.reason === "paused" || start?.reason === "no_teammate" ? CLOSED(spoken) : DOWN(spoken));
  }
  const key = Deno.env.get("ELEVENLABS_API_KEY") ?? "", agent = (await settings()).agent_id;
  let xml = "", why = "";
  if (!key || !agent) why = "not_set_up";
  else {
    try {
      const r = await fetch(`${EL}/v1/convai/twilio/register-call`, {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: agent, from_number: from, to_number: to, direction: "inbound",
          // The pass is a secret variable: ElevenLabs puts it only in the header of its requests back to this function.
          conversation_initiation_client_data: { dynamic_variables: { pip_greeting: hello, secret__pip_pass: pass } },
        }),
        signal: AbortSignal.timeout(4000),
      });
      const text = await r.text();
      if (r.ok && /<Response[\s>]/.test(text) && /<Connect[\s>]/.test(text) && /<Stream[\s/>]/.test(text)) xml = text;
      else why = `speech_${r.status}`;
    } catch (e) { why = /timeout|abort/i.test(String(e)) ? "speech_timeout" : "speech_unreachable"; }
  }
  if (!xml) {
    console.error("[voice] could not connect", why);
    await db.rpc("voice_call_fail", { p_call_sid: sid, p_reason: why });
    return sayBye(DOWN(spoken));
  }
  // When the speaking side closes, Twilio asks /twilio/after what to do next.
  const action = `action="${esc(`${SELF}/twilio/after`)}" method="POST"`;
  xml = /<Connect[^>]*\saction=/.test(xml)
    ? xml.replace(/(<Connect[^>]*?)\saction="[^"]*"(\s+method="[^"]*")?/, `$1 ${action}`)
    : xml.replace(/<Connect(?=[\s>])/, `<Connect ${action}`);
  return new Response(xml, { headers: { "content-type": "text/xml", "cache-control": "no-store" } });
}

// ---------- ElevenLabs: the caller said something ----------
function lastUser(body: J): string {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.role !== "user") continue;
    const c = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((p: J) => (typeof p?.text === "string" ? p.text : "")).join(" ") : "";
    return c.replace(/\s+/g, " ").trim().slice(0, 1000);
  }
  return "";
}
const canEndCall = (body: J) => Array.isArray(body?.tools) && body.tools.some((t: J) => (t?.function?.name ?? t?.name) === "end_call");

type Said = { say: string; end?: "hangup" | "transfer" };

async function answer(open: J, heard: string, canEnd: boolean): Promise<Said> {
  const call = open.call as string;
  const close = (next: string | null = null, outcome: string | null = null) => db.rpc("voice_turn_close", { p_call: call, p_next: next, p_outcome: outcome });
  try {
    if (!heard) { await close(); return { say: "Sorry, I didn't catch that. Could you say it again?" }; }
    // 1. Danger to a person: the 911 line, an urgent alert to the owner, and no model.
    if (DANGER.test(heard) || SELF_HARM.test(heard)) {
      const line = SELF_HARM.test(heard) ? SAY_988 : SAY_911;
      await Promise.all([
        db.rpc("voice_say", { p_call: call, p_heard: heard, p_said: line }),
        db.rpc("voice_alert", { p_call: call, p_summary: "A caller said something that sounded like an emergency and was told to hang up and dial 911. Please check on this call.", p_urgency: "urgent" }),
      ]);
      await close(null, "emergency");
      return { say: line };
    }
    // 2. The caller asked for a person: transfer when the owner's hours allow it, decided in the database.
    if (WANTS_PERSON.test(heard) && canEnd) {
      const { data: h } = await db.rpc("voice_handoff", { p_call: call });
      if (h?.allowed) {
        const line = "Sure. I'm connecting you to the team now. Please hold.";
        await db.rpc("voice_say", { p_call: call, p_heard: heard, p_said: line });
        await close("transfer", "asked_for_person");
        return { say: line, end: "transfer" };
      }
    }
    // 3. Everything else: the teammate, in pip-turn, with its own tools and limits.
    let j: J = null;
    try {
      const r = await fetch(`${SB_URL}/functions/v1/pip-turn/turn`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ skill: open.spec, conversation: open.conversation, message: heard, channel: "voice" }),
        signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
      });
      j = await r.json().catch(() => null);
      if (!r.ok) { console.error("[voice] turn", r.status, JSON.stringify(j).slice(0, 120)); j = null; }
    } catch (e) { console.error("[voice] turn", String(e).slice(0, 120)); }
    let reply = speakable(String(j?.reply ?? ""));
    if (!reply) {
      await db.rpc("voice_alert", { p_call: call, p_summary: `The teammate could not answer a caller${heard ? `: "${heard.slice(0, 160)}"` : ""}. The caller was told someone will call back.`, p_urgency: "urgent" });
      await close(canEnd ? "hangup" : null, "teammate_failed");
      return { say: "Sorry, I'm having trouble right now. I've let the team know, and someone will call you back. Goodbye.", end: canEnd ? "hangup" : undefined };
    }
    if (MAYBE_DANGER.test(heard)) reply = `${DANGER_FIRST} ${reply}`;
    const handed = Array.isArray(j?.actions) && j.actions.some((a: J) => a?.tool === "handoff" && a?.status === "done");
    if (handed && canEnd) {
      const { data: h } = await db.rpc("voice_handoff", { p_call: call });
      if (h?.allowed) { await close("transfer", "handed_off"); return { say: `${reply} I'm connecting you to the team now. Please hold.`, end: "transfer" }; }
    }
    if (GOODBYE.test(heard) && canEnd) { await close("hangup", "goodbye"); return { say: reply, end: "hangup" }; }
    await close();
    return { say: reply };
  } catch (e) {
    console.error("[voice] answer", String(e).slice(0, 160));
    await close().then(() => undefined, () => undefined);
    return { say: "Sorry, could you say that again?" };
  }
}

async function llm(req: Request) {
  const t0 = Date.now();
  const pass = req.headers.get("x-pip-pass") ?? "";
  if (!/^[0-9a-f]{64}$/.test(pass)) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => null);
  const hash = await sha256(pass);
  let { data: open } = await db.rpc("voice_turn_open", { p_pass_hash: hash });
  if (!open?.ok && open?.reason !== "ending" && open?.reason !== "too_long") return json({ error: "forbidden" }, 403);

  const heard = lastUser(body), canEnd = canEndCall(body);
  const id = `chatcmpl-${crypto.randomUUID()}`, enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>, gone = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; }, cancel() { gone = true; } });
  const put = (delta: J, finish: string | null = null) => {
    if (gone) return;
    try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(t0 / 1000), model: "pip-turn", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)); } catch { gone = true; }
  };
  const done = () => { if (gone) return; try { ctrl.enqueue(enc.encode("data: [DONE]\n\n")); ctrl.close(); } catch { /* the caller interrupted */ } gone = true; };

  later((async () => {
    put({ role: "assistant", content: "" });
    let held = false, skipped = false;
    const turn = Number(open?.turn ?? 0);
    const hold = setTimeout(() => { held = true; put({ content: `${HOLD[turn % HOLD.length]} ` }); }, Math.max(0, HOLD_MS - (Date.now() - t0)));
    let out: Said;
    try {
      if (open?.reason === "ending") out = { say: "" };
      else if (open?.reason === "too_long") {
        await db.rpc("voice_turn_close", { p_call: open.call, p_next: canEnd ? "hangup" : null, p_outcome: "too_long" });
        out = { say: "I need to end this call here. The team has my notes and will follow up. Goodbye.", end: canEnd ? "hangup" : undefined };
      } else {
        // The caller spoke again before the last turn finished: wait for it, so nothing is done twice.
        let waited = false;
        for (let i = 0; open?.busy && i < 30 && !gone; i++) {
          waited = true;
          await new Promise((r) => setTimeout(r, 400));
          if (gone) break;
          open = (await db.rpc("voice_turn_open", { p_pass_hash: hash })).data;
        }
        if (gone && waited) {
          // While this request waited, the phone side dropped it: the caller kept talking, and a newer request carries
          // their whole sentence. Step aside without asking the teammate, so one sentence gets one answer (found on the
          // first real call, Nov 27 2026: one long sentence was answered five times). A turn that had already started
          // is never dropped, because the teammate may have acted.
          if (open?.ok && !open.busy && open.call) await db.rpc("voice_turn_close", { p_call: open.call, p_next: null, p_outcome: null });
          skipped = true;
          out = { say: "" };
        } else if (!open?.ok || open?.busy) out = { say: open?.reason === "ending" ? "" : "Sorry, could you say that again?" };
        else out = await answer(open, heard, canEnd);
      }
    } finally { clearTimeout(hold); }
    if (out.say) put({ content: out.say });
    if (out.end && canEnd) {
      put({ tool_calls: [{ index: 0, id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`, type: "function", function: { name: "end_call", arguments: JSON.stringify({ reason: out.end === "transfer" ? "Transferring the caller to a person." : "The call is finished." }) } }] });
      put({}, "tool_calls");
    } else put({}, "stop");
    done();
    console.log(`[voice] turn ${turn} ms=${Date.now() - t0} held=${held} end=${out.end ?? "-"} dropped=${gone} skipped=${skipped}`);
  })());

  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
}

// ---------- Twilio: the speaking side closed ----------
async function after(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!(await fromTwilio(req, `${SELF}/twilio/after`, params))) return new Response("forbidden", { status: 403 });
  // The caller has already hung up: there is nobody to speak to and nothing went wrong.
  if ((params.get("CallStatus") ?? "") === "completed") return twiml("<Hangup/>");
  const { data: r } = await db.rpc("voice_call_after", { p_call_sid: params.get("CallSid") ?? "" });
  if (r?.do === "transfer" && /^\+[1-9][0-9]{7,14}$/.test(String(r.number))) {
    return twiml(`<Dial timeout="25" answerOnBridge="true" action="${esc(`${SELF}/twilio/dialed`)}" method="POST"><Number>${esc(r.number)}</Number></Dial>`);
  }
  if (r?.do === "cut_off") {
    await db.rpc("voice_alert", { p_call: r.call, p_summary: `A phone call was cut off before it finished.${r.hint ? ` Caller's number ends in ${r.hint}.` : ""}`, p_urgency: "normal" });
    return sayBye(CUT_OFF);
  }
  return twiml("<Hangup/>");
}

async function dialed(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!(await fromTwilio(req, `${SELF}/twilio/dialed`, params))) return new Response("forbidden", { status: 403 });
  if ((params.get("DialCallStatus") ?? "") === "completed") return twiml("<Hangup/>");
  const { data: c } = await db.from("voice_calls").select("id,contact_hint").eq("call_sid", params.get("CallSid") ?? "").maybeSingle();
  if (c?.id) {
    await db.from("voice_calls").update({ outcome: "transfer_no_answer" }).eq("id", c.id);
    await db.rpc("voice_alert", { p_call: c.id, p_summary: `A caller asked for a person, the call was transferred, and nobody picked up.${c.contact_hint ? ` Caller's number ends in ${c.contact_hint}.` : ""}`, p_urgency: "urgent" });
  }
  return sayBye(NO_PICKUP);
}

// ---------- Twilio: the call ended ----------
const OVER = ["completed", "busy", "failed", "no-answer", "canceled"];
async function status(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!(await fromTwilio(req, `${SELF}/twilio/status`, params))) return new Response("forbidden", { status: 403 });
  const st = params.get("CallStatus") ?? "";
  if (OVER.includes(st)) {
    const secs = Math.max(0, Math.floor(Number(params.get("CallDuration") ?? "0")) || 0);
    const { error } = await db.rpc("voice_call_end", { p_call_sid: params.get("CallSid") ?? "", p_duration: secs, p_status: st });
    if (error) { console.error("[voice] end", error.message.slice(0, 160)); return new Response("retry", { status: 500 }); }
  }
  return new Response(null, { status: 204 });
}

async function twilioGet(path: string) {
  const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim(), token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  if (!sid || !token) return { status: 0, j: null as J };
  try {
    const r = await fetch(`${TW}/2010-04-01/Accounts/${sid}${path}`, { headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}` }, signal: AbortSignal.timeout(8000) });
    return { status: r.status, j: await r.json().catch(() => null) as J };
  } catch { return { status: 0, j: null as J }; }
}

/** Bills calls Twilio never reported as ended, from Twilio's own record of how long they ran. Safe to call by anyone: it only settles what is true. */
async function sweep() {
  const { data: list } = await db.rpc("voice_calls_unbilled");
  const out = { waiting: Array.isArray(list) ? list.length : 0, settled: 0, still_open: 0, unknown: 0 };
  for (const sid of (Array.isArray(list) ? list : []) as string[]) {
    const r = await twilioGet(`/Calls/${sid}.json`);
    if (r.status === 200 && OVER.includes(String(r.j?.status))) {
      await db.rpc("voice_call_end", { p_call_sid: sid, p_duration: Math.max(0, Math.floor(Number(r.j?.duration ?? 0)) || 0), p_status: String(r.j.status) });
      out.settled++;
    } else if (r.status === 200) out.still_open++;
    else out.unknown++;
  }
  return out;
}

async function diag(body: J) {
  const out: J = {
    elevenlabs_key: !!Deno.env.get("ELEVENLABS_API_KEY"), twilio_token: !!Deno.env.get("TWILIO_AUTH_TOKEN"), twilio_account: !!(Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim(),
    agent_set: !!(await settings()).agent_id, wording: WORDING, hold_ms: HOLD_MS,
  };
  if (body?.check === true) {
    if (out.elevenlabs_key && out.agent_set) {
      try {
        const r = await fetch(`${EL}/v1/convai/agents/${cfg.agent_id}`, { headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")! }, signal: AbortSignal.timeout(8000) });
        out.elevenlabs = r.status; await r.body?.cancel();
      } catch { out.elevenlabs = 0; }
    }
    if (out.twilio_token && out.twilio_account) out.twilio = (await twilioGet(".json")).status;
  }
  return json(out);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-voice/, "") || "/";
  try {
    if (path === "/twilio/voice") return await incoming(req);
    if (/^\/llm(\/v1)?\/chat\/completions$/.test(path)) return await llm(req);
    if (path === "/twilio/after") return await after(req);
    if (path === "/twilio/dialed") return await dialed(req);
    if (path === "/twilio/status") return await status(req);
    if (path === "/hooks/sweep") return json(await sweep());
    if (path === "/diag") return (await founder(req)) ? await diag(await req.json().catch(() => ({}))) : json({ error: "forbidden" }, 403);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error("[voice]", String(e).slice(0, 200));
    // A Twilio route must still answer with something a caller can hear.
    if (path.startsWith("/twilio/") && path !== "/twilio/status") return sayBye("Sorry, something went wrong on our side. Please call back in a few minutes.");
    return json({ error: "server" }, 500);
  }
});
