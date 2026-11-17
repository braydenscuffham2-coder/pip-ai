# Customer-facing notices and consent wording

> **DRAFT. Not legal advice. Not reviewed by a lawyer.** Lane 10, November 17, 2026.
> Other lanes: use the wording here. Until a lawyer signs off, use the strictest version everywhere, in every state.
> `{teammate}` is the teammate's name, `{business}` the business's name.

## 1. AI disclosure

Rule: the first thing a customer hears or reads says it is an AI. One plain sentence. Never "virtual team member", "digital associate" or a human-sounding name alone.

| Channel | Wording |
| --- | --- |
| Website chat, first message | "Hi, I'm {teammate}, an AI assistant for {business}. How can I help?" |
| Text, first reply | "This is {teammate}, an AI assistant for {business}. [answer] Reply STOP to opt out." |
| Email, footer of every email | "Sent by {teammate}, an AI assistant for {business}." |
| If asked "are you a real person?" at any time | "No, I'm an AI assistant for {business}. I can get a person to follow up if you'd like." |

What the code does today: `pip-turn` adds "This is {teammate}, an AI assistant for {business}." to a first reply that does not already say so, and adds the email footer. The "if asked" line is not enforced in code. Proposed for lane 01: add it to the rules every teammate carries.

## 2. Call openings (for lane 02)

Say it before anything else, in one breath, and do not let the caller's first words skip it.

