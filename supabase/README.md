# Supabase edge functions

Pip's backend on Supabase: Deno edge functions next to a Postgres database. The Next.js app reaches the database only through locked-down database functions (see `lib/server/store.ts`). These functions handle the work that lives outside the website.

| Function | What it does |
|---|---|
| `lead-alert` | Emails each new lead to the owner through Resend. A database trigger calls it when a lead is inserted, and a 15-minute cron retries anything that didn't send. A burst of leads becomes one digest. |
| `voice-token` | Hands the call demo a one-time ElevenLabs token for a call with an AI teammate. Adds a monthly ceiling on top of the agent's own daily and per-call caps. |
| `pip-voice` | Phone calls on a business's Pip number. Twilio asks it first; it asks ElevenLabs to do the listening and speaking, and passes every caller sentence to `pip-turn` so the teammate, its rules and its limits are the same as on chat. Also: the plain message when ElevenLabs is down, transfers inside the owner's hours, and billing per started minute. See `docs/voice.md`. |
| `site-kit` | Reads a business's homepage for what Pip needs to show it back to them: logo, colors, fonts, headline, menu and buttons. It also runs a scan in the background (`start=1`, read back with `poll=1`), and buys the market numbers (`insight=1`: Google Maps rank and search demand) and deep reviews (`reviews=`) from DataForSEO. Every new scan and every DataForSEO order is taken from the day's budget first and refused over the limit. |
| `rival-read` | Reads each competitor's own homepage: what it says and what it lets a customer do. |
| `scan-run` | The Brain, as a resumable job. Each call runs one stage and chains the next, so no request outlives the edge-function limit. Has per-scan, per-month and per-IP budget caps. Google review text is used while the job runs and never stored. |
| `pip-forge` | The building side. Takes an owner's order and turns it into build orders, skill specs and queued build jobs. `POST /intake` takes Pip's own Lock it in order, gives it a code (PIP-XXXX) and files the API Shelf's needs. The API-key engine only builds an order after the Board has had it for the fallback window. |
| `pip-forge-mcp` | The founder-only "Pip Forge" connector the Forge Board uses: the real order queue, taking an order onto the Board, saving results, go-live, the API Shelf, the Forge's safety settings, the funding tracker (`shelf_funds`, `funds_set`, numbers from `pip-shelf/funds`), the agent library (`library_list`, `library_match`, `library_file`, `library_retire`), owner sign-in links through Composio (`client_connect`, `client_connections`) and the red team's read and save (`redteam_pack`, `redteam_save`). `forge_save` takes a teammate's `contract` and `jobs`, refuses jobs that fail the teammate contract, and answers with what is behind each tool; `forge_golive` checks again (`_shared/forge-check.ts`, `docs/forge.md`). Its URL ends in a key; only the key's hash is stored. |
| `pip-shelf` | The API Shelf's alert. When an order needs an API you don't own, it emails one digest: what to fund, which orders wait on it, the price and the budget so far. It checks keys by secret name only. |
| `pip-jobs` | Starts a teammate's jobs when nobody asked: on a schedule (the database knocks on `/tick` every 5 minutes), on an event (`/event`), or from "Run now" (`/run`). It only decides when; `pip-turn` `POST /job` does the work under the job's permissions and limits. Each slot or event starts at most one run, and a retry never repeats a real change (`job_runs`, `job_actions`). A run whose worker dies three times is failed and its job paused, the same as three reported failures. The timer reads this project's own functions address from `forge_settings` key `functions_url` and knocks on nothing until it is set (see "Switching the job timer on" below). See `docs/contracts/teammate-spec.md`. |
| `pip-reader` | A small remote MCP server that lets the Pip build inside the Claude app call Pip's own read endpoints, and send an owner's Lock it in order to `pip-forge/intake` (`pip_order`). |

`scan-run/brain.js` and `pip-forge/forge.js` are bundled build files. They carry the 63-part primitives library and the stage logic.

## The spend guard

Anyone can use Pip without signing in, and a scan buys data and model time. `migrations/20261115_spend_guard.sql` puts every limit on that spending in one table, `pip_limits`, and makes the database the judge.

- **Everyone together:** a cap for the day and for the month on each paid thing: new scans, DataForSEO dollars, Brain scans and Brain dollars, and each kind of request the website serves.
- **One visitor:** an hourly and a daily allowance, counted on a salted hash of the IP address. The website asks through `pip_gate` (`lib/server/guard.ts`) before it spends; a saved scan replays free and isn't counted.
- **The pause switch:** `update forge_settings set value = 'true' where key = 'public_pause'` stops every paid visitor action at once. Saved scans, leads and clients' live teammates keep working.
- `site-kit` asks the database's `spend_take` before every new scan (`scans`) and every DataForSEO order (`dfs_usd`); a failed order gives its cost back. Over the limit, or when the budget cannot be checked, it answers `daily_limit` and nothing is bought. The limit that counts is the row in `pip_limits`. The number `site-kit` sends along (40 scans and $3 by default) is only used by the database to work out how much room it asked to be left, so leave the old `SCANS_DAILY` and `DFS_DAILY_USD` secrets unset: a different number there would be read as a request to leave room, not as a new limit. `scan-run` is held by a trigger on `scan_jobs`: a new scan over a limit is saved as failed with the reason, and nothing runs.
- `select * from pip_guard_status()` shows today and this month against every limit. A tripped limit writes one `cap_hit` row to `events` per day.

