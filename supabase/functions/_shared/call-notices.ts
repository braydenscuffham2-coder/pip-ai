// What a caller must be told at the start of a phone call, by state (Nov 27, 2026).
//
// Until now every call opened with "an AI assistant" and "I keep written notes", everywhere. The founder's rule is
// now: say the shortest thing the law requires, and nothing where nothing is required. Two things are decided here:
//
//   ai     say at the start that this is an AI. Required where a state's law reaches a business's own phone line
//          (jurisdiction_rules.call_ai_notice = 'always', from its date), for a health business where the state's
//          rule is about regulated services ('health'), when the business's state is not on file, and when the
//          owner's line is set to always say it.
//   notes  say the call is transcribed. No audio is kept, but the caller's speech goes to a speech vendor to be
//          turned into text, and in an all-party-consent state that needs everyone's knowledge. Required when the
//          business's state or the caller's state has call_notes_notice, and when either state cannot be told.
//
// A call between two states follows the stricter one. The caller's state is read from the area code, which says
// where a number was issued, not where the caller is standing: a known limit, written down in docs/voice.md.
//
// What never varies, in any state: the teammate never says it is a person, and says it is an AI whenever a caller
// asks (honest(), below). That is checked in code on every reply, not left to the model.
//
// The rules are data (the table), read by a lawyer or not (reviewed_by_lawyer). Nothing here talks to a database.

/** US area codes by state, from Google's libphonenumber geodata (generated Nov 27, 2026; 359 codes). */
const AREA: Record<string, string> = {
  AK: "907",
  AL: "205 251 256 334 659 938",
  AR: "327 479 501 870",
  AZ: "480 520 602 623 928",
  CA: "209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 738 747 760 805 818 820 831 840 858 909 916 925 949 951",
  CO: "303 719 720 748 970 983",
  CT: "203 475 860 959",
  DC: "202 771",
  DE: "302",
  FL: "239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954",
  GA: "229 404 470 478 678 706 762 770 912 943",
  HI: "808",
  IA: "319 515 563 641 712",
  ID: "208 986",
  IL: "217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 872",
  IN: "219 260 317 463 574 765 812 930",
  KS: "316 620 785 913",
  KY: "270 364 502 606 859",
  LA: "225 318 337 504 985",
  MA: "339 351 413 508 617 774 781 857 978",
  MD: "227 240 301 410 443 667",
  ME: "207",
  MI: "231 248 269 313 517 586 616 734 810 906 947 989",
  MN: "218 320 507 612 651 763 952",
  MO: "235 314 417 557 573 636 660 816 975",
  MS: "228 601 662 769",
  MT: "406",
  NC: "252 336 472 704 743 828 910 919 980 984",
  ND: "701",
  NE: "308 402 531",
  NH: "603",
  NJ: "201 551 609 640 732 848 856 862 908 973",
  NM: "505 575",
  NV: "702 725 775",
  NY: "212 315 329 332 347 363 516 518 585 607 631 646 680 716 718 838 845 914 917 929 934",
  OH: "216 220 234 283 326 330 380 419 440 513 567 614 740 937",
  OK: "405 539 572 580 918",
  OR: "458 503 541 971",
  PA: "215 223 267 272 412 445 484 570 582 610 717 724 814 835 878",
  RI: "401",
  SC: "803 821 839 843 854 864",
  SD: "605",
  TN: "423 615 629 731 865 901 931",
  TX: "210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979",
  UT: "385 435 801",
  VA: "276 434 540 571 686 703 757 804 826 948",
  VT: "802",
  WA: "206 253 360 425 509 564",
  WI: "262 274 353 414 534 608 715 920",
  WV: "304 681",
  WY: "307",
};
const STATE_OF: Record<string, string> = {};
for (const [st, codes] of Object.entries(AREA)) for (const c of codes.split(" ")) STATE_OF[c] = st;

