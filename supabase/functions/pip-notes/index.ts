// pip-notes: each teammate that may act for real writes one note a week about its own work.
//
//   POST /tick   The database knocks every Monday. The knock carries nothing: this works out which teammates are due
//                a note for the week that just ended, counts each one's week in the database (teammate_week), has a
//                small model put the counts into plain words, checks those words against the counts
//                (_shared/notes.ts), and saves the note. A quiet week gets a plain note with no model call.
//                Knocking again writes nothing twice: one note per teammate per week (a database rule).
//
// A note may carry at most one proposed change, and only one that points at runs that really failed. A proposal is
// words for the owner and the founder to read. Nothing here, or anywhere, applies one.
// The owner reads notes in the Portal; the founder reads them with the evidence (notes_list in the Forge connector).
// verify_jwt is off because the database's knock has no sign-in; the knock can only write what is already due.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (without it every note is the plain kind).
// deno-lint-ignore-file no-explicit-any
// deno-lint-ignore no-var
declare var EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkNote, lastWeek, notePrompt, plainNote, readNote, type WeekFacts } from "../_shared/notes.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim(), MODEL = Deno.env.get("NOTES_MODEL") ?? "claude-haiku-5-5";
const PRICE = { input: 0.1, output: 0.5 };       // list price per million tokens for the small model; a budget guard, not a bill
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const PER_KNOCK = 6;

async function setting(key: string): Promise<any> { const { data } = await db.from("forge_settings").select("value").eq("key", key).maybeSingle(); return data?.value; }

async function write(t: { spec: string; business: string; business_name: string; teammate: string }, w: { week: string; from: string; to: string }): Promise<"model" | "facts" | "skipped"> {
  const { data: facts } = await db.rpc("teammate_week", { p_spec: t.spec, p_from: w.from, p_to: w.to });
  if (!facts) return "skipped";
  const f = facts as WeekFacts;
  let note = plainNote(t.teammate, f), usd = 0;
  if (Number(f.runs) > 0 && ANTHROPIC) {
    const why = (await db.rpc("pip_take", { p_kind: "work_usd", p_units: 0.005, p_room: 0 })).data;
    if (typeof why !== "string") {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(45000), headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: notePrompt(t.teammate, t.business_name, f) }] }) });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          usd = ((j.usage?.input_tokens ?? 0) * PRICE.input + (j.usage?.output_tokens ?? 0) * PRICE.output) / 1_000_000;
          const checked = checkNote(readNote(((j.content || []) as any[]).filter((c) => c.type === "text").map((c) => c.text).join("")), f);
          if (checked) note = checked;
        } else await r.body?.cancel().catch(() => {});
      } catch { /* the plain note stands */ }
      await db.rpc("pip_take", { p_kind: "work_usd", p_units: Math.round((usd - 0.005) * 100000) / 100000, p_room: 0 });
    }
  }
  const { error } = await db.from("teammate_notes").insert({ business_id: t.business, spec_id: t.spec, week_start: w.week, teammate: t.teammate.slice(0, 80), did: note.did, wrong: note.wrong, proposal: note.proposal, facts: f, written_by: note.written_by, cost_usd: Math.round(usd * 100000) / 100000 });
  if (error) return "skipped";                                    // already written for this week, or the row was refused
  await db.from("activity_log").insert({ business_id: t.business, spec_id: t.spec, kind: "system", outcome: "info", actor: "pip", summary: `${t.teammate}'s week: ${note.did}`.slice(0, 500), ref: { note_week: w.week } });
  return note.written_by;
}

async function tick() {
  if ((await setting("notes_on")) !== true) return json({ ok: true, off: true });
  const last = await setting("notes_tick");
  if (last?.at && Date.now() - new Date(last.at).getTime() < 20000) return json({ ok: true, skipped: "too_soon" });
  await db.from("forge_settings").upsert({ key: "notes_tick", value: { at: new Date().toISOString() } });
  const w = lastWeek(new Date());
  const { data: due } = await db.rpc("teammate_notes_due", { p_week: w.week, p_limit: 25 });
  const list = Array.isArray(due) ? due : [];
  const out = { model: 0, facts: 0, skipped: 0 };
  for (const t of list.slice(0, PER_KNOCK)) out[await write(t, w)]++;
  // More are due than one knock should write: knock again, after the short gate.
  if (list.length > PER_KNOCK) EdgeRuntime.waitUntil(new Promise((r) => setTimeout(r, 21000)).then(() => fetch(`${SB_URL}/functions/v1/pip-notes/tick`, { method: "POST", body: "{}" })).then((r) => r.body?.cancel()).catch(() => {}));
  await db.from("forge_settings").upsert({ key: "notes_tick", value: { at: new Date().toISOString(), week: w.week, due: list.length, ...out } });
  return json({ ok: true, week: w.week, due: list.length, written: out.model + out.facts, ...out });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "not_found" }, 404);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-notes/, "") || "/";
  try {
    if (path === "/tick") return await tick();
    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error("[notes]", String((e as Error)?.message ?? e).slice(0, 160));
    return json({ ok: false, error: "server" }, 500);
  }
});
