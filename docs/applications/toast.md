# Toast: integration partner application

**Status:** prepared, **recommended not to apply yet**. Prepared 2026-11-22.

## Recommendation, with the reason

Toast says it receives many applications and cannot integrate with every one, and asks applicants for details of any shared customers who are requesting the integration. Pip has no paying customers and no restaurant has asked for a Toast connection. An application today would probably be turned down, and a rejection is harder to undo than waiting. Apply when a restaurant client asks.

None of Pip's three first operators needs Toast. Review requests and quote follow-ups open a case from a finished job or a sent quote, which are field-service ideas; a restaurant has neither.

## The process (Toast's own list)

1. **Application.** Toast vets for fit. No review time is stated.
2. **Discovery.** A call about the business opportunity and technical readiness. Before development Toast needs approval from its compliance, privacy, security and legal teams, a signed partner agreement, and an assigned Toast representative.
3. **Partner agreement.** Both sides present business terms; it is signed before development.
4. **Development kickoff.** Toast gives partner API credentials for a sandbox.
5. **Certification.** A one-hour demo-style review of how each endpoint is used, how history is polled, how reports are retrieved and whether the data matches Toast's.
6. **Alpha.** Production credentials for one restaurant; about a week of use, then a check of logs and the customer's feedback.
7. **Beta.** Three to five locations or groups using it in production for several weeks.
8. **General availability.** Listed on Toast's integrations site.

Fees and timelines: not stated, except the one-hour certification, the one-week alpha and "several weeks" of beta.

## What the application asks (the first page was not opened)

Toast's own page describes three steps: agree to the API Documentation License Agreement, follow the instructions in the email that follows, and complete the application form linked there. I did not start it, because step 1 is a licence click-through that only Brayden may accept. The form's questions were therefore not read; fill them from the draft below and expect to adjust.

## A different path to know about

Toast sells **standard API access** to its own restaurant customers through the Toast Shop: read-only endpoints, with credentials created by an active employee of the location. It is for a restaurant's own internal systems. Whether a restaurant may hand those credentials to a third party such as Pip is not stated on the pages read. Ask Toast before ever suggesting it to a client.

## What Brayden must do himself (when the time comes)

1. Open Toast's Integration Partner Application page and read the API Documentation License Agreement.
2. **Stop here:** accept it and submit. Everything after that arrives by email and is his to answer.
3. Have ready: the entity and a person who can sign a partner agreement (see README), a security and privacy summary (the lawyer's data-processing addendum draft is `legal/data-processing-addendum.md`), and the name of the restaurant client that asked.

## Drafted description (for when a restaurant has asked)

> Pip builds AI teammates for local businesses. A restaurant owner connects their Toast account so their teammate can [read orders and customer lists only], to [purpose the owner asked for, such as asking diners for a review after a visit or reminding regulars]. Teammates tell customers they are an AI, never contact anyone who opted out, and cannot refund, charge or change an order. We request read-only access to [list]. Our privacy policy is https://www.hirepip.com/privacy. A mutual customer, [restaurant name], has asked for this integration.

## Sources (read 2026-11-22)

- Toast, Integration partnership process: https://doc.toasttab.com/doc/devguide/integrationDevProcess.html
- Toast, Integration partner application: https://pos.toasttab.com/partners/integration-partner-application
- Toast, Integration types and standard API access: https://doc.toasttab.com/doc/devguide/apiIntegrationTypes.html
- Toast, Standard API access requirements: https://doc.toasttab.com/doc/devguide/devApiAccessRequirements.html
