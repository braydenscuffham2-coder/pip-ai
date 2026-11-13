/** Pulls the first JSON object out of a model reply. */
export function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { return null; }
}
