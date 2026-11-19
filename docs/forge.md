# The Forge, as it is today

A map of how an order becomes a teammate. Owned by lane 05 (issue #19). Written November 18, 2026 from the code in this repo, not from memory. Where something could not be checked, it says so.

Code: `supabase/functions/pip-forge/` (`index.ts` and the bundled `forge.js`), `pip-forge-mcp/`, `pip-shelf/`, `_shared/forge-check.ts`, `redteam/`.

## What could not be checked from this repo

- **The connector that is deployed is newer than the one in this repo.** The live "Pip Forge" connector offers `library_file`, `library_list`, `library_match`, `library_retire`, `funds_set` and `shelf_funds`, and describes itself as having "the live funding tracker" and "the agent library". None of that is in `pip-forge-mcp/index.ts` on `main`, on any branch, or in any pull request. **Deploying `pip-forge-mcp` from `main` would remove those tools.** The deployed source has to be brought into the repo first.
- **Nothing in this repo writes `agent_manifests` or `agent_library`.** `pip-turn` and several database functions read `agent_manifests`. Whatever writes it is in the deployed connector or the database, not here.
- **The Forge Board itself** (the page Brayden builds on, in his Claude plan) is not in this repo. What follows describes only what the Board sends and what Pip stores.
- **The Shelf's database side** (`api_shelf`, `api_needs`, `shelf_links`, `primitives`, the functions `forge_file_needs`, `shelf_missing`, `shelf_refresh_needs`, `claim_build_job`, `forge_order_code`, and the trigger that refuses go-live) was made before migrations were kept in the repo. The code calls them; their rules cannot be read here.
- **`forge.js` is build output.** Its section comments (`// src/forge/stages.ts` and so on) and its logic are readable, but names are shortened and the source it was built from is not in the repo. Everything below about it was read line by line or run (it carries 63 building blocks).

## How an order arrives

| Door | Who uses it | What it needs |
| --- | --- | --- |
| `POST pip-forge/intake` | Pip's "Lock it in": the Pip page through the PIP Reader connector (`pip_order`), the order page (`/lock.html` to `/api/order`), or anything that posts the same body | A name, an email or a phone number, a business, and at least one teammate with an id, a name and a list of building blocks (`uses`) |
| `POST pip-forge/order` | The older path, from a finished scan | A scan id, the owner's name and the chosen teammates |

Intake writes, in this order: a `leads` row (this sends Brayden the lead email), a `build_orders` row with a short code (`PIP-XXXX`), one `skill_specs` row per teammate, one queued `build_jobs` row per teammate, then asks the database which APIs those teammates need that Pip does not own (`forge_file_needs`, which fills `api_needs`). It allows 12 orders an hour from one address, and the same order sent twice returns the first one.

Two copies of the order are kept on `build_orders`: `order` (the engine's format, `build-order/1`) and `brief` (the Board's format). Building blocks Pip does not know are dropped from `order` without a word, and kept in `brief`.

Each new `skill_specs` row starts with `spec: {}`, `status: draft`, `forge_stage: queued`, and `brain: { facts, qa, agent, lane }`. `brain.agent` is the teammate as the Marketplace imagined it, including `uses` and the words the owner was shown (`presented`: tagline, how, wont). `lane` is `spec` (a conversation teammate), `code`, or `onprem` (an on-site box).

Only orders from intake carry a `brief`. An order from the older door cannot be taken onto the Board; it can only build on the API key.

## The queue, and who builds

There are two builders and they produce two different shapes of spec.

1. **The Board, on Brayden's Claude plan.** It sees the queue through the founder-only connector (`forge_queue`), takes an order (`forge_take`, which sets `build_orders.engine = 'board'` and a heartbeat time), and keeps the heartbeat going (`forge_heartbeat`).
2. **The API-key engine**, in `forge.js`, started by `POST pip-forge/run`. That route is open on purpose: it can only work through jobs already queued. The chain calls it after every stage, and the comments say a database timer calls it every 2 minutes (the timer itself is not in the repo). It needs `ANTHROPIC_API_KEY`; without it nothing is claimed and the queue waits.

Board first: the comments say the engine only claims jobs for orders older than the fallback window (`forge_settings.fallback_hours`, 6 by default) whose Board heartbeat has gone quiet, under a per-order cap, a daily cap and a kill switch. That rule lives in the database function `claim_build_job`, which is not in the repo. `forge_release` hands an order back: to the queue, or to the key right now.

The connector's address ends in a founder key. Only the key's hash is stored (`founder_keys`). Never print it, log it or commit it. This repo is public.

## A Board build

What Pip can see of it:

1. `forge_take` returns the order's `brief`, anything saved before, and (new) `jobs_guide`: how to write jobs.
2. The Board does its work on Brayden's plan. Pip stores what it sends and looks inside it in only four places: `seats.gate.system_prompt` (the instructions `pip-turn` runs), `seats.prompt.system_prompt` and `seats.voice.never_says` (read by the red team), `tests` and `integration`.
3. `forge_save` with no `agent_id` saves the team's result to `build_orders.board`.
4. `forge_save` with an `agent_id` saves one teammate (table below). Status `sandbox` or `design_only` means "ready"; when every teammate of the order is ready the order becomes `awaiting_golive`. Status `sandbox`, `design_only` or `needs_you` also closes that teammate's queued API-key jobs, so the engine does not build it a second time.

Pip does not run the Board's tests. `result.tests` is stored as sent.

## An API-key build (`forge.js`)

One `build_jobs` row is one stage for one teammate. Each stage queues the next.

| Stage | What it does | If it fails |
| --- | --- | --- |
| `compile` | Only for the `spec` lane. A model writes an older-style Skill Spec from the order. A cleaner keeps the Skill Spec's own keys and drops everything else, then checks names against the building blocks. **It replaces the whole `spec`.** | Tries again with the errors, up to 3 times, then `needs_review` |
| `test` | A model plays the teammate on the spec's own test messages plus 7 fixed hard ones; a second model call grades each reply. Needs 80% and every "must not promise" case. No tool is ever run. | Back to `compile`, then `needs_review` |
| `review` | A second reviewer on OpenAI, if `OPENAI_API_KEY` is set. If not, it is skipped and the record says "tests are the only gate". | Back to `compile`, then `needs_review` |
| `stage` | Marks the teammate `sandbox` (ready). For the `onprem` lane it reserves a `boxes` row. For the `code` lane it names a template. | |
| `golive` | Sets `status: live`. Only the founder console calls it. | |

The `code` and `onprem` lanes skip `compile`, `test` and `review` and go straight to `stage`. They are marked ready with `spec: {}`.

The founder console (`GET pip-forge/console?token=`, needs `FOUNDER_TOKEN`) shows each build and has four buttons: Go live, Send back (queues `compile` again, which rewrites the spec), Pause, and a try-it chat.

## What gets written where

| Place | Written by | Holds |
| --- | --- | --- |
| `skill_specs.spec.board` | `forge_save` | The Board's JSON for the teammate, plus `status`, `saved_at`, `note` |
| `skill_specs.spec.contract`, `.jobs` | `forge_save` (new) | The teammate's jobs, at the top of the spec, beside `board` |
| `skill_specs.spec.forge_check` | `forge_save`, and the engine's `compile` (new) | The Forge's note: does it declare jobs, do they pass, what is behind each tool |
| `skill_specs.spec` (whole) | the engine's `compile` | An older-style Skill Spec: `agent.persona`, `agent.tools`, `guardrails`, `tests` and so on |
| `skill_specs.spec.redteam` | `redteam_save` | Passed, total, failed checks, link to the run |
| `skill_specs.brain` | intake | Business facts, owner answers, the teammate as ordered |
| `skill_specs.tests` | `forge_save` (`result.tests`, as sent) or the engine's `test` | Test results |
| `skill_specs.review` | the engine's `review` | Reviewer findings |
| `skill_specs.quote` | the engine (tier, blocks not ready, demo) or `forge_save` (`result.integration`, replacing what was there) | Build notes. Not the price. |
| `skill_specs.status`, `forge_stage` | both builders, go-live, the Portal's pause and resume | `draft`, `testing`, `needs_review`, `sandbox`, `approved`, `live`, `paused` |
| `build_orders.board`, `engine`, `board_seen_at`, `status` | the connector | The team result, who has the order, the heartbeat |
| `build_jobs` | intake, the engine, `forge_save` | The API-key queue |
| `agent_manifests`, `agent_library` | **not in this repo** | See the top of this page |

## The API Shelf

The Shelf is the list of outside services Pip can use (`api_shelf`), and which orders are waiting on one Pip does not own yet (`api_needs`). `pip-shelf` emails Brayden one digest of what to fund, the price read from the provider's page, and the budget. It checks keys by secret name only and never reads a value. In the connector, `shelf_status` shows it, `shelf_funded` checks the key is present, runs a small test call for six providers, and releases what was waiting; `shelf_mark` handles services that need an application.

The Shelf answers "does Pip own this service". It does not answer "can a teammate act through it". Twilio being funded does not give any teammate a way to send a text.

## The red-team pack

`redteam/build.mjs` and `report.mjs`, run by hand from the "Red team" GitHub workflow for one order. It reads each teammate through `redteam_pack`, has Promptfoo attack it, and saves passed and total back with `redteam_save`. It stays asleep until two repository secrets exist.

What it attacks is one prompt on a plain model: no tools, no business facts, none of `pip-turn`'s limits. For a Board build it reads `seats.prompt.system_prompt`. `pip-turn` runs `seats.gate.system_prompt`. If the Board fills those two differently, the red team is attacking words that never run. Nothing at go-live reads the result.

## Go-live: what it checks and what it changes

Two doors, both Brayden's: `forge_golive` in the connector, and the console's Go live button.

**What the code did before this change:** one update, `status: live` and `forge_stage: live`. `forge_golive` with no `agent_id` picks teammates whose status is `sandbox` or `approved`. With an `agent_id` it does not look at status at all, so a draft can be switched on. The console's route does not look at status either. Neither reads tests, the reviewer, or the red team.

**What stops it** is the database, when the update is tried: the Shelf's trigger (something still unfunded), the Portal's gate (messages starting `portal:`, `health:`, `camera:`; not in the repo) and the billing gate (an overdue payment; `20261117_portal_08_billing_fixes.sql`). The refusal text is passed back.

**What it changes:** the teammate's status. If every teammate of the order is live, the order is live. A database trigger (`portal_on_golive`) then starts the business's billing clock on its first live teammate. `pip-turn` acts for real only when the teammate is live or the business is on the TEST list.

**New in this change:** before the update, a teammate that declares jobs must pass the contract check as it stands at that moment, and every job's required tool must have something behind it. A teammate with no declared jobs goes live exactly as before. See the last section.

The Portal's Resume also sets `live` (from `paused`). It is lane 03 and 06's code and is unchanged: the contract is not checked there.

## Where a teammate's abilities are decided today

`pip-turn` `POST /turn` reads these and nothing else:

| What | Board build | Older Skill Spec |
| --- | --- | --- |
| May it run at all | `spec.board.seats.gate.system_prompt` is text | `spec.agent` exists |
| Its instructions | `spec.board.seats.gate.system_prompt`, word for word | `spec.agent.persona`, `spec.name`, `spec.goal`, `spec.guardrails.never`, `spec.guardrails.escalate_on` |
| **Which tools it gets** | `agent_manifests.manifest.uses`, or if there is no manifest, `brain.agent.uses` from the order | `spec.agent.tools` |
| Which need the owner's approval | fixed in code | `spec.actions[].approval` |
| Forced hand-off words | none in code (only what the prompt says) | `spec.guardrails.escalate_on` |
| What it knows | `brain.facts`, `brain.qa` | the same |
| Its name | `manifest.teammate`, or `brain.agent.teammate.name` | `spec.name` |
| Real actions or test mode | `skill_specs.status` is `live`, or the business is on the TEST list | the same |

From that list of tools, a teammate really gets: Pip's five own actions (alert the owner, save a lead, ask for a booking, hand off, draft for approval), and outside tools only where an enabled `tool_catalog` row exists for that building block and the owner's connection is working. Today that is the calendar, email and the Pip sheet. Any other tool the owner connected gets "add one new record" and nothing more.

`spec.jobs` is read by `pip-jobs` and `pip-turn` `POST /job` (jobs that start on their own; merged, not switched on). `POST /turn` does not read jobs yet. That is lane 01's next pull request.

## Where a build can claim an ability with nothing behind it

1. **The Board's instructions are run word for word, and nothing compares them with the tools.** The prompt can say "I'll check the schedule" or "I'll text you" while the tool list holds neither. The instructions come from the build; the tools come from somewhere else (next point).
2. **A Board teammate's tools are not decided by its build.** They come from a manifest nothing in this repo writes, or from what the Marketplace imagined when the order was placed.
3. **Most building blocks do nothing at run time.** There are 63. `pip-turn` can act on Pip's five own actions and on blocks with catalog rows. A teammate designed with `pos`, `booking_app`, `crm`, `accounting`, `send_text`, `social_posting`, `schedule`, `weather` or `record_change` gets nothing for them, and is not even told they are missing: the "not available right now" line only covers steps that have reviewed tools but no working connection.
4. **The API-key engine is told it may use blocks that are not available.** Its prompt says to include one anyway "so the team sees what is missing". The cleaner accepts it. It is listed on the console as "Blocks not ready yet" and does not stop go-live.
5. **Triggers on an older Skill Spec are words.** `spec.triggers` can say `schedule` or `weather`; nothing starts a teammate that way.
6. **The engine's tests are a model grading a model.** No tool runs. A teammate can pass by saying the right thing about an action it cannot take.
7. **The Board's tests are stored, not run.** Pip keeps whatever `result.tests` says.
8. **With no OpenAI key the reviewer is skipped**, and the reviewer is the only step that compares the build with what the owner was shown.
9. **`code` and `onprem` teammates are marked ready with an empty spec.** `pip-turn` answers "not runnable" for them. They can still be switched live, which starts the billing clock.
10. **`design_only` counts as ready.** A Board save with that status maps to `sandbox`, the same as a finished build.
11. **Go-live by `agent_id`, and the console's route, skip the "is it ready" check.** A draft or a failed build can be switched on.
12. **The red team may attack a prompt that is not the one that runs**, on a model with no tools, and go-live does not read the result.
13. **The Shelf says a service is owned, not that a teammate can use it.**
14. **What the owner was shown is never re-checked.** `brain.agent.presented` (tagline, how it works, what it will not do) is kept as the Marketplace wrote it, whatever was built.
15. **Jobs and tools can disagree.** After this change a teammate can carry checked jobs, but `POST /turn` still hands out tools from the list in point 2. Until lane 01's next pull request, jobs describe a teammate; they do not yet limit it in conversation.
16. **Sending a job-free build skips the new check.** A build with no jobs saves and goes live as before. That is on purpose for now (older teammates must keep working), and the record says "no declared jobs" so it can be seen.

One more thing that loses work rather than inventing it: "Send back" on the console, and any API-key `compile`, replaces the whole spec. A Board build, its jobs and its red-team result on that row are gone.

## The contract on every build (new)

The rules are in [`contracts/teammate-spec.md`](contracts/teammate-spec.md) and its [examples](contracts/examples/). The Forge's side is `supabase/functions/_shared/forge-check.ts`, which decides and writes nothing; the two functions call it.

**Writing jobs.** Every thing the owner asked for becomes a job: what starts it, the tools it needs with a level for each (read, add or update; never delete), its limits, and what makes it pause. Anything that is not possible today becomes a plain line for the owner, never a pretend ability. The builder is told this in three places: `forge_take`'s answer (`jobs_guide`), the description and inputs of `forge_save`, and the connector's opening instructions. The API-key engine is not told, because its prompt is inside `forge.js`; it only ever produces the older shape.

**Saving.** Send `contract` and `jobs` to `forge_save` beside `result`, for one teammate.

- Jobs that fail the check: the save is refused with every problem in plain words. Nothing is written.
- Jobs that pass: they are stored at the top of the spec, beside `board`.
- No jobs: saved as before. `spec.forge_check.declared` is `false`, so the Portal and go-live can tell.
- Jobs already on the record are kept when a later save brings none. If they no longer pass (the contract tightened), the teammate cannot be marked ready until corrected jobs are sent; a save that says "still building" or "failed" goes through and the note says the jobs are failing.

**Can it run.** Every save answers with one line per tool a job needs (`can_run`), and the ones that will stop go-live (`blocks_golive`):

| What the job names | Line |
| --- | --- |
| Pip's own action | ready |
| A setup step with a reviewed tool for this kind of record and level | ready, once the owner has connected it |
| A setup step with reviewed tools, but not for this | "Pip can ... there. Pip cannot ... there yet." |
| A setup step with no reviewed tool (booking, point of sale, accounting and the rest of `connection_catalog`) | "Booking software: Pip cannot act there yet" |
| An extra product, `kit:<name>` | add one new record while answering a customer, and nothing else |
| Anything else | "Pip does not know this tool" |

Two things have a reviewed tool and are still reported as gaps, because code refuses them today: anything to do with money, and, for a job that starts on its own, sending a message, changing a record, or reading with a field list. "Reviewed" means an enabled `tool_catalog` row that says which kind of record it touches and how, matched to the job's tool name the same way `pip-turn`'s runner does it. A test fails if the runner's lines change.

Gaps never stop a save. **A required tool with nothing behind it stops go-live.** Mark a tool `"required": false` when the job is still worth running without it, and write the gap for the owner.

The check asks "does anything exist in Pip that could do this". It does not ask whether this owner has connected the tool; the Portal's own gate does that.

**Not done yet** (lane 05's next steps): turning the gap lines into the owner's wording and into requests to the right lane; tests made with each build and a build that fails them blocked; the library; checking jobs against the tool list in point 2 above.
