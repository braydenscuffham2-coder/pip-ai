// What counts as "stop contacting me", and the line every outbound email carries.
// The text route in pip-run keeps its own copy of the SMS words (its stand-in test runs the file on its own); the
// tests in tests/pip-turn/optout.test.mjs read both files and fail if the two lists ever differ.
export const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"];
export const STOP_PHRASE = /\b(stop (texting|messaging|contacting|emailing) me|take me off|remove me from|do not (text|contact|email) me|don'?t (text|contact|email) me)\b/i;

/** Email opt-out line, added to every email a teammate sends. */
export const EMAIL_OPT_OUT_LINE = "Reply STOP to opt out of further emails.";

/** True when a customer's message asks not to be contacted. A single word counts only when it is the whole first line. */
export function isStopRequest(text: string): boolean {
  const first = String(text ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const word = first.toUpperCase().replace(/[^A-Z]/g, "");
  return STOP_WORDS.includes(word) || STOP_PHRASE.test(String(text ?? ""));
}
