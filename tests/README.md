# Tests

Owned by lane 09 (guard). Everything here runs on every pull request (`.github/workflows/tests.yml`) and on your own machine with Node 24:

```
node --test "tests/**/*.test.mjs" "supabase/functions/**/*.test.ts" "supabase/functions/**/*.test.mjs"   # the suites
node tests/pip-turn/prove.mjs         # proof that the suites catch a removed limit
```

No keys, no vendor calls, no cost. Nothing here touches the live database or any business.

## What is here

### `pip-turn/` : the hard limits

Runs the real `supabase/functions/pip-turn/index.ts` with the database, the model and Composio replaced by fakes (`harness.mjs`). In each test the fake model tries to do the wrong thing, and the test checks that pip-turn's code stops it.

Covered today, each matching a line in `docs/handbook.md`:

- who may call, and that the website cannot reach `/diag`
- a write may only name an email address the customer typed
- the calendar comes back as busy times only
- hidden fields are never shown or sent; fixed values cannot be overridden
- at most 6 tool calls and 5 rounds a turn
- real actions only when the teammate is live or the business is on the TEST list
- a tool the teammate was not given cannot be run
- a teammate with jobs gets only what the job that answers the channel lists: no tool, level or field outside it; a broken job list or a channel no job lists gets the holding reply
- extra connected tools are off by default: nothing for an older teammate, and for a teammate with jobs only what a `kit:` permission and a reviewed catalog row both say
- texts, calls, updates and emails that are not a reply stay shut until their checks exist
- a money product behind a building block is refused, on a turn and in a job run
- lost access pauses one job; the rest keep working
- the first reply and every outgoing email say it is an AI
- no key appears in anything the model sees or the caller gets back

`prove.mjs` takes each limit out of a temporary copy of pip-turn, one at a time, and checks the tests fail. If you add a limit, add a test and a line in `prove.mjs`. Where two separate things each hold a limit, the entry lists both edits, because taking out one alone changes nothing.

## What these tests do not show

- They test the code's limits, not how a real model behaves. Whether a teammate can be talked into misusing a tool it does have is the attack pack's job (coming under `tests/attacks/`).
- The database is a fake. Row security and the `portal_*` functions are not exercised here.
- Composio's own allowlist is not exercised here.

## For other lanes

- Changing `pip-turn`? Run the two commands above before you open the pull request.
- Tests that sit next to a function (`supabase/functions/**/*.test.ts` or `.test.mjs`) run in the same check. Use `node:test`, no installs.
- New function? Follow `pip-turn/harness.mjs`: load the real file, fake only what is outside it.
- If your change moves a line that `prove.mjs` looks for, it prints `STALE` and tells you which entry to update.
