# Pip Portal: backend map

What the Portal page talks to, and what is still waiting. Written for whoever wires a new front end to it.

## Where things live

| Piece | Where | Notes |
| --- | --- | --- |
| Portal page | `public/portal.html` | One file, no build step. Live at `https://www.hirepip.com/portal.html`. |
| Sign-in, business data, setup steps | Supabase function `pip-portal` | Source is only in Supabase for now (`supabase functions download pip-portal`). |
| Founder steps, consent, cancel, card on file, usage | Supabase function `pip-portal-ops` | `supabase/functions/pip-portal-ops/index.ts` |
| Billing run and inbound texts | Supabase function `pip-run` | Source is only in Supabase for now. |
| Rules | Postgres functions named `portal_*` | The functions above prove who is signed in; the database decides what they may do. |

Base URLs: `https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-portal` and `.../pip-portal-ops`.
Every signed-in call sends `Authorization: Bearer <Supabase session token>`. Errors come back as `{ "error": "<code>", "message"?: "<plain words>" }` with a matching HTTP status.

## Calls the page makes

**`pip-portal`** (unchanged): `POST /signin {email}`, `GET /me`, `GET /business/:id`, `GET /business/:id/activity`,
`POST /business/:id/{profile|accept|connect|refresh|phone|texting|ack|vault|unsupported|issue|people|remove-person|alerts|disconnect}`,
`POST /business/:id/agents/:spec/{pause|resume}`, `POST /founder/{businesses|quote|link|agreement|setting|resolve}`.

**`pip-portal-ops`**:

