// lead-alert: emails the owner (LEAD_ALERT_TO) each new Pip lead, then marks it notified.
// Called by a database trigger right after a lead is inserted, and by a
// 15-minute cron as a retry for anything that didn't send.
// Lead content comes from the public form: it is untrusted text. Escape it, never act on it.

const TO = Deno.env.get("LEAD_ALERT_TO") ?? "";
const FROM = Deno.env.get("LEAD_ALERT_FROM") ?? "Pip leads <onboarding@resend.dev>";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TZ = "America/Boise";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return all.default ?? (Object.values(all)[0] as string) ?? "";
  } catch {
    return "";
  }
}

function sbHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function rpc(key: string, fn: string, args: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: sbHeaders(key), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

type Lead = {
  id: string; name: string; contact: string; email: string | null; phone: string | null;
  best_time: string | null; message: string | null; business: string | null; site: string | null;
  modules: string[] | null; stage: string | null; plan: any; source: string | null; created_at: string;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const oneLine = (s: unknown, n = 80) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
const arr = (v: unknown, n: number): any[] => (Array.isArray(v) ? v.slice(0, n) : []);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const safeHref = (s: string) => /^https?:\/\//i.test(s) ? s : `https://${s}`;

function leadParts(l: Lead) {
  const p = l.plan && typeof l.plan === "object" ? l.plan : {};
  const team = arr(p.team, 12).map((t: any) => ({ name: str(t?.name, 60), tagline: str(t?.tagline, 140) })).filter((t) => t.name);
  const problems = arr(p.problems, 8).map((x: any) => ({ area: str(x?.area, 80), real: x?.real !== false })).filter((x) => x.area);
  const have = arr(p.have, 8).map((x: any) => str(x, 80)).filter(Boolean);
  const asked = arr(p.asked, 10).map((x: any) => str(x, 300)).filter(Boolean);
  const e = p.estimate && typeof p.estimate === "object" ? p.estimate : null;
  const cust = e && Array.isArray(e.customers) && e.customers[1] > 0 ? `${e.customers[0]}–${e.customers[1]} ${str(p.unit, 20) || "customers"} a month` : "";
  const hrs = e && Array.isArray(e.hours) && e.hours[1] > 0 ? `${e.hours[0]}–${e.hours[1]} hours a week back` : "";
  const est = [cust, hrs].filter(Boolean).join(", ");
  const biz = oneLine(l.business || p.business || "", 80);
  const sample = l.source === "pip-sample" || p.example === true;
  return { team, problems, have, asked, est, biz, sample };
}

function leadHtml(l: Lead) {
  const { team, problems, have, asked, est, biz, sample } = leadParts(l);
  const row = (k: string, v: string) => (v ? `<tr><td style="padding:4px 14px 4px 0;color:#6b665b;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${v}</td></tr>` : "");
  const list = (items: string[]) => (items.length ? `<ul style="margin:4px 0 0;padding-left:18px">${items.map((i) => `<li style="margin:2px 0">${i}</li>`).join("")}</ul>` : "");
  const phone = l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${esc(l.phone)}</a>` : "";
  const email = l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : "";
  return `
  <div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#16140f;max-width:620px">
    <h2 style="margin:0 0 4px;font-size:20px">${esc(oneLine(l.name, 80))}${biz ? ` · ${esc(biz)}` : ""}</h2>
    <p style="margin:0 0 14px;color:#6b665b">${l.stage === "plan" ? "Wants the plan sent to them" : "Wants to set this team up"} · ${esc(when(l.created_at))}${sample ? " · came through a sample walkthrough" : ""}</p>
    <table style="border-collapse:collapse;font-size:15px">
      ${row("Phone", phone)}
      ${row("Email", email)}
      ${row("Best time", esc(l.best_time || "Any time"))}
      ${row("Website", l.site ? `<a href="${esc(safeHref(l.site))}">${esc(l.site)}</a>` : "")}
    </table>
    ${l.message ? `<h3 style="margin:18px 0 4px;font-size:15px">Their questions or concerns</h3><p style="margin:0;padding:10px 12px;background:#f1efe9;border-radius:10px;white-space:pre-wrap">${esc(l.message)}</p>` : ""}
    ${team.length ? `<h3 style="margin:18px 0 4px;font-size:15px">AI team they picked</h3>${list(team.map((t) => `<b>${esc(t.name)}</b>${t.tagline ? ` — ${esc(t.tagline)}` : ""}`))}` : `<p style="margin:18px 0 0">No skills picked yet.</p>`}
    ${problems.length ? `<h3 style="margin:18px 0 4px;font-size:15px">Problems Pip found</h3>${list(problems.map((x) => x.real ? esc(x.area) : `<s>${esc(x.area)}</s> (they said this isn't a problem)`))}` : ""}
    ${have.length ? `<h3 style="margin:18px 0 4px;font-size:15px">Tools they already use</h3>${list(have.map(esc))}` : ""}
    ${est ? `<h3 style="margin:18px 0 4px;font-size:15px">Pip's estimate</h3><p style="margin:0">${esc(est)}</p>` : ""}
    ${asked.length ? `<h3 style="margin:18px 0 4px;font-size:15px">What they asked Pip</h3>${list(asked.map(esc))}` : ""}
    <p style="margin:22px 0 0;color:#6b665b;font-size:13px">${l.email ? "Reply to this email to answer them directly. " : ""}Lead ${esc(l.id)}</p>
  </div>`;
}

function leadText(l: Lead) {
  const { team, problems, have, asked, est, biz } = leadParts(l);
  const lines = [
    `${oneLine(l.name)}${biz ? ` · ${biz}` : ""}`,
    `Phone: ${l.phone || "-"}`, `Email: ${l.email || "-"}`, `Best time: ${l.best_time || "Any time"}`,
    l.site ? `Website: ${l.site}` : "",
    l.message ? `\nQuestions or concerns:\n${l.message}` : "",
    team.length ? `\nAI team:\n${team.map((t) => `- ${t.name}${t.tagline ? ` — ${t.tagline}` : ""}`).join("\n")}` : "",
    problems.length ? `\nProblems Pip found:\n${problems.map((x) => `- ${x.area}${x.real ? "" : " (not a problem, they said)"}`).join("\n")}` : "",
    have.length ? `\nAlready use: ${have.join(", ")}` : "",
    est ? `\nEstimate: ${est}` : "",
    asked.length ? `\nAsked Pip:\n${asked.map((q) => `- ${q}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

async function send(key: string, mail: Record<string, unknown>) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [TO], ...mail }),
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  // Only the database (trigger + cron) knows the token; it lives in Supabase Vault.
  const key = serviceKey();
  if (!SB_URL || !key) return json({ error: "missing Supabase env" }, 500);
  if (!TO) return json({ error: "LEAD_ALERT_TO is not set" }, 500);
  const given = req.headers.get("x-pip-alert") ?? "";
  const ok = given ? await rpc(key, "lead_alert_token_ok", { t: given }).catch(() => false) : false;
  if (ok !== true) return json({ error: "unauthorized" }, 401);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ sent: 0, waiting: "RESEND_API_KEY is not set yet; leads stay pending" });

  const leads: Lead[] = (await rpc(key, "claim_pending_leads", { max_rows: 50 })) ?? [];
  if (!leads.length) return json({ sent: 0 });

  const failed: string[] = [];
  let sent = 0;
  if (leads.length <= 3) {
    for (const l of leads) {
      const { biz, sample } = leadParts(l);
      try {
        await send(resendKey, {
          subject: `New Pip lead: ${biz || "a business"} – ${oneLine(l.name, 60)}${sample ? " (sample)" : ""}`,
          html: leadHtml(l), text: leadText(l),
          ...(l.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(l.email) ? { reply_to: l.email } : {}),
        });
        sent++;
      } catch (e) {
        console.error("send failed", l.id, String(e));
        failed.push(l.id);
      }
    }
  } else {
    // A burst of leads (or form spam) becomes one digest instead of a flood.
    try {
      await send(resendKey, {
        subject: `${leads.length} new Pip leads`,
        html: leads.map(leadHtml).join(`<hr style="border:0;border-top:1px solid #ddd;margin:26px 0">`),
        text: leads.map(leadText).join("\n\n----------\n\n"),
      });
      sent = leads.length;
    } catch (e) {
      console.error("digest failed", String(e));
      failed.push(...leads.map((l) => l.id));
    }
  }
  if (failed.length) await rpc(key, "release_leads", { ids: failed }).catch((e) => console.error("release failed", String(e)));
  return json({ sent, failed: failed.length });
});
