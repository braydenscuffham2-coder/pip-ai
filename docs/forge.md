# The Forge, as it is today

A map of how an order becomes a teammate. Owned by lane 05 (issue #19). Written November 18, 2026 from the code in this repo, not from memory. Where something could not be checked, it says so.

Code: `supabase/functions/pip-forge/` (`index.ts` and the bundled `forge.js`), `pip-forge-mcp/`, `pip-shelf/`, `_shared/forge-check.ts`, `redteam/`.

## What is in this repo, and what is not

- **The connector's source is now here.** Until November 18 the deployed "Pip Forge" connector was newer than the repo: the agent library and the funding tracker existed only on the live function. `pip-forge-mcp/index.ts` is now the deployed source (version 17, read from Supabase) with the contract check on top. A test (`pip-forge-mcp/tools.test.mjs`) fails if any of its 20 tools disappears.
- **`pip-shelf` is still behind.** The funding tools call `pip-shelf/funds`. The `pip-shelf` in this repo has no such route, so the deployed one is newer. **Do not deploy `pip-shelf` from `main`** until its deployed source is brought in the same way.
- **The deployed `pip-forge`** matched the repo's `index.ts` on reading, except that it loads `forge.js` from jsDelivr at commit `37cdccf`. That commit is not on `main` (it is on four older branches), but its `forge.js` is the same file as `main`'s.
- **The Forge Board itself** (the page Brayden builds on, in his Claude plan) is not in this repo. What follows describes only what the Board sends and what Pip stores.
- **Much of the database side has no migration here.** Its rules below were read from the live catalog on November 18 (definitions only, no rows). The list is at the end of this page.
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

Board first. The database function `claim_build_job` decides what the engine may take: nothing while the kill switch is on or today's spend has reached the daily cap (`forge_settings.daily_cap_usd`, 15 if unset); otherwise the oldest queued job of an order that was handed to the key, or of an order older than the fallback window (`fallback_hours`, 6 if unset) that no Board took or whose Board heartbeat is more than 45 minutes old. A job stuck "running" for 15 minutes is taken again. `forge_release` hands an order back: to the queue, or to the key right now.

The connector's address ends in a founder key. Only the key's hash is stored (`founder_keys`). Never print it, log it or commit it. This repo is public.

## A Board build

What Pip can see of it:

1. `forge_take` returns the order's `brief`, anything saved before, and (new) `jobs_guide`: how to write jobs.
2. The Board does its work on Brayden's plan, in "seats". Pip stores what it sends and looks inside it in a few places only: `seats.gate.system_prompt` (the instructions `pip-turn` runs), `seats.prompt.system_prompt` and `seats.voice.never_says` (read by the red team), `tests`, `integration` (rows with a `block`; these add to the teammate's tools, see the abilities table), `from_library`, and, for the library, `seats.agent_architect`, `seats.integration.rows`, `seats.voice`, `seats.prompt.tools`, the last `seats.planner*` and `seats.gate.critical`.
3. `forge_save` with no `agent_id` saves the team's result to `build_orders.board`.
4. `forge_save` with an `agent_id` saves one teammate (table below). Status `sandbox` or `design_only` means "ready"; when every teammate of the order is ready the order becomes `awaiting_golive`. Status `sandbox`, `design_only` or `needs_you` also closes that teammate's queued API-key jobs, so the engine does not build it a second time. A save at `sandbox` also files the teammate in the library, in the background. A save with a `result` replaces the stored one. A save with no `result` (to add jobs, or to change only the status or the note) keeps the Board's stored work.
5. Every change to a teammate's `spec`, `quote` or `brain` makes the database rebuild its row in `agent_manifests` (trigger `skill_specs_portal_manifest`), for orders that belong to a business.

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
| `agent_manifests` | the database, on every change to a spec (`portal_compile_manifest`) | The teammate's name, its list of tools (`uses`) and the setup steps those need |
| `agent_library` | `forge_save` at `sandbox`, `library_file`, `library_retire` | Skeletons of built teammates, for reuse |
| `api_funds` | `funds_set`, and `pip-shelf` | One row per paid provider: balance and when to warn |

## The API Shelf

The Shelf is the list of outside services Pip can use (`api_shelf`), and which orders are waiting on one Pip does not own yet (`api_needs`). `pip-shelf` emails Brayden one digest of what to fund, the price read from the provider's page, and the budget. It checks keys by secret name only and never reads a value. In the connector, `shelf_status` shows it, `shelf_funded` checks the key is present, runs a small test call for six providers, and releases what was waiting; `shelf_mark` handles services that need an application.

