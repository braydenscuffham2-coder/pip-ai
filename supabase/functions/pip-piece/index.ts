// pip-piece: the one runtime for every piece of software Pip builds for a business (contract "piece/1").
//
//   GET  /p/<piece id>   What the public may see: the piece's public page (chosen fields of records at chosen stages)
//                        and its public form, with the business's name. Nothing else about the piece or its records.
//   POST /p/<piece id>   One submission of the public form. It becomes a record at the piece's starting stage, and
//                        Pip's event "form_submitted" (door: the piece's name) so a teammate's job can act on it.
//   POST /draft          Internal (service key): the Forge writes a piece for an idea. The answer is checked against
//                        the contract and run in the sandbox here; nothing is saved.
//   POST /save           Internal: check, run the sandbox, and only if every line passes keep the piece as "staged"
//                        and file its shape in the parts library. Going live is a separate tap that is not here.
//
// A piece is reachable only when it is live or its business is on the TEST list (database function piece_open), and
// never when forge_settings 'pieces_paused' is true. The Forge writes descriptions, never code: this file and
// _shared/piece.ts are the only code that runs, for every piece.
// verify_jwt is off because the public page and form have no sign-in; the internal routes check the service key.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (for /draft only).
// deno-lint-ignore-file no-explicit-any
// deno-lint-ignore no-var
declare var EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkPiece, closestParts, intakeForm, type LibraryPart, piecePrompt, pieceWords, type PieceSpec, publicPage, readPieceAnswer, selfTest, submitIntake } from "../_shared/piece.ts";
import { dbStore } from "../_shared/piece-store.ts";
import { costOf } from "../_shared/setup/guards.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim(), MODEL = Deno.env.get("PIECE_MODEL") ?? "claude-sonnet-5-5";
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = ["https://www.hirepip.com", "https://hirepip.com"];
const cors = (req: Request): Record<string, string> => { const o = req.headers.get("origin") ?? ""; return ORIGINS.includes(o) || /^https:\/\/pip-[a-z0-9-]+-braydenscuffham2-coders-projects\.vercel\.app$/.test(o) ? { "access-control-allow-origin": o, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" } : {}; };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

async function open(id: string): Promise<{ id: string; business_id: string; business: string; name: string; label: string; spec: PieceSpec; status: string; test: boolean } | null> {
  if (!UUID.test(id)) return null;
  const { data } = await db.rpc("piece_open", { p_piece: id });
  if (!data?.spec) return null;
  const c = checkPiece(data.spec);              // a stored description is checked again every time it is used
  return c.ok ? { ...data, spec: c.spec } : null;
}

async function view(req: Request, id: string) {
  const h = cors(req), p = await open(id);
  if (!p) return json({ ok: false, error: "not_found" }, 404, h);
  const store = dbStore(db, p.id, p.spec.limits);
  return json({ ok: true, piece: { id: p.id, business: p.business, label: p.label, test: p.status !== "live", form: intakeForm(p.spec), page: await publicPage(p.spec, store) } }, 200, h);
}

async function submit(req: Request, id: string) {
  const h = cors(req), p = await open(id);
  if (!p) return json({ ok: false, error: "not_found" }, 404, h);
  const raw = await req.text().catch(() => "");
  let body: any = null;
  try { body = raw && raw.length <= 64000 ? JSON.parse(raw) : null; } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "bad_request" }, 400, h);
  const r = await submitIntake(p.spec, dbStore(db, p.id, p.spec.limits), body);
  if (!r.ok) { const status = r.error === "slow_down" || r.error === "full" ? 429 : r.error === "not_found" ? 404 : 400; return json({ ok: false, error: r.error, field: r.field }, status, h); }
  if (r.bot) return json({ ok: true }, 200, h);
  // Tell the business's teammates, in the background. What was typed travels as information only.
  EdgeRuntime.waitUntil(fetch(`${SB_URL}/functions/v1/pip-jobs/event`, { method: "POST", headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ business: p.business_id, from: "pip", event: "form_submitted", key: `${p.name}:${r.id}`.slice(0, 120), data: { door: p.name, ref: r.ref, ...r.data } }), signal: AbortSignal.timeout(25000) }).then((x) => x.body?.cancel()).catch(() => {}));
  return json({ ok: true, ref: r.ref }, 200, h);
}

async function library(): Promise<LibraryPart[]> {
  const { data } = await db.from("parts_library").select("id,name,does,words,shape,uses").eq("status", "ready").eq("kind", "piece").order("uses", { ascending: false }).limit(300);
  return (data ?? []) as LibraryPart[];
}

