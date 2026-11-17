# Memo of open questions for the lawyer

> **DRAFT. Not legal advice. Written by an AI drafting assistant, not a lawyer.**
> Lane 10, November 17, 2026. Sources are numbered [S1] and so on and listed with the date checked in `legal/sources.md`.

**To:** the reviewing lawyer
**From:** Brayden Scuffham, Pip (drafted by lane 10)
**About:** what we need decided before Pip takes its first paying client, and after

## What Pip is, in one paragraph

Pip sells AI "teammates" to local businesses in the United States. A teammate answers a business's website chat and texts today. Phone calls, a Pip email address per business, work inside password-only websites, supplier orders inside owner-set limits, and a count-only camera box are being built. After a one-time setup, teammates act on their own with no approval for each action. Limits are set once by the owner and enforced in code. Brayden is the only person in the business, is in Meridian, Idaho, and today operates as an individual doing business as Pip. There is no paying client yet.

## The three questions to answer before the first paying client

**1. Can Pip take a paying client as it stands today, and do the Terms hold when a teammate makes a mistake?**
Pip has no company and, as far as this lane knows, no insurance. The draft Terms cap Pip's liability at the fees paid in the prior 12 months and make the business responsible for what it tells its teammate to do. Please tell us: (a) whether to form the LLC and buy insurance before the first client signs (we assume yes); (b) whether the cap, the disclaimer and the indemnity in `terms-of-service.md` sections 9 to 11 are enforceable for a product that acts without per-action approval; (c) what must be carved out. Item 1 below.

**2. On calls and texts, who is legally the caller, and is our opening wording enough?**
A teammate answers and, later, places calls and texts for a business through Pip's Twilio account, with Anthropic and ElevenLabs processing the content. Please tell us: (a) whether Pip, the business, or both are the "caller" or "sender" under the federal Telephone Consumer Protection Act and state versions; (b) whether Pip's vendors are third parties to the call under California's wiretap law, so that an announcement alone is not consent; (c) whether the opening lines in `notices.md` are sufficient consent to record in every state. Items 2 and 3 below.

**3. Is Pip a service provider for customer data, and can the Privacy Policy go to Google as written?**
Google's review of Pip's sign-in app and the carrier registration for texting both need a published Privacy Policy. Please tell us: (a) whether Pip is a processor or service provider for the conversations it handles for a business, and a controller only for owner account data; (b) whether section 4 of the Privacy Policy meets Google's Limited Use rules given that the founder can read stored conversations and that content goes to Anthropic; (c) what retention period to set, since today there is none. Items 5 and 6 below.

---

## Open questions, most serious first

### 1. Liability for a teammate's mistake, the legal entity, and insurance

**Facts.** Teammates act without per-action approval. The code holds these limits today: a teammate may only email an address the customer typed in that conversation; calendar reads return busy times only; at most 6 tool calls and 5 rounds a turn; in tools the owner connects beyond setup, a teammate may only add one new record; money and payroll tools are never opened; a teammate is instructed not to tell a customer something was done unless a tool result says so. Bookings and drafts go to the owner for approval. Nothing else is guaranteed. An AI model can still give a customer wrong information about hours, prices or services.

**What the drafts assume.** The business is responsible for the facts and instructions it gives, for reviewing the plain-words list of what its teammate can do before go-live, and for its own legal duties to its customers. Pip is responsible for running the teammate inside the limits the code enforces. Liability is capped at 12 months of fees. Neither side is liable for indirect losses. The business indemnifies Pip for claims arising from its instructions, its data and its own compliance failures; Pip indemnifies the business for claims that Pip's software infringes.

**Questions.**
- Is a 12-month fee cap enforceable in Idaho for a business-to-business service, and should breaches of confidentiality, data security or Pip's own indemnity sit outside it?
- Does "autopilot" raise the standard of care? Should the Terms say the business appoints Pip's software as its electronic agent? Contracts formed by electronic agents are valid under the Uniform Electronic Transactions Act, but that law does not say who bears an agent's unexpected mistake [S18].
- Brayden is personally liable today. What entity, and must it exist before a client accepts the Terms? The Terms name a placeholder.
- Which insurance before the first client: technology errors and omissions, cyber, general liability? Many policies exclude telephone-law claims; is there one that does not?
- The existing preview Terms (item 12) require arbitration in Ada County with a class waiver. Should the business Terms do the same? The draft does, for consistency.

### 2. Phone calls: recording, wiretap law, and AI voices

