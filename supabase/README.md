# Supabase edge functions

Pip's backend on Supabase: Deno edge functions next to a Postgres database (19 tables). The Next.js app reaches the database only through locked-down database functions (see `lib/server/store.ts`). These functions handle the work that lives outside the website.

| Function | What it does |
|---|---|
| `lead-alert` | Emails each new lead to the owner through Resend. A database trigger calls it when a lead is inserted, and a 15-minute cron retries anything that didn't send. A burst of leads becomes one digest. |
| `voice-token` | Hands the call demo a one-time ElevenLabs token for a call with an AI teammate. Adds a monthly ceiling on top of the agent's own daily and per-call caps. |
| `site-kit` | Reads a business's homepage for what Pip needs to show it back to them: logo, colors, fonts, headline, menu and buttons. |
| `rival-read` | Reads each competitor's own homepage: what it says and what it lets a customer do. |
| `scan-run` | The Brain, as a resumable job. Each call runs one stage and chains the next, so no request outlives the edge-function limit. Has per-scan, per-month and per-IP budget caps. Google review text is used while the job runs and never stored. |
| `pip-forge` | The building side. Takes an owner's order and turns it into build orders, skill specs and queued build jobs. |
| `pip-reader` | A small remote MCP server that lets the Pip build inside the Claude app call Pip's own read endpoints, and nothing else. |

`scan-run/brain.js` and `pip-forge/forge.js` are bundled build files. They carry the 63-part primitives library and the stage logic.

## Differences from what's deployed

This copy matches the deployed functions as of November 12, 2026, with these changes made for publishing:

- `lead-alert`: the recipient comes only from `LEAD_ALERT_TO`, not a hard-coded address.
- `pip-reader`: the allowed endpoints are built from `SUPABASE_URL` instead of a hard-coded project URL.
- `voice-token`: the ElevenLabs agent comes from `ELEVENLABS_AGENT_ID`.
- `site-kit`: the key-check code comes from `SITE_KIT_CHECK_CODE`. The check is off when it's unset.
- Two temporary admin and diagnostic functions are left out.

## Secrets

`ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `RESEND_API_KEY`, `LEAD_ALERT_TO`, `LEAD_ALERT_FROM`, `SITE_KIT_CHECK_CODE`, plus optional `FIRECRAWL_API_KEY`, `MICROLINK_API_KEY`, `OPENAI_API_KEY`, `DATAFORSEO_PASSWORD`, `FOUNDER_TOKEN` and the `BRAIN_*` budget caps. Supabase provides `SUPABASE_URL` and the service key itself.
