// /acceptable-use: legal/acceptable-use-policy.md. It is part of the Terms of Service, so it is published with them
// and follows the same rule: shown only with no blanks left and its switch on (see components/legal/LegalDocPage.tsx).
import type { Metadata } from 'next';
import { LegalDocPage, legalMetadata } from '@/components/legal/LegalDocPage';

export const dynamic = 'force-static';

export function generateMetadata(): Metadata {
  return legalMetadata('aup', 'Acceptable Use Policy', 'What a Pip teammate may not be used for.');
}

export default function AcceptableUsePage() {
  return <LegalDocPage which="aup" title="Acceptable Use Policy" />;
}
