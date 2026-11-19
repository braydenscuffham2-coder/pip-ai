# Materials for Google's review of Pip's sign-in app

> **DRAFT. Not legal advice. Not reviewed by a lawyer.** Lane 10, for lane 03. November 17, 2026.
> Google's rules summarized here are from [S12], checked November 17, 2026 from search excerpts. Google's policy page itself could not be opened in this session; lane 03 should read the current verification page before submitting.

## 1. Where things stand

- Decision (handbook, November 17): Pip's own Google app in project `pip-ai`, asking only for send mail, calendar events and files Pip made.
- Since November 17 to 18, 2026: sign-ins go through Pip's own Google app (project `pip-ai`). It asks for five permissions and no others: `gmail.send`, `calendar.events`, `calendar.calendars.readonly`, `drive.file` and `userinfo.email`. Composio's own Google app, which asked for the full mailbox and full calendar, is no longer used. Composio (a vendor) still runs the sign-in and stores the Google sign-in for Pip; Pip's own servers and the AI model never see it. Google sends the owner back through `https://www.hirepip.com/api/connect/callback`, so the screen names Pip's domain. Full-mailbox access is a "restricted" permission. **Pip's own app must not request it**, or Google will require a security assessment.
- November 18, 2026: ownership of hirepip.com was verified in Google Search Console.
- The pages Google will read are on hirepip.com: `/about` (the application home page), `/privacy` and `/terms`. `/privacy` and `/terms` show a short holding notice, not the draft. Each shows its document in full only when the file in `legal/` has no blanks left and the lawyer's switch for it is on (`LAWYER_SIGNED_OFF` in `lib/legal/facts.ts`). These pages are built on branch `10-public-pages` and are not live until it is merged and deployed.
- The Privacy Policy draft, section 4, lists all five permissions as of November 18, 2026, and the note about the old sign-in is closed. It is still a draft: it has blanks and no lawyer has reviewed it.

## 2. What Google will look for

| Requirement | Status | Who |
| --- | --- | --- |
| Home page on a domain Pip owns and has verified, that explains what the app does | hirepip.com verified November 18, 2026. `/about` is built: what a teammate does, the four things Pip asks Google for, the Limited Use statement, and links to `/privacy` and `/terms`. Give Google `https://www.hirepip.com/about` as the application home page once it is deployed. | Lane 10 built; Brayden to deploy |
| Privacy policy linked from the home page, on the same domain, matching the link on the consent screen | Page built at `/privacy` and linked from `/about`. It shows a holding notice until the draft has no blanks and the lawyer has signed off. Google will need the full policy there. | Lawyer, Brayden |
| The policy says what Google data is accessed, how it is used, stored and shared | Section 4 of the draft, with all five permissions | Lane 10 |
| Limited Use statement | In section 4, in Google's expected form. The same sentence is on `/about`. | Lane 10 |
| Only the permissions the features need, each justified | Section 3 below | Lane 03 |
| A demo video showing the consent screen and each permission in use | Not made | Lane 03 with Brayden |
| A support email on the domain | Not set up | Brayden |
| App name and logo that are Pip's own and do not use Google's marks | To check | Brayden |

## 3. Permission justifications

Paste-ready. One feature per permission, in Google's "My app will use … to …" form.

**`https://www.googleapis.com/auth/userinfo.email`** (non-sensitive)

Google's form normally asks for a justification only for sensitive and restricted permissions. If it asks for a line here, use:

> My app will use userinfo.email to show the business owner which Google account is connected to Pip. Nothing else from the profile is requested.

**`https://www.googleapis.com/auth/gmail.send`** (sensitive)

> Pip provides AI assistants that local businesses set up to answer their customers. My app will use gmail.send to send an email from the business's own Gmail address when the business's assistant needs to reply to a customer who asked for one, for example a booking confirmation the customer requested. The email is sent only to an address the customer typed in that conversation, and every email states it was sent by an AI assistant. The app cannot read, search, modify or delete any email. A narrower permission does not exist for sending.

**`https://www.googleapis.com/auth/calendar.events`** (sensitive)

> My app will use calendar.events to check when the business is busy so the assistant can tell a customer which times are open, and to add an event when a booking is made. The app reduces events to busy and free times on its own server before anything is shown to the AI model or the customer; event titles, guests and notes are not displayed or stored. A read-only permission is not enough because the assistant must add the booking. The broader calendar permission is not requested because the app does not manage calendars or sharing.

