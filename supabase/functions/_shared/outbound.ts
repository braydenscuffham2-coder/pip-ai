// The one outbound gate (Nov 27, 2026). Every message Pip sends to a person, and every post to an owner's system,
// asks the database function outbound_gate first, through gate() below, and nothing else decides. It fails closed:
// if the database cannot say yes, the answer is no. tests/outbound-gate.test.mjs reads the source of every function
// and fails if a provider send appears in a file that does not call gate().
export type Channel = "email" | "sms" | "post";
export type GateAnswer = { allowed: boolean; reason: string | null; consent_id?: string | number | null };
// deno-lint-ignore no-explicit-any
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error?: unknown }>;

export async function gate(rpc: Rpc, a: { business: string; spec?: string | null; channel: Channel; to?: string | null; first?: boolean; givenInChat?: boolean }): Promise<GateAnswer> {
  try {
    const { data, error } = await rpc("outbound_gate", { p_business: a.business, p_spec: a.spec ?? null, p_channel: a.channel, p_to: a.to ?? null, p_first: a.first === true, p_given_in_chat: a.givenInChat === true });
    if (error || !data || data.allowed !== true) return { allowed: false, reason: String(data?.reason ?? "could_not_confirm"), consent_id: null };
    return { allowed: true, reason: null, consent_id: data.consent_id ?? data.ledger_id ?? null };
  } catch { return { allowed: false, reason: "could_not_confirm", consent_id: null }; }
}

/** What the teammate is told when a send is refused. Never the customer's details, and never a way around it. */
export function refusal(reason: string | null, channel: Channel): string {
  const what = channel === "email" ? "email" : channel === "sms" ? "text" : "post";
  switch (reason) {
    case "opted_out": return `Blocked: this person asked not to get a ${what} from this business. Do not try again. Tell them nothing was sent.`;
    case "paused": return "Blocked: sending is paused for now. Nothing was sent. Tell the customer a team member will follow up.";
    case "texting_first_off": return "Blocked: this teammate cannot text someone first yet. It can only reply to a text. Nothing was sent. Tell the owner instead.";
    case "no_consent_on_file": return "Blocked: there is no record that this person agreed to get texts from this business. Nothing was sent. Tell the owner instead.";
    case "outside_hours": return "Blocked: it is outside the hours when this business may text people. Nothing was sent.";
    case "too_many_today": case "frequency_cap": return "Blocked: this person has already been contacted as often as allowed today. Nothing was sent.";
    case "business_disconnected": return "Blocked: this business is no longer connected. Nothing was sent.";
    default: return `Blocked: permission to send this ${what} could not be confirmed. Nothing was sent. Tell the customer a team member will follow up.`;
  }
}

/** The line every first text carries. Kept short: a text segment is 160 characters. */
export const TEXT_FOOTER = (teammate: string, business: string) => ` This is ${teammate}, an AI assistant for ${business}. Reply STOP to opt out.`;
/** A text Pip sends first: trimmed, footer added once, never longer than two segments' worth of body. */
export function firstText(body: unknown, teammate: string, business: string): string | null {
  const b = String(body ?? "").replace(/\s+/g, " ").trim();
  if (b.length < 3) return null;
  const foot = TEXT_FOOTER(teammate || "the assistant", business || "the business");
  return (/reply stop/i.test(b) ? b.slice(0, 480) : b.slice(0, 480 - foot.length) + foot);
}
/** A US or international number in the form Twilio wants, or null. */
export function phone(v: unknown): string | null {
  const d = String(v ?? "").replace(/[^0-9+]/g, "");
  if (/^\+[1-9][0-9]{9,14}$/.test(d)) return d;
  if (/^[2-9][0-9]{9}$/.test(d)) return "+1" + d;
  if (/^1[2-9][0-9]{9}$/.test(d)) return "+" + d;
  return null;
}