/** The US state a number was issued in, or null: not a US number, toll-free, withheld, or a code not on the list. */
export function stateOfNumber(from: unknown): string | null {
  const d = String(from ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d[0] === "1" ? d.slice(1) : d.length === 10 ? d : "";
  return ten ? STATE_OF[ten.slice(0, 3)] ?? null : null;
}

export type Rule = { state: string; call_ai_notice?: string | null; call_ai_from?: string | null; call_notes_notice?: boolean | null };
export type Notices = { ai: boolean; notes: boolean; why: { business: string | null; caller: string | null; ai: string; notes: string } };

const says = (r: Rule | undefined, health: boolean, today: string): boolean => {
  if (!r) return false;
  if (r.call_ai_notice === "health") return health;
  if (r.call_ai_notice !== "always") return false;
  return !r.call_ai_from || String(r.call_ai_from).slice(0, 10) <= today;
};

/** What this call must open with. `today` is YYYY-MM-DD. Fails strict: rules that could not be read mean both notices. */
export function decide(a: { businessState: string | null | undefined; health: boolean; from: unknown; rules: Rule[] | null | undefined; today: string; line?: string | null }): Notices {
  const biz = /^[A-Z]{2}$/.test(String(a.businessState ?? "").toUpperCase()) ? String(a.businessState).toUpperCase() : null;
  const caller = stateOfNumber(a.from);
  if (!Array.isArray(a.rules) || !a.rules.length) return { ai: true, notes: true, why: { business: biz, caller, ai: "rules_not_read", notes: "rules_not_read" } };
  const by = new Map(a.rules.map((r) => [String(r.state).toUpperCase(), r]));
  let ai = "", notes = "";
  if (a.line === "always") ai = "line_set_to_always";
  else if (!biz) ai = "business_state_not_on_file";
  else if (says(by.get(biz), a.health, a.today)) ai = `business_in_${biz}`;
  else if (caller && says(by.get(caller), a.health, a.today)) ai = `caller_from_${caller}`;
  if (!biz) notes = "business_state_not_on_file";
  else if (by.get(biz)?.call_notes_notice === true) notes = `business_in_${biz}`;
  else if (!caller) notes = "caller_state_not_known";
  else if (by.get(caller)?.call_notes_notice === true) notes = `caller_from_${caller}`;
  return { ai: !!ai, notes: !!notes, why: { business: biz, caller, ai: ai || "not_required", notes: notes || "not_required" } };
}

/** The opening line. Shortest wording that still says, plainly and first, what must be said. */
export function greeting(teammate: string, business: string, n: { ai: boolean; notes: boolean }): string {
  const t = teammate.trim() || "the front desk", b = business.trim() || "us";
  if (n.ai && n.notes) return `Thanks for calling ${b}. This is ${t}, an AI assistant, and this call is transcribed. How can I help?`;
  if (n.ai) return `Thanks for calling ${b}. This is ${t}, an AI assistant. How can I help?`;
  if (n.notes) return `Thanks for calling ${b}, this is ${t}. This call is transcribed. How can I help?`;
  return `Thanks for calling ${b}, this is ${t}. How can I help?`;
}

// ---------- always honest, in every state ----------
/** The caller is asking whether this is a person or a machine, or asking for a person. */
export const ASKS_IF_AI = /\b(are|r) (you|u) (even )?(an? |the )?(real|human|person|robot|bot|ai|a\.i\.|machine|computer|recording|automated)\b|\bam i (talking|speaking|chatting) (to|with) (an? |the )?(real |live |actual )?(person|human|robot|bot|ai|a\.i\.|machine|computer|recording|someone real)\b|\bis (this|that|it) (an? |the )?(real |live |actual )?(person|human|robot|bot|ai|a\.i\.|recording|machine|computer|automated)\b|\b(talk|speak|talking|speaking) (to|with) (an? |the )?(real|live|actual) (person|human)\b|\b(a|an) (real|actual|live) (person|human)\b|\byou(('| a)re| sound like) (an? )?(robot|bot|ai|a\.i\.|machine|computer|recording)\b/i;
const SAYS_AI = /\b(ai|a\.i\.|artificial intelligence|automated assistant|virtual assistant|bot)\b/i;
/** A reply that says, or plainly implies, that the speaker is a person. */
export const CLAIMS_HUMAN = /\b(i'?m|i am|this is) (an? )?(real|actual|live) (person|human)\b|\b(i'?m|i am) (an? )?(person|human|human being)\b|\b(i'?m|i am) not (an? |the )?(ai|a\.i\.|robot|bot|machine|computer|recording|automated)\b|\byes,? (i'?m|i am) (real|human|a person)\b|\bnot an? (ai|a\.i\.|robot|bot)\b(?!.*\b(i'?m|i am) an? ai\b)/i;

/**
 * Makes a reply honest about what is speaking. Applied to every reply, on every channel, after the model has answered:
 *   - a reply that claims to be a person is replaced outright;
 *   - when the customer asked whether this is a person or a machine, the reply starts by saying it is an AI.
 */
export function honest(reply: string, heard: string, business: string): string {
  const b = business.trim() || "this business";
  const r = String(reply ?? "");
  if (CLAIMS_HUMAN.test(r)) return `I'm an AI assistant for ${b}. I can help with most things, or get a person to follow up. What do you need?`;
  if (ASKS_IF_AI.test(String(heard ?? "")) && !SAYS_AI.test(r)) return `I'm an AI assistant for ${b}. ${r}`.trim();
  return r;
}
