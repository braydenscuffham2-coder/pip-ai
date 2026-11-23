# Runtime channels: what is proven today (Job 1, 2026-11-22)

Each channel is marked **works**, **partly works** or **missing**. "Proven" means a test in this repo runs it. Anything that
needs a real vendor account, a separate test project or a real number is marked **needs you** and is not claimed as passed.

Live state read from the database on 2026-11-22 (read only): `phone_lines` has 0 rows, `consent_ledger` has 0 rows,
`compliance_events` has 0 rows, `usage_events` has no `sms` rows and 3 `voice_minute` rows. No customer has ever been texted or
emailed through Pip on the live project.

| Channel | Status | Proven here by | What is not proven |
|---|---|---|---|
| Text (SMS), customer texts first | **partly works** | `supabase/functions/pip-run/test/sms.ts` (24 checks: signature, STOP words, START, HELP left to Twilio, first reply says AI and how to opt out, send record per text, nothing sent after STOP) and `tests/db/outbound-record.test.mjs` (the record cites the consent row) | A real Twilio number with 10DLC registration; **needs you**. Pip texting a customer first is not built: there is no outbound-first route, on purpose until 10DLC is approved. |
| Email, teammate replies | **partly works** | `tests/pip-turn/optout.test.mjs` (opt-out checked before every send, AI line, opt-out line, one record per email, fail closed, STOP by email), `tests/pip-turn/limits.test.mjs` (typed addresses only, sender set by Pip) | A real Gmail send through Composio on the TEST Fork account (**needs you**). No route yet delivers a customer's email to `pip-turn` with the sender as `visitor`: STOP by email works when a caller passes it, but nothing feeds Gmail or Resend mail in. `pip-mail-in` only tells the founder. |
| Voice | **partly works** | `supabase/functions/pip-voice/test/run.ts` (83 checks against stand-ins) | A real call. No Pip phone number is bought or attached to the ElevenLabs agent, and `phone_lines` is empty. **needs you** (a real number). Reply time through `pip-turn` has been 4 to 6.6 seconds, which is slow for a phone call. |
| Calendar | **works** for Google, **missing** for Outlook | `tests/pip-turn/limits.test.mjs` (busy times only, no titles or guests, an unreadable answer is never "free") | The live Google sign-in for the TEST Fork business was recorded as `active` and a busy-time read and a hold were recorded as passing in the docs. Outlook has no catalog rows. |

## What Job 1 built

- `supabase/migrations/20261122_01_outbound_record.sql` (written, **not applied**): a `outbound_sent` compliance event that cites
  the newest `consent_ledger` row for the contact, with whether the AI line and the opt-out line were included; `portal_sms_out`
  gains optional arguments so one call counts the text and writes the record; `portal_email_gate` (refuses an opted-out address,
  records the consent when the customer typed the address into a chat); `portal_email_in` (STOP by email revokes email for that
  address). Raw numbers and addresses are never stored, only the hash the ledger already uses. The rollback is in the file header
  and is tested.
- `pip-run`: every text that goes out passes the recipient to `portal_sms_out`.
- `pip-turn`: every email goes through `portal_email_gate` first (fails closed) and `portal_outbound_sent` after; the email always
  carries the AI line and "Reply STOP to opt out of further emails."; an inbound email channel turn that says STOP is recorded and
  gets no reply and no model call.
- `_shared/optout.ts`: the STOP words and phrases for email. A test fails if they drift from the text route's list.
- CI now runs the two Deno stand-in tests and installs PGlite so the database tests run instead of being skipped.

## Needs you before any channel is called finished

1. Apply `20261122_01_outbound_record.sql` (a separate step, ask first) and deploy `pip-run` and `pip-turn`.
2. Twilio: a real test account or number, and 10DLC registration (Job 4 prepares that).
3. A Pip phone number attached to the ElevenLabs agent and a `phone_lines` row, then one real call to your own phone.
4. One real email send from the TEST Fork Gmail to your own address.
5. A route that hands a customer's inbound email to `pip-turn` (decision: Resend inbound on `hirepip.com`, or a Gmail trigger).
