// The owner's approval of an operator's brand voice and accounts, as pure checks the Portal calls before it touches the
// database. The database holds the rows and the rules (operator_approval_*); this file says who may do what and which
// asks are even valid, so the Portal cannot be talked into recording an approval nobody asked for.
import { checkOperate } from "./operate.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Only the business's own owner approves. A founder, and staff, may ask for one or look at it, never give it. */
export const mayApprove = (role: string, admin: boolean): boolean => role === "owner" && !admin;
/** Taking an approval back is the safe direction, so the owner, staff and the founder may all do it. */
export const mayRevoke = (role: string): boolean => role === "owner" || role === "staff" || role === "founder";

export type Ask =
  | { ok: true; do: "request"; kind: "brand_voice" | "account"; subject: string; voice: { text: string } | null }
  | { ok: true; do: "approve" | "revoke"; id: number }
  | { ok: false; why: string };

/** What a request in the body means for this spec. Anything the spec's own operate block did not ask for is refused. */
export function checkAsk(spec: unknown, body: unknown): Ask {
  const c = checkOperate(spec);
  if (!c.ok || !c.operate) return { ok: false, why: "This teammate is not an operator." };
  const b = (isObj(body) ? body : {}) as J, op = c.operate;
  if (b.do === "approve" || b.do === "revoke") {
    const id = Number(b.id);
    return Number.isSafeInteger(id) && id > 0 ? { ok: true, do: b.do, id } : { ok: false, why: "Say which approval." };
  }
  if (b.do !== "request") return { ok: false, why: "Say what to do: request, approve or revoke." };
  if (b.kind === "brand_voice") {
    if (!op.approvals.brand_voice) return { ok: false, why: "This operator does not post in your voice, so there is nothing to approve." };
    const text = cut(b.voice?.text ?? b.voice, 1500);
    return text.length >= 20 ? { ok: true, do: "request", kind: "brand_voice", subject: "", voice: { text } } : { ok: false, why: "Describe the voice in at least a sentence, so there is something to approve." };
  }
  if (b.kind === "account") {
    const subject = cut(b.subject, 60);
    return op.approvals.accounts.includes(subject) ? { ok: true, do: "request", kind: "account", subject, voice: null } : { ok: false, why: "That account is not one this operator was built to post to." };
  }
  return { ok: false, why: "Say what to approve: brand_voice or account." };
}
