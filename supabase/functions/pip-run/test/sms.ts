// Runs the real pip-run text route against stand-ins for the database, pip-turn and Twilio.
//   DENO_NO_PACKAGE_JSON=1 deno run -A supabase/functions/pip-run/test/sms.ts
// deno-lint-ignore-file no-explicit-any
const MOCK = 9111, FN = 9112, TOKEN = "test-twilio-token", SERVICE = "test-service-key";
const SELF = `http://127.0.0.1:${MOCK}/functions/v1/pip-run`;
const w: any = {};
const reset = () => Object.assign(w, { live: false, test: true, stopped: new Set<string>(), sent: [] as any[], turns: [] as any[], usage: [] as any[], notes: [] as any[], consent: [] as any[], turn: "ok", firsts: new Set<string>(), gates: [] as any[], paused: false });
Deno.serve({ port: MOCK, hostname: "127.0.0.1", onListen() {} }, async (req) => {
  const u = new URL(req.url), p = u.pathname, j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (p === "/rest/v1/rpc/portal_line_ctx") { const a = await req.json(); return j(a.p_to === "+12085550100" ? { ok: true, business: "b1", name: "TEST Fork (check)", status: "building", spec: w.live ? "live-spec" : null, teammate: w.live ? "Hallie" : null } : { ok: false }); }
  if (p === "/rest/v1/rpc/voice_line_ctx") return j(w.test ? { ok: true, test: true, business: "b1", spec: "test-spec", teammate: "Hallie" } : { ok: true, test: false, business: "b1", spec: null });
  if (p === "/rest/v1/rpc/portal_sms_in") {
    const a = await req.json(); w.consent.push(a);
    if (a.p_kind === "stop") { w.stopped.add(a.p_from); return j({ allowed: false, reason: "opted_out" }); }
    if (a.p_kind === "start") { w.stopped.delete(a.p_from); return j({ allowed: false, reason: "rejoined" }); }
    if (!a.p_spec) return j({ allowed: false, reason: "no_teammate" });
    if (w.stopped.has(a.p_from)) return j({ allowed: false, reason: "opted_out" });
    const first = !w.firsts.has(a.p_from); w.firsts.add(a.p_from);
    return j({ allowed: true, conversation: "conv-1", first });
  }
  if (p === "/rest/v1/rpc/outbound_gate") { const a = await req.json(); w.gates.push(a); return j(w.paused ? { allowed: false, reason: "paused" } : w.stopped.has(a.p_to) ? { allowed: false, reason: "opted_out" } : { allowed: true }); }
  if (p === "/rest/v1/rpc/portal_sms_out") { w.usage.push(await req.json()); return j(null); }
  if (p === "/rest/v1/notifications") { w.notes.push(await req.json()); return new Response(null, { status: 201 }); }
  if (p === "/functions/v1/pip-turn/turn") { const b = await req.json(); w.turns.push(b); return w.turn === "down" ? j({ error: "server" }, 500) : j({ reply: "This is Hallie, an AI assistant for TEST Fork. We open at 5.", conversation: b.conversation }); }
  if (p === "/2010-04-01/Accounts/ACtest/Messages.json") { w.sent.push(Object.fromEntries(new URLSearchParams(await req.text()))); return j({ sid: "SM1" }, 201); }
  return j({ error: "unexpected " + p }, 500);
});
// pip-run talks to api.twilio.com directly, so the test rewrites that one address to the stand-in.
const src = (await Deno.readTextFile(new URL("../index.ts", import.meta.url))).replace("https://api.twilio.com", `http://127.0.0.1:${MOCK}`)
  .replaceAll('"../_shared/', '"' + new URL("../../_shared/", import.meta.url).href); // the copy runs from a temp folder, so shared imports become absolute
const tmp = await Deno.makeTempFile({ suffix: ".ts" }); await Deno.writeTextFile(tmp, src);
const child = new Deno.Command(Deno.execPath(), { args: ["run", "-A", tmp], stdout: "null", stderr: "null", env: { DENO_NO_PACKAGE_JSON: "1", SUPABASE_URL: `http://127.0.0.1:${MOCK}`, SUPABASE_SERVICE_ROLE_KEY: SERVICE, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_ACCOUNT_SID: "ACtest", DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN}` } }).spawn();
for (let i = 0; i < 100; i++) { try { await (await fetch(`http://127.0.0.1:${FN}/pip-run/x`)).body?.cancel(); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
async function text(body: string, opt: { sig?: boolean; to?: string; from?: string } = {}) {
  const params: Record<string, string> = { From: opt.from ?? "+12085551234", To: opt.to ?? "+12085550100", Body: body, MessageSid: "SM0" };
  let data = SELF + "/twilio/sms"; for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(TOKEN), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))));
  const r = await fetch(`http://127.0.0.1:${FN}/functions/v1/pip-run/twilio/sms`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(opt.sig === false ? {} : { "x-twilio-signature": sig }) }, body: new URLSearchParams(params) });
  const t = await r.text(); await new Promise((r) => setTimeout(r, 250)); return { status: r.status, text: t };
}
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d = "") => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (d ? "  -> " + d : "")); } };