**Facts.** No call feature is live. The plan: inbound calls answered by an AI voice (ElevenLabs for speech, Anthropic for the reply, Twilio for the line). Every call opens by saying it is an AI assistant and, if recorded, that it is recorded. Outbound calls only to contacts with a stored consent.

**Law found.**
- About eleven to thirteen states require every party's consent to record a call, depending on how mixed-rule states are counted [S7]. The database's default for every state is all-party, which is the safe side. See `state-table.md`.
- The FCC ruled in February 2024 that an AI-generated voice is an "artificial or prerecorded voice" under the Telephone Consumer Protection Act, so outbound AI-voice calls need prior express consent, and prior express written consent if they are marketing [S8].
- California's wiretap law, Penal Code section 631, has been applied to AI call-center vendors. One line of cases asks only whether the vendor is capable of using call content for its own purposes; if so, the vendor may be a third-party listener, and the caller's consent to that vendor is needed. In Ambriz v. Google the court let that claim proceed in February 2025; later reporting says the claim was dismissed in 2026 on a telephone-company-agent exemption [S15]. This is unsettled.

**Questions.**
- Is "This call is recorded" at the start, followed by the caller staying on the line, valid consent in every all-party state? Should the teammate offer a way to continue without recording?
- If a call is not recorded but is transcribed live by a vendor so the AI can answer, is that an interception that needs consent under section 631 or similar laws? The draft opening line discloses AI on every call, recorded or not. Is that enough?
- What must Pip's contracts with ElevenLabs, Twilio and Anthropic say so those vendors are extensions of Pip and not third parties? Anthropic's commercial terms bar training on customer content [S16]. ElevenLabs and Twilio terms have not been checked.
- For outbound AI-voice calls that are not marketing (appointment reminders), is the stored consent described in `notices.md` section 6 enough, and must it mention an artificial voice?
- Emergency calls: the teammate tells the caller to hang up and dial 911. Is any other duty triggered by answering a business line with AI?

### 3. Text messages: consent, quiet hours, carrier registration

**Facts.** Live in code, not yet in use (no number bought). A text from a new number is treated as consent to reply about that request ("transactional"). An owner can import contacts by ticking a box that says they asked to hear from the business; imported contacts can receive service messages only, never marketing. Marketing texts need a stored marketing consent that was not imported. STOP and six other words, plus plain phrases like "stop texting me", revoke consent on every channel at once. Outbound sends are checked against hours and a daily attempt limit and each check is logged.

**Law found.**
- The FCC's October 1, 2026 order lets a sender name one opt-out method but still requires honoring seven standard opt-out words, and keeps a 10-business-day limit to act on opt-outs. It takes effect 30 days after Federal Register publication; a further proposal would shorten the limit to seven days [S9]. Pip honors opt-outs at once.
- Texas quiet hours for solicitations are 9 a.m. to 9 p.m. Monday to Saturday and noon to 9 p.m. Sunday, and since September 1, 2025 they cover texts. A November 2025 settlement exempts consent-based marketing texts from Texas's registration and bond rule, but private claims continue [S17]. Florida, Oklahoma and Maryland limit hours to 8 a.m. to 8 p.m. and attempts to three in 24 hours in the database; Virginia changed its opt-out rules on January 1, 2026 [S17]. The database rows for these states carry no source yet.
- Carriers require each business that texts to be registered, with a public privacy policy and terms, a described opt-in, sample messages with the brand name, and STOP and HELP handling [S11].

**Questions.**
- Is an inbound text valid consent for the reply and for later service messages about the same request? For how long?
- Is the owner's tick-box statement for imported contacts enough for service texts, and what records should Pip keep?
- **Gap to decide:** the code applies quiet hours in the business's time zone. Federal and state rules look at the recipient's local time. Should Pip use the recipient's area code, the stricter of the two, or block marketing sends to out-of-state numbers until this is built?
- Does Pip, as the account holder at Twilio, register as the sender itself or register each business as its own brand? We assume each business is its own brand and Pip is the software provider.
- Does Pip or the business need to register as a telemarketer in any state if a business sends marketing texts with consent?
- Are texts covered by the same federal rules as calls after recent court decisions limiting deference to the FCC? This lane did not research that question and flags it.

### 4. Saying it is an AI

**Facts.** In the main teammate path, code adds "This is [name], an AI assistant for [business]." to the first reply on any channel if the model did not say it. Emails a teammate sends get an AI line added in code. This lane did not find the same code check in the older teammate path (`lib/skills/runtime.ts`); it may rely on the prompt. Disclosures are not written to the compliance log today; the conversation itself is the only record.

