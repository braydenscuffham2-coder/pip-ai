# Edges: how Pip connects to anything, honestly (Part D)

Written November 27, 2026. Code: `supabase/functions/pip-edge/`, `_shared/edges.ts`, `_shared/ladder.ts`,
`supabase/migrations/20261127_09_edges.sql`, `public/form.html`, `integrations/zapier/`.

Status words used here: **built** means merged and tested with fakes; **live** means deployed; **proven** means it ran
for real against a test business. Anything not marked proven is not claimed to work in a business.

## 1. The ladder

Pip reaches a tool by the first rung that fits the tool **and** that Pip can run today. The decision and its reason are
written to `tool_routes` for that business (`ladder_pick` in the Forge connector), and what is not known is listed as
not known.

| # | Rung | When it fits | Can Pip run it today? |
| --- | --- | --- | --- |
| 1 | The tool's own API or sign-in (Composio) | A reviewed connection for it is in `tool_catalog` | Yes. Proven for Google calendar, email and sheets. |
| 2 | A sync partner for the line of work | A partner is named for it | No. Nothing is signed. Candidates to evaluate: NexHealth and Sikka (dental and vet practice systems), Conductor (QuickBooks Desktop). Prices and terms not checked. |
| 3 | The owner's own Zapier | The tool is on Zapier and the owner already uses Zapier | No. The Pip integration is prepared, not published (section 4). |
| 4 | Email, webhooks, forms and exports | The tool can send any of them | Built. Live and proven status is in section 7. |
| 5 | Screen work on Pip's browsers | It has a web sign-in and its terms allow a separate login for Pip | No for real tools. Proven on Pip's practice tool; an owner cannot yet sign a real tool in (docs/runtime.md). |
| 6 | The on-site box or a desktop connector | Installed software with no web route | No. Designed in docs/runtime.md, not built. |
| 7 | Pip builds the piece | The business has no software for the job | No. Part E. |

Which rungs are ready is the setting `forge_settings.ladder_ready`, so a rung becomes pickable without a deploy.
Zapier is only ever the owner's own account: Pip never connects a customer's tools through an account of its own.

## 2. Doors in

A door is a way the business's own world starts a teammate's job with nobody asking Pip.

| Door | What the business does | The event a job listens for |
| --- | --- | --- |
| `webhook` | Another system posts JSON to `…/pip-edge/hook/<door id>` with the header `x-pip-secret` | `webhook_received` |
| `email` | Anyone emails `in-<business>-<8 letters>@hirepip.com` | `email_received` |
| `form` | A customer fills in `hirepip.com/form.html?f=<door id>` | `form_submitted` |
| `zapier` | A Zap (or Make, n8n, any app that can send a header) posts in the same way as a webhook | `webhook_received` |
| a schedule | Nothing. The job's own `schedule` trigger (already live in `pip-jobs`). | |

A job listens with `{ "type": "event", "from": "pip", "event": "form_submitted", "if": { "field": "door", "is": "refill_form" } }`.
`pip-jobs` starts it at most once per knock, and only for a teammate that may act for real (live, or on a TEST business).

The rules, all in code:

- **What arrives is information, never instructions.** It is cleaned, capped and handed to the job inside a data block.
- **Secrets are dropped.** A field whose name says it is a secret (password, token, card number, code) is removed before
  anything is stored. Card numbers, SSNs, passwords and codes inside free text are blanked.
- **A form cannot ask for a secret.** A form with a password, card or code field is refused when it is made. Only the
  fields the form declares are kept. A hidden trap field catches bots, which get the same quiet thanks as a person.
- **A webhook's secret is shown once**, to the owner, in the Portal. Pip keeps only its hash. It is accepted in a header,
  never in the address, so it cannot land in a log. Making a new one stops the old one.
- **Limits per door** (60 an hour, 500 a day by default), **one pause switch** (`forge_settings.edges_paused`), and
  repeats count once (an `Idempotency-Key` header, or the same body).
- **STOP by email is an opt-out.** It is recorded for that business and sender and starts nothing.
- **Kept 30 days**, then deleted by a nightly job.

## 3. Doors out

| Way out | How | Status |
| --- | --- | --- |
| A sheet, an email, a connector | The job's own tool permissions (`kit:` tools through Composio) | Live before this part |
| A webhook (`out` door) | The pip record `outbound_post`. The teammate names the door; the address was set by the owner. Pip posts over https to a named public host only, never to Pip's own systems, never following a redirect, and signs the body (`x-pip-signature`, HMAC-SHA256 over `<timestamp>.<body>`). The model never sees the address or the key. | Built |
| A feed (`zapier` door) | The same record. Nothing is pushed: the item waits and the connected app reads it with the door's secret. | Built |

A teammate in test mode posts nothing ("Test mode: nothing was sent").

## 4. The Pip Zapier integration (prepared, not submitted)

`integrations/zapier/` is a Zapier Platform CLI app (core 19).

- **Connect**: the owner pastes two values from their Portal (Setup, Doors, the door called Zapier): the Connection ID
  and its secret.
