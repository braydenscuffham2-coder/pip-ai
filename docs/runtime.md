# Pip's own computers: the background runtime

Written November 26, 2026 (Part B). It describes what is built, what was chosen and why, and what is only designed.
Where something was not tested, it says so.

Brayden's direction: "I want Pip to work in the background on its own computer. It should not only be able to work
when a customer's computer is on and it's inside their tabs. It should be able to sign in and complete actions on its
own computer/server."

## The rule

Nothing a customer relies on may depend on the customer's computer being on, or on Brayden's computer being on.
Everything below runs on Pip's Supabase project and on browsers Pip rents by the minute.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `tool_identities` | database | Who Pip is, per business and per tool: the saved browser state (a Browserbase context), the vaulted login, whether the owner set up an authenticator for Pip, and whether a person is needed right now. |
| `work_jobs` | database | The queue. One row is one piece of background work, with its saved state, step count, cost and cap. |
| `work_steps` | database | What each job did, step by step, with the masked screenshot the model saw. Kept 14 days. Never a typed secret. |
| `pip-work` | edge function | The worker. Claims a job, runs its steps, gives it back. |
| `vault-writer` | edge function | The only code with the vault token. Fills a saved login on the tool's own site. No model runs in it. |
| pg_cron `pip-work-tick` | database | Knocks on `pip-work` every minute, only while something is due or a worker has gone quiet. |

## How a job runs

