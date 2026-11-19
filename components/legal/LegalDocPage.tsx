// A legal document as a public page, behind one gate: while the document still has blanks or working notes,
// the page shows a short holding notice and none of the draft, and asks search engines not to list it.
import type { Metadata } from 'next';
import { loadLegal, type LegalDoc } from '@/lib/legal/load';
import { Markdown } from '@/lib/legal/markdown';
import { PublicShell } from './PublicShell';

export function legalMetadata(which: LegalDoc, title: string, description: string): Metadata {
  const ready = loadLegal(which).ready;
  return {
    title: `${title} · Pip`,
    description: ready ? description : `${title} for Pip. This page is being finalized.`,
    robots: ready ? undefined : { index: false, follow: true },
  };
}

export function LegalDocPage({ which, title }: { which: LegalDoc; title: string }) {
  const doc = loadLegal(which);
  return (
    <PublicShell current={which}>
      {doc.ready ? (
        <article className="pub-doc">
          <Markdown source={doc.body} />
        </article>
      ) : (
        <section className="pub-hold">
          <h1>{title}</h1>
          <p>This page is being finalized. Questions: use the contact on the <a href="/about">About page</a>.</p>
        </section>
      )}
    </PublicShell>
  );
}
