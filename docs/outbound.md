# One outbound gate (November 27, 2026)

Every message Pip sends to a person, and every post a teammate makes to an owner's system, asks one database
function first: `outbound_gate(business, spec, channel, to, first, given_in_chat)`. In code that is `gate()` in
`_shared/outbound.ts`. It fails closed: if the database cannot say yes, nothing is sent.

| Channel | Who calls it | What decides |
|---|---|---|
| `email` | `pip-turn`, chat and background jobs | `portal_email_gate`: opt-out, consent, the address typed in chat |
| `sms`, a reply | `pip-run`, before answering a text | `portal_outbound_check` as a reply: STOP wins, a business that left sends nothing |
| `sms`, texting first | `pip-turn`, the new `send_text` action | `sms_first_on` must be true, then `portal_outbound_check` as a non-reply: consent on file, allowed hours, daily cap |
| `post` | `pip-turn`, before a door post | the business still exists and has not left; the door's own checks follow |

**Two switches, both in `forge_settings`:**
- `outbound_paused` (false). Set it to true and every channel above stops at once.
- `sms_first_on` (false). Texting a customer first stays refused until this is true. Turning it on means messaging
  real people, so it is Brayden's decision, and it also needs the Twilio 10DLC registration.

**Texting first.** A job that declares the record `outbound_text` gets the action `send_text`. It takes a number and a
message. The text always ends with "This is NAME, an AI assistant for BUSINESS. Reply STOP to opt out." The number is
used for the send and hashed for the record; it is never stored or logged. In test mode nothing is sent. Today every
real call is refused with "this teammate cannot text someone first yet", and the owner sees that line in Activity.

**The guard.** `tests/outbound-gate.test.mjs` reads every function's source. A Twilio message send, a Gmail send or a
door post in a file that does not call the gate fails the build. Mail to owners, staff and Brayden (sign-in links,
alerts) is sent through Resend from six named files; a seventh fails the build until someone decides which kind it is.

**Not covered:** phone calls are inbound only, so there is no outbound call to gate. Mail a teammate sends from the
owner's own Gmail is gated; replies to it land in the owner's inbox, not Pip's, so a STOP by reply is only seen when
the reply comes to a Pip address (a door's email address or the business's Pip inbox).
