# Notes on the Terms of Service and the Acceptable Use Policy (not published)

Both are published since November 20, 2026, at https://www.hirepip.com/terms and https://www.hirepip.com/acceptable-use. Brayden said yes to publishing on November 20, 2026.

**What changed on the day of publishing**

- The Terms no longer make the Data Processing Addendum part of every agreement. `data-processing-addendum.md` is still a draft and promises things that were not checked (two-step sign-in on every provider, each provider's contract, a 72-hour notice). The Terms now say a business that needs one should ask before accepting.
- Section 2's list of what the software enforces was checked against the code on November 20, 2026: the AI line on a first message, tools limited to the job's list and working connections, email only to the customer in the conversation, busy times only, extra tools off until reviewed, money tools refused, bookings and drafts sent for approval, one job pausing when a connection fails.
- "Before a teammate goes live, the Portal shows you in plain words what it can and cannot do" is true since #58 (each teammate card, built from its job list).
- Section 8: no refund for a partial month; the unused part is refunded if Pip ends service for a reason other than the client's breach. Billing stops at the end of the paid month when a business disconnects or deletes its account (#60). Refunds are done by hand in Stripe.
- Acceptable Use Policy: the open question about adding more business types Pip does not serve (debt collection, firearms, adult services, gambling, cannabis, lending) was left out, so only health care is listed. Add them here if you want them excluded.
- Reports go to support@hirepip.com. There is no abuse@ inbox.

**Earlier notes, as written on November 17, 2026**

- **Checked against code and database on November 17, 2026:** usage rates, 40% included, $100 early-invoice threshold and 7-day grace (`forge_settings.billing_defaults`); billing starts at go-live and usage never pauses a client (`pip-run` header, `portal_billing_tick`); the section 2 limits (`pip-turn/index.ts`); delete flow (`portal_api_cancel`).
- Section 8's "billing stops at the end of the paid month" is a proposed term. What the billing code does on disconnect was not checked.
- **The Portal does not ask for agreement to terms today.** It only shows the tick-box when a terms link is set, and none is set. Set it to the approved Terms before the first client.
- "A teammate can only use the tools it was built with" is enforced for the main teammate kind.
- Section 5's "we may submit registration for you" assumes the answer to memo item 3 on who registers.
- The older preview Terms say teammates are covered "only under a separate written agreement that we both sign." Acceptance in the Portal is recorded with email, time and version (`business_agreements`, `compliance_events`). Confirm that counts.

**Acceptable Use Policy notes, November 17, 2026**
 Items 6 and 7 match the "never" list every teammate is built with (`pip-forge`). Items 1 and 2 are enforced in code for the main teammate kind and for texts; item 3 has no code yet because calls are not live; items 12 to 14 describe features not yet built.
