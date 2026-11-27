# The thinking loop (Part F, November 27, 2026)

Three places where Pip now checks its own work, writes down what it found, and leaves the decision to a person.
Each one is a step with a stored trace, not a hidden pass.

## 1. The Brain's critic

**Where:** the server Brain (`scan-run`), as its own step between choosing the six ideas and writing them up.
Code: `_shared/critic.ts`.

**What it does:** shows a second model call the six chosen ideas, the evidence each one cites, and the strongest ideas
left on the bench. For each of the six it must answer two things: does the evidence in this scan support it, and could
this idea belong to any business in any line of work? It may swap out at most two ideas (`MAX_SWAPS`) for bench ideas,
once. Code checks every swap: the idea going out must be one of the six, the one coming in must be on the bench, and
neither may be used twice. Anything else in the answer is ignored. If the critic call fails, the six stand as chosen.

**What is stored:** `result.critique` on the scan (verdict per idea, what was swapped and why, seconds taken), and a
`critic` event in `scan_events`.

**Engine time, measured first.** Six recent server scans, from `scan_events`:

| Scan | Total | Longest single step |
|---|---|---|
| sheilasmithrealestate.com | 419 s | 156 s |
| trilliumboise.com | 427 s | 128 s |
| cloverdaleplumbing.com | 389 s | 149 s |
| smilesonstatestreet.com | 357 s | 113 s |
| garytheplumber208.com | 349 s | 120 s |
| madrilsalon.com | 337 s | 117 s |

The server Brain runs one step per invocation, so the critic is one more invocation and adds nothing to any other
step's time. The page Brain is different: it measured 176 to 240 s of a 300 s limit in one run, which leaves no room
for another model call, and its source is not in this repository (only minified bundles). So the critic is on the
server Brain only. The page Brain is unchanged.

**Known gaps:** fingerprints are not recomputed after a swap. The critic can only swap for ideas already on the bench;
it cannot ask for a new idea.

## 2. The Forge repairs instead of recompiling

Code: `pip-forge/forge.js` (`repairPrompt`, `applyRepair`), `pip-forge/index.ts` (`shelfNeed`, `buildPiece`).

- **A teammate that failed its tests** is sent back with the failing transcript and asked for the smallest fix. The fix
  may add guardrails and correct test expectations by index. It may never change channels, triggers, connections,
  actions or tools: `applyRepair` drops those. Each repair is kept in `quote.repairs`. If the repair answer is unusable,
  the Forge recompiles as before.
- **A new part whose route is "provider"** files a Shelf need (`api_needs`, primitive `new_part:<slug>`), so the missing
  provider shows up in the funding tracker instead of in a build note nobody reads.
- **A new part whose route is "compose"** is attempted: the Forge asks `pip-piece` to draft and save a piece for the
  order's business. The piece is staged, never live.

## 3. The weekly teammate note

Code: migration `20261127_12_teammate_notes.sql`, `_shared/notes.ts`, `pip-notes`, the Portal's notes card, the Forge
connector's `notes_list`.

Every Monday at 14:07 UTC the database knocks on `pip-notes/tick`. For each teammate that may act (live, or on a TEST
business) it counts last week's facts in the database (`teammate_week`): runs, done, failed, asked for a person, cost,
pauses, and up to eight troubled runs. A small model call (`claude-haiku-5-5`, on the `work_usd` line) puts the facts
into three parts: what it did, what went wrong, and at most one proposed change. With no model answer, the note is
written from the facts alone.

**Guards, in code:**
- A proposal is kept only if its evidence is run ids that are really among that week's troubled runs.
- A proposal that would loosen a safeguard, skip an approval, delete anything or widen access is dropped.
- The owner sees plain words and two buttons, "Good idea" and "No thanks". Either one records the answer and tells
  Pip's builder. Neither changes the teammate. A proposal never applies itself.
- Brayden sees the same note with its evidence through `notes_list`.

**Switch:** `forge_settings.notes_on` (true). Set it to false to stop notes being written.

## What is proven

See the rollback document's row for this change; filled in here after the live run.