Change a number in `pip_limits` and it applies on the next request. Nothing is redeployed.

## The email gate and the bot check

- **The email gate.** Before Pip shows "Your team" for a real business, the owner gives one email: no password, no account. The Pip page sends it through `pip_read` to `.../pip-pass?email=`, which `pip-reader` answers itself. It files a lead (source `pip-gate`, so `lead-alert` emails it) and returns a pass: a signed note that runs out after 30 days.
- **What the pass opens.** `voice-token` refuses a call without a valid pass (`needs_email`), so only a visitor who left an email can spend ElevenLabs minutes. The Pip page adds the pass to the call link; `public/talk.html` sends it on.
- **The bot check.** Vercel BotID, basic level, on the website's `POST /api/scan`, `/api/chat` and `/api/demo` (`instrumentation-client.ts`, `isBot()` in `lib/server/guard.ts`). A request that fails it is treated as over the limit. `/api/gather` is left out because `site-kit` and `pip-reader` call it server to server.

## Board first and the API Shelf

- An order from Pip's Lock it in reaches `pip-forge/intake` three ways: the Pip page through the PIP Reader connector, Pip's order page on this site (`/lock.html` → `/api/order`), or any client that posts the same body.
- The Forge Board builds it on Brayden's Claude plan. If no Board takes it within the fallback window (6 hours by default), the `pip-forge` cron builds it on the API key, under the per-order cap, the daily cap and the kill switch (`forge_settings`).
- Every teammate's building blocks are checked against the Shelf (`api_shelf`, `shelf_links`). What isn't owned yet becomes an `api_needs` row and one email. A database trigger refuses go-live while anything is missing.
- Keys go into Supabase secrets by hand. Nothing here reads a secret's value; the Shelf only checks that a secret with the right name exists.

## Owner sign-ins and the red team

- When a teammate needs the owner's own tool (their Gmail, calendar or job software), ask the Pip Forge connector for `client_connect` with the order and a Composio toolkit name. It returns a sign-in link to send the owner. The owner signs in on Composio's page and Composio keeps the token; `client_connections` stores only ids and a status. It does nothing until `COMPOSIO_API_KEY` is in Supabase secrets and Composio is marked funded on the Shelf.
- Before go-live, run the **Red team (Promptfoo)** workflow in GitHub Actions with the order code. It attacks each built teammate's real system prompt (prompt injection, prompt extraction, hijacking, made-up promises, impersonation, PII, plus the teammate's own "never" rules), posts a table on the run page and saves passed / total on the teammate. It needs two repository secrets, `PIP_FORGE_URL` and `ANTHROPIC_API_KEY`; without them it stops with a notice. Promptfoo's telemetry, sharing and hosted attack generation are switched off.

## Differences from what's deployed

This copy matches the deployed functions as of November 12, 2026, with these changes made for publishing:

- `lead-alert`: the recipient comes only from `LEAD_ALERT_TO`, not a hard-coded address.
- `pip-reader`: the allowed endpoints are built from `SUPABASE_URL` instead of a hard-coded project URL.
- `voice-token`: the ElevenLabs agent comes from `ELEVENLABS_AGENT_ID`.
- `site-kit`: the check code comes from `SITE_KIT_CHECK_CODE`. The deployed copy (version 35) has the code written into the file; the repo never does, and a test fails if it appears. Everything else in the repo's file is the deployed source. A deploy from `main` needs that secret set first. With it unset, the three things the code opens are simply off: the key check (`check=`), the competitor test run (`rivals=check`) and the Maps re-look (`insight=1&maps=1`).
- `pip-reader`, `pip-forge`: the deployed copies hold the project address; `pip-forge` imports `forge.js` from this repo through jsDelivr, pinned to a commit.
- Two temporary admin and diagnostic functions are left out.
- `pip-shelf` in this repo is behind the deployed one: it has no `POST /funds`, which the Forge connector's funding tools call. Do not deploy `pip-shelf` from `main` until its deployed source is brought in (`docs/forge.md`).

## Secrets

`ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `RESEND_API_KEY`, `LEAD_ALERT_TO`, `LEAD_ALERT_FROM`, `SITE_KIT_CHECK_CODE`, plus any key the API Shelf asks for (`COMPOSIO_API_KEY`, `TWILIO_AUTH_TOKEN` and the rest, by the name the Shelf shows), plus optional `FIRECRAWL_API_KEY`, `MICROLINK_API_KEY`, `OPENAI_API_KEY`, `DATAFORSEO_PASSWORD`, `FOUNDER_TOKEN` and the `BRAIN_*` budget caps. Supabase provides `SUPABASE_URL` and the service key itself.

## Switching the job timer on

The migration `20261117_01_job_runner.sql` schedules the 5-minute knock on `pip-jobs`, but it does not contain any project's address. The knock reads the address from `public.forge_settings`, key `functions_url`, each time. With no such row, or a value that is not `https://<host>/functions/v1`, nothing is called. So a test project that runs the same migration can never call the live function.

To switch the timer on for a project, run this once on that project, with that project's own address (for the live project the reference id is in `docs/handbook.md`). It goes through the Supabase migration tool like any other change, so Brayden sees the approval prompt:

```sql
insert into public.forge_settings (key, value)
values ('functions_url', to_jsonb('https://<project ref>.supabase.co/functions/v1'::text))
on conflict (key) do update set value = excluded.value;
```

To switch it off, delete that row. The schedule stays; it just has nowhere to knock.
