# Twilio A2P 10DLC: sole-proprietor registration for Pip's own number

**Status:** prepared, not submitted. Prepared 2026-11-22.

## What this covers, and what it does not

Covers: one Pip-owned US 10-digit number, used for Pip's own messages (a test line to prove the text channel, and notices from Pip itself).

Does **not** cover: any client business's texts. Twilio's ISV guidance says to use the customer's information, not the ISV's, when registering for a customer. Each client that wants texts needs its own brand and campaign later, using `legal/notices.md` section 8. See the README for why this matters.

Also not needed for one-time passcodes: Twilio's Verify service needs no A2P registration. Pip does not use Verify today.

## Why the sole-proprietor path

Pip has no EIN. Sole-proprietor registration is for US or Canadian people and businesses with no EIN. A US LLC always has an EIN and is not eligible, so this path ends the day Pip forms one.

## Requirements, and where Pip stands

| Requirement | Pip today |
| --- | --- |
| No EIN, US or Canada | Met |
| Real, working website (Twilio runs automated checks and a screenshot review; a non-functional site gets the campaign rejected) | hirepip.com is live |
| Brand name: usually the proprietor's first and last name; a DBA is also accepted | "Brayden Scuffham" with DBA "Pip" (Brayden to confirm which name goes on the brand) |
| Contact email: well formed, not disposable | privacy@hirepip.com (Brayden to confirm he reads it) |
| Business address, US | 2767 E Rockhampton Dr, Meridian, ID 83642 |
| A US mobile phone that can receive the one-time text, not from a provider like Twilio | **Brayden's own mobile.** Allowed on up to 3 sole-proprietor brands |
| Privacy Policy titled "Privacy Policy", naming the brand, saying SMS opt-in data is not shared for marketing | **Met.** Section 5 has the sentence; it must say "Pip" where the form asks for the brand |
| Terms titled "Terms & Conditions" or "Terms of Service", with an **SMS Terms section** including a message-and-data-rates disclaimer, naming the brand | **Not met.** `legal/terms-of-service.md` has no SMS section, and the Terms are held by the lawyer |
| Opt-in method and proof (a public link, or screenshots of the form and its confirmation) | **Not met.** No opt-in form exists; see the draft below for the lowest-risk method |
| 2 to 5 sample messages with the brand name or website and an opt-out | Drafted below |
| One number only per campaign, with no other 10DLC numbers on the same Messaging Service | To arrange after the number is bought |

## Lead time and cost (as published)

- Brand verification: Twilio sends a text with a code right after you submit; you must answer within 24 hours or request another. Approval usually takes a few minutes after that.
- Campaign: all new US campaigns get manual vetting. Standard use cases take up to 5 business days; contact Twilio support if still in progress after 10.
- Cost: Twilio's 10DLC overview lists a $4 one-time brand fee, a $15 one-time campaign vetting fee and $2 per campaign per month. The registration page says the amounts appear in the form's fee details. Confirm in the console before agreeing.
- Limits from the same overview: one campaign, one number, 1,000 messages a day and 15 a minute to T-Mobile. A third-party forum cites 3,000 a day; that is older and I did not rely on it.

## What Brayden does himself (the stop point)

1. Sign in to the Twilio Console himself (no password or code goes through any agent).
2. Buy or choose the one 10-digit number, and remove any other 10DLC number from the Messaging Service.
3. Open the A2P 10DLC registration, choose No to "do you have a business registration number", and fill the fields from the table above.
4. **Stop here:** tick the fee acknowledgment himself, pay, and press the button that submits the brand. Then answer the text-message code from his phone within 24 hours.
5. After the brand is approved, paste the drafted campaign answers below and submit the campaign himself.

## Drafted answers

These are written for **Pip's own number**. They are not the per-business wording in `legal/notices.md` section 8.

**Campaign description**

> Pip (Brayden Scuffham, doing business as Pip, hirepip.com) uses this number to send service messages to business owners who use Pip and to people who texted this number first: replies to their questions, confirmations of what they asked Pip to do, and account notices. Replies may be written by an AI assistant, which says so in its first message. No marketing or promotional messages are sent on this campaign. No message is sent to anyone who has not texted this number first or asked in writing to be contacted.

**Message flow (how people opt in)**

> People opt in by texting this number first (for example "HI" or a question). The auto-reply says: "This is Pip's AI assistant. Msg & data rates may apply. Reply STOP to opt out, HELP for help." No one is added to a list by anyone else. The website hirepip.com links to the Privacy Policy at https://www.hirepip.com/privacy and the Terms, which include the SMS Terms.

**Primary opt-in method:** Via text (keyword campaign). Why: it needs no form that does not exist yet. Twilio asks for opt-in proof; for a text-first opt-in that is the description and a screenshot of the reply flow once the number is live, so **confirm with Twilio's form which proof it accepts before submitting.** If the form insists on a web form, a form must be built first (not built).

**Sample messages** (each includes the brand and an opt-out; square brackets mark variable text)

1. `Pip: This is Pip's AI assistant. Thanks for texting. [Answer to the question]. Reply STOP to opt out, HELP for help. Msg & data rates may apply.`
2. `Pip: You asked us to set up [item]. It's done: [link to hirepip.com page]. Reply STOP to opt out.`
3. `Pip: Your Pip account notice: [short notice]. Questions? privacy@hirepip.com. Reply STOP to opt out.`

**Message contents checkboxes:** embedded links: yes (message 2). Phone numbers: no. Direct lending or age-gated content: no.

**Wording that must match on the website before submitting**

- Privacy Policy section 5 already says texting "is not switched on yet" and describes the rules when it is. Update that sentence to say Pip's own number is live, **after** the number is, so the page is true on the day Twilio's check runs. Any change to the policy goes through the lawyer per `legal/README.md`.
- Terms: add an "SMS Terms" section (program name Pip, what messages, frequency varies, Msg & data rates may apply, STOP and HELP, contact, link to the Privacy Policy). **This is the blocker.** A draft SMS section is below for the lawyer; it is not legal advice.

> **SMS Terms (draft for the lawyer).** Pip's text messages are service messages: replies from Pip's AI assistant to people who texted Pip first, and notices about a Pip account. Message frequency varies. Message and data rates may apply. Reply STOP at any time to stop all texts; reply HELP for help or email privacy@hirepip.com. Carriers are not liable for delayed or undelivered messages. We do not share mobile information with third parties or affiliates for marketing or promotional purposes. See the Privacy Policy.

## What can still reject it

Twilio names a non-compliant opt-in method as the most common reason. Other causes from its pages: a one-word campaign description, a sample message with no brand or opt-out, a site that fails the automated check, an unanswered text-message code within 24 hours, and an EIN found later (campaign errors; fees paid again).

## After approval

- Attach the number and the campaign to one Messaging Service. Numbers added later are not verified A2P routes.
- Then, and only then, the Job 1 text channel can be tried with Brayden's own phone. Twilio account and number are still "needs you" until that happens.

## Sources (read 2026-11-22)

- Twilio, Direct Sole Proprietor Registration Overview (new console): https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience
- Twilio, A2P 10DLC registration overview (fees, limits): https://pages.twilio.com/10DLC-HelpArticles-WW
- Twilio, Required information for US A2P 10DLC registration: https://support.twilio.com/hc/en-us/articles/13718729624091
- Twilio, ISV Sole Proprietor guidance (use the customer's information): https://twilio.com/docs/sms/a2p-10dlc/isv-starter-api
- Twilio blog, Sole Proprietor registration: https://twilio.com/blog/sole-proprietor-api-and-console-experience-for-10dlc-registration