/** The Forge writes a piece. One retry with the checker's own reasons when the first answer is refused. */
async function draft(b: any) {
  if (typeof b?.business !== "string" || !UUID.test(b.business) || typeof b.idea !== "string" || b.idea.trim().length < 10) return json({ ok: false, error: "bad_request" }, 400);
  if (!ANTHROPIC) return json({ ok: false, error: "not_configured" }, 503);
  const { data: biz } = await db.from("businesses").select("name,industry").eq("id", b.business).maybeSingle();
  if (!biz) return json({ ok: false, error: "no_business" }, 404);
  const close = closestParts(b.idea, await library());
  const messages: any[] = [{ role: "user", content: piecePrompt({ business: biz.name, industry: biz.industry ?? undefined, idea: b.idea, library: close }) }];
  let usd = 0, last: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const why = (await db.rpc("pip_take", { p_kind: "forge_usd", p_units: 0.05, p_room: 0 })).data;
    if (typeof why === "string") return json({ ok: false, error: "budget", why }, 429);
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(90000), headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages }) });
    if (!r.ok) { await r.body?.cancel().catch(() => {}); await db.rpc("pip_take", { p_kind: "forge_usd", p_units: -0.05, p_room: 0 }); return json({ ok: false, error: "model", status: r.status }, 502); }
    const j = await r.json().catch(() => ({}));
    const cost = costOf(j.usage ?? {}); usd += cost;
    await db.rpc("pip_take", { p_kind: "forge_usd", p_units: Math.round((cost - 0.05) * 10000) / 10000, p_room: 0 });
    const text = ((j.content || []) as any[]).filter((c) => c.type === "text").map((c) => c.text).join("");
    const ans = readPieceAnswer(text);
    if (ans?.cannot && !ans.piece) return json({ ok: true, cannot: String(ans.cannot).slice(0, 300), cost_usd: Math.round(usd * 10000) / 10000, attempts: attempt });
    const c = ans?.piece ? checkPiece(ans.piece) : { ok: false as const, errors: ["The answer was not one JSON object with a piece."] };
    if (c.ok) {
      const tests = await selfTest(c.spec);
      if (tests.passed) {
        const reuse = typeof ans!.reuse === "string" && close.some((p) => p.id === ans!.reuse) ? ans!.reuse : null;
        return json({ ok: true, spec: c.spec, tests, reuse, why: String(ans!.why ?? "").slice(0, 300), closest: close.map((p) => ({ id: p.id, name: p.name, score: p.score })), cost_usd: Math.round(usd * 10000) / 10000, attempts: attempt });
      }
      last = tests.lines.filter((l) => !l.passed).map((l) => `Sandbox: ${l.test} (${l.saw})`);
    } else last = c.errors;
    // Repair the failing part with the checker's own words, instead of starting again from nothing.
    messages.push({ role: "assistant", content: text || "(no answer)" }, { role: "user", content: `That piece was refused. Fix only these and answer again with the whole JSON object:\n- ${last.slice(0, 12).join("\n- ")}` });
  }
  return json({ ok: false, error: "refused", errors: last.slice(0, 12), cost_usd: Math.round(usd * 10000) / 10000, attempts: 2 });
}

async function save(b: any) {
  if (typeof b?.business !== "string" || !UUID.test(b.business)) return json({ ok: false, error: "bad_request" }, 400);
  const c = checkPiece(b.spec);
  if (!c.ok) return json({ ok: false, error: "bad_piece", errors: c.errors }, 400);
  const tests = await selfTest(c.spec);
  if (!tests.passed) return json({ ok: false, error: "sandbox_failed", tests }, 400);
  const reuse = typeof b.reuse === "string" && UUID.test(b.reuse) ? b.reuse : null;
  const { data: row, error } = await db.from("pieces").insert({ business_id: b.business, name: c.spec.name, label: c.spec.label, does: c.spec.does, spec: c.spec, status: "staged", tests, library_id: reuse, idea: typeof b.idea === "string" ? b.idea.slice(0, 600) : null, created_by: typeof b.by === "string" ? b.by.slice(0, 120) : "forge", staged_at: new Date().toISOString() }).select("id").single();
  if (error) return json({ ok: false, error: error.code === "23505" ? "name_taken" : "server" }, error.code === "23505" ? 409 : 500);
  // The parts library: a reused part is counted; a new shape is filed so the next business that needs one starts from it.
  if (reuse) { const { data: l } = await db.from("parts_library").select("uses").eq("id", reuse).maybeSingle(); if (l) await db.from("parts_library").update({ uses: (l.uses ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", reuse); }
  else { const { data: biz } = await db.from("businesses").select("industry").eq("id", b.business).maybeSingle(); await db.from("parts_library").insert({ kind: "piece", name: c.spec.label, does: c.spec.does, words: pieceWords(c.spec), shape: c.spec, source_piece: row.id, industry: biz?.industry ?? null }); }
  return json({ ok: true, id: row.id, status: "staged", tests: { passed: true, lines: tests.lines.length }, page: `https://www.hirepip.com/piece.html?p=${row.id}`, filed_in_library: !reuse });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/^.*\/pip-piece/, "") || "/";
  const m = path.match(/^\/p\/([^/]+)$/);
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (m && req.method === "GET") return await view(req, m[1]);
    if (m && req.method === "POST") return await submit(req, m[1]);
    if (req.method !== "POST") return json({ ok: false, error: "not_found" }, 404);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer || !same(bearer, SERVICE)) return json({ ok: false, error: "not_found" }, 404);
    const b = await req.json().catch(() => ({}));
    if (path === "/draft") return await draft(b);
    if (path === "/save") return await save(b);
    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error("[piece]", String((e as Error)?.message ?? e).slice(0, 160)); // never a body: records may hold personal details
    return json({ ok: false, error: "server" }, 500);
  }
});
