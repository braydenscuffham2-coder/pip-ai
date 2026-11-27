// The integration ladder: how Pip reaches a tool, tried in a fixed order, with the reason written down.
//
//   1 api      the tool's own API or sign-in, through Composio
//   2 partner  a sync partner for that line of work
//   3 zapier   the owner's own Zapier account
//   4 edges    email, webhooks, forms and exports (Pip's doors)
//   5 screen   screen work on Pip's own browsers, with the owner's vaulted Pip login
//   6 onsite   the on-site box or a desktop connector
//   7 build    Pip builds the piece itself
//
// The pick is the highest rung that FITS the tool AND that Pip can run today. A higher rung that fits but is not ready
// is named too, so nobody forgets it. What is not known is listed as not known; it is never guessed into a yes.
// Pure: facts in, a decision out. The facts come from the catalog, the scanner and the owner, never from a model's say-so.
export const RUNGS = [
  { n: 1, id: "api", label: "The tool's own API or sign-in" },
  { n: 2, id: "partner", label: "A sync partner for this line of work" },
  { n: 3, id: "zapier", label: "The owner's own Zapier" },
  { n: 4, id: "edges", label: "Email, webhooks, forms and exports" },
  { n: 5, id: "screen", label: "Screen work on Pip's own browsers" },
  { n: 6, id: "onsite", label: "The on-site box or a desktop connector" },
  { n: 7, id: "build", label: "Pip builds the piece itself" },
] as const;
export type RungId = (typeof RUNGS)[number]["id"];
export type Tri = boolean | null | undefined;
export type Facts = {
  tool: string;
  /** No software exists for this job at the business: there is nothing to connect to. */
  no_software?: boolean;
  composio_toolkit?: string | null;         // a reviewed toolkit exists for it
  partner?: string | null;                  // a sync partner that covers it
  on_zapier?: Tri;                          // the tool has a Zapier app
  owner_uses_zapier?: Tri;                  // the scanner saw Zapier, or the owner said so
  can_email?: Tri; has_webhooks?: Tri; has_export?: Tri;
  web_sign_in?: Tri;                        // it has a web app a person signs in to
  terms?: "allowed" | "forbidden" | "unknown"; // what its terms say about automated use of a login
  desktop_only?: Tri;                       // installed software with no web route
};
/** Which rungs Pip can actually run today. Kept in forge_settings 'ladder_ready' so it changes without a deploy. */
export type Ready = Record<RungId, boolean>;
export const READY_TODAY: Ready = { api: true, partner: false, zapier: false, edges: true, screen: false, onsite: false, build: false };
const NOT_READY: Record<RungId, string> = {
  api: "Connections through Composio are switched off.",
  partner: "Pip has no sync partner signed yet.",
  zapier: "Pip's Zapier integration is prepared but not published.",
  edges: "Pip's doors are switched off.",
  screen: "Screen work is built and proven on Pip's practice tool, but an owner cannot yet sign a real tool in (the secure browser needs its paid keep-alive setting, or the one-connection rebuild).",
  onsite: "The desktop connector is designed, not built.",
  build: "The Forge's code lane is not building apps yet.",
};
export type Step = { rung: RungId; fits: "yes" | "no" | "unknown"; why: string };
export type Pick = {
  tool: string; rung: RungId | null; n: number | null; label: string | null; why: string;
  /** A higher rung that fits but is not ready, and what it is waiting on. */
  better_later: { rung: RungId; waiting_on: string }[];
  unknown: string[]; steps: Step[];
};
const yes = (v: Tri) => v === true, unknown = (v: Tri) => v === null || v === undefined;

