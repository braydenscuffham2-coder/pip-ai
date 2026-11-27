// One thing said on a call gets one answer, and the caller is not left in silence (Nov 27, 2026).
//
// Measured on a real call: the phone side (ElevenLabs) sent each thing the caller said twice, about 0.2 seconds apart,
// spelled slightly differently ("7:00 p.m." then "seven p.m.", "Scuffham" then "Scuffum"). pip-voice answered both,
// one after the other, so the caller waited 4 to 5 seconds, the teammate filed the same booking request twice, and
// it asked the caller to spell a name it had only been told once. sameTurn() says when a second request is the same
// words again; pip-voice then gives it the first one's answer instead of asking the teammate a second time.
//
// The rest is what a person does while they think: a short "Okay." so the caller knows they were heard, and only
// after a real wait, "One moment." Nothing here decides what the teammate may do.

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** How alike two strings are, 0 to 1 (1 minus the edit distance over the longer length). */
export function alike(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/**
 * Is `now` the same thing said again (a second transcription of one sentence), and not something new?
 * Longer sentences may differ a little (a number written two ways). One or two words must be nearly identical, so
 * "Tuesday" then "Thursday" is a correction and gets its own answer, while "Scuffham" then "Scuffum" does not.
 */
export function sameTurn(before: string, now: string): boolean {
  const a = norm(before), b = norm(now);
  if (!a || !b) return false;
  if (a === b) return true;
  const words = Math.min(a.split(" ").length, b.split(" ").length);
  // A different number is a different thing, however alike the rest is ("table for 6" then "table for 8").
  const nums = (s: string) => (s.match(/\d+/g) ?? []).join(" ");
  if (nums(a) && nums(b) && nums(a) !== nums(b)) return false;
  return alike(a, b) >= (words <= 2 ? 0.85 : 0.75);
}

/** How long a finished answer may be handed to a second request for the same words. */
export const SAME_TURN_MS = 10000;

// What the caller hears while the teammate works.
export const ACK_MS = 800;   // after this long with nothing to say yet: a short acknowledgement
export const HOLD_MS = 3200; // after this long: a holding phrase
export const STILL_MS = 6400; // and after this long, one more: looking at a calendar and writing to it took 7 s on a live booking
export const STILL = ["Thanks for waiting, almost there.", "Still with you, just finishing that.", "Nearly done."];
const ACK_QUESTION = ["Let's see.", "Okay.", "Let me see."];
const ACK_OTHER = ["Okay.", "Alright.", "Got it."];
export const HOLD = ["One moment.", "Bear with me one second.", "Just a moment, I'm pulling that up.", "One second."];
const QUESTION = /\?\s*$|^(what|when|where|who|how|why|which|do|does|did|can|could|is|are|will|would|should)\b/i;
const NOTHING = /^[.\s…]*$/;

/**
 * The short acknowledgement for what was heard, or "" when none fits: nothing was heard (a silence timeout), or the
 * caller is saying thanks or goodbye. `turn` only rotates the choice so the same word is not said every time.
 */
export function ackFor(heard: string, turn: number, closing: boolean): string {
  if (closing || NOTHING.test(String(heard ?? ""))) return "";
  const from = QUESTION.test(String(heard).trim()) ? ACK_QUESTION : ACK_OTHER;
  return from[Math.abs(Math.floor(turn) || 0) % from.length];
}

/** The answer with its first words dropped when they repeat the acknowledgement just spoken ("Okay." then "Okay, we open at five"). */
export function afterAck(ack: string, reply: string): string {
  const a = norm(ack);
  if (!a) return reply;
  const m = String(reply).match(/^\s*([A-Za-z' ]{2,14}?)[,.!]\s+(\S[\s\S]*)$/);
  if (!m || norm(m[1]) !== a) return reply;
  return m[2].charAt(0).toUpperCase() + m[2].slice(1);
}