**Law found.** Pip discloses at the start in every state, which meets or exceeds each rule found.
- In force now: Utah (on request, and up front for high-risk regulated services), Maine (when a person could think it is human, since September 24, 2025), California's bot law for sales and its companion-chatbot law, New York's companion law [S2][S3].
- Passed, not yet in force: Idaho's Conversational AI Safety Act, S 1297, signed March 31, 2026, effective July 1, 2027 [S1]. Colorado, Connecticut, Oregon and Washington on January 1, 2027; Georgia on July 1, 2027 [S3][S4]. California AB 1609 on customer-service chatbots takes effect January 1, 2027 but covers only businesses with more than $500 million in revenue [S5].
- Colorado's 2024 AI Act was narrowed and delayed to January 1, 2027 by SB 189 in May 2026 [S6].

**Questions.**
- Idaho S 1297 covers "operators" that make conversational AI available to the public, requires a protocol for users who express thoughts of suicide, and adds rules for minors [S1]. Is Pip an operator, is each client business, or both? Does a front-desk teammate fall inside it? We need a decision by early 2027.
- Should every teammate carry a crisis response now (give the 988 line and alert the owner), whatever the answer?
- Is one disclosure at the start enough, or do any of the 2027 laws require repeating it in long conversations for ordinary business chat?

### 5. Privacy: Pip's role, state laws, retention

**Facts.** Pip stores conversation text, leads and booking requests in clear text with no automatic deletion. Phone numbers in consent records are stored as a one-way code plus the last four digits. When a business deletes its account, everything is deleted except consent and opt-out records, the compliance log and signed agreements; the business name is stripped after one year and the record removed after four. The founder can read stored conversations in the database. A health-business flag exists and blocks go-live until business associate agreements are recorded; none are, so no health client can go live.

**Questions.**
- Confirm roles: Pip as service provider or processor for customers' conversations, controller for owner account data.
- Pip is far below the size thresholds of state comprehensive privacy laws. Its clients may not be. Is the data processing addendum in `data-processing-addendum.md` sufficient for a client that is covered?
- What retention period for conversations? The Privacy Policy proposes 13 months. Is four years right for consent and opt-out records?
- Customers will type health details and other sensitive facts even though teammates are told not to ask. Does that create duties under Washington's My Health My Data Act or similar laws for a non-health business?
- Does Idaho's data breach law, or any client state's, require anything of Pip beyond notifying the business?

### 6. Google's review of the sign-in app

**Facts.** The decision is to use Pip's own Google app asking for send-mail, calendar events and files Pip created. Today sign-ins still run through Composio's Google app, which requests full mailbox and full calendar access, with Pip's allowlist and code limits doing the restricting (`docs/portal-backend.md`).

**Rules found.** Send-mail and calendar-events are "sensitive" permissions that need Google's verification; any permission that reads mail is "restricted" and needs a paid security assessment. Google requires a privacy policy on the app's home page domain that discloses how Google data is accessed, used, stored and shared; use limited to what is disclosed; and compliance with the four Limited Use rules, including no use for training generalized AI models and limits on people reading the data [S12].

**Questions.**
- Does section 4 of the Privacy Policy satisfy the policy as written? `google-review.md` has the scope justifications.
- Sending calendar busy times and email drafts to Anthropic: is that a permitted transfer "to provide or improve user-facing features"? We believe so and say so.
- May the founder read conversations that contain content a teammate drew from Google (for example, "Tuesday at 3 is open")? The policy limits human reading to consent, security, legal need, or aggregated internal operations.

### 7. Working inside third-party websites with a password

**Facts.** Not built. Plan: the owner creates a separate login named "Pip" in their own software; the password goes into a vault and a non-AI step types it; a cloud browser then does a narrow task. No model sees the password. The job pauses on a CAPTCHA and never tries to get around one.

**Law found.** In Amazon v. Perplexity, a district court in March 2026 enjoined an AI shopping agent from logged-in Amazon pages. On August 4, 2026 the Ninth Circuit vacated that order, reasoning that the user, not the agent's maker, "accessed" Amazon, and noted that sites can still enforce their terms of service by contract [S13]. Commentary says the reasoning turned on the agent running on the user's own device [S13]. Pip's browser runs in the cloud, so Pip's servers touch the site. That difference may matter.

**Questions.**
- When a site's terms forbid automated access or sharing a login, who is exposed, Pip or the business, and to what: contract claims, computer-access laws, account closure?
- Does a dedicated "Pip" user created by the owner, plus the authorization in `terms-of-service.md` section 6, reduce that risk? Should Pip keep a list of sites it will not automate?
- Should Pip identify itself to sites as an automated agent?
- Is a per-site sign-off from the owner needed (the database already has an agreement type `login_authorization`)?