function fit(f: Facts): Step[] {
  if (f.no_software) return RUNGS.map((r) => ({ rung: r.id, fits: r.id === "build" ? "yes" : "no", why: r.id === "build" ? "There is no software for this job at the business, so the piece has to be made." : "There is no tool to connect to." } as Step));
  const edgeWays = [yes(f.has_webhooks) && "webhooks", yes(f.can_email) && "email", yes(f.has_export) && "exports"].filter(Boolean) as string[];
  const edgeUnknown = [unknown(f.has_webhooks) && "webhooks", unknown(f.can_email) && "email", unknown(f.has_export) && "exports"].filter(Boolean) as string[];
  return [
    { rung: "api", fits: f.composio_toolkit ? "yes" : "no", why: f.composio_toolkit ? `A reviewed connection exists (${f.composio_toolkit}). The owner signs in on the tool's own page.` : "No reviewed connection for it in Pip's catalog." },
    { rung: "partner", fits: f.partner ? "yes" : "no", why: f.partner ? `${f.partner} syncs with it.` : "No sync partner is listed for it." },
    { rung: "zapier", fits: yes(f.on_zapier) && yes(f.owner_uses_zapier) ? "yes" : f.on_zapier === false || f.owner_uses_zapier === false ? "no" : "unknown",
      why: yes(f.on_zapier) && yes(f.owner_uses_zapier) ? "The tool is on Zapier and the owner already uses Zapier, so they connect it in their own account." : f.on_zapier === false ? "The tool is not on Zapier." : f.owner_uses_zapier === false ? "The owner does not use Zapier, and Pip never connects through an account of its own." : `Not known: ${[unknown(f.on_zapier) && "whether the tool is on Zapier", unknown(f.owner_uses_zapier) && "whether the owner uses Zapier"].filter(Boolean).join(", and ")}.` },
    { rung: "edges", fits: edgeWays.length ? "yes" : edgeUnknown.length ? "unknown" : "no", why: edgeWays.length ? `The tool offers ${edgeWays.join(" and ")}, which Pip's doors take.` : edgeUnknown.length ? `Not known: whether the tool offers ${edgeUnknown.join(", ")}.` : "The tool has no webhooks, email or exports." },
    { rung: "screen", fits: f.terms === "forbidden" || yes(f.desktop_only) || f.web_sign_in === false ? "no" : yes(f.web_sign_in) ? (f.terms === "allowed" ? "yes" : "unknown") : "unknown",
      why: f.terms === "forbidden" ? "Its terms do not allow automated use of a login, so Pip does not do it." : yes(f.desktop_only) || f.web_sign_in === false ? "It has no web app to sign in to." : yes(f.web_sign_in) ? (f.terms === "allowed" ? "It has a web app and its terms allow a separate login for Pip." : "It has a web app, but its terms on automated use have not been read yet.") : "Not known: whether it has a web app." },
    { rung: "onsite", fits: yes(f.desktop_only) ? "yes" : f.desktop_only === false ? "no" : "unknown", why: yes(f.desktop_only) ? "It runs only on a computer at the business, so something has to sit beside it." : f.desktop_only === false ? "It is not installed software." : "Not known: whether it is installed software." },
    { rung: "build", fits: "no", why: "The business already has software for this job; Pip does not replace it unasked." },
  ];
}

/** Pick the rung for one tool. */
export function pickRung(f: Facts, ready: Ready = READY_TODAY): Pick {
  const steps = fit(f), better_later: Pick["better_later"] = [];
  const unknownList = steps.filter((s) => s.fits === "unknown").map((s) => s.why.replace(/^Not known: /, "").replace(/\.$/, ""));
  for (const s of steps) {
    if (s.fits !== "yes") continue;
    if (!ready[s.rung]) { better_later.push({ rung: s.rung, waiting_on: NOT_READY[s.rung] }); continue; }
    const r = RUNGS.find((x) => x.id === s.rung)!;
    return { tool: f.tool, rung: r.id, n: r.n, label: r.label, why: s.why, better_later, unknown: unknownList, steps };
  }
  const why = better_later.length ? `Nothing Pip can run today reaches ${f.tool}. ${better_later.map((b) => b.waiting_on).join(" ")}` : unknownList.length ? `Not enough is known about ${f.tool} to choose. Find out: ${unknownList.join("; ")}.` : `No way to reach ${f.tool} was found. The owner is told plainly that Pip cannot work in it yet.`;
  return { tool: f.tool, rung: null, n: null, label: null, why, better_later, unknown: unknownList, steps };
}

/** One plain sentence for the owner. */
export function pickWords(p: Pick): string {
  if (!p.rung) return p.why;
  return `${p.tool}: ${p.label}. ${p.why}${p.better_later.length ? ` A better way later: ${p.better_later.map((b) => RUNGS.find((r) => r.id === b.rung)!.label.toLowerCase()).join(", ")}.` : ""}`;
}
