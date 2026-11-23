// The second go-live refusal: a connection the teammate's manifest marks required must be connected AND tested for
// that business. (The first refusal, an open API Shelf need, lives in the database: forge_golive_guard.)
//
//   missingConnections(manifest, rows)   pure: which required connections are not ready, and why, in plain words
//   connectionGate(rows, specId, ...)    reads the manifest and the business's connections, and asks the pure function
//
// "Connected and tested" means business_connections.status = 'active' AND checked_at is set: the portal sets checked_at
// each time it asks the provider whether the sign-in still works, so an 'active' row that was never checked does not count.
// A teammate with no manifest row, or a manifest with no required connection, is not held back by this check.
// Reads fail closed: if the connections cannot be read, the caller gets an error, never a pass.

export interface ConnRow { slot?: unknown; status?: unknown; checked_at?: unknown }
export interface Missing { slot: string; label: string; state: string }
export type ConnGate = { ok: true } | { ok: false; missing: Missing[]; why: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** What each state of a connection means to the owner. */
const STATE: Record<string, string> = {
  needed: "it has not been set up yet",
  submitted: "it was submitted but has not been confirmed yet",
  link_made: "the sign-in link was sent but not finished",
  expired: "the sign-in expired and needs to be done again",
  revoked: "access was removed and it needs to be connected again",
};
const NOT_ASKED = "it has not been asked for yet";
const NOT_TESTED = "it is connected but has not been tested yet";

/**
 * The connections a manifest marks required. Anything not exactly `required: true` is optional.
 * Today portal_compile_manifest writes `required: true` on every connection it lists, so the catalog's own
 * `blocks_golive` is honoured too: a connection the catalog says does not block go-live (the Google Business Profile)
 * does not block it here either, the same as the owner's own go-live check (portal_golive_gate).
 */
export function requiredConnections(manifest: unknown): { slot: string; label: string }[] {
  if (!isObj(manifest) || !Array.isArray(manifest.connections)) return [];
  const out: { slot: string; label: string }[] = [];
  for (const c of manifest.connections) {
    if (!isObj(c) || c.required !== true || c.blocks_golive === false) continue;
    const slot = text(c.slot, 60);
    if (!slot) continue;
    if (!out.some((o) => o.slot === slot)) out.push({ slot, label: text(c.label) || slot.replace(/_/g, " ") });
  }
  return out;
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Which required connections are not ready for this business, and one plain sentence naming them.
 *   "Boise River Dental still needs to connect Booking software (the sign-in link was sent but not finished), which
 *    Weekend Call Desk needs before it can go live."
 */
export function missingConnections(manifest: unknown, conns: ConnRow[], names: { business?: string; teammate?: string } = {}): ConnGate {
  const required = requiredConnections(manifest);
  const missing: Missing[] = [];
  for (const r of required) {
    const mine = (conns ?? []).filter((c) => isObj(c) && c.slot === r.slot);
    if (mine.some((c) => c.status === "active" && c.checked_at)) continue;
    const best = mine.find((c) => c.status === "active") ?? mine[0];
    const state = !best ? NOT_ASKED : best.status === "active" ? NOT_TESTED : (STATE[String(best.status)] ?? STATE.needed);
    missing.push({ slot: r.slot, label: r.label, state });
  }
  if (!missing.length) return { ok: true };
  const who = text(names.business, 80) || "This business";
  const agent = text(names.teammate, 60) || "This teammate";
  const parts = missing.map((m) => `${m.label} (${m.state})`);
  return { ok: false, missing, why: `${who} still needs to connect ${list(parts)}, which ${agent} needs before it can go live.` };
}

/**
 * Read what the check needs and ask the pure function. `rows` is the caller's database reader and throws on an error.
 * No manifest row, or no required connection in it: nothing else is read and the teammate is not held back.
 */
export async function connectionGate(rows: (path: string) => Promise<unknown>, specId: string, fallbackName = ""): Promise<ConnGate> {
  const found = await rows(`agent_manifests?spec_id=eq.${encodeURIComponent(specId)}&select=business_id,manifest`);
  const m = Array.isArray(found) ? found[0] : null;
  if (!m || !requiredConnections(m.manifest).length) return { ok: true };
  const bid = text(m.business_id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(bid)) throw new Error("connection check: the teammate's manifest has no business");
  const [conns, biz] = await Promise.all([
    rows(`business_connections?business_id=eq.${bid}&select=slot,status,checked_at`),
    rows(`businesses?id=eq.${bid}&select=name`),
  ]);
  if (!Array.isArray(conns)) throw new Error("connection check: the business's connections could not be read");
  const name = isObj(m.manifest) ? text(m.manifest.teammate) || text(m.manifest.name) : "";
  return missingConnections(m.manifest, conns as ConnRow[], { business: Array.isArray(biz) ? text(biz[0]?.name) : "", teammate: name || fallbackName });
}
