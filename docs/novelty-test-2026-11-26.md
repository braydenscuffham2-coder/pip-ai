# Novelty test, round 1 (November 26, 2026)

Brayden's direction: stop perfecting single agents. Judge whether Pip can imagine something new for a business it has
never seen, build it, and get it running. This replaces re-scoring the same ten Boise businesses.

## What was run

Four real businesses in lines of work Pip had never scanned, each through the live page on hirepip.com from the
opening screen to Lock it in. Nothing was submitted and no business was contacted.

| Business type | Site | Whole flow | Engine time | Ideas | Ideas that named a part Pip has not built |
|---|---|---|---|---|---|
| Veterinary clinic (CO) | fossilridgeah.com | reached Lock it in, console clean | 240 s | 15 | 7 |
| Brewery taproom (NC) | theradbrewco.com | reached Lock it in, console clean | 176 s | 14 | 3 |
| Bookstore (AZ) | antigonebooks.com | reached Lock it in, console clean | 209 s | 15 | 6 |
| Custom machinery maker (MI) | hillmachinery.com | engine and write-ups finished; the walk to Lock it in was still running when this was written | 188 s | 14 | 3 |

58 ideas, 19 of them built around a part that does not exist yet.

## What the ideas show

The Brain is specific in lines of work it was never tuned on. Examples: for the vet, pausing reminders and autoship
for one pet after a family loses it (the clinic's worst review is about exactly that); for the bookstore, reading the
handwritten staff notes on the shelves into the online picks page; for the machinery maker, finding a part from a
photo by indexing drawings under the shop's own job numbers.

The 19 missing parts are not 19 different problems:

| Kind of missing part | Count | Examples |
|---|---|---|
| Work inside, or read from, the owner's own software through its screens or account | 13 | practice software, online pharmacy, store website editor, inventory system, wholesaler account, point of sale |
| Logic on data Pip can already reach | 3 | compare today's tap list with yesterday's, match part numbers to public end-of-life pages |
| Read a device or an exported log | 2 | solar inverter output, press and welder logs |
| Hardware on site | 1 | a door-facing camera |

**One general part, a teammate that can do a job inside any web software with the owner's vaulted sign-in, would
cover 13 of the 19.** That is the single biggest lever for "integrate with anything". The Setup Agent already has the
pieces (a hosted browser and the password vault) but only uses them once, during setup.

## The hole this round found, and the fix

Since engine 4 the Brain could ask for a new part, and the owner saw "Pip builds: ..." on the team page. The idea was
then lost three times before a build: the page left it out of the order, the Forge intake did not read it, and the
Forge's teammate record did not keep it. The Forge compiled the ordinary version without knowing.

Fixed in PR #88 (live): the order carries the part, and the Forge now **thinks before it compiles**. For any teammate
with a new part it writes down what the part does, the route to it (assemble from existing parts, connect the owner's
tool, an outside provider, hardware, or new code), which existing parts it stands on, what is still missing, what the
teammate honestly does on day one, what a test must show, and the main risk. That answer is kept on the spec, shown
to the founder, and given to the compiler with a rule that the teammate never claims to have the part.

## Live proof

Test order PIP-B4DY ("TEST Novelty Vet", test address, labelled not a customer) with three of the vet ideas:

| Teammate | Route the Forge chose | Built to sandbox on its own | Tests | Never-pretend rule in the spec |
|---|---|---|---|---|
| Refill Runner | new code (it would file prescriptions; the Forge flagged controlled drugs and the current-exam rule) | yes | 12 of 12 | yes |
| Comfort Card | connect the owner's practice software | yes | 12 of 13 | yes |
| Records Fetcher | connect the owner's practice software | yes | 13 of 13 | yes |

Each needed three compile attempts. Forge spend for all three: $0.81.

## Spend (UTC Nov 26)

Page model $8.27, review data $1.33, Forge $0.81. Month to date about $59 of the $1,000 budget. The first scan
attempt was wasted (about $1.50): the older harness could not read the model's answers and quit early.
Daily lines were raised for the test and are back to $10 and $3.

## Not tested or not done

- Only three of 19 new-part ideas were pushed through the Forge, all from one business.
- "Built to sandbox" means the day-one version passed its conversation tests. No new part was actually built.
- The Forge does not yet file a Shelf need when the route is an outside provider.
- The owner-facing Portal does not yet show the part plan.
- The engine took 176 to 240 seconds against a 300 second limit.

## Next

1. Build the general screen-work part as a running capability, not only a setup step. Needs the Browserbase and
   1Password accounts.
2. Round 2: five more unseen businesses, and push every new-part idea through the Forge.
3. Cut the three compile attempts: have the Forge repair the failing piece instead of rewriting the teammate.
