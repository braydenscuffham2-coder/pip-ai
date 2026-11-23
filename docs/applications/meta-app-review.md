# Meta app review: posting to client Facebook Pages and Instagram

**Status:** prepared, not started. Prepared 2026-11-22. **Do not apply yet:** the screencast Meta requires cannot be recorded because no posting code exists (the content operator names a `social_posting` tool that Pip does not have).

## Why Pip needs it

The content operator posts owner-approved drafts to a client's own Page. That is access to data Pip does not own, so Meta requires Advanced Access, which requires App Review for every permission, plus business verification. Read-only parts can be built and demoed before review; publishing cannot go to real client Pages without it.

## Permissions to request (the smallest set that does the job)

| Permission | Why | Depends on |
| --- | --- | --- |
| `pages_show_list` | Let the owner pick which Page Pip may use | none |
| `pages_read_engagement` | Required with posting; reads the Page Pip posts to | `pages_show_list` |
| `pages_manage_posts` | Publish the approved post to the Page | `pages_read_engagement`, `pages_show_list` |
| `instagram_business_basic` and `instagram_business_content_publish` | Same, for the owner's Instagram professional account (Instagram Login) | See the Instagram review page; confirm which login type Pip will use |

Requesting `pages_manage_posts` alone is a configuration error; the dependencies must be in the same authorization. Do **not** request `pages_manage_engagement`, `pages_messaging`, `business_management` or ads permissions; Pip's operator does not need them and each adds review burden.

## Requirements, and where Pip stands

| Requirement | Pip today |
| --- | --- |
| Business verification, with documents showing the legal business name and address. For the US Meta lists an EIN letter or a state business registration; self-filed forms are not accepted; the name must match exactly | **Blocker.** Pip has no EIN and no known registration. Confirm with the lawyer whether an Idaho assumed-name registration counts before starting |
| A Meta developer app, with a Facebook Login for Business flow that lets the owner pick Pages | Not built |
| Privacy policy URL in App Settings, saying what data is collected, why, and how to ask for deletion | https://www.hirepip.com/privacy exists. Check section on deletion covers Meta data specifically (it says to email privacy@hirepip.com) |
| A way for people to ask for deletion. Meta's Platform Terms require the privacy policy to say how; the callback itself is optional per Meta's FAQ, but the app dashboard asks for a callback URL or an instructions URL, and practitioners report review stalls without one | Not set. The simplest honest option is an instructions URL that matches what Pip really does. A callback must be a real working endpoint that starts the deletion |
| App icon 1024 x 1024 with no trademarks or logos from others | Not made. Pip's own mark only |
| A separate written use case for each permission (copy-paste across permissions is a rejection cause) | Drafted below |
| A screencast per permission at 1080p or more, monitor width 1440 or less, English UI, no audio, mouse not keyboard, showing the whole sign-in and permission grant, then the feature working | **Blocked** until posting is built on a test Page |
| Reviewer access: instructions for how Meta reviews the app (reviewers use their own test accounts; do not give your personal credentials) | To write once the app exists |
| A real successful API call for each permission within 30 days of submitting | Blocked, same reason |
| Data handling and data protection questions, answered after business verification | Not started |

## Lead time (as published)

A decision within a week of submitting. Business verification is a separate step; Meta's page gave no duration. Changes to settings or features after submitting can trigger another review.

## What Brayden must do himself

1. Decide the entity and the exact legal business name with the lawyer (see README).
2. Sign in to Meta (his own login and any code) and create the developer app and the business portfolio.
3. **Stop here:** upload the business documents for verification, and press every submit. Meta may ask for IDs; those are his to provide.

## Drafted use-case descriptions (write them again in your own words if anything has changed)

These describe what the content operator does as designed in `docs/contracts/operate-spec.md`. **Re-read them against the built product before submitting; Meta rejects descriptions the app does not match.**

**`pages_show_list`**

> After an owner signs in, Pip shows the list of Facebook Pages the owner manages so the owner can choose the one Page Pip may post to. Pip does not read or store any Page the owner does not choose. Without this the owner could not tell Pip which Page to use.

**`pages_read_engagement`**

> Pip reads basic information about the chosen Page (its name and identifier) and confirms the owner can publish to it, before any post is sent. It is requested because `pages_manage_posts` depends on it. Pip does not collect Page visitors' data or use it for anything but showing the owner which Page is connected.

**`pages_manage_posts`**

> Pip's AI teammate drafts up to three short posts a week for the business and shows each to the owner. Pip publishes a post to the owner's chosen Page only after the owner approves that exact text, and never edits it after approval. The first five posts, and any post naming a price, offer, guarantee, customer or customer photo, always need the owner's approval. The owner can pause posting or take back approval at any time, which stops Pip posting. Pip never invents reviews or testimonials.

**Instagram `instagram_business_content_publish`**

> Same as above, for the owner's Instagram professional account: Pip publishes only owner-approved text and the owner's own images to that account.

## What can reject it

No screencast for a requested permission; the app not meeting the allowed use of a permission; reviewers unable to open the app; required API calls not made; copied descriptions; a wrong icon; settings changed after submitting.

## Open questions to settle first

1. Does a Composio Facebook or Instagram toolkit already post to a Page using Composio's own reviewed Meta app? If yes, Pip may not need its own review for the first operators. Not checked.
2. Which Instagram login type, and does Instagram Login need a separate App Review path? Meta's Instagram pages list separate permissions.
3. Is posting to the public worth the review before the first client asks? The operator's reviews and quote follow-ups need no Meta approval.

## Sources (read 2026-11-22)

- Meta, App Review submission guide: https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide
- Meta, App Review content (six components): https://developers.facebook.com/documentation/resp-plat-initiatives/appreview/content
- Meta, Data Deletion Request Callback and FAQs: https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback and https://developers.facebook.com/documentation/development/terms-and-policies/faqs
- Meta, Instagram Platform App Review: https://developers.facebook.com/docs/instagram-platform/app-review
- Meta, business verification documents (US: EIN letter or state business registration): https://developers.meta.com/horizon/resources/publish-organization-verification-business/
- Permission dependencies as summarised by a third-party guide (verify in the permissions reference): https://bundle.social/blog/facebook-api-permissions
