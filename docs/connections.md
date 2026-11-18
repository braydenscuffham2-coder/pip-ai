# Connections: where things stand, what failed, and the plans

Owned by lane 03. Log and requests live on issue #17. Last updated November 17.

## 1. Google runs on Pip's own Google app

Owners now sign in through Pip's own Google project (`pip-ai`), not Composio's shared one. That is what lets Pip ask for less.

| Step | Composio config | What the owner grants | Tools allowed |
| --- | --- | --- | --- |
| Email | `ac_rLk6_10SZ2Fw` | Send email on your behalf. See your email address. | `GMAIL_SEND_EMAIL` |
| Calendar | `ac_6wfeUkZbxNQY` | View and edit events. See calendar names and time zones. | `GOOGLECALENDAR_EVENTS_LIST`, `GOOGLECALENDAR_CREATE_EVENT` |
| Spreadsheet | `ac_z_Z1RPnwseGn` | Only the files Pip itself makes. See your email address. | `GOOGLESHEETS_CREATE_GOOGLE_SHEET1`, `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND` |

`forge_settings.sign_in_configs` points the Portal at these three, plus Outlook (section 4). The older Composio-managed configs still exist and are no longer used for new sign-ins.

**Smallest calendar permission that lets a hold be created:** `calendar.events` plus `calendar.calendars.readonly`. `calendar.events` alone fails with "insufficient authentication scopes", because Composio's create-event tool also reads the calendar's own settings (its time zone). The second permission shows the calendar's name and time zone and nothing inside it. Both are in Google Cloud's Data Access list so the review request matches what owners see.

### Live results on TEST Fork after the switch

| Tool | Result |
| --- | --- |
| Check the calendar | Pass |
| Add a calendar hold | Pass |
| Make the Pip sheet | Pass |
| Add a row to the sheet | Pass, on a new sheet (see below) |
| Send an email | **Fails until pull request #32 is merged and `pip-turn` is redeployed** |

**Why email fails.** With send-only access, Composio's tool cannot look up which mailbox it is sending from and refuses: "Unable to resolve the sender email address automatically". When Pip passes the address, the email sends. Gmail replaces the sender with the signed-in mailbox whenever they differ (tested with a made-up sender; the copy in Sent shows the real mailbox), so this cannot be used to send as someone else. Pull request #32 makes `pip-turn` pass the business owner's address.

**Why the sheet moved.** "Only files Pip makes" is tied to the Google app that made them. The sheet made under Composio's app is invisible to Pip's app. The lost-sheet recovery made a new sheet and saved the row there. The old sheet and its rows are still in the owner's Drive. This only matters for TEST Fork, since no client signed in under the old app.

### What an owner sees, and what is wrong with it

1. **The screen says "composio.dev wants access", not "Pip".** Google shows the app's verified name. Until Google verifies Pip's brand, it shows the domain the sign-in returns to, which is Composio's.
2. **"Google hasn't verified this app."** Every owner gets this warning while the app is in Testing, and only people on the test-user list can sign in at all (100 lifetime cap).
3. **A tick box for "Send email on your behalf".** Google shows sensitive permissions as boxes the owner may leave empty. If they do, the step shows Connected and email still fails.
4. **The sign-in link lasts 10 minutes.** An owner who pauses on Google's screens lands on a Composio page with a raw error ("connection is no longer awaiting completion") instead of back in the Portal.

Fixes: 1 and 2 need Google's review (section 2). 3 and 4 are Portal wording and a check after sign-in (asked of lane 06 on its issue; the check itself is lane 03's to build).

## 2. Google's review: what it needs

Google will not publish the app or verify the brand without all of these:

- A home page on hirepip.com that says what Pip is, and links to the privacy statement.
- A privacy statement on hirepip.com that includes Google's "Limited Use" wording.
- Terms of service on hirepip.com.
- hirepip.com verified in Google Search Console by the same Google account.
- A support email on the consent screen that is not Brayden's personal address.
- For the sensitive permissions (`gmail.send`, `calendar.events`, `calendar.calendars.readonly`): a written reason for each, and a short video of the sign-in and of each permission being used.

