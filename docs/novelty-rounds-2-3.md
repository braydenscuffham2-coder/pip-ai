# Novelty rounds 2 and 3 (November 27, 2026)

Ten businesses in ten lines of work Pip had never scanned, five per round: a trade, a clinic, a maker, a venue, and a
nonprofit or school. Nobody at any of them was contacted. Only their public websites and listings were read. Every
order was a labelled test order ("TEST Novelty ... (not a customer)", owner@example.test) on a TEST business.

**What ran:** the server Brain (`scan-run`), not the page on hirepip.com. Round 1 used the page. The server Brain is
where the new critic lives and it is the one that runs on Pip's own infrastructure, so it is the one measured here.
The page flow to "Lock it in" was not re-tested in these rounds.

## Round 2: server Brain with the critic, before the fix

| Business | State | Seconds | Cost | Critic: generic in first six | Critic swaps | Same idea twice in the final six | New parts named | Shelf pieces missing |
|---|---|---|---|---|---|---|---|---|
| Chimney sweep (trade) | OH | 344 | $1.07 | 1 | 0 | 2 pairs | 0 | none |
| Physical therapy (clinic) | TX | 390 | $1.21 | 1 | 1 | 0 | 0 | none |
| Furniture and pottery (maker) | VT | 380 | $1.15 | 2 | 1 | 0 | 0 | Google profile, point of sale |
| Wedding farm (venue) | TN | 453 | $1.25 | 2 | 0 | 1 (same id) | 0 | social DMs |
| Food pantry (nonprofit) | MN | 493 | $1.38 | 2 | 1 | 0 | 0 | outside signal, weather, WhatsApp |

- 5 of 5 finished. $6.06 for the round. The critic took 14 to 19 seconds per scan, as its own step.
- The critic's reasons were concrete: "its quotes are empty strings", "it repeats the previous idea for the same
  moment", "its 'seen' claim is not in the quote".
- All five orders passed the Forge's order check as dry runs.
- Forge: one idea needed code (a finder for old orders and drawings). It reached the sandbox from a library template
  with no build attempt.

**Weakest stage:** two things.
1. **0 of 30 ideas named a part Pip would have to build.** The server Brain had no field for it, so every idea was
   shrunk to fit the building blocks. Round 1, on the page Brain, had 19 of 58.
2. **The same idea twice** in the six in two of five scans. The critic judges ideas one at a time and did not catch it.

**Fixed between rounds (PR #116):** the invent prompt asks for the missing part in one sentence; the finished idea
carries it to the Forge as `builds`; the writer is told not to describe the part as existing. A check in code after
the critic drops the lower-scored twin and takes the best bench idea that is nobody's twin.

## Round 3: after the fix

| Business | State | Seconds | Cost | Critic: generic in first six | Critic swaps | Twins caught in code | New parts named |
|---|---|---|---|---|---|---|---|
| Septic and portable restrooms (trade) | IA | 399 | $1.19 | 2 | 1 | 0 | 1 |
| Audiology (clinic) | not given | 378 | $1.14 | 4 | 2 | 0 | 3 |
| Stoneware pottery (maker) | KY | 352 | $1.04 | 2 | 1 | 1 | 3 |
| Theater (venue) | VT | 384 | $1.22 | 1 | 0 | 1 | 1 |
| Music school (school, nonprofit) | CA | 422 | $1.20 | 1 | 0 | 1 | 2 |

- 5 of 5 finished. $5.78 for the round. **10 of 32 ideas named a new part** (0 of 30 before).
- No idea appeared twice in any final team. Three twins were caught and replaced from the bench.

### Every new-part idea through the Forge (5 test orders, 10 teammates)

| Idea | Business | What the Forge decided | Ladder rung | Build attempts | In the sandbox | Runnable today |
|---|---|---|---|---|---|---|
| Trailer board | Septic | Pip assembles it: built a piece | build | 1 | yes | **Yes, as a test:** a "Trailer check-out" form, live and marked Test |
| Referral intake desk | Audiology | Needs Brayden: works inside contractor portals through their screens | screen | 1 | yes | No |
| Booth-to-report draft | Audiology | Needs Brayden | not placed | 3 (2 repairs) | yes | No |
| Booth to report (wild) | Audiology | Matched a library template | build | 0 | yes | No |
| Tour afterglow | Pottery | Connect the owner's Mailchimp | api | 2 (1 repair) | yes | No: no catalog entry for Mailchimp |
| Retail inbox sorter | Pottery | Needs Brayden | not placed | 3 (2 repairs) | yes | No |
| Registry open pieces | Pottery | Connect the owner's tool | api | 2 (1 repair) | yes | No: no catalog entry |
| Building date keeper | Theater | Needs Brayden | not placed | 2 (1 repair) | yes | No |
| Teacher pointer | Music school | Connect the owner's teacher database | api | 1 | yes | No: no catalog entry |
| Intermission card | Music school | Connect the owner's tool | api | 1 | yes | No: no catalog entry |

- **10 of 10 reached the sandbox.** Forge cost for all ten plus the piece: $1.13.
- **Repair ran live:** five teammates failed tests on the first build and were repaired from the failing transcript
  (seven repairs in all) instead of being recompiled. All five then passed.
- **The piece lane ran live:** for the trailer board the Forge drafted, sandbox-tested and staged a piece by itself.
  Its page opens at 360px with a clean console and no failed requests.
- **Not seen live:** a Shelf need filed for a "provider" part. No idea in this round was routed that way.
- **Background runs:** none of the ten was run in the background. They are in the sandbox on a TEST business; nothing
  was scheduled or triggered.

"Built to sandbox" is not "works in the business". One of the ten can be used today, and only as a test.

**Weakest stage now:**
1. **"Connect" is a promise the runtime cannot keep.** Four of ten were routed to "connect the owner's tool", but the
   tool catalog holds only Gmail, Google Calendar and Google Sheets (and Outlook calendar, switched off). A connect
   route should check the catalog and, when the tool is missing, climb the ladder (a door, screen work, or a piece)
   instead of stopping at a sign-in that leads nowhere.
2. **A simple tracker went to "needs Brayden".** The theater's date keeper is a private page plus a request form,
   which is a piece. The part plan should try "compose" first for that shape.
3. **The critic can only swap two.** At the audiology clinic it called four of six generic and could replace two.

## Totals

| | Round 2 | Round 3 |
|---|---|---|
| Scans finished | 5 of 5 | 5 of 5 |
| Seconds per scan | 344 to 493 | 352 to 422 |
| Brain cost | $6.06 | $5.78 |
| Ideas that named a new part | 0 of 30 | 10 of 32 |
| Final teams with the same idea twice | 2 of 5 | 0 of 5 |
| New-part ideas in the sandbox | none to build | 10 of 10 |
| Usable today, as a test | 0 | 1 |

Limits raised for the rounds and put back the same day, each with a dated note on its line: DataForSEO $3 to $8 a day
(used $0.04), Brain $10 to $16 a day (used $11.85), Brain scans per visitor 6 to 12 a day.

Left on the system: ten finished scans, six test orders (PIP-W35U, PIP-QH2X, PIP-68P5, PIP-9YEB, PIP-UVV8, PIP-WQTU)
attached to the business "TEST Novelty Vet", which is now on the TEST list, and one staged piece.
