// Which saved scans the website may hand back as a full read.
//
// The scans table has two writers. The website saves the whole read (putScan). Pip's server-side scan (scan-run)
// saves a slimmed copy when it finishes: it keeps only the Google listing's id and kind and drops the reviews, the
// name, the rating and each competitor's details, on purpose. Until Nov 28, 2026 both were served as the same thing
// for 7 days. The Pip page then read `place.reviews.length` on a listing with no reviews list and the whole scan
// stopped with "I lost my train of thought", for every business Pip had already studied for an owner.
//
// A slimmed copy is not a read. When that is all there is, the caller reads the business again.

type Loose = { kept?: unknown; pages?: unknown; place?: { name?: unknown; reviews?: unknown } | null } | null | undefined;

/** True when a saved raw read is whole: its pages are there and its Google listing, if it has one, is complete. */
export function wholeRead(raw: unknown): boolean {
  const r = raw as Loose;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (r.kept === 'slim') return false;
  if (!Array.isArray(r.pages)) return false;
  if (r.place == null) return true;
  return typeof r.place === 'object' && Array.isArray(r.place.reviews) && typeof r.place.name === 'string';
}

/** The saved scan, or null when it is missing or only a slimmed copy. */
export function usableScan<T extends { raw?: unknown }>(saved: T | null | undefined): T | null {
  return saved && wholeRead(saved.raw) ? saved : null;
}
