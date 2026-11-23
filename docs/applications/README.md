# Approval applications: what Pip needs, in what order (Job 4)

**Prepared on 2026-11-22. Nothing here has been submitted.** No form was opened past its first page, no fee was paid, no credential or one-time code was entered anywhere. Every packet stops before the button that submits, pays, signs or enters a secret, and says what Brayden does himself.

Facts below come from each vendor's own pages, read on the date above (sources at the bottom of each packet). Where a page did not say, the packet says "not stated" instead of guessing. Fees and timelines change; check the page again on the day you apply.

## The five at a glance

| # | Application | Do it now? | Biggest blocker | Lead time (as published) | Cost (as published) |
| --- | --- | --- | --- | --- | --- |
| 1 | [Twilio 10DLC](twilio-10dlc.md) (Pip's own number, sole proprietor) | **Yes, first** | The Terms have no SMS section and are still held; no opt-in form exists | Brand: minutes after the text-message code. Campaign: up to 5 business days | About $4 brand + $15 campaign vetting, then $2 a month (Twilio's 10DLC overview; confirm in the console) |
| 2 | [Jobber](jobber.md) | **Yes, second** (self-serve, no fee stated) | Pip's Jobber connection code does not exist yet (OAuth with refresh-token rotation, a disconnect webhook) | Not stated by Jobber. Review is a live demo with their team | None stated |
| 3 | [Meta app review](meta-app-review.md) (post to client Pages) | **Prepare only**, apply after posting is built | Business verification needs a registered business; no posting code exists to record a screencast of | "A decision within a week" of submitting; business verification is separate and not stated | None stated |
| 4 | [Toast](toast.md) | **No, not yet** | Toast prioritizes by customers who are asking for you. Pip has none | Not stated; the process runs through alpha (1 restaurant, about a week) and beta (3 to 5 locations, several weeks) | Not stated |
| 5 | [ServiceTitan](servicetitan.md) | **No, not yet** | A mandatory paid partner program; Pip cannot connect to a customer without it | Not stated; five certification steps | Annual dues by tier, plus a per-customer fee or a revenue share |

## Three things that change the plan (read these)

**1. Pip's Twilio registration cannot be used for customers' texts.** A sole-proprietor registration is for the sender's own business. Twilio says an ISV registering for its customers must use the customer's information, not the ISV's. So registering Pip covers Pip's own number (testing, and messages from Pip itself). Every client business that wants texts needs its own brand and campaign later, with its own consent wording (that is why `legal/notices.md` section 8 is written "per business"). A sole-proprietor campaign also allows exactly one campaign and one number, so it cannot carry both service texts and marketing texts.

**2. Forming a company changes the Twilio path.** Sole-proprietor registration is only for people with no EIN. Twilio warns that if a registrant is later found to have an EIN, the campaign errors and the fees are paid again. If an LLC is coming soon (the legal memo's first question is whether Pip can take a paying client "as it stands"), expect to re-register under a Low-Volume Standard brand once the EIN exists. The sunk cost is small (about $21), so registering now for a test number is still reasonable. Registering a customer's number is a separate decision per customer.

**3. Three of the five want a registered business.** Meta business verification lists an EIN letter or a state business registration for the US. ServiceTitan and Toast both require a signed partner agreement. Pip today is Brayden Scuffham doing business as Pip (privacy policy, section 1). Whether a state assumed-name filing is enough for Meta is something to confirm with the Idaho Secretary of State and the lawyer; I did not verify it. Do not start Meta business verification, Toast or ServiceTitan until the entity question is answered.

## What Brayden must do himself, across all five

Per the rules for this job, none of these were done for you:

- Enter any password, one-time code or security answer on any vendor site.
- Pay any fee (Twilio brand and campaign, any program dues).
- Click any submit, agree or sign button, including each vendor's licence or terms click-through.
- Answer the text-message verification code Twilio sends to a real mobile phone within 24 hours.
- Upload business documents, an ID or a tax letter.
- Decide the entity question (company or no company) with the lawyer.

## Shared facts to paste (all already public on hirepip.com, or Brayden's own decisions in `legal/README.md`)

| Field | Value |
| --- | --- |
| Operator | Brayden Scuffham, an individual doing business as Pip |
| Website | https://www.hirepip.com |
| Privacy policy | https://www.hirepip.com/privacy (effective 2026-11-20) |
| Terms | Not published. Held: section 2 promises a Portal screen that does not exist yet |
| Contact | privacy@hirepip.com |
| Mailing address | 2767 E Rockhampton Dr, Meridian, ID 83642 |
| EIN | None |
| Does Pip sell data or use it for advertising or model training | No (privacy policy, "The short version") |
| Does Pip text anyone today | No. Texting is not switched on |

## Order of work

1. Lawyer: entity question, Terms with an SMS section (the Twilio campaign needs it). Blocks 1, 3, 4, 5.
2. Brayden: Twilio sole-proprietor registration for Pip's own test number (needs the Terms and an opt-in method).
3. Build seat: Jobber OAuth connection with refresh-token rotation and the disconnect webhook, then Brayden requests Jobber review.
4. Build seat: a real Facebook and Instagram posting path on a test Page, then the screencast, then Meta review (after business verification).
5. Toast and ServiceTitan: wait for a customer who uses them and asks.

## Not covered (found along the way)

- **Google Business Profile posting** (`google_business` is a channel the content operator lists) needs its own access request from Google. It was not in this job and is not prepared here.
- **Whether a connection broker already covers some of this.** Pip's sign-ins run through Composio, and Google moved to Pip's own app on 2026-11-18. Before building your own Meta or Jobber app, check what Composio's Facebook and Jobber toolkits already allow. I did not check, and the answer could save weeks.
