# Ops readiness and acceptance (checked live, November 27, 2026)

Everything here was looked at on the live system on the day, not assumed. "Not checked" means exactly that.

## Ops readiness

| Item | Result | How it was checked |
|---|---|---|
| Row security on every table | **Pass.** 86 tables, all with row security on. The public key has no table rights and no policy names it. | `pg_class`, `role_table_grants`, `pg_policies` |
| Functions open to the public key | **Pass after a fix.** 12 are open on purpose and each checks a shared secret. Two more were open by default and are now closed (migration `20261127_15`). Neither could read or change anything. | `has_function_privilege('anon', ...)` |
| Scheduled jobs firing | **Pass.** 25 active. 22 ran successfully in the last day, none failed in 24 hours. Three have never run because their time has not come: `pip-weekly-notes` (Mondays), `pip-portal-purge`, `pip-skill-checks`. | `cron.job`, `cron.job_run_details` |
| Switches | `portal_golive_gate` on. `outbound_paused`, `edges_paused`, `pieces_paused`, `work_paused`, `sms_first_on`, `portal_invites` off. `notes_on` on. | `forge_settings` |
| Funds | Anthropic $101.70 **as typed in on Nov 13** (no balance API; $99.88 of it is a promo credit that ends Dec 6, and about $60 has been spent on the key since). DataForSEO $42.86. Twilio $20. ElevenLabs 99% of credits. Composio 9,925 of 10,000 tool calls. Firecrawl 960 of 1,000. Browserbase 15 browser minutes used. | Shelf funds tracker |
| Secrets, by name only | Present and working: Anthropic, DataForSEO, ElevenLabs, Composio, Twilio, Browserbase, Firecrawl, 1Password (token works, sees 0 vaults), Resend (mail arrives). Not set: Microlink. No balance reading: Resend, Google Cloud. | Shelf funds tracker; no value was read |
| Error alerts | **Pass for background work:** a failed job emailed the founder earlier in this build. **Not checked:** an alert for a failing scheduled job itself. | live failure on TEST Fork |
| Rate limits on public routes | **Pass with one note.** Doors (`pip-edge`), pieces (`pip-piece`), scans (`scan-run`), the reader, the Forge intake, setup and work all take from a limit before doing anything. `pip-turn` is limited inside the database (`skill_turn` per visitor). Note: `voice-token`, `site-kit` and `rival-read` keep their own caps in code rather than a shared limiter. | source of every function |
| DNS, TLS, www | **Pass.** `hirepip.com` redirects to `https://www.hirepip.com/`. An unknown path answers 404 with a proper page. | real browser |
| Page metadata | **Pass after a fix.** Title, description and share image were right. The Marketplace page had no language set (the one serious accessibility finding on the site) and no canonical address; both added. Portal, setup, form and piece pages are marked noindex. | real browser, axe |
| Privacy and terms linked | **Partly.** `/privacy` and `/terms` are live. Form and piece pages already linked privacy. Links added to the Portal, setup, talk and "Lock it in" pages. **The Marketplace home still has no link:** the app fills the whole window and a link has to go inside the preserved design, which is Brayden's call. | real browser |

## Accessibility (axe-core, WCAG 2 A and AA, 360px and 1280px)

`scripts/portal-check/axe.py` now runs these and fails on a serious or critical finding.

| Page | Result |
|---|---|
| Marketplace home | 1 serious on live (no page language). Fixed in this change; 0 after. |
| Lock it in, setup, talk | 0 findings |
| Portal, signed in (faked server) | 0 findings |
| A live piece page with real records | 0 findings |
| A live door form | 0 findings |
| Privacy, terms | 0 findings |

## Failure drills (live, on TEST businesses, each switch put back afterwards)

| Drill | What happened |
|---|---|
| Stop all sending (`outbound_paused`) | Email, text and door post were each refused with "paused". Back to allowed after. |
| Close the doors (`edges_paused`) | The live form page said "This form is not open" and showed no fields. |
| Close pieces (`pieces_paused`) | The live piece page said "This page is not open". |
| Stop weekly notes (`notes_on` false) | The weekly knock answered "off" and wrote nothing. |
| Wrong secret on a door | Answered 404, nothing stored (earlier in this build). |
| A hostile form entry | Stored as plain text, never run, ignored as an instruction (three times in this build). |
| A background job that fails | Owner alert written and the founder emailed (earlier in this build). |

## Acceptance, end to end

| Flow | Result | Evidence |
|---|---|---|
| A door form starts a teammate's job | **Pass** | thanks in 0.8 s, job run finished, on phone and desktop width |
| Another system posts to a door, result comes back on a feed | **Pass** | `docs/edges.md` section 7 |
| Pip builds a small tool, owner uses it in the real Portal, public page shows it | **Pass, as a test** | `docs/pieces.md` |
| The Forge builds a tool with no hand on it | **Pass, as a test** | trailer check-out form, `docs/novelty-rounds-2-3.md` |
| Brain scan with critic on a never-seen line of work | **Pass**, 10 of 10 | `docs/novelty-rounds-2-3.md` |
| Forge repairs a failing teammate instead of rebuilding | **Pass**, 5 of 5 | same |
| Weekly note written and shown to the owner | **Pass** | two notes in the real Portal |
| A note's proposal answered by the owner | **Not proven live** | no real note has carried a proposal yet |
| Email door receives mail | **Not proven** | needs one real email sent to the door's address |
| A door posts out to an outside address | **Not proven** | no outside address was set up |
| Texting first | **Built, off.** Refusal proven; a real send is not, and must not be until switched on | `docs/outbound.md` |
| Outlook calendar | **Built, off.** Not tested with a real Outlook account | catalog rows disabled |
| Setup Agent signs in to an owner's tool | **Fails today** | Browserbase's free plan ends the browser when a connection drops; parked as the last step |
| Vault fill during background work | **Not proven** | same cause |
| A go-live tap | **Not done.** It needs Brayden | by rule |
| The page flow on hirepip.com from scan to "Lock it in" | **Not re-tested in this build** | last tested in novelty round 1 |
