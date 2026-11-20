// A small markdown reader for the documents in legal/. It turns text into a plain tree; lib/legal/markdown.tsx
// turns the tree into React elements. No HTML passes through: anything that looks like a tag is shown as text.
// Covers what the legal files use: headings, paragraphs, bold, italics, inline code, links, bullet and numbered
// lists, tables, blockquotes, horizontal rules and fenced code. Keep this file free of imports so tests can load it.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; external: boolean; children: Inline[] };

export interface ListItem { children: Inline[]; blocks: Block[] }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'table'; align: ('left' | 'center' | 'right' | null)[]; head: Inline[][]; rows: Inline[][][] }
  | { type: 'blockquote'; children: Block[] }
  | { type: 'code'; text: string }
  | { type: 'hr' };

/**
 * The link target if it is one we allow, otherwise null. Allowed: http and https addresses, mailto, a path on this
 * site ("/privacy") and a jump within the page ("#contact"). Everything else, javascript: and data: included, is refused.
 */
export function safeHref(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s || /[\u0000- \u007f-\u009f\\]/.test(s)) return null; // no spaces, control characters or backslashes
  if (/^https?:\/\/[a-z0-9]/i.test(s)) return s;
  if (/^mailto:[^@/?#]+@[^@/?#]+$/i.test(s)) return s;
  if (s[0] === '/' && s[1] !== '/') return s;
  if (s[0] === '#') return s;
  return null;
}

export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children))).join('');
}

const PUNCT = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;

/** Finds the bracket that closes the one at `open`, skipping nested pairs, code and escaped characters. */
function matching(s: string, open: number, a: string, b: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '`') {
      const close = closingTicks(s, i);
      if (close) { i = close.end - 1; continue; }
    }
    if (ch === a) depth++;
    else if (ch === b) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function closingTicks(s: string, i: number): { text: string; end: number } | null {
  let n = 0;
  while (s[i + n] === '`') n++;
  for (let j = i + n; j < s.length; j++) {
    if (s[j] !== '`') continue;
    let m = 0;
    while (s[j + m] === '`') m++;
    if (m === n) {
      let text = s.slice(i + n, j).replace(/\n/g, ' ');
      if (text.length > 2 && text.startsWith(' ') && text.endsWith(' ') && text.trim()) text = text.slice(1, -1);
      return { text, end: j + m };
    }
    j += m - 1;
  }
  return null;
}

/** Where the emphasis opened at `i` with `mark` closes, or -1. */
function closingMark(s: string, i: number, mark: string): number {
  const start = i + mark.length;
  if (start >= s.length || /\s/.test(s[start])) return -1;
  const underscore = mark[0] === '_';
  if (underscore && i > 0 && WORD.test(s[i - 1])) return -1; // snake_case is not emphasis
  for (let j = start; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === '`') {
      const close = closingTicks(s, j);
      if (close) { j = close.end - 1; continue; }
    }
    if (!s.startsWith(mark, j)) continue;
    if (j === start || /\s/.test(s[j - 1])) continue;
    if (mark.length === 1) {
      // A single mark must stand alone: skip the two-character marks of bold text inside.
      if (s[j + 1] === mark) { j++; continue; }
      if (s[j - 1] === mark) continue;
    }
    if (underscore && j + mark.length < s.length && WORD.test(s[j + mark.length])) continue;
    return j;
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ type: 'text', text: buf }); buf = ''; } };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) { buf += s[i + 1]; i++; continue; }

    if (ch === '`') {
      const close = closingTicks(s, i);
      if (close) { flush(); out.push({ type: 'code', text: close.text }); i = close.end - 1; continue; }
    }

    if (ch === '[') {
      const end = matching(s, i, '[', ']');
      if (end > i && s[end + 1] === '(') {
        const stop = matching(s, end + 1, '(', ')');
        if (stop > end) {
          // [text](address "optional title")
          const target = /^\s*<?([^\s>]*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*$/.exec(s.slice(end + 2, stop));
          const children = parseInline(s.slice(i + 1, end));
          const href = target ? safeHref(target[1]) : null;
          flush();
          if (href) out.push({ type: 'link', href, external: /^https?:/i.test(href), children });
          else out.push(...children); // a refused address: keep the words, drop the link
          i = stop;
          continue;
        }
      }
    }

    if (ch === '*' || ch === '_') {
      const double = s[i + 1] === ch;
      const mark = double ? ch + ch : ch;
      const end = closingMark(s, i, mark);
      if (end > i) {
        flush();
        out.push({ type: double ? 'strong' : 'em', children: parseInline(s.slice(i + mark.length, end)) });
        i = end + mark.length - 1;
        continue;
      }
      if (double) { buf += mark; i++; continue; }
    }

    buf += ch;
  }
  flush();
  return out;
}

