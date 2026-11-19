// Markdown to React elements, for the documents in legal/. The reading is done in markdown-parse.ts; this file only
// maps the tree to elements. Every piece of text goes in as a React child, so React escapes it. No raw HTML is set.
import type { ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from './markdown-parse';

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'strong':
        return <strong key={i}>{inline(n.children)}</strong>;
      case 'em':
        return <em key={i}>{inline(n.children)}</em>;
      case 'code':
        return <code key={i}>{n.text}</code>;
      case 'link':
        // href was checked by safeHref() when the text was read: http(s), mailto, a path on this site, or #anchor.
        return n.external
          ? <a key={i} href={n.href} rel="noopener noreferrer">{inline(n.children)}</a>
          : <a key={i} href={n.href}>{inline(n.children)}</a>;
    }
  });
}

function block(b: Block, key: number): ReactNode {
  switch (b.type) {
    case 'heading': {
      const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={key} id={b.id}>{inline(b.children)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{inline(b.children)}</p>;
    case 'list': {
      const items = b.items.map((item, i) => (
        <li key={i}>
          {inline(item.children)}
          {item.blocks.map(block)}
        </li>
      ));
      return b.ordered ? <ol key={key} start={b.start === 1 ? undefined : b.start}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'table':
      // The table scrolls sideways inside its own box, so a wide table never widens the page.
      return (
        <div key={key} className="md-table" role="region" aria-label="Table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {b.head.map((cell, i) => (
                  <th key={i} scope="col" style={b.align[i] ? { textAlign: b.align[i] ?? undefined } : undefined}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} style={b.align[i] ? { textAlign: b.align[i] ?? undefined } : undefined}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'blockquote':
      return <blockquote key={key}>{b.children.map(block)}</blockquote>;
    case 'code':
      return <pre key={key}><code>{b.text}</code></pre>;
    case 'hr':
      return <hr key={key} />;
  }
}

/** Renders markdown text. Links are limited to http(s), mailto and paths on this site. */
export function Markdown({ source }: { source: string }) {
  return <>{parseMarkdown(source).map(block)}</>;
}
