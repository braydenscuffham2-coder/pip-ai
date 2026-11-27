// What a business has told its team: the basics every teammate should know (Nov 27, 2026).
//
// Found on the first real phone call: the teammate did not know the business's opening hours, because the only facts
// it had were the handful written when it was built. An employee knows the hours, the address and where to park.
// The owner now types these once in the Portal (Setup, "What your team knows"), they are kept on the business
// (businesses.basics), and every teammate on every channel is given them.
//
// They are facts, never instructions: the text is cut to a length, stripped of anything that is not plain text, and
// handed to the teammate under a heading that says so.
export const FIELDS = [
  { key: "hours", label: "Hours", hint: "Mon to Thu 5 to 9, Fri and Sat 5 to 10, closed Sunday", max: 400 },
  { key: "address", label: "Address", hint: "123 Main St, Boise", max: 200 },
  { key: "phone", label: "Phone for customers", hint: "The number customers should call", max: 40 },
  { key: "website", label: "Website", hint: "example.com", max: 120 },
  { key: "parking", label: "Parking and getting in", hint: "Free lot behind the building", max: 200 },
  { key: "payments", label: "Payment", hint: "Cards and cash, no checks", max: 200 },
  { key: "booking", label: "How to book", hint: "Reservations for 6 or more; walk-ins welcome", max: 300 },
  { key: "notes", label: "Anything else your team should know", hint: "Dogs welcome on the patio. Kitchen closes 30 minutes before closing.", max: 800 },
] as const;
export type Basics = Partial<Record<(typeof FIELDS)[number]["key"], string>>;

/** Plain text only: no control characters, no markup brackets, spaces tidied. */
const plain = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>{}`]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

/** What may be saved: only the known fields, cleaned and cut to length; empty ones are left out. */
export function cleanBasics(input: unknown): Basics {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const out: Basics = {};
  for (const f of FIELDS) { const v = plain(src[f.key], f.max); if (v) out[f.key] = v; }
  return out;
}

/** The lines a teammate is given, or "" when the owner has told the team nothing yet. */
export function basicsText(basics: unknown): string {
  const b = cleanBasics(basics);
  return FIELDS.filter((f) => b[f.key]).map((f) => `${f.key === "notes" ? "Also" : f.label}: ${b[f.key]!.replace(/\n+/g, " ")}`).join("\n");
}
