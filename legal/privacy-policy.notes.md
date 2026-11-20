# Notes on the Privacy Policy (not published)

The policy is published at https://www.hirepip.com/privacy. Brayden approved the text for publishing on November 19, 2026.

These notes used to sit at the bottom of `privacy-policy.md`. They were moved here on November 19, 2026 so the policy file holds only what is published.

**Updates on November 19, 2026, when the policy was published:**

- Item 2 below (HELP reply): texting is not switched on, and the policy now says so at the top of section 5 and in the table. The HELP reply still has to be built before texting goes live.
- Item 3 below (13-month limit): built. `pip_purge_conversations` runs once a day (migration `20261120_10_conversation_retention.sql`) and a test fails if the policy and the code name different periods.
- Section 8 no longer says each company "may use the information only to provide its service to us". That was only checked for Anthropic. It now says each company gets only what it needs and handles it under its own terms.
- The operator is Brayden Scuffham, an individual doing business as Pip. When a company is formed, change section 1.
- privacy@hirepip.com is forwarded to the founder's inbox by ImprovMX.


**What was checked.** Every statement of fact above was checked on November 17, 2026 against the code on `main` (commit `edf9024`) and the live database. Where a feature is not live, the row says so.

| Statement | Where it was checked |
| --- | --- |
| AI notice in the first message | `pip-turn/index.ts` adds the notice in code if the model's first reply does not contain one |
| Phone numbers kept as one-way code plus last four | `portal_contact_hash`, `consent_ledger` (columns `contact_hash`, `contact_hint`) |
| STOP applies to every channel | `portal_sms_in` writes a `revoked` row with channel `any` |
| First text reply ends "Reply STOP to opt out." | `pip-run/index.ts`, `answerText` |
| Calendar busy times only | `pip-turn/index.ts`, `busy_only` shape |
| Emails carry an AI line | `pip-turn/index.ts`, `guard === "email"` |
| Deletion on cancel and what is kept | `portal_api_cancel`, `portal_purge_old` |
| 2-day, 30-day, 90-day periods | cron `pip-hits-clean`, `portal_purge_old` |
| Sign-ins held by Composio, ids only in Pip | `business_connections`, `client_connections` table comments and columns |
| Tax ID not stored | `texting_registrations` table comment and columns |

**Things that are true in this draft only if work in other lanes is finished.** Do not publish before these are closed. Each is also in `legal/README.md`.

1. Closed November 18, 2026. Section 4 assumes Pip's own Google app (lane 03). Since November 17 to 18, 2026 owner sign-ins go through Pip's own Google app (Google Cloud project `pip-ai`), which asks for exactly the five permissions in the section 4 table. Composio still runs the sign-in and holds it for Pip.
2. Section 5 says "Reply HELP for help." Today `pip-run` sends nothing back to HELP and leaves it to Twilio's default. The HELP reply needs the business name and a contact (lane 02).
3. Section 9 proposes a 13-month limit on conversations. No such limit exists in the database today.
4. Calls, email in and camera rows are placeholders until lanes 02, 04 and 11 confirm what is stored.
5. The older kind of teammate (the "Skill Spec" kind, run by `lib/skills/runtime.ts` through `/api/runtime/chat`) does not appear to have the AI notice added in code. If any client runs on that path, "every teammate tells you it is an AI" depends on the prompt alone (lane 01).

**Sources for the legal points** are in `legal/sources.md`: Google's user data policy and Limited Use wording [S12], carrier registration wording [S11], Anthropic's no-training term [S16].
