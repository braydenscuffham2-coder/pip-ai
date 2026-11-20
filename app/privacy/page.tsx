// /privacy: legal/privacy-policy.md, shown only once it has no blanks left and the lawyer's switch is on (see components/legal/LegalDocPage.tsx).
import type { Metadata } from 'next';
import { LegalDocPage, legalMetadata } from '@/components/legal/LegalDocPage';

export const dynamic = 'force-static';

export function generateMetadata(): Metadata {
  return legalMetadata('privacy', 'Privacy Policy', 'What information Pip handles, how it is used, who receives it, and how Pip treats Google user data.');
}

export default function PrivacyPage() {
  return <LegalDocPage which="privacy" title="Privacy Policy" />;
}
