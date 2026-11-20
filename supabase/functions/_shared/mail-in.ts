// Mail arriving in a Pip inbox (privacy@, legal@, support@hirepip.com): what to tell the founder.
//
// The notice names the inbox, the sender and the subject, and nothing else. The message itself stays in the inbox,
// where the founder reads it, so a privacy request is not copied into another mailbox or the notice log.
// No imports, so the tests can load it directly.

/** The inboxes Pip publishes. Mail for any other address at the domain is not announced. */
export const INBOXES = ["privacy@hirepip.com", "legal@hirepip.com", "support@hirepip.com"] as const;

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** The bare address out of "Name <a@b.c>" or "a@b.c". Empty if there is none. */
export const address = (v: unknown): string => (clean(v, 320).match(/[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/i)?.[0] ?? "").toLowerCase();

export type Notice = { inbox: string; subject: string; title: string; lines: string[] };

/**
 * The notice for one received message, as Resend's API returned it. Null when it is not for a published inbox or has
 * no id. Everything shown comes from the message Pip fetched itself, never from the webhook that announced it.
 */
export function noticeFor(mail: unknown): Notice | null {
  const m = (mail && typeof mail === "object" ? mail : {}) as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id) return null;
  const to = (Array.isArray(m.to) ? m.to : [m.to]).concat(Array.isArray(m.received_for) ? m.received_for : []).map(address);
  const inbox = (INBOXES as readonly string[]).find((a) => to.includes(a));
  if (!inbox) return null;
  const from = address(m.from) || "an unknown sender", subject = clean(m.subject, 140) || "(no subject)";
  const urgent = inbox === "privacy@hirepip.com" ? ["A privacy request must be answered within 45 days. That is what the Privacy Policy promises."] : [];
  return {
    inbox, subject: `New mail for ${inbox}`.slice(0, 180), title: "New mail in a Pip inbox",
    lines: [`Inbox: ${inbox}`, `From: ${from}`, `Subject: ${subject}`, ...urgent, "Read and answer it in Resend, under Inboxes."],
  };
}