Reasons to give Google, in the words it expects:

| Permission | Reason |
| --- | --- |
| `gmail.send` | A business owner connects their own mailbox so their AI assistant can send replies and booking confirmations to their customers from the owner's address. Pip never reads, lists or deletes mail. |
| `calendar.events` | The assistant checks when the owner is busy and adds a hold when a customer asks for a time. Pip's code returns busy times only; event titles, guests and notes are never shown to the model or stored. |
| `calendar.calendars.readonly` | Needed to read the calendar's time zone so a hold is created at the right time. Nothing inside the calendar is read through it. |
| `drive.file` | Pip creates one spreadsheet in the owner's Drive and adds rows to it. It cannot see any other file. |
| `userinfo.email` | To show the owner which Google account is connected. |

Lane 10 writes the privacy statement and terms. Review of sensitive permissions takes about two weeks once everything is in, and approval is not guaranteed.

## 3. Composio's allowlist: tested, and what it does not do

Each Composio config has an "Execution Allowlist". The brief asked for proof that Composio itself refuses a tool that is not on it.

**It does not, on the path Pip uses.** Test on November 17: removed `GOOGLECALENDAR_EVENTS_LIST` from the calendar config's allowlist, saved, confirmed by reload, then ran that tool on TEST Fork five times over 17 minutes, the last one after `pip-turn`'s 20-minute session memory had expired so the session was certainly new. Every call ran. The allowlist was put back afterwards.

Pip's Composio key cannot run tools directly; it opens a session and runs the tool inside it. The allowlist is not applied to tools run inside a session.

What actually limits a teammate today, strongest first:

1. **The permission the owner granted.** On Pip's own Google app, Gmail can only send, and Sheets can only touch files Pip made. No setting at Composio or bug at Pip can widen that. Calendar is the weak spot: "view and edit events" also allows changing and deleting events and reading their details.
2. **`pip-turn`'s own code.** Only tools in `tool_catalog`, with hidden and fixed fields. Covered by lane 09's tests.
3. **Composio's allowlist.** No effect for Pip, as shown above.

What to add:

