// pip-portal-ops: the Portal's second small function.
// 1. POST /rpc/:name      A signed-in person asks for a Portal action. This function only proves who they are
//                         (the session) and how recent the sign-in is, then hands the request to public.portal_api,
//                         which decides what that person may do. It holds no rules of its own.
// 2. POST /hooks/notices  Sends queued plain alert emails (pause alerts, weekly digest, deletion receipt).
// It never asks for, reads or returns a password, a token or a client credential.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. Optional: PORTAL_FROM, LEAD_ALERT_FROM.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const FROM = Deno.env.get("PORTAL_FROM") ?? Deno.env.get("LEAD_ALERT_FROM") ?? "Pip <onboarding@resend.dev>";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// A sign-in counts as fresh for 15 minutes. The token is already verified by getUser before this is trusted.
function fresh(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const t = Math.max(0, ...((p.amr ?? []) as { timestamp?: number }[]).map((a) => Number(a.timestamp) || 0));
    return t > 0 && Date.now() / 1000 - t < 900;
  } catch {
    return false;
  }
}

async function portalUrl(): Promise<string> {
  const { data } = await db.from("forge_settings").select("value").eq("key", "portal_url").maybeSingle();
  return typeof data?.value === "string" ? data.value : "";
}

async function sendNotices() {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: 0, waiting: "RESEND_API_KEY is not set" };
  const { data: rows, error } = await db.from("portal_notices")
    .select("id,to_email,subject,title,lines,no_link,tries").eq("status", "pending").order("created_at").limit(20);
  if (error) return { sent: 0, waiting: "not_ready" };
  const link = await portalUrl();
  let sent = 0, failed = 0;
  for (const n of rows ?? []) {
    const lines: unknown[] = Array.isArray(n.lines) ? n.lines : [];
    const button = !n.no_link && link
      ? `<p style="margin:18px 0 0"><a href="${esc(link)}" style="background:#5b3df5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open your Pip Portal</a></p>`
      : "";
    const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1b1f">` +
      `<h2 style="margin:0 0 12px">${esc(n.title)}</h2>` +
      lines.map((l) => `<p style="margin:0 0 8px;line-height:1.5">${esc(l)}</p>`).join("") + button +
      `<p style="margin:22px 0 0;font-size:12px;color:#6b6b76">Pip never asks for a password or a code by email or text.</p></div>`;
    const text = [n.title, ...lines.map(String), !n.no_link && link ? link : ""].filter(Boolean).join("\n");
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [n.to_email], subject: n.subject, html, text }),
      });
      if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
      await db.from("portal_notices").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", n.id);
      sent++;
    } catch (e) {
      const tries = (n.tries ?? 0) + 1;
      await db.from("portal_notices")
        .update({ tries, status: tries >= 3 ? "failed" : "pending", error: String((e as Error).message).slice(0, 300) }).eq("id", n.id);
      failed++;
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const path = new URL(req.url).pathname.replace(/^.*\/pip-portal-ops/, "") || "/";
  try {
    if (path === "/hooks/notices") return json(await sendNotices());
    const m = path.match(/^\/rpc\/([a-z_]{2,40})$/);
    if (!m) return json({ error: "not_found" }, 404);

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "sign_in" }, 401);
    const { data: u, error: ue } = await db.auth.getUser(token);
    if (ue || !u?.user?.email) return json({ error: "sign_in" }, 401);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* an empty body is fine */ }
    const business = typeof body.business === "string" && /^[0-9a-f-]{36}$/i.test(body.business) ? body.business : null;
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    if (JSON.stringify(args).length > 60000) return json({ error: "too_many" }, 400);

    const { data, error } = await db.rpc("portal_api", {
      p_name: m[1], p_business: business, p_email: u.user.email, p_fresh: fresh(token), p_args: args,
    });
    if (error) return json({ error: "not_ready" }, 503);
    const out = (data ?? {}) as Record<string, unknown>;
    if (out.ok === false) return json({ error: out.error, message: out.message }, Number(out.status) || 400);
    return json(out);
  } catch (_e) {
    return json({ error: "server" }, 500);
  }
});