reset();
ok("an unsigned request is refused", (await text("hi", { sig: false })).status === 403 && w.consent.length === 0);
let r = await text("What time do you open?");
ok("Twilio gets an empty answer at once", r.status === 200 && r.text.includes("<Response></Response>"));
ok("a TEST business's line is answered by the teammate named on the line", w.turns.length === 1 && w.turns[0].skill === "test-spec" && w.turns[0].channel === "sms");
ok("the first reply says AI in its first sentence and how to opt out", /^This is Hallie, an AI assistant/.test(w.sent[0]?.Body) && / Reply STOP to opt out\.$/.test(w.sent[0]?.Body), w.sent[0]?.Body);
ok("the reply goes from the Pip number to the texter", w.sent[0]?.From === "+12085550100" && w.sent[0]?.To === "+12085551234");
ok("the text is counted for billing", w.usage.length === 1 && w.usage[0].p_segments >= 2);
ok("the same call records the send for the texter, with the AI line and the opt-out line flagged", w.usage[0].p_to === "+12085551234" && w.usage[0].p_ai_disclosed === true && w.usage[0].p_opt_out_offered === true, JSON.stringify(w.usage[0]));
ok("every send has exactly one record", w.usage.length === w.sent.length);
await text("thanks");
ok("a later reply is recorded too, without claiming a new AI line or opt-out line", w.usage.length === 2 && w.usage[1].p_ai_disclosed === false && w.usage[1].p_opt_out_offered === false && w.usage[1].p_to === "+12085551234", JSON.stringify(w.usage[1]));
ok("a later reply does not repeat the opt-out line", w.sent.length === 2 && !/STOP/.test(w.sent[1].Body));

reset(); w.test = false;
await text("hello");
ok("a business that is not on the test list and has no live teammate gets no reply", w.turns.length === 0 && w.sent.length === 0);

reset();
for (const s of ["STOP", "stop.", "Unsubscribe", "please stop texting me"]) {
  w.sent.length = 0; w.turns.length = 0; w.stopped.clear();
  await text(s);
  ok(`"${s}" is recorded as an opt-out and gets no reply from Pip`, w.consent.at(-1).p_kind === "stop" && w.sent.length === 0 && w.turns.length === 0);
}
await text("are you still there?");
ok("after STOP, a normal message is not answered", w.sent.length === 0 && w.turns.length === 0);
ok("and nothing is recorded as sent to someone who opted out", w.usage.length === 0);
await text("START");
ok("START is recorded and gets no reply from Pip (Twilio sends its own)", w.consent.at(-1).p_kind === "start" && w.sent.length === 0);
await text("ok I am back");
ok("after START, messages are answered again", w.sent.length === 1);
w.sent.length = 0; w.consent.length = 0;
await text("HELP"); await text("info");
ok("HELP and INFO are left to Twilio: no second text from Pip", w.sent.length === 0 && w.consent.length === 0);
await text("I need help with my order");
ok("a sentence containing 'help' is an ordinary message", w.sent.length === 1);

reset(); w.turn = "down";
await text("can I book for six?");
ok("pip-turn down: the texter still gets a reply that says AI", /^This is an AI assistant for TEST Fork\. We got your message/.test(w.sent[0]?.Body) && !/check/.test(w.sent[0].Body), w.sent[0]?.Body);
ok("and the owner gets an urgent alert", w.notes.length === 1 && w.notes[0].body.args.urgency === "urgent");
reset();
await text("hi", { to: "+12085559999" });
ok("a text to a number that is not a Pip line does nothing", w.consent.length === 0 && w.sent.length === 0);
reset();
await text("are you open?"); await new Promise((r) => setTimeout(r, 400));
ok("a reply asks the one outbound gate first, as a reply", w.gates.length === 1 && w.gates[0].p_channel === "sms" && w.gates[0].p_first === false && w.gates[0].p_to === "+12085551234" && w.sent.length === 1);
reset(); w.paused = true;
await text("are you open?"); await new Promise((r) => setTimeout(r, 400));
ok("when sending is paused, no text goes out and none is recorded", w.gates.length === 1 && w.sent.length === 0 && w.usage.length === 0);

child.kill(); await Deno.remove(tmp);
console.log(`\n${pass} passed, ${fail} failed`); Deno.exit(fail ? 1 : 0);