const RE_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const RE_HR = /^ {0,3}([-*_])[ \t]*(\1[ \t]*){2,}$/;
const RE_FENCE = /^ {0,3}(```+|~~~+)/;
const RE_QUOTE = /^ {0,3}>[ \t]?/;
const RE_ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const RE_TABLE_RULE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Splits one table row into cells. A "|" inside inline code or after a backslash does not split. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') {
      const close = closingTicks(s, i);
      if (close) { cur += s.slice(i, close.end); i = close.end - 1; continue; }
    }
    if (ch === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function slug(text: string, used: Map<string, number>): string {
  const base = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}-${n + 1}` : base;
}

export function parseMarkdown(md: string): Block[] {
  return parseBlocks(String(md ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), new Map());
}

function parseBlocks(lines: string[], used: Map<string, number>): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const blank = (n: number) => n >= lines.length || lines[n].trim() === '';
  const startsBlock = (n: number) =>
    RE_HEADING.test(lines[n]) || RE_HR.test(lines[n]) || RE_FENCE.test(lines[n]) || RE_QUOTE.test(lines[n]) || RE_ITEM.test(lines[n]);
  const isTable = (n: number) => lines[n].includes('|') && n + 1 < lines.length && lines[n + 1].includes('-') && RE_TABLE_RULE.test(lines[n + 1])
    && cells(lines[n]).length === cells(lines[n + 1]).length;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    const fence = RE_FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`).test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const h = RE_HEADING.exec(line);
    if (h) {
      const children = parseInline(h[2]);
      blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6, id: slug(inlineText(children), used), children });
      i++;
      continue;
    }

    if (RE_HR.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    if (RE_QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) inner.push(lines[i++].replace(RE_QUOTE, ''));
      blocks.push({ type: 'blockquote', children: parseBlocks(inner, used) });
      continue;
    }

    if (isTable(i)) {
      const head = cells(line).map(parseInline);
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : null));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        const row = cells(lines[i++]);
        // Every row gets exactly as many cells as the header.
        rows.push(head.map((_c, n) => parseInline(row[n] ?? '')));
      }
      blocks.push({ type: 'table', align, head, rows });
      continue;
    }

    const first = RE_ITEM.exec(line);
    if (first) {
      const indent = first[1].length;
      const ordered = /\d/.test(first[2]);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = RE_ITEM.exec(lines[i]);
        if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
        const text: string[] = [m[3]];
        const nested: string[] = [];
        i++;
        // Lines that belong to this item: indented text, and deeper lists.
        while (i < lines.length) {
          if (blank(i)) {
            // A blank line stays in the item only when indented content follows it.
            let k = i;
            while (k < lines.length && lines[k].trim() === '') k++;
            if (k < lines.length && /^ +/.test(lines[k]) && lines[k].search(/\S/) > indent) { nested.push(''); i++; continue; }
            break;
          }
          const depth = lines[i].search(/\S/);
          const item = RE_ITEM.exec(lines[i]);
          if (item && item[1].length <= indent) break;
          if (depth <= indent && startsBlock(i)) break;
          if (item || nested.length) { nested.push(lines[i].slice(Math.min(depth, indent + 2))); i++; continue; }
          if (depth <= indent && isTable(i)) break;
          text.push(lines[i].trim());
          i++;
        }
        items.push({ children: parseInline(text.join(' ')), blocks: nested.length ? parseBlocks(nested, used) : [] });
        // Blank lines between items of the same list do not end the list.
        let k = i;
        while (k < lines.length && lines[k].trim() === '') k++;
        const next = k < lines.length ? RE_ITEM.exec(lines[k]) : null;
        if (k > i && next && next[1].length === indent && /\d/.test(next[2]) === ordered) i = k;
      }
      blocks.push({ type: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items });
      continue;
    }

    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && !blank(i) && !startsBlock(i) && !isTable(i)) para.push(lines[i++].trim());
    blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) });
  }
  return blocks;
}
