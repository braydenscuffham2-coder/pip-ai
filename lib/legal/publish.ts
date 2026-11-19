// What may be shown in public from a document in legal/, and what still stops it from being shown.
// The legal files are drafts with working notes in them. Two rules keep those notes off the website:
//   1. publicText() takes out the furniture that is never public: the draft banner under the title,
//      a "Sources for the legal points" footer, and source tags like [S12].
//   2. blanks() lists everything that is still open. While that list is not empty, or the lawyer's switch for
//      the document is off, the page shows a holding notice and none of the draft (see components/legal/LegalDocPage.tsx).
// Keep this file free of imports so the tests can load it directly.

export type BlankKind =
  /** A value to fill in, for example [business mailing address]. */
  | 'placeholder'
  /** A note or question for a person, for example [LAWYER: ...] or [NOTE BEFORE PUBLISHING: ...]. */
  | 'note'
  /** A whole section of working notes, for example "Notes for the lawyer (not part of the published policy)". */
  | 'internal-notes'
  /** A "[" that is never closed. Treated as open so a typo cannot hide a note. */
  | 'unclosed';

export interface Blank {
  /** The text as written in the file, brackets included. */
  text: string;
  /** Line in the file, counted from 1. */
  line: number;
  kind: BlankKind;
}

/** Bracketed words that are part of the published text, not blanks. Shown in round brackets. */
const STATUS_LABEL = /^(not live yet|not offered yet)$/i;
/** A source tag: [S12] or [S11, S12]. */
const SOURCE_TAG_INNER = /^S\d+(\s*,\s*S\d+)*$/;
/** How a note to a person starts. Capitals only, so a name such as "Brayden Scuffham" in a placeholder is not taken for one. */
const NOTE_START = /^(BRAYDEN|LAWYER|LANE \d+|PROPOSED|NOTE BEFORE PUBLISHING)\b/;
const DRAFT_BANNER = /\bDRAFT\b|\bLane\s+\d+\b/;
const SOURCES_FOOTER = /^(\*\*|__)?\s*Sources for the legal points\b/i;
/** A heading that opens a section of working notes. */
const NOTES_HEADING = /^notes for\b|\(\s*not part of\b/i;

const heading = (line: string) => /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);

