// /terms: legal/terms-of-service.md, shown only once it has no blanks left (see components/legal/LegalDocPage.tsx).
import type { Metadata } from 'next';
import { LegalDocPage, legalMetadata } from '@/components/legal/LegalDocPage';

export const dynamic = 'force-static';

export function generateMetadata(): Metadata {
  return legalMetadata('terms', 'Terms of Service', 'The terms a business agrees to when it uses Pip.');
}

export default function TermsPage() {
  return <LegalDocPage which="terms" title="Terms of Service" />;
}
