// A legal document as a public page, behind one gate. The full text shows only when the document has no blanks or
// working notes left AND the lawyer's switch for it is on (LAWYER_SIGNED_OFF in lib/legal/facts.ts). Otherwise the
// page shows a short holding notice and none of the draft, and asks search engines not to list it.
import type { Metadata } from 'next';
import { CONTACT_EMAIL } from '@/lib/legal/facts';
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
          <p>This page is being finalized.</p>
          <p><a href="/about">Back to About Pip</a></p>
          {CONTACT_EMAIL ? (
            <p>
              Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          ) : null}
        </section>
      )}
    </PublicShell>
  );
}