1. Something queues a job with `work_enqueue` (a schedule, a teammate's job, a founder test). The same key queued
   twice gives back the first job.
2. `work_claim` hands the oldest due job to one worker and starts a lease. Two knocks at the same moment cannot take
   the same job (`for update skip locked`).
3. The worker runs steps for about 75 seconds, renewing the lease before each one (`work_heartbeat`). Each step saves
   where it got to.
4. The worker gives the job back with `work_release`: more to do, waiting for the owner, waiting for an approval,
   done, or failed.
5. **A worker that dies** never gives the job back. Its lease runs out, the next knock claims the job, and it carries
   on from the saved state. Three deaths in a row end the job and tell the founder.

### What stops a job

- **The global kill switch** (`forge_settings.kill_switch`) or `work_paused`: nothing is claimed.
- **The per-job dollar cap** (`cost_cap_usd`, $1 by default, $20 at most). Held by a database trigger: whatever a
  worker writes, a running job that reaches its cap ends there.
- **The step budget** (`max_steps`, 30 by default).
- **The spend line** `work_usd` in `pip_limits` ($10 a day, $60 a month), inside the $300 monthly ceiling.
- **Dark by default.** A job can be queued only for a business on the TEST list until `background_work_on` is true.
  Turning that on for a real customer is Brayden's call.

## Signing in, and staying signed in

Every job that touches a tool starts by making sure Pip is signed in. No model takes part.

1. Open a browser with the business's saved state for that tool, and go to the tool's sign-in page.
2. Read what kind of page it is from the page's own markup: a password field, a username-only field, a one-time-code
   field, a captcha frame, or none of those.
3. No sign-in form: Pip is in. Carry on.
4. A sign-in form: `vault-writer` types the saved login, once. It refuses unless the page's host is exactly the
   sign-in page's host, or a host the owner themselves signed in on (`tool_identities.signin_hosts`). A shared parent
   domain is not enough, because many tools give each customer a subdomain. The engine checks the same thing before
   asking.
5. A code is asked for: if the owner chose to create a separate "Pip" login and keep its authenticator secret in their
   vault, `vault-writer` asks the vault for the current code and types it. Otherwise this is treated as a new-device
   check.
6. Anything only a person can do stops that tool's jobs and tells the owner once, in plain words: a captcha, a
   new-device check, a password that no longer works, a sign-in page on another site. Other jobs for the same tool
   then wait quietly; they do not open a browser and they do not send a second email.

Pip never guesses a password twice and never touches a captcha.

## What the owner and the founder see

- **Owner:** each ending, and each time a person is needed, is one plain line in the Portal's activity
  (`activity_log`), plus one email when a tool needs them (`tool_needs_you`).
- **Founder:** every failed job is emailed once with the business, the job, the reason, the steps taken and the cost.
  The step log and masked screenshots are in `work_steps` under the job id.

## The worker tier: what was chosen

The job is always the same: claim from the queue, drive a rented browser over its remote-control socket, save state,
give the job back. Four places to run that loop were compared.

| Option | Cost | Cold start | Longest single run | Region | Simplicity | Verdict |
|---|---|---|---|---|---|---|
| **Supabase edge function, stepped** (chosen for now) | Nothing extra: Pip already pays for Supabase Pro | Under a second when warm | About 400 seconds of wall clock per worker and 150 seconds per request on a paid plan, so the work is cut into steps | Same project as the queue | Already how `scan-run` and `setup-run` work | **Chosen.** Zero new accounts, always on, and the queue makes the time limit a non-issue: a job is many short steps. |
| Small always-on container (Fly.io machine) | About $2 a month for the smallest size, billed by the second | None (always running) | No limit | Pick one near the browsers | One more vendor, one more deploy path, one more secret store | **Next**, when a single step needs more than about two minutes, or the per-minute knock is too slow. The loop and the database rules do not change. |
| Browserbase Functions | Listed as included with every plan | Runs beside the browser | Tied to the browser session | Browserbase's | Code and secrets would live at the browser vendor | **Not chosen.** The vault service must stay the only holder of the vault token, and Pip should be able to change browser vendor without moving its worker. |
| Vercel Sandbox | Metered by CPU time | Fast | Hours per session, with a cap by plan | One US region | Built for running untrusted code in isolation | **Not for this.** It is the right tool for testing software Pip builds (Part E), not for a standing worker. |

Limits and prices above were read from each vendor's published pages on November 26, 2026 through search results,
not from a signed-in account. Re-check before relying on a number.

**Why not buy the container now:** Pip is in development with no paying customers, and Brayden's rule is no new paid
plans until they are needed. The stepped worker costs nothing and proves the whole design. Moving to a container
later is a deployment change, not a redesign: the same `work_claim`, `work_heartbeat` and `work_release` calls, and the
same step code, from a process that never sleeps.

### The real limit today: browser minutes

Browserbase's Free plan gives one browser hour a month, sessions of at most 15 minutes and three at once. That is
enough to prove the runtime and not enough to run a business on. Every job closes its browser the moment it ends or
needs a person. The session length is the setting `setup_session_minutes` (15 by default).

### The other limit, measured Nov 27: one connection, and the browser ends when it drops

On the Free plan a browser ends the moment a connection to it closes ("keep alive" is a paid setting). We measured it
with `setup-run /probe` on a throwaway browser: a second program connected, ran one command and left; five seconds
later the browser was no longer running and the first connection was dead.

What that breaks today, and what it does not:

| Path | Works on the Free plan? | Why |
| --- | --- | --- |
| A background job that finishes inside one worker turn (every Part C proof) | Yes, proven live | One connection, opened and closed by the same request. A job that spans turns reopens a browser on the saved state. |
| The Setup Agent (the owner signs in while watching) | **No.** Broke at step one on the first live run | Each step is its own request and its own connection. The holder added in PR #109 keeps one connection open, but the next step's connection closing still ends the browser. |
| A silent re-sign-in from the vault (`vault-writer /fill`, `/code`) | **No, never run live** | The worker holds one connection and the vault writer needs its own to type the login. |

Two ways forward (Brayden's decision, parked as the last step on Nov 27):

1. Browserbase Developer, $20 a month: set `keepAlive: true` when a session is made and everything above works as
   built. It also gives 100 browser hours instead of 1.
2. Stay on Free: rebuild sign-in so one request holds the only connection and does everything, with the owner's page
   talking to that one request over a live socket, and the vault writer doing a whole sign-in in a browser of its own.
   A sign-in attempt is then limited to about five minutes (the longest one request may live).

## The Forge Board is optional

Builds used to wait up to six hours for the Forge Board on Brayden's computer before the API-key engine on Pip's
servers took them. The server engine is now the default: `forge_settings.fallback_hours` is 0, so an order nobody has
taken onto the Board is built on Pip's servers straight away. The Board still works as an accelerator: an order taken
with `forge_take` stays with the Board while its heartbeat is fresh.

## Software that is not on the web (designed, not built)

Desktop-only and office-network software: QuickBooks Desktop, on-premise practice systems, local point of sale.
The order of preference:

1. **A vertical sync partner**, where one exists for that line of work. It already runs inside those offices and
   offers an API. The Shelf lists NexHealth for dental systems. Other verticals need the same search before any build.
2. **A small Pip connector on site.** One installable program, or the on-site box Pip already plans for cameras. Rules:
   - It only ever makes outbound connections to Pip. Nothing listens for the internet.
   - It holds no login a model can read. A login for local software is typed by the owner into the connector and stays
     on that machine.
   - It speaks the same queue: it claims `work_jobs` of its own kind for its own business, heartbeats, and gives them
     back. A box that is switched off is simply a worker that is not claiming, and the owner is told.
   - Read, add or update. Never delete.
3. **A Pip-run cloud desktop with computer use**, only for software that has a web or remote-desktop route. This needs
   the same guards as browser work (masked secrets, an allowed-screens list, a step budget, approvals for the first
   write runs) and a per-minute cost that has not been measured.

Nothing in this section is built. The first one gets built after the novelty rounds say which kind of software comes
up most.

## Not done, said plainly

- No real customer tool has been through this. Proofs so far are on TEST businesses and a Pip-hosted practice tool.
- Screenshots are stored in a database column, not in file storage. Fine at test volume; it should move before real use.
- One knock a minute means a job can wait up to a minute to start. A container removes that.
- `work_steps` is not yet shown in the Portal as a replay. The owner sees the plain-words lines only.
- The on-site connector and the cloud desktop are designs.