- **Trigger, "New Update From Your Pip Team"**: starts a Zap once for each update a teammate left in the door's feed.
- **Action, "Send to Your Pip Team"**: tells the team something happened; every job listening to that door starts once.
  Zapier's own run id is the once-only key, so a retried step does not start a job twice.

An owner who already uses Zapier then connects any of Zapier's apps to Pip inside their own Zapier account, at their own
task cost. Pip holds none of their Zapier connections. Tests run in CI against fakes of Zapier and of Pip's door.
What is **not** done: `zapier-platform push`, an invite link, and the public listing. Each needs Brayden's Zapier
account and his yes. The exact steps are in `integrations/zapier/README.md`.

## 5. Zapier MCP and SDK for the long tail: evaluated, not adopted

Read on November 27, 2026 from Zapier's pricing, rates and MCP usage pages.

- Zapier MCP has no price of its own. It runs on the Zapier plan of whoever owns the MCP server, and **each successful
  tool call uses 2 tasks** from that plan. A failed call uses none. "Find a contact, then email them" is 2 calls, 4 tasks.
- The Zapier SDK (beta) draws from the same task allowance.
- Connections live in the Zapier account that owns the server.

So for Pip it only fits if **each owner brings their own Zapier account** and makes their own MCP server: then the
connections and the task bill are theirs, which is the rule. A single Pip account would put every customer's tools
behind Pip's login and Pip's task bill; that is refused.

Recommendation: **do not adopt now.** It would make a teammate's reach depend on an owner creating a Zapier MCP server
and pasting a server address, which is more to ask than "connect Pip in Zapier" (section 4), and a teammate that reads
and writes often would burn the owner's tasks at twice the rate of a Zap. Revisit when a real owner already on a paid
Zapier plan needs a tool that no other rung reaches. If adopted: the owner's own server address goes in their vault,
never one shared Pip server, and the Portal shows the owner the 2-tasks-a-call cost before they connect.

## 6. Composio against Pipedream Connect, for per-client managed sign-ins

Pip uses Composio today for Google and Outlook through Pip's own app. The question is what to use when there are many
clients, each connecting their own tools. Prices read on November 27, 2026; both vendors changed pricing during 2026,
so re-read before deciding.

| | Composio | Pipedream Connect |
| --- | --- | --- |
| What you pay for | Tool calls. Connected accounts: the first 1,000 free, then a one-time $0.10 each on paid plans (Composio's pricing page). | External users (each client who connects at least one account counts once) plus usage credits. |
| Entry price for production | Free tier with a monthly tool-call allowance; paid plans from $29 a month. The August 2026 change cut the $29 plan's allowance and raised overage to about $4 per 1,000 calls; published figures for the free tier disagree between pages (10K, 20K and 100K calls appear), so treat the free allowance as unconfirmed. | Development is free. Production starts at the Connect plan, about $99 a month, with 100 external users included, then $2 per user per month. |
| Price per Pip client | Near zero per client; cost follows how much the teammates do. | About $1 a client at 100 clients, then $2 for each one after. Predictable, and unrelated to how much they do. |
| Catalog | About 1,000 to 1,700 toolkits depending on the page. | 3,000+ APIs, 10,000+ tools. |
| Local-business software checked | Jobber and ServiceTitan have toolkits; Calendly, FreshBooks, Follow Up Boss listed. Housecall Pro, Toast, Mindbody, Vagaro and Square were **not** confirmed in this pass. | Jobber, Housecall Pro and ServiceTitan have apps. Toast, Mindbody, Vagaro and Square were **not** confirmed in this pass. |
| Auth types | OAuth2 and API key, with Pip's own OAuth app where a vendor allows it (how Google runs today). | OAuth and API keys, with Pipedream's OAuth clients or Pip's own. |
| What the owner sees | The vendor's own sign-in page; the return address is Composio's unless Pip's own app is used. | A Pipedream-branded connect screen by default. |
| Risks seen | Two pricing overhauls in 2026. | Bought by Workday (announced November 2025); its original Workflows product shuts down in March 2027; no public changelog entry since October 2025, per a competitor's comparison page. |

**Recommendation: stay on Composio for now; do not sign up for Pipedream.** Reasons: Pip already runs on it with
least-permission Google sign-ins and a reviewed tool catalog; its cost per client is close to nothing, which matters
while clients are few and teammates are light; and Pipedream's per-user price buys a larger catalog Pip cannot yet show
it needs. The catalog gap is real for home services (Housecall Pro), so the trigger to revisit is concrete: the first
paying client whose core tool is on Pipedream and not on Composio, or Composio's bill passing about $2 a client a month.
Before either, confirm the unconfirmed rows above by searching each vendor's catalog from a signed-in account.

Beyond "Composio's 5 free shared connections": that limit is on Composio's own shared OAuth apps. Pip's Google and
Outlook sign-ins already run on Pip's own apps, so they are not bound by it. Each further vendor needs either Pip's own
OAuth app registered with that vendor (their partner programs: Part H prep packs) or an API key the owner pastes into
their vault.

## 7. What is proven

Filled in after deploy; see the rollback document's row for this change for the live checks.
