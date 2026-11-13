# Pip API contract

The frontend only talks to these five routes. The backend swap replaces what happens inside each route. The request and response shapes stay the same. All shapes are in `lib/types.ts`.

Every response that carries business data has `source: 'live' | 'preview'`. The UI shows a "Preview data" chip whenever `source` is `'preview'`. Only set `'live'` when the data really came from the site, Google, or Claude.

Today every route returns stand-in data from `lib/preview.ts`.

---

## POST /api/scan

Streams the scan as newline-delimited JSON (`application/x-ndjson`), one `ScanEvent` per line.

**Request**
```json
{ "url": "harborlinehvac.com" }
```

**Event order the UI expects**
1. `meta` → `{ type: 'meta', source }`. Send it first.
2. Any mix of the following, in any order:
   - `status` → `{ message, progress }`, where progress is 0 to 100 and only goes up.
   - `page` → `{ url, title }` for each page read. The UI shows the last 8.
   - `fact` → `{ key, label, value }`. The key is one of name, industry, services, hours, area, or phone, and a repeated key replaces the earlier one.
   - `tech` → `{ tool: DetectedTool, label }`. Send one per tool found on the site.
   - `reviews` → `{ rating, count, themes }`. Send it once. Negative themes need `relates` (an AreaId) so the engine can cite them.
   - `competitor` → `{ competitor }`. Send up to 4.
3. `done` → `{ profile, source }`. This is the full `Profile`. Leave `pains` empty; the owner fills them in. Leave `tools` as the detected ids, or empty if none.
4. `error` → `{ message, code }` can be sent instead of `done`. The code is one of `unreachable`, `blocked`, `invalid_url`, or `internal`.

**Errors before streaming**
- `400 { error: 'invalid_url' }`

**Notes**
- `harborlinehvac.com` is the reserved example business. The "See an example first" button scans it. The real backend should return the canned example profile for that domain instead of crawling.
- A good real scan finishes in 20 to 45 seconds. Send a `status` at least every 3 seconds so the bar keeps moving.
- Stop work when the client disconnects (`req.signal.aborted`).

**Real implementation plan**
- Fetch the homepage, plus the services, contact, and about pages found in the nav (max 6 pages, 8 second timeout each).
- Detect tools from script tags and known widget signatures. Map each one to a `ToolId` and record the `vendor` and `evidence`.
- Send the page text to Claude with a strict JSON schema to get name, industry, services, hours, area, and phone.
- Look up the business in Google Places: rating, review count, and up to 50 recent reviews. Have Claude cluster the reviews into themes with counts and one short real quote each.
- Search Google Places for 3 to 4 nearby businesses in the same category. Check each one's site for chat or booking tools to fill `note`.

## POST /api/recommend

**Request** `{ "profile": Profile }`. The server runs it through `sanitizeProfile` and returns `400 { error: 'invalid_profile' }` if it fails.

**Response** `RecommendResponse` `{ report, modules, source }`.

The rules engine in `lib/engine.ts` stays the source of truth for the score, area coverage, match %, and ranking, so results stay explainable and stable. Claude may rewrite `why`, `insight`, and the demo copy for each module so they use the business's real services and wording. It must keep the same module types and the same JSON shape. Validate Claude's output and fall back to the engine's text if it doesn't parse.

## POST /api/demo

This is the live demo. The owner plays a customer, and the AI answers as the business.

**Request** `{ profile, module: ModuleType, messages: ChatTurn[] }`. Keep the last 12 messages, 300 characters each.

**Response** `{ reply, source }`

Real version: Claude with a system prompt built from the profile (name, services, hours, area, phone) and the module's job. Its rules:
- It never quotes exact prices.
- It never invents services.
- It offers two concrete time slots when someone wants to book.
- It escalates emergencies.
- It keeps every reply to 2 sentences or fewer.
- It answers in plain text.

## POST /api/chat

This is Ask Pip.

**Request** `{ messages: ChatTurn[], profile: Profile | null, modules: ModuleType[] }`

**Response** `{ reply, source }`

Real version: Claude as Pip. Its rules:
- It gives short, plain answers.
- It never names prices or price packages.
- It never makes guarantees.
- It defers anything specific to "a person on our team".

## POST /api/leads

**Request** `{ name, contact, profile, modules }`. `contact` must be an email or a phone number with 10 or more digits.

**Response** `{ ok: true, id }` or `400 { error }`.

Real version:
- Insert into Supabase `leads` (name, contact, profile jsonb, modules text[], created_at, source).
- Notify the team by email or Slack.
- Rate-limit by IP.

---

## Environment the real backend will need

| Variable | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | Extraction, review themes, demo receptionist, Ask Pip |
| `GOOGLE_PLACES_API_KEY` | Rating, reviews, nearby competitors |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storing scans and leads (server only) |
| `LEAD_NOTIFY_WEBHOOK` | Optional Slack or email alert for new leads |
