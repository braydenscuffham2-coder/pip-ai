# Jobber: developer app and App Marketplace review

**Status:** prepared, not started. Prepared 2026-11-22.

## What it gets Pip

Pip's review-request and quote-follow-up operators open a case from a record in the owner's job software (a finished job, a sent quote). For a Jobber customer, that record can only be read through Jobber's API, which needs an app. Jobber has two routes:

- **Marketplace app:** an app any Jobber account can install through OAuth, after Jobber's review. This is what Pip needs for more than one client.
- **Custom integration:** for a developer who does not intend to publish. Fine for the first client, but each is limited (see Jobber's Custom Integrations page for the limits; not read in full).

## Requirements, and where Pip stands

| Requirement | Pip today |
| --- | --- |
| A Jobber Developer Center account (developer.getjobber.com), separate from any Jobber account | Not created |
| A separate Jobber account for testing | Not created |
| An app with a name, developer name, description, scopes, features and benefits, a logo (PNG or SVG, square, 384 x 384 minimum, 1 MB maximum), and gallery screenshots | Not made |
| Scopes: choose only what Pip needs | See below |
| Core functionality complete and stable; tested end to end with your own Jobber accounts | **Not built.** Pip has no Jobber connection code |
| Refresh Token Rotation enabled, and a subscription to the `APP_DISCONNECT` webhook | **Not built.** Needs a public webhook endpoint (a new function or a route in `pip-portal`) |
| Connect, disconnect and reconnect flows working from both the Marketplace and Pip's own page | Not built |
| A test account or login with instructions for the reviewer | To create |
| The Pre-Submission Checklist that appears when you request a review | Not seen; it appears in the Developer Center |

Not stated by Jobber's page: a privacy-policy or terms requirement, scope-justification wording, logo rules for the review, a review duration, rejection reasons. Do not assume the answers; ask Jobber's API support, whose address is on the page.

Third-party report (not Jobber's own, so unverified): full API access on a customer's own account is limited to a higher plan tier. Ask Jobber before promising a client that Pip can connect on any plan.

## Scopes Pip should ask for

Read-only, the narrowest set that lets an operator see (a) that a job finished and (b) that a quote was sent, plus the customer's first name and email for the case. Choose the exact scope names in the Developer Center when creating the app; I did not guess them. **Do not request write scopes** until a job that writes (such as setting a record's status) is built and tested.

## What Brayden must do himself

1. Sign up for a Jobber Developer Center account and a separate Jobber test account (his own sign-in and any codes).
2. Create the app in the Developer Center, enter the listing, and generate the Client ID and Secret. **The secret goes into the 1Password vault only; it must never be pasted in a chat, a log or the database.** (The build seat will give the vault item name; it will not see the value.)
3. **Stop here:** press "Request a review", and agree to anything it asks. Jobber's team then emails the Developer Center address to schedule a meeting and a live demo.

## Drafted listing text (Brayden to approve every word; Jobber also does a marketing review of it)

- **App name:** Pip
- **Developer name:** Pip (Brayden Scuffham)
- **Short description:** Pip is an AI assistant for local service businesses. Connected to Jobber, it notices when a job is finished or a quote has gone quiet and writes a short, honest follow-up for the owner's customers, always saying it is an AI and always honoring "stop".
- **Features and benefits:**
  - Asks every finished-job customer for a review, once, with one reminder (never filtered by how happy they seem)
  - Follows up on quotes that went quiet, up to three times, never mentioning a price
  - Stops the moment a customer says stop or replies, and hands the conversation to you
  - Reads your Jobber data only; it does not change your jobs, quotes or invoices
- **Do not say** "official partner", "certified", or use Jobber's logo anywhere public until the app is Published. Jobber's page says not to announce or market anything referencing Jobber or its logo before then.

**Check the claims against the code before submitting.** "Reads your data only" and "never mentioning a price" are true of the operator design (a case context never carries an amount); the operator lane is off by default and nothing sends yet.

## Lead time and cost

Not stated by Jobber. No fee is mentioned on the pages read. The steps are: internal testing, a meeting and live demo, functional and user-experience testing and marketing review, changes if requested, then Approved and publishing.

## Sources (read 2026-11-22)

- Jobber, App Review Process: https://developer.getjobber.com/docs/publishing_your_app/app_review_process
- Jobber, Getting Started (listing fields and logo size): https://developer.getjobber.com/docs/getting_started
- Jobber, Publishing Your App on the Marketplace: https://developer.getjobber.com/docs/publishing_your_app/app_listing_details/
- Jobber, Testing your app: https://developer.getjobber.com/docs/building_your_app/testing_your_app
- Jobber, Custom Integrations: https://developer.getjobber.com/docs/custom_integrations/
