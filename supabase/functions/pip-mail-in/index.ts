// pip-mail-in: tells the founder when mail arrives in a Pip inbox.
//
// Resend receives mail for hirepip.com and posts a short "email.received" event here. That event is NOT trusted:
// anyone can post to this address. So the function takes only the message id from it, then asks Resend for the message
// itself with Pip's own key. A made-up id finds nothing and nothing happens. One notice per message.
//
// The notice goes out through the same path as every other founder notice (portal_notify). It carries the inbox, the
// sender and the subject, never the body: the message stays in the inbox.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (all already set). verify_jwt is off because Resend
// cannot send a Supabase sign-in.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { noticeFor } from "../_shared/mail-in.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "post_only" }, 405);
  const ev: any = await req.json().catch(() => null);
  const id = ev?.type === "email.received" && typeof ev?.data?.email_id === "string" ? ev.data.email_id : "";
  // Anything that is not a well-formed event gets a plain "ok" so nobody learns anything and Resend does not retry it.
  if (!/^[0-9a-f][0-9a-f-]{15,63}$/i.test(id)) return json({ ok: true, ignored: true });
  if (!KEY) return json({ ok: false, error: "no_mail_key" }, 503);
  try {
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (r.status === 404) return json({ ok: true, ignored: true });
    if (!r.ok) { console.error("[mail-in] could not read the message", r.status); return json({ ok: false, error: "mail_api", status: r.status }, 502); }
    const notice = noticeFor(await r.json());
    if (!notice) return json({ ok: true, ignored: true });
    const { data: seen } = await db.from("events").select("id").eq("kind", "mail_in").eq("detail->>id", id).limit(1);
    if (seen?.length) return json({ ok: true, already: true });
    const { error } = await db.rpc("portal_notify", { p_business: null, p_to: "founder", p_subject: notice.subject, p_title: notice.title, p_lines: notice.lines, p_no_link: true });
    if (error) { console.error("[mail-in] notice failed", error.message); return json({ ok: false, error: "notice" }, 502); }
    await db.from("events").insert({ kind: "mail_in", domain: null, detail: { id, inbox: notice.inbox } });
    return json({ ok: true, told: notice.inbox });
  } catch (e) {
    console.error("[mail-in]", String((e as Error)?.message ?? e).slice(0, 200));
    return json({ ok: false, error: "failed" }, 502);
  }
});
