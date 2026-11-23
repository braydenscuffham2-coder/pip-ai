# ServiceTitan: App Marketplace partner program

**Status:** prepared, **recommended not to apply yet**. Prepared 2026-11-22.

## Recommendation, with the reason

ServiceTitan's route is mandatory, paid and recurring, and it is the only approved way for Pip to connect to a ServiceTitan customer. Pip has no ServiceTitan customer. ServiceTitan is also software for larger trades contractors, which is not where Pip's first clients are. Apply only after a ServiceTitan customer signs and the lawyer has read the agreement.

## The rule that decides it

ServiceTitan lists two approved ways to connect third-party software:

1. **Certified App:** developed, hosted and run by a third party (Pip would be one), reviewed by ServiceTitan, and integrates without the customer sharing an App Key.
2. **Customer-Built App:** the customer builds and hosts their own, using their own App Keys, without sharing the keys with software they do not control.

**Tunneling is prohibited:** a third party may not use a customer's App Key to reach the customer's account, and ServiceTitan may ask the customer to disconnect it. So Pip cannot take a ServiceTitan customer's API keys and connect on their behalf. It must be a Certified App, or it cannot connect at all. (The Brain's own limit line for the job-software building block says the same: "ServiceTitan API needs their approval as a partner app.")

## What the program requires (ServiceTitan's program guide)

- Mandatory participation in the Partner Program for anyone distributing through the Marketplace, under the Partner and App Marketplace Agreement and the Partner Program Agreement.
- **Five certification steps:** Integration Evaluation Call, ServiceTitan Workflow Recommendation, Data and API Workflow Questionnaire (maps every data flow), Integration Environment Provision, Final Review and Certification.
- **Money:** annual dues by tier (Silver, Gold, Titanium), plus either a flat fee per active customer or a revenue share (a percentage of net revenue or a stated minimum, whichever is greater), never both; calculated monthly; set in an order form. The amounts are not on the page.
- Annual recertification; tier placement reviewed yearly at ServiceTitan's discretion.
- Security: reviewed during certification and in the questionnaire; the page lists no specific controls.
- A partner must not replace core ServiceTitan features, disparage ServiceTitan or competitors, or contact ServiceTitan's sales, product, engineering or support teams directly (all contact goes through the App Marketplace team).
- Support: 5 business days (Silver), 3 (Gold), 1 (Titanium).

Not stated: lead time, a list of application documents, or the dues. Ask the App Marketplace team (appmarketplace@servicetitan.com, as the partner page gives it).

## Where Pip stands

| Need | Pip today |
| --- | --- |
| A party able to sign a binding agreement with recurring fees | An individual doing business as Pip; see the README entity question |
| A hosted app with a stable integration and data-flow map | The data flows for a case (record in, one email out) are described in `docs/contracts/operate-spec.md`; a ServiceTitan-specific map does not exist |
| Revenue or customers to base a fee on | None |
| Security and privacy documents | Draft data-processing addendum in `legal/`, not signed off |

## What Brayden must do himself (when the time comes)

1. Email the App Marketplace team through the address on the Partner Program page, asking for the onboarding steps, the current dues and the order form, **before** committing to anything.
2. **Stop here:** do not accept the Partner and App Marketplace Agreement, pay dues or sign an order form without the lawyer.

## Drafted first email (a question, not an application)

> Subject: Pip: onboarding steps and current terms for the App Marketplace
>
> Hello, I run Pip (hirepip.com), which builds AI teammates for local service businesses. A contractor who uses ServiceTitan has asked us to connect. We would build a hosted Certified App with read-only access to jobs and estimates, to follow up with customers on the contractor's behalf (always disclosing it is an AI, honoring opt-outs). Could you send the onboarding steps, the current annual dues by tier, the per-tenant or revenue-share terms, and the Data and API Workflow Questionnaire? Thank you. Brayden Scuffham, privacy@hirepip.com

Do not send this until a ServiceTitan contractor has actually asked; the email says one has.

## Sources (read 2026-11-22)

- ServiceTitan, App Marketplace Program Guide: https://www.servicetitan.com/legal/app-marketplace-program-guide
- ServiceTitan, Understand approved integration paths: https://help.servicetitan.com/docs/understand-approved-integration-paths-in-servicetitan
- ServiceTitan, overview for App Marketplace partners: https://help.servicetitan.com/docs/servicetitan-overview-for-app-marketplace-partners
- ServiceTitan, Partner and App Marketplace Agreement: https://www.servicetitan.com/legal/partner-and-app-marketplace-agreement