- **A tool filter on every session** (asked of lane 01): create the session with `"tools": {"<toolkit>": {"enable": ["<exact slugs from tool_catalog>"]}}` in place of the whole toolkit. Composio documents this as enforced when the session runs a tool. It is still Pip's own code setting it, so it guards against a bug or a tricked model, not against a stolen key.
- **A narrower Composio key** (Brayden, in Composio's API Keys page): Composio keys can be scoped per area. The key in Supabase needs auth configs (read and write), connected accounts (read and write), tools (read) and session tool execution. It should not have direct tool execution or proxy execute.
- **The second-key test is still worth doing** once the session filter is in: a key with only session execution, used to try a tool outside the filter.

The proof line in `docs/lanes.md` ("a wrong tool call is refused by Composio itself, not only by Pip") is **not met** and cannot be met by the allowlist.

## 4. Microsoft (Outlook mail and calendar)

Set up, not yet tested with a real account.

- Config `ac_F-SF6rglo7Ww` (Composio's Microsoft app). Composio's default asks for 12 permissions, including reading and changing all mail, contacts and Teams chat. Cut to 4: `Mail.Send`, `Calendars.ReadWrite`, `offline_access`, `User.Read`.
- Allowlist: `OUTLOOK_SEND_EMAIL`, `OUTLOOK_GET_CALENDAR_VIEW`, `OUTLOOK_CALENDAR_CREATE_EVENT`.
- Microsoft has no "add events only" permission. `Calendars.ReadWrite` can also change and delete events, so the limit has to come from Pip's code and the session filter (section 3).
- **A hole, now closed:** the Portal offered Outlook for the Email and Calendar steps, but `tool_catalog` has no Outlook rows. An owner who picked Outlook would have seen "Connected" while their teammate could do nothing with it. Outlook was taken off both steps on November 17 (`connection_catalog.choices`). Put it back once the rows exist and pass a live test: `{"label":"Outlook","toolkit":"outlook","provider":"microsoft"}` on Email and `{"label":"Outlook calendar","toolkit":"outlook","provider":"microsoft"}` on Calendar. The same gap exists on the Booking step (Calendly, Acuity and Square have no rows). It is left in place because removing every choice would break the step; it is flagged to lane 01.
- What lane 01 needs to add: three catalog rows, and a busy-times reader for Outlook's calendar format (it differs from Google's).
- To show "Pip" on Microsoft's screen, Pip needs its own Microsoft app registration and publisher verification, the same idea as Google.

## 5. Key and username-and-password tools

The path exists: the owner picks a tool in the Portal, and Composio's own page collects the key or the login. Pip never sees it. Reached the key page with Perplexity on November 17. Not finished end to end, because that needs a real key or login typed by the account's owner.

Two problems to fix before any client uses this:

- **"Add one record" is not always harmless.** For a tool that bills per use, adding a record can cost money or contact people: in Twilio, "create message" sends a text and "create incoming phone number" buys a number. Today only tools whose name looks like a payment tool are blocked. Raised with lane 01 for the permission profiles.
- **Nothing tests an extra tool safely.** The founder test route only reaches tools on a setup step.

## 6. A tool Composio does not carry

Example: Toast (restaurants) is not in Composio's list. Options found, least code first:

1. **Composio custom toolkit.** Register an outside tool server (MCP, over https) as a project toolkit: `POST /api/v3.1/custom/toolkits` with a name and the server's address. Composio then handles the owner's sign-in link and Pip calls it like any other toolkit. Marked experimental by Composio.
2. **Proxy call through an existing connection.** If Composio carries the vendor but not the action, a session can make a signed raw request to the vendor's API. Needs the "proxy execute" permission on Pip's key. Leave that off unless a tool needs it.
3. **Pip's own connector.** A small function per vendor, with the key in the password vault (lane 07's design). Most code, most control.

Not yet proven with a real tool. Recommendation: prove option 1 with one vendor a first client actually uses, rather than a demo vendor.

## 7. If Composio is down

Composio sits between Pip and every owner's tools. If it is down, no teammate can send email, read a calendar or save a row.

What happens today, per turn: the tool call fails, the customer is told a team member will follow up, and the action is marked failed. Nothing is retried later and nobody is told that Composio is the cause.

Plan, in order of value:

1. **Tell the difference between "the owner's sign-in broke" and "Composio is down".** A failure with no HTTP answer, or a 5xx, on two different businesses within 5 minutes is an outage. Do not pause jobs or alert owners for an outage; alert Brayden once.
2. **Keep the customer's request.** On an outage, save the intended action (who, what, when) as a pending item and tell the customer honestly that it will be done shortly. Lane 01's job runner retries it with its idempotency key when Composio answers again.
3. **Built-in actions keep working.** Notify the owner, capture a lead and request a booking write to Pip's own database and do not depend on Composio. Teammates fall back to these.
4. **A status line in the Portal** when an outage is active, so owners do not sign in again for nothing.
5. **Watch it.** A check every 5 minutes that opens a session and runs one harmless read on TEST Fork. Two failures in a row alert Brayden.
6. **Leaving Composio, if it ever came to that.** Sign-ins made through Pip's own Google and Microsoft apps belong to Pip's apps, so owners would have to sign in again with a new holder but would see the same consent screen. Key-based tools would need the key entered again. This is a reason to keep moving sign-ins to Pip's own apps.

Before the first client: move Composio to a paid plan with a support channel and stated limits. Prices were not confirmed in this session (the pricing page could not be opened). Brayden buys it.
