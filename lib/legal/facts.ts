// Facts only the founder can supply. Nothing here is guessed: Brayden gave these on November 19, 2026.
// Keep this file free of imports so the tests can load it directly.

/**
 * The address shown on the About page for questions. While it is null the About page shows no email line.
 * Set it only to an inbox that exists and is read.
 */
export const CONTACT_EMAIL: string | null = 'support@hirepip.com';

/**
 * The lawyer's switch, one per document. A document is shown in full only when it has no blanks left AND its
 * switch here is true. Turn a switch on only after a lawyer has approved the exact text in legal/ and Brayden
 * has said to publish it. Until then the page shows the holding notice.
 */
export const LAWYER_SIGNED_OFF: { privacy: boolean; terms: boolean; aup: boolean } = {
  /** legal/privacy-policy.md, shown at /privacy. On since November 19, 2026: Brayden said to publish it. */
  privacy: true,
  /** legal/terms-of-service.md, shown at /terms. On since November 20, 2026: Brayden said yes to publishing. */
  terms: true,
  /** legal/acceptable-use-policy.md, shown at /acceptable-use. Part of the Terms, so it is published with them. */
  aup: true,
};

export interface FounderFacts {
  /** The legal name of whoever operates Pip (a person doing business as Pip, or the company once it is formed). */
  operatorLegalName: string | null;
  /** The inbox for privacy requests (see, correct, delete). It must exist and be read before the policy is published. */
  privacyEmail: string | null;
  /** The support inbox on hirepip.com. Google's review asks for a support email on the app's own domain. */
  supportEmail: string | null;
  /** The business mailing address printed in the Privacy Policy and the Terms. */
  mailingAddress: string | null;
  /** The date the approved documents take effect, as it should be printed (for example "December 1, 2026"). */
  effectiveDate: string | null;
  /** How many months conversations, leads and booking requests are kept. The draft proposes a number; it is not decided. */
  conversationRetentionMonths: number | null;
}

export const FOUNDER_FACTS: FounderFacts = {
  operatorLegalName: 'Brayden Scuffham, an individual doing business as Pip',
  privacyEmail: 'privacy@hirepip.com',
  supportEmail: 'support@hirepip.com',
  mailingAddress: 'Pip, 2767 E Rockhampton Dr, Meridian, ID 83642',
  effectiveDate: 'November 20, 2026',
  conversationRetentionMonths: 13,
};
