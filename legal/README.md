# legal/

> **Status on November 19, 2026.** The Privacy Policy is published at https://www.hirepip.com/privacy (Brayden's decision; operator, address, contact address and the 13-month period are his). Conversations are now deleted automatically 13 months after their last message (`20261120_10_conversation_retention.sql`), so the "no automatic deletion" mismatch below is closed. The Terms are filled in but still held: section 2 promises a Portal screen that is not built yet. `lawyer-memo.md` item 6 (the old Google sign-in) is out of date since November 18; Pip's own Google app asks for five narrow permissions.


> **Everything in this folder is a DRAFT.** It was written by an AI drafting assistant (lane 10), not a lawyer. It is not legal advice. Nothing here is published, linked from the website or shown to an owner until a lawyer has signed off and Brayden says so.

The same text is in one shared doc for the lawyer's comments: https://claude.ai/artifact/DQpY6t3dkGf9xcS6WESSJr

## Files

| File | What it is |
| --- | --- |
| `lawyer-memo.md` | Open questions for the lawyer, most serious first. Start here. |
| `privacy-policy.md` | Privacy Policy for owners and their customers. Google's review and texting registration wait on it. |
| `terms-of-service.md` | Terms for businesses, with the order terms. |
| `data-processing-addendum.md` | Pip as the business's service provider. |
| `acceptable-use-policy.md` | What a teammate may not be used for. |
| `notices.md` | AI disclosure, call openings, opt-out wording, consent wording and records, carrier registration wording. **Other lanes take their wording from here.** |
| `state-table.md` | Call recording and AI disclosure by state, checked against `jurisdiction_rules`. |
| `buying-authorization.md` | What an owner agrees to when setting a purchasing policy. |
| `camera-notice.md` | The sign and the owner's sign-off. |
| `google-review.md` | Materials for Google's review of the sign-in app. |
| `sources.md` | Every source, with the date checked. |

## Three questions the lawyer must answer before the first paying client

1. Can Pip take a paying client as it stands (no company, no known insurance), and do the Terms' liability cap, disclaimer and indemnity hold for a product that acts without per-action approval?
2. On calls and texts, who is legally the caller, are Pip's voice and AI vendors third parties to a call under wiretap law, and is the opening wording valid consent to record in every state?
3. Is Pip a service provider for customer data, does the Privacy Policy's Google section meet Google's Limited Use rules, and what retention period should be set?

## Where the code does not yet match the documents

Found while checking every factual statement against `main` (commit `edf9024`) and the live database on November 17, 2026. Each is noted on the owning lane's issue.

| # | What the documents or the handbook say | What is true today | Owner |
| --- | --- | --- | --- |
| 1 | Owners agree to the Terms | The Portal shows the agreement tick-box only when `portal_terms_url` is set. It is not set. An owner can accept a price with no terms. | Brayden, after lawyer sign-off |
| 2 | Disclosures are logged (handbook rule 7) | `compliance_events` has no disclosure rows and no code writes one. The saved conversation is the only record. | 01 core |
| 3 | Every teammate says it is an AI | Enforced in code in `pip-turn`. Not found in the older path (`lib/skills/runtime.ts` via `/api/runtime/chat`). | 01 core |
| 4 | "Reply HELP for help" | `pip-run` returns nothing for HELP, and sends no STOP or START confirmation. Twilio's defaults may cover it; the wording will not name the business unless configured. | 02 voice |
| 5 | Texts respect quiet hours | Hours are judged in the business's time zone, not the recipient's. | 02 voice, after the lawyer answers |
| 6 | Google access is send mail, calendar events, files Pip made | Closed November 18, 2026. Since November 17 to 18, 2026 sign-ins go through Pip's own Google app (Google Cloud project `pip-ai`). It asks for exactly: the account's email address, send mail, calendar events, calendar name and time zone, and files Pip made. Composio still runs the sign-in and holds it for Pip. Before that date, sign-ins used Composio's Google app with full mailbox and full calendar access. | 03 connections |
| 7 | Conversations are kept for a stated time | No automatic deletion of conversations, leads or booking requests. | Brayden and lawyer to set; then 09 guard |
| 8 | `jurisdiction_rules` has a source per row | Only the US and Idaho rows have any source. Six corrections are listed in `state-table.md`, not applied. | Brayden and lawyer |
| 9 | Preview policy: "We do not set tracking cookies" | `app/layout.tsx` and `public/app.html` load Google Analytics 4. | Brayden |
| 10 | Preview policy: "your own voice is not recorded" | The preview's demo call uses the visitor's microphone through ElevenLabs. Not changed by this lane (handbook rule 10). | Brayden |

## Rules for this folder

- Every legal statement carries a source number from `sources.md` and the date checked.
- Every statement about what Pip does must be true of the code on the day it is published. If you change behavior a document describes, tell lane 10 on issue #24.
- Blanks and questions are in [square brackets]. Search for `[LAWYER`, `[BRAYDEN`, `[LANE` to find them.