At go-live the database asks the Shelf about the building blocks in `brain.agent.uses`, the list from the order. A block passes when one of its providers is ready (or is Pip's own, a library, or hardware) and every provider it requires is ready.

The Shelf answers "does Pip own this service". It does not answer "can a teammate act through it". Twilio being funded does not give any teammate a way to send a text.

## The funding tracker

How much money is behind each paid service. The numbers are worked out in `pip-shelf` (`POST pip-shelf/funds`, whose source is not in this repo yet); the connector only asks for them, signed with the project's own service key, and passes them on.

- `shelf_funds` shows one row per provider (balance, burn per day, days left, a status and a link to add funds), or a budget summary, or 30 days of readings. It never returns a key.
- `funds_set` is for providers with no balance to read (its description names Anthropic, Resend, Google Cloud and Microlink): Brayden records what the billing page shows, or a top-up, and when to be warned. It only accepts a provider that already has a row in `api_funds`.

## The agent library

A teammate saved at `sandbox` is filed as a "skeleton" so the next similar order can start from it.

1. **What is kept:** the design, the integration rows, the voice, the system prompt (the `gate` seat's, or the `prompt` seat's if there is none), the tool list and the test messages; plus the job name, industry, kind of job, lane, building blocks, and test and red-team scores. For an API-key build: the goal, channels, triggers, guardrails, persona and tests. Business facts (`brain`) are not copied. **Jobs are not copied either**, so a reused skeleton brings no jobs with it yet.
2. **Names are replaced in code first:** the business (and shorter forms of its name), its website, teammates' names, the owner's name from the lead, rivals, and anything shaped like an email, a US phone number or a street address, become placeholders such as `{{business}}`.
3. **Then a small model rewrites it as a template**, replacing every remaining fact (city, hours, prices, menu items) with a placeholder. This needs `ANTHROPIC_API_KEY`. The result is accepted if it has the same keys and its prompt has not shrunk to under half (or under 200 characters). Nothing checks that the facts are really gone.
4. If step 3 cannot run or fails, the skeleton is still stored, marked `retired`, and never offered. It still holds whatever step 2 missed.
5. `library_match` scores each teammate of an order against the ready templates: shared building blocks (60%), same kind of job (25%), same industry (15%), and 0 if the lane differs. It returns the best two at 0.6 or more, never one from the same order, with the whole skeleton. `library_list` shows the library without skeletons. `library_file` files an order's ready teammates by hand. `library_retire` takes one out, or puts a templated one back.
6. A Board save that carries `from_library` adds one to that skeleton's reuse count.

## The red-team pack

`redteam/build.mjs` and `report.mjs`, run by hand from the "Red team" GitHub workflow for one order. It reads each teammate through `redteam_pack`, has Promptfoo attack it, and saves passed and total back with `redteam_save`. It stays asleep until two repository secrets exist.

What it attacks is one prompt on a plain model: no tools, no business facts, none of `pip-turn`'s limits. For a Board build it reads `seats.prompt.system_prompt`. `pip-turn` runs `seats.gate.system_prompt`. If the Board fills those two differently, the red team is attacking words that never run. Nothing at go-live reads the result.

## Go-live: what it checks and what it changes

Two doors, both Brayden's: `forge_golive` in the connector, and the console's Go live button.

**What the code did before this change:** one update, `status: live` and `forge_stage: live`. `forge_golive` with no `agent_id` picks teammates whose status is `sandbox` or `approved`. With an `agent_id` it does not look at status at all, so a draft can be switched on. The console's route does not look at status either. Neither reads tests, the reviewer, or the red team.

**What stops it** is the database, when the update is tried. Four triggers on `skill_specs`, and the refusal text is passed back:

| Trigger | Refuses when |
| --- | --- |
| `forge_golive_guard` | a building block in `brain.agent.uses` is not covered by the Shelf ("shelf: fund these before going live") |
| `portal_golive_gate` (only for an order that belongs to a business, and only while the `portal_golive_gate` setting is on) | the business disconnected; the owner has not accepted the price; the state or time zone is not set; a setup step marked as blocking for this teammate is not connected; a health agreement is missing; a camera teammate in a state with a biometric law has no sign-off |
| `portal_card_gate` | no card on file (while `portal_require_card` is on) |
| `portal_billing_gate` | a payment is overdue (`20261117_portal_08_billing_fixes.sql`) |

Only the last one has a migration in this repo.

**What it changes:** the teammate's status. If every teammate of the order is live, the order is live. A database trigger (`portal_on_golive`) then starts the business's billing clock on its first live teammate. `pip-turn` acts for real only when the teammate is live or the business is on the TEST list.

**New in this change:** before the update, a teammate that declares jobs must pass the contract check as it stands at that moment, and every job's required tool must have something behind it. A teammate with no declared jobs goes live exactly as before. See the last section.

The Portal's Resume also sets `live` (from `paused`). It is lane 03 and 06's code and is unchanged: the contract is not checked there.

## Where a teammate's abilities are decided today

`pip-turn` `POST /turn` reads these and nothing else:

| What | Board build | Older Skill Spec |
| --- | --- | --- |
| May it run at all | `spec.board.seats.gate.system_prompt` is text | `spec.agent` exists |
| Its instructions | `spec.board.seats.gate.system_prompt`, word for word | `spec.agent.persona`, `spec.name`, `spec.goal`, `spec.guardrails.never`, `spec.guardrails.escalate_on` |
| **Which tools it gets** | `agent_manifests.manifest.uses`: everything in the order's `uses`, plus the `block` of each row in the Board's `integration`. With no manifest (an order with no business yet), `brain.agent.uses` from the order. | `spec.agent.tools` |
| Which need the owner's approval | fixed in code | `spec.actions[].approval` |
| Forced hand-off words | none in code (only what the prompt says) | `spec.guardrails.escalate_on` |
| What it knows | `brain.facts`, `brain.qa` | the same |
| Its name | `manifest.teammate`, or `brain.agent.teammate.name` | `spec.name` |
| Real actions or test mode | `skill_specs.status` is `live`, or the business is on the TEST list | the same |

From that list of tools, a teammate really gets: Pip's five own actions (alert the owner, save a lead, ask for a booking, hand off, draft for approval), and outside tools only where an enabled `tool_catalog` row exists for that building block and the owner's connection is working. Today that is the calendar, email and the Pip sheet. Any other tool the owner connected gets nothing until an action in it has been reviewed and a job lists it as `kit:<name>`.

`spec.jobs` is read by `pip-jobs` and `pip-turn` `POST /job` (jobs that start on their own; merged, not switched on). `POST /turn` reads jobs too, in the code on `main` once lane 01's turn-permissions pull request is merged; it is not deployed yet (see the status table in `docs/contracts/teammate-spec.md`).

## Where a build can claim an ability with nothing behind it

1. **The Board's instructions are run word for word, and nothing compares them with the tools.** The prompt can say "I'll check the schedule" or "I'll text you" while the tool list holds neither. The instructions come from the build; the tools come from somewhere else (next point).
2. **A Board build can add tools but never take one away.** The tool list is what the Marketplace imagined when the order was placed, plus any blocks in the Board's `integration` rows. If the Board decides a tool is not possible, the teammate keeps it anyway.
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
13. **The Shelf says a service is owned, not that a teammate can use it.** And its go-live check reads the order's list of blocks, not what was built.
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
| An extra product, `kit:<name>` | nothing until an action in it has been reviewed (an enabled `tool_catalog` row with block `any_tool`, that toolkit, and the same kind of record and level); then that action, while answering a customer only. A job that starts on its own cannot use an extra product at all |
| Anything else | "Pip does not know this tool" |

Some things have a reviewed tool and are still reported as gaps, because code refuses them today: anything to do with money (a reviewed row for a money product does not count either); changing a record, reading with a field list, placing a call, and sending any message except an email reply while answering a customer; and, for a job that starts on its own, that email reply too. "Reviewed" means an enabled `tool_catalog` row that says which kind of record it touches and how, matched to the job's tool name the same way `pip-turn` does it. What is not built yet is one function both use (`notYet` in `teammate-spec.ts`), and a test runs the Forge's answer and `pip-turn` side by side on the same catalog and fails if they differ (`pip-turn/forge-agree.test.mjs`).

Gaps never stop a save. **A required tool with nothing behind it stops go-live.** Mark a tool `"required": false` when the job is still worth running without it, and write the gap for the owner.

The check asks "does anything exist in Pip that could do this". It does not ask whether this owner has connected the tool; the Portal's own gate does that.

**Not done yet** (lane 05's next steps): jobs in the library, so a reused skeleton starts with proven jobs; turning the gap lines into the owner's wording and into requests to the right lane; tests made with each build and a build that fails them blocked; the library; checking jobs against the tool list in point 2 above.

## Database pieces the connector depends on that no migration here creates

Read from the live catalog on November 18, 2026.

- **Tables:** `founder_keys`, `forge_settings`, `build_orders`, `skill_specs`, `build_jobs`, `api_needs`, `api_shelf`, `primitives`, `spend_daily`, `events`, `client_connections`, `leads`, `connection_catalog`. (`tool_catalog` has migrations.)
- **Recorded, not created:** `agent_library`, `api_funds`, `api_fund_snaps` and the function `agent_library_reused` are written down in `supabase/migrations/20261118_05_record_library_and_funds.sql`. It changes nothing where they exist, and a test compares it with the live catalog. It holds structure only; the rows of `api_funds` are not in the repo.
- **Functions it calls:** `shelf_refresh_needs()`, `agent_library_reused(lib)`.
- **Triggers its writes set off, and what they call:** on `skill_specs`: `skill_specs_golive_guard` (`forge_golive_guard`, which uses `shelf_missing`, `shelf_provider_ready`, `shelf_links`), `skill_specs_portal_gate` (`portal_golive_gate`, which uses `portal_flag`, `portal_health_missing`, `business_connections`, `jurisdiction_rules`, `business_agreements`), `skill_specs_portal_card_gate` (`portal_card_gate`), `skill_specs_portal_manifest` (`portal_on_spec`, `portal_compile_manifest`, `portal_arr`, `portal_sync_connections`, table `agent_manifests`). `skill_specs_portal_billing_gate` and `skill_specs_portal_golive` are in the repo.
- **Also used by `pip-forge`:** `claim_build_job`, `forge_file_needs`, `forge_order_code` (also the default of `build_orders.code`), `forge_spend_add`, `forge_setting`, `shelf_fund_target`, and the triggers `build_orders_portal_attach` (`portal_on_order`), `api_needs_alert` and `leads_alert`.