**`https://www.googleapis.com/auth/calendar.calendars.readonly`** (label to confirm in the Google Cloud console)

> My app will use calendar.calendars.readonly to read the name and default time zone of the business's calendars, so that when the assistant adds a hold or a booking it lands on the right calendar in the right time zone. The app does not read other calendar settings, and it cannot change a calendar or how it is shared. This is the read-only form of the permission; the form that can change calendars is not requested.

**`https://www.googleapis.com/auth/drive.file`** (non-sensitive)

> My app will use drive.file to create one spreadsheet named "Pip: [business name]" in the business's Drive and add a row when a customer leaves details, so the owner has a record. The app can only open files it created and cannot see any other file.

[LANE 03: the handbook asks you to "find the smallest extra calendar permission that lets a hold be created". If the final permission set differs from the five here, tell lane 10 so this page and the Privacy Policy change together. If `calendar.events` cannot be made to work and the full `calendar` permission is needed, the second justification must be rewritten and it remains a sensitive permission.]

[LANE 03: two things to confirm before pasting the `calendar.calendars.readonly` text. (1) Google's list of Calendar permissions, read November 18, 2026 (https://developers.google.com/workspace/calendar/api/auth), describes this one as seeing the title, description, default time zone and other properties of calendars. Seeing the list of calendars an account is subscribed to is a different permission (`calendar.calendarlist.readonly`). If the code asks Google for that list, this permission may not cover it. (2) That page does not say whether the permission is sensitive. Use the label the Google Cloud console shows.]

The sheet's name was checked in the code on November 18, 2026: `pip-turn/index.ts` creates it with the title "Pip: " followed by the business's name. The Portal and the About page call it "the Pip sheet".

## 4. Limited Use: how Pip meets each rule

| Google's rule, in plain words | What Pip does | Proof |
| --- | --- | --- |
| Use the data only to provide or improve the features the user sees | Used only to run the business's teammate | `pip-turn` offers only catalogued tools per teammate |
| Transfer only to provide those features, for security, to comply with law, or in a merger with consent | Busy times and email drafts go to Anthropic to write the reply; tool calls go through Composio | Privacy Policy sections 4 and 8 |
| No advertising use | None. Google user data is never sent to an advertising or analytics service. | hirepip.com loads Google Analytics for page counts only; it receives no Google user data |
| No person reads the data except with the user's agreement, for security, to comply with law, or when aggregated for internal operations | Calendar details and Google email content are not stored, so there is nothing to read. Conversations are stored and can contain a time or an email address a teammate used. | `busy_only` shape in `pip-turn`; **see open point below** |
| No use to train generalized AI models | None. Anthropic's commercial terms bar training on customer content [S16] | Privacy Policy section 6 |

**Open point for the lawyer (memo item 6).** The founder can read stored conversations to support a client. A conversation may include an open time slot that came from Google Calendar. If Google treats that as Google user data, human access needs the owner's agreement. Proposed fix: one line in the Terms and the Portal connect screen: "You agree Pip's support staff may view your teammates' conversations to fix problems you report."

## 5. What the consent screen and the Portal should say

Before the owner taps "Connect Google", the Portal shows:

> **What {teammate} will be able to do in your Google account**
> - See the email address of the Google account you connect. Nothing else from your profile.
> - Send email from your address. It cannot read your email.
> - See when you're busy and add events to your calendar. It does not see what your events are.
> - Read your calendar's name and time zone, so a hold lands on the right calendar at the right time.
> - Create one spreadsheet, the Pip sheet, and add rows to it. It cannot open your other files.
>
> You can disconnect at any time. [Privacy Policy]

## 6. Demo video outline (for lane 03)

1. `https://www.hirepip.com/about` (the application home page) and its privacy policy link.
2. Portal: the connect screen above, then Google's consent screen showing the app name "Pip" and the five permissions (the account's email address, send mail, calendar events, calendar name and time zone, files Pip made). The web address bar must be visible.
3. A customer chat on TEST Fork: asks for a time, the teammate checks the calendar (show busy times only), takes a booking, sends a confirmation email, adds a sheet row.
4. The owner's Gmail sent folder, calendar and the sheet showing the results.
5. Disconnecting in the Portal.
