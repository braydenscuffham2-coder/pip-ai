// The frame around the three public pages (/about, /privacy, /terms): a small header and a footer.
import { Fragment, type ReactNode } from 'react';
import './public-pages.css';

type Current = 'about' | 'privacy' | 'terms';

const LINKS: { key: Current; href: string; label: string }[] = [
  { key: 'about', href: '/about', label: 'About' },
  { key: 'privacy', href: '/privacy', label: 'Privacy' },
  { key: 'terms', href: '/terms', label: 'Terms' },
];

// Plain <a> on purpose: "/" is served by a static page (public/app.html), so it needs a full page load.
export function PublicShell({ current, children }: { current: Current; children: ReactNode }) {
  return (
    <div className="pub">
      <header className="pub-head">
        <a className="pub-brand" href="/" aria-label="Pip home">
          <span className="pub-orb" aria-hidden="true" />
          <span className="pub-word">Pip</span>
        </a>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-foot">
        <nav aria-label="Pip pages">
          {LINKS.map((l, i) => (
            <Fragment key={l.key}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <a href={l.href} aria-current={l.key === current ? 'page' : undefined}>{l.label}</a>
            </Fragment>
          ))}
        </nav>
      </footer>
    </div>
  );
}
