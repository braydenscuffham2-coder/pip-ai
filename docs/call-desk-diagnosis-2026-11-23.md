# Weekend Call Desk: why it was stuck, and what fixed it (Nov 23, 2026)

**Now:** order PIP-DDH3 (the Boise River Dental demo) passed 13 of 13 tests on Nov 23 at 10:19 UTC and is waiting for a go-live tap. Nothing went live. No call was placed.

## What was wrong

The teammate was fine. The Forge's test bench was failing it.

| When | What happened |
|---|---|
| Nov 15 | Built by the API-key lane. Failed 10 of 13 after three attempts and stopped at `tests_failed`. |
| Nov 22 | Commit `60463ff` gave the bench a test clock and sample owner facts (open slots, emergency instructions). Nobody re-ran the order. |
| Nov 23, 09:46 | Re-run with that fix: failed again, 8 of 13. |
| Nov 23, 10:15 | Re-run after PR #83 (`pip-forge` v22): passed 13 of 13 on the second attempt. |

On the Nov 23 failure, five behaviors were marked missed. Four were the grader's mistakes:

- The teammate said "Saturday at 8:00 PM". The test said "tomorrow at 8 PM". The test clock is a Friday.
- It said "a real staff member, the team is back Monday". The test said "offers a real person".
- It said "a crown question on Saturday morning" and called `capture_lead`. The test said "crown pricing and a Saturday morning visit".
- The same emergency reply passed in one case and failed in another.

The fifth was real: the test asked it to check booking software and name open slots, and it has no tool that reads a calendar.

Two more things made it worse. Each failed attempt rewrites the whole teammate, so three attempts drifted (10, then 9, then 8 passed). And a grade the bench could not read counted as a pass.

## What changed (PR #83)

- The grader gets the test clock and grades what the reply did, not its wording. A behavior that names a tool still needs that tool in the actions.
- An ordinary behavior is missed only when two looks agree. Price, promise, refund, card, advice and saying it is an AI stay strict: one look is enough.
- A grade that cannot be read twice in a row fails the case.
- Tests the Forge writes must be one behavior each, shown in one reply with the teammate's own tools.

## Before anyone taps go-live

- The emergency instructions and on-call number it read in the test are **samples** ("call the on-call line at 555-0100"). The owner's real ones are not on file.
- It waits on two things Pip does not have for this business: a phone line and a booking connection. Today it can take a request and the office confirms the time.
- The three runs cost $0.51 of Forge budget.

## Not done

- The Claude app copy of the Forge (inside the Marketplace artifact) has its own test runner. It was not changed.
- The rewrite-everything-on-retry behavior is still there.