### 8. Purchasing

**Facts.** Not built. Stage 1 only: a teammate reorders from supplier accounts the business already has, using payment already on file there, inside a policy the owner sets once (suppliers, items, most per order, most per month). Code checks every order against the policy. Pip handles no card and no money. Pip-issued cards are on hold until you advise.

**Law found.** A contract formed by an electronic agent binds the party that deployed it, even if no person reviewed the order; the Uniform Electronic Transactions Act also gives some relief for errors where the other side gave no chance to correct them. Neither it nor federal E-SIGN settles who bears an AI agent's unexpected order [S18].

**Questions.**
- Is `buying-authorization.md` enough to make the business, not Pip, the buyer in every order, and to put a wrong-but-within-policy order on the business?
- Who bears an order that breaks the policy because of a Pip defect? The draft says Pip, up to the liability cap.
- Stage 2: if Pip issues cards or moves money, what licenses or card-program rules apply? We will not build it until you say how.
- Sales tax, resale certificates and age-restricted goods (alcohol, tobacco): should the policy forbid certain categories outright? The draft does.

### 9. Camera counting

**Facts.** Not built. A box on site reads the business's cameras and sends counts and times only. The stored configuration for the one ordered box sets "store video: no" and "faces: no". The go-live gate blocks a camera teammate in Illinois, Texas and Washington until a legal sign-off is recorded.

**Law found.** Illinois, Texas and Washington have biometric privacy laws aimed at identifiers such as scans of face geometry. Commentary treats counting that never builds a face or body template as outside those laws, but the Texas Attorney General has taken the position that the Texas law reaches face geometry even when not used to identify anyone [S14].

**Questions.**
- Does a detector that finds "a person" in a frame, without a face template, capture a biometric identifier under any of the three laws?
- Is a posted sign enough everywhere, and does `camera-notice.md` say the right thing? Any state that requires more for employees?
- Audio must stay off. Is there any state where video analytics alone needs consent?

### 10. Health businesses

Blocked in code until agreements are on file. Please confirm the list of vendors that would need a business associate agreement (`health_vendor_map` lists Supabase, Vercel, Anthropic, Twilio, ElevenLabs, Composio, Deepgram, NexHealth) and whether Pip should decline health clients for now. The drafts say Pip is not for protected health information.

### 11. Billing terms

**Facts.** A monthly price per business, set by Brayden in a pricing email and accepted by the owner in the Portal. Usage is priced at $0.15 per chat, $0.04 per text and $0.25 per call minute; 40% of the monthly price is included as usage; the rest is added to the next invoice, or invoiced at once past $100. Usage never pauses a client. An unpaid invoice pauses service after a 7-day grace period. Card required before go-live.

**Questions.** Do state automatic-renewal laws reach this business-to-business subscription? What cancellation and price-change notice should the Terms promise? Is the service subject to Idaho sales tax or any client state's?

**One fact to fix first:** the Portal only asks an owner to tick "I agree to the terms" when a terms link is set. No link is set today (`portal_terms_url` is absent), so an owner can accept a price with no terms. The link must be set to the approved Terms before the first client.

### 12. The preview's existing Terms and Privacy Policy

The Pip preview (a Claude artifact) already shows Terms and a Privacy Policy dated November 8, 2026, version 1.0. This lane did not change them. Three things to review: the contact email is still a placeholder; the policy says "your own voice is not recorded", while the preview offers a live demo call that uses the visitor's microphone through ElevenLabs; and those Terms say AI teammates are covered "only under a separate written agreement that we both sign", which the new Terms must satisfy or replace.

### 13. Smaller items

- **Acceptable use.** The draft bars teammates from employment, credit, housing and insurance decisions, debt collection, and political messaging. Anything to add?
- **Reused teammate designs.** Pip keeps de-identified patterns of tested teammates. Is the license in the Terms enough?
- **Accessibility** of the chat window and Portal.
- **Minors.** Idaho's 2027 law has rules for users known to be minors [S1]. Teammates do not ask age.

---

## What this lane could not verify

- The text of each state statute. State rows cite secondary sources checked today; statute numbers in `state-table.md` come from general knowledge and are marked for confirmation.
- Vendor contract terms other than Anthropic's no-training term.
- Whether the FCC's October 2026 order has been published in the Federal Register.
- The scope of the New York, Colorado, Connecticut, Oregon, Washington and Georgia chatbot laws as applied to ordinary customer-service chat.