| Call | Opening |
| --- | --- |
| Inbound, recorded | "Thanks for calling {business}. I'm {teammate}, an AI assistant, and this call is recorded. How can I help?" |
| Inbound, not recorded | "Thanks for calling {business}. I'm {teammate}, an AI assistant. How can I help?" |
| Outbound, recorded | "Hi, this is {teammate}, an AI assistant calling from {business} on a recorded line, about [reason]. Is now a good time?" |
| Outbound, not recorded | "Hi, this is {teammate}, an AI assistant calling from {business}, about [reason]. Is now a good time?" |
| Caller objects to recording | "No problem. I'll have someone from {business} call you back." Then end the call, alert the owner, and delete the recording. |
| Transfer to a person | "I'm connecting you to someone at {business} now." If the recording continues after transfer, the owner's staff must know their line is recorded. |
| Voicemail left by a teammate | "This is {teammate}, an AI assistant for {business}, calling about [reason]. You can reach us at [number]." No marketing content in a voicemail. |
| Emergency words (fire, chest pain, can't breathe, and so on) | "I can't help with emergencies. Please hang up and dial 911 now." |

Open points for the lawyer (memo item 2): whether staying on the line is consent to record everywhere; whether "not recorded" calls that are transcribed live by a vendor need the recorded wording anyway. **Until answered, lane 02 should use the recorded wording on every call, including calls it does not keep.**

Outbound calls use an AI voice, which federal rules treat as an artificial voice needing prior consent [S8]. Outbound calls stay off until consent wording in section 6 is approved.

## 3. Opt-out wording

| Moment | Wording |
| --- | --- |
| First text reply | ends with "Reply STOP to opt out." |
| After STOP | "{business}: You're opted out and won't get more texts or calls from this number. Reply START to opt back in." |
| After START | "{business}: You're opted back in. Reply STOP to opt out, HELP for help. Msg & data rates may apply." |
| After HELP | "{business}: Texts from our AI assistant about your requests and appointments. Contact [business phone or email]. Reply STOP to opt out. Msg & data rates may apply." |
| On a call | "Understood. I've taken you off our list. You won't get more calls or texts from this number." |
| In chat or email | "Done. You won't be contacted again by this assistant." |

What the code does today: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE and OPTOUT, plus phrases such as "stop texting me", record an opt-out for every channel and send nothing more. START opts back in. **HELP gets no reply from Pip** and none of the three confirmation texts above is sent by Pip; Twilio's default handling may send its own. Lane 02 needs to decide whether Pip or Twilio sends them and make the wording match. Carriers expect the HELP reply to name the business and give a contact [S11].

## 4. Website chat notice

Under the chat box, small print:

> "{teammate} is an AI assistant. Chats are saved so {business} can follow up. [Privacy](link to the business's or Pip's privacy policy)"

## 5. Consent to texts: web form wording

For a business's website form or the chat window, when a customer gives a phone number. The box is not pre-ticked.

Service messages:

> ☐ "I agree to get texts from {business} about my request and appointments, sent by an AI assistant. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. [Privacy Policy] [Terms]"

Marketing messages (separate box, never combined):

> ☐ "I also agree to get marketing texts from {business}, which may be sent using automated technology, at the number above. Consent is not a condition of purchase. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out. [Privacy Policy] [Terms]"

## 6. Consent to calls from an AI voice

> ☐ "I agree that {business} may call me at the number above using an artificial (AI) voice about my request and appointments. I can opt out at any time by telling the assistant or replying STOP."

For marketing calls, add: "including for marketing. Consent is not a condition of purchase." [LAWYER: confirm this meets the written-consent rule for artificial-voice marketing calls [S8].]

## 7. What a consent record holds

The `consent_ledger` table already stores, per contact and channel: a one-way code for the contact plus its last four characters, phone or email, channel (text, voice, email or any), purpose (service or marketing), granted or revoked, how it happened, proof, which teammate, who recorded it, and when. It is add-only; the newest row wins.

| How consent happened (`method`) | What `proof` should hold | Status |
| --- | --- | --- |
| `inbound_message` | "Texted the business first" or "Texted START" | Live |
| `keyword_stop` | The channel the opt-out was heard on | Live |
| `imported_by_business` | Who confirmed, when, and the statement they ticked | Live. Service messages only. |
| `web_form` (proposed) | The exact wording shown, the page address, the time, and the scrambled internet address | Not built |
| `verbal_on_call` (proposed) | Call id and time; the question asked and the answer | Not built |

The owner's statement when importing contacts (live wording in `portal_api_consent_add`): "The business confirms this contact asked to be contacted about their own service."

Proposed stronger wording for the Portal tick-box:

> "Each person on this list gave {business} this number or address and asked to hear from us about their own service. I am not uploading a bought, rented or scraped list. I understand these contacts will get service messages only."

## 8. Carrier registration wording (US 10-digit numbers)

For the Twilio registration form, per business. Carriers reject vague entries [S11].

**Campaign description**

> "{business} uses this number to answer customer texts and send service messages about the customer's own requests and appointments: replies to questions, booking confirmations and reminders, and follow-up on a request the customer made. Replies are written by an AI assistant that identifies itself in its first message. No marketing messages are sent on this campaign."

**How customers opt in**

> "Customers opt in by texting this number first, or by giving their mobile number on {business}'s website form at [URL] and ticking a box that is not pre-ticked and reads: 'I agree to get texts from {business} about my request and appointments, sent by an AI assistant. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.' The form links to the Privacy Policy at [URL] and Terms at [URL]. Existing customers who gave their number to the business and asked for updates may be added by the business, which confirms this in writing."

**Sample messages**

> 1. "This is Hallie, an AI assistant for {business}. Yes, we're open Saturday 9 to 2. Want me to ask the team for a time? Reply STOP to opt out."
> 2. "{business}: Your appointment is confirmed for Tue, Dec 2 at 3:00 PM. Reply STOP to opt out, HELP for help."
> 3. "{business}: Thanks for your request. A team member will confirm your time shortly. Reply STOP to opt out."

**Opt-out, opt-in and help messages:** use section 3.

**Required lines on the business's privacy policy** (already in Pip's draft Privacy Policy, section 5): "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes."

A business that wants marketing texts needs a second, separate campaign with the marketing consent in section 5.

## 9. Outbound checks the code already makes

For reference when wording anything about "when we contact you". `portal_outbound_check` blocks a send when: the contact opted out; there is no stored consent (for anything that is not a reply); it is a marketing send and the consent is service-only or was imported; it is outside allowed hours; or the contact already had the day's limit of attempts. Each decision is logged.

Two gaps, both in the lawyer memo: hours are judged in the business's time zone, not the recipient's; and the default window (9 a.m. to 8 p.m. Monday to Saturday, noon to 8 p.m. Sunday) also applies to service messages, which is stricter than required but safe.