| Call | Body | Who | Returns |
| --- | --- | --- | --- |
| `POST /rpc/founder_step` | `{business, args:{slot, status: active\|needed\|submitted, pip_number?, note?}}` | founder | `{ok, left}` |
| `POST /rpc/supervise_now` | `{}` | founder | `{ok, result:{paused, resumed, flagged}}` |
| `POST /rpc/consent_add` | `{business, args:{kind: phone\|email, channel: sms\|voice\|email, contacts:[...], attest:"true"}}` | owner, staff | `{ok, added, opted_out_skipped, already_on_file, not_valid}` |
| `POST /rpc/consent_export` | `{business}` | owner | `{ok, rows:[{at, ending, kind, channel, purpose, status, method, code}]}` |
| `POST /rpc/cancel` | `{business, args:{name}}` | owner, needs a sign-in under 15 minutes old and status `disconnected` | `{ok, deleted}` |
| `POST /rpc/billing_status` | `{business}` | anyone on the business | `{ok, card_on_file_at, card_hint, price_accepted, billing_status}` |
| `POST /rpc/usage` | `{business}` | anyone on the business | `{ok, billing_status, monthly_usd, included_usd, rates, started, period_start, period_end, lines:[{unit, qty, rate_usd, value_usd}], value_usd, beyond_plan_usd, past_due_since}` |
| `POST /rpc/founder_billing` | `{business, args:{included_usd?, rates?:{unit: usd}}}` | founder | `{ok, included_usd, rates}` |
| `POST /billing/start` | `{business}` | owner | `{ok, url}`; send the browser to `url` (Stripe's card page) |
| `POST /billing/confirm` | `{business, session}` | owner | `{ok, card_hint}`; call it when the page loads with `?card=<session>` |

`usage`, `founder_billing` and the `billing_status` field on `billing_status` need database update `portal_07` (below).

## What a front end should show that the old page does not yet

- **Price terms in numbers.** `business.quote.included_usd` and `business.quote.rates` (for example `{"conversation":0.15,"sms":0.04,"voice_minute":0.25}`) next to the monthly price, before the owner accepts.
- **This month's usage.** From `/rpc/usage`: used so far, what is included, and anything beyond the plan.
- **Billing state.** `billing_status`: `none`, `due` (live, first charge pending), `active`, `past_due` (card declined, days left before a pause), `paused`, `ended`.

## Billing rules (decided 2026-11-16)

- Charging starts on go-live day. Any setup fee is on that first invoice.
- Each plan includes a usage allowance in dollars. Use is valued at the rates in the business's quote.
- Use beyond the allowance is added to the next invoice. More than `threshold_usd` beyond it is invoiced right away.
- Usage never pauses a team. Only an unpaid invoice does, after `grace_days` of alerts, and the team restarts on its own when the invoice is paid.
- Defaults live in `forge_settings.billing_defaults`. The default rates are estimates and need the founder's review.

## Waiting on someone

- `supabase/migrations/20261116_portal_07_billing_and_texting.sql` is written and **not applied**. Supabase asks the founder to approve it.
- `STRIPE_SECRET_KEY` (from the Pip Stripe account) is not saved yet. Card on file and billing answer "not switched on" until it is.
- Texting: point the Twilio number's "a message comes in" webhook at `https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-run/twilio/sms` (POST). Carrier registration must be approved before replies deliver.
- Phone calls are not built. A call can outlast a Supabase function, so the plan is ElevenLabs for the call audio with Pip's own runtime as the brain. It needs a phone number first.
- The runtime (`app/api/runtime/chat`) records a teammate's actions as owner notifications. It does not yet carry them out in the connected tools.

## Where things stand, late November 16

### Live now
- Billing is in the database and connected to the live Pip Stripe account, which can take charges. Charging starts on
  go-live day. Usage beyond the plan goes on the next invoice. Usage never pauses a team. Only an unpaid invoice does,
  after 7 days of alerts, and the team restarts on payment.
- A card on file is required before go-live (`portal_require_card` is on).
- Default usage rates are kept: $0.15 a chat, $0.04 a text, $0.25 a call minute, with 40% of the monthly price included.
- A daily check (`portal_billing_watch`) emails the founder about use that is not being billed.

### Teammates that act (`supabase/functions/pip-turn`)
- Runs one turn of any teammate, including ones built on the Forge Board, from their finished instructions.
- Lets a teammate use the owner's connected calendar, sheet and email through Composio. Pip never sees the sign-in.
- Limits enforced in code: calendar read as busy times only; email only to an address the customer typed in that
  conversation, with an AI line; rows only to one sheet Pip creates; a tool that loses its sign-in pauses that one job;
  at most 6 actions a turn; a teammate that is not live acts for real only for businesses in `act_sandbox_businesses`.
- Allowed tools are rows in `tool_catalog`. Nothing outside it can be called.
- Website chat (`/api/runtime/chat`, Board-built teammates) and texts (`pip-run`) both go through `pip-turn`.
- `pip-turn` and `pip-run` are deployed as a one-line import pinned to a commit of this repo. To ship a change:
  commit it, then redeploy the function with the new commit id.

### Waiting
- A live test in a real Google account (TEST Fork).
- Phone calls, built after that test passes (ElevenLabs paid plan, Twilio funds and a number needed).
- Twilio balance and carrier registration before any text can send.
- Template and camera-box teammates (wait forecast, table watch, floor pulse) have no runner yet.
- The first three Portal migrations, portal_06 and the `pip-portal` function exist only in Supabase, not in this repo.

## Google sign-ins through Composio: what consent is possible (November 17)

Pip uses Composio's own Google app for owner sign-ins. That app only offers a fixed list of Google permissions, and Google blocks anything outside it ("This app is blocked").

| Step | Permission Google shows the owner | Why |
| --- | --- | --- |
| Spreadsheet | Only the Drive files this app makes (`drive.file`) | Works. Matches the Portal's promise. |
| Calendar | Full calendar (`calendar`) | `calendar.events` passes Google's screen and can read, but Composio's create-event tool fails on it with "insufficient authentication scopes". |
| Email | Full mailbox (`https://mail.google.com/`) | The only Gmail permission Composio's app offers. `gmail.send` is blocked by Google for that app. Gmail access also ends after six months unless the owner ticks "ongoing access". |

What limits a teammate in practice is therefore not Google's screen but two things on Pip's side:
1. Each Composio sign-in config has an execution allowlist: Gmail send only; Calendar list and create only; Sheets create and append only.
2. `pip-turn` only offers tools that have an enabled row in `tool_catalog`, with hidden and fixed fields.

To get a consent screen that says "Pip" and asks only for send-mail and calendar events, Pip needs its own Google OAuth app (Google Cloud project, verified by Google for `gmail.send` and `calendar.events`), then Composio auth configs that use that app instead of Composio's. That is a founder decision and a Google review, not a code change.

## Signing in again

A connected step can be signed in again from the Portal ("Sign in again or switch account"). The working sign-in stays in use; the new one is stored in `business_connections.detail.pending` until Composio reports it active, then the step switches and the old account is deleted at Composio (`detail.replaces` holds any that could not be deleted yet, retried on each check). Unfinished sign-ins are removed after two hours (second sign-ins) or a day (first sign-ins for extra tools).

## The page is three files (November 26)

`public/portal.html` (sign-in, the app, every card) loads two parts after first paint, from the same site:
`public/portal-pip.js` (Pip in 3D) and `public/portal-office.js` (the office). Pictures live in `public/portal-art/`. The CSP allows `'self'` scripts for these two files only; nothing else changed in it.
Bump `PART_V` in portal.html when either part changes in a way the page depends on.

## The office is pictures, not 3D (November 26)

`portal-office.js` no longer renders a 3D room. Each place (the floor, every station, a teammate's desk in four moods,
the goodbye) is one cleaned Higgsfield picture in `public/portal-art/sc/` (2400px, plus a `-s` 1280px copy for smaller
screens). The pictures have no characters in them. Teammates are the original Pip-family floating heads from portal.html
(`face()`, the same rigged art as the Marketplace), placed live: at their seats on the floor (with a clipped copy of the
floor drawn in front), and at their own desk in a close-up. Moving around is a zoom and cross-fade the browser's compositor runs on its own, so it stays at full
frame rate. Pip is the only live 3D, from his original engine on one small canvas.

Everything you click is HTML from portal.html: tags, Pip's bubble, and `sceneCards()` (the cards and labels inside each
station, positioned in percent of its picture). A station opens on its scene; "Everything here" or any card opens the
station's full panel. Positions are at the top of portal-office.js (`SCENES`, `SEATS`). "Let go" shows the goodbye scene
behind its card; the button itself still does nothing (`letGoNow`).