/** The same text with code (fenced blocks and `inline code`) replaced by spaces, so positions and lines stay put. */
function maskCode(md: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let out = md.replace(/^ {0,3}(```|~~~)[^\n]*\n[\s\S]*?(\n {0,3}\1[^\n]*(?=\n|$)|$)/gm, blank);
  out = out.replace(/(`+)(?!`)[^\n]*?[^`\n]\1(?!`)/g, blank);
  return out;
}

/** Blanks out the draft banner and the sources footer, leaving every other character where it was in the file. */
function scrub(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');

  // 1. The draft banner: a quoted block that is the first thing under the title.
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^ {0,3}#\s/.test(lines[i])) {
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  if (i < lines.length && /^ {0,3}>/.test(lines[i])) {
    let end = i;
    while (end < lines.length && /^ {0,3}>/.test(lines[end])) end++;
    if (DRAFT_BANNER.test(lines.slice(i, end).join('\n'))) for (let k = i; k < end; k++) lines[k] = '';
  }

  // 2. A "Sources for the legal points" footer, written as a paragraph or as a section.
  for (let n = 0; n < lines.length; n++) {
    const h = heading(lines[n]);
    if (h && SOURCES_FOOTER.test(h[2])) {
      const level = h[1].length;
      let end = n + 1;
      for (; end < lines.length; end++) {
        const next = heading(lines[end]);
        if (next && next[1].length <= level) break;
      }
      for (let k = n; k < end; k++) lines[k] = '';
    } else if (SOURCES_FOOTER.test(lines[n].trim())) {
      let end = n;
      while (end < lines.length && lines[end].trim() !== '') end++;
      for (let k = n; k < end; k++) lines[k] = '';
    }
  }

  return lines.join('\n');
}

/** Takes out source tags such as [S12], except inside code. */
function dropSourceTags(text: string): string {
  const masked = maskCode(text);
  let out = '';
  let last = 0;
  const tag = /[ \t]*\[S\d+(?:\s*,\s*S\d+)*\](?!\()/g;
  for (let m = tag.exec(masked); m; m = tag.exec(masked)) {
    out += text.slice(last, m.index);
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

/**
 * The document without the draft banner, without a "Sources for the legal points" footer and without source tags.
 * Nothing else is removed. Blanks and working-notes sections stay in, which is why a page must check blanks() first.
 */
export function publicText(md: string): string {
  return dropSourceTags(scrub(md)).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Turns the status labels into ordinary text: "[not live yet]" becomes "(not live yet)". */
export function showStatusLabels(md: string): string {
  return md.replace(/\[(not live yet|not offered yet)\](?!\()/gi, (_m, label: string) => `(${label.toLowerCase()})`);
}

interface Span { start: number; end: number; closed: boolean }

/** Top-level [ ... ] spans in text that has already had its code masked. Nested brackets stay inside their parent. */
function bracketSpans(masked: string, from: number, to: number): Span[] {
  const spans: Span[] = [];
  let depth = 0;
  let start = -1;
  for (let i = from; i < to; i++) {
    const ch = masked[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '\n' && masked[i + 1] === '\n' && depth > 0) {
      // A bracket never runs past the end of its paragraph.
      spans.push({ start, end: i, closed: false });
      depth = 0;
      continue;
    }
    if (ch === '[') { if (depth === 0) start = i; depth++; }
    else if (ch === ']' && depth > 0) { depth--; if (depth === 0) spans.push({ start, end: i + 1, closed: true }); }
  }
  if (depth > 0) spans.push({ start, end: to, closed: false });
  return spans;
}

/**
 * Everything that still has to be filled in or removed before the document can be shown.
 * Counted as open: any [bracketed text] that is not a markdown link, a source tag or a status label,
 * a "[" that is never closed, and any heading that opens a working-notes section.
 * Works the same on the raw file and on publicText() of it.
 */
export function blanks(md: string): Blank[] {
  const text = scrub(md);
  const masked = maskCode(text);
  const found: Blank[] = [];
  const lineOf = (pos: number) => text.slice(0, pos).split('\n').length;

  const walk = (from: number, to: number) => {
    for (const s of bracketSpans(masked, from, to)) {
      const raw = text.slice(s.start, s.end);
      if (!s.closed) {
        found.push({ text: raw.split('\n')[0].trim(), line: lineOf(s.start), kind: 'unclosed' });
        continue;
      }
      const inner = raw.slice(1, -1).trim();
      if (masked[s.end] === '(') { walk(s.start + 1, s.end - 1); continue; } // a link: only its text can hold a blank
      if (SOURCE_TAG_INNER.test(inner) || STATUS_LABEL.test(inner)) continue;
      found.push({ text: raw, line: lineOf(s.start), kind: NOTE_START.test(inner) ? 'note' : 'placeholder' });
    }
  };
  walk(0, masked.length);

  const lines = masked.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const h = heading(lines[n]);
    if (h && NOTES_HEADING.test(h[2])) found.push({ text: text.split('\n')[n].trim(), line: n + 1, kind: 'internal-notes' });
  }

  return found.sort((a, b) => a.line - b.line);
}

export interface PublicDocument {
  /** True only when nothing is open AND the lawyer's switch for this document is on. */
  ready: boolean;
  blanks: Blank[];
  /** The lawyer's switch that was passed in (LAWYER_SIGNED_OFF in lib/legal/facts.ts). */
  signedOff: boolean;
  /** The text to show. Empty while the document is not ready, so a caller cannot show a draft by mistake. */
  body: string;
}

/**
 * The one call a page needs: may the document be shown, and if so what text to show.
 * Two things must both be true: the document has no blanks left, and `signedOff` is exactly true.
 */
export function publicDocument(md: string, signedOff: boolean): PublicDocument {
  const open = blanks(md);
  const ok = signedOff === true;
  const ready = ok && open.length === 0;
  return { ready, blanks: open, signedOff: ok, body: ready ? showStatusLabels(publicText(md)) : '' };
}
