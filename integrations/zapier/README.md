# Pip for Zapier

Prepared on November 27, 2026. **Not pushed, not shared, not submitted.** Publishing is Brayden's decision.

What it does, in an owner's words: "Connect Pip in my Zapier, and any app I already use there can tell my Pip team
something happened, and my Pip team can start any Zap."

| Piece | Name in Zapier | What it does |
| --- | --- | --- |
| Connection | Pip | Two values from the owner's Pip Portal (Setup, Doors, the door called Zapier): Connection ID and Secret. |
| Trigger | New Update From Your Pip Team | Starts the Zap once for each update a teammate left for Zapier. |
| Action | Send to Your Pip Team | Tells the team something happened. Every teammate job listening to that door starts once. |

How it works underneath is in `docs/edges.md`. Tests: `npm test` in this folder (they also run in the repo's CI).

## Before any owner can use it

1. The business needs a door of kind `zapier` (the Forge makes it with `door_make`). It shows in the owner's Portal.
2. A teammate job must listen to it: `{ "type": "event", "from": "pip", "event": "webhook_received", "if": { "field": "door", "is": "zapier" } }`.
   To send updates out, the job is given the pip record `outbound_post` and names the door `zapier`.

## Brayden's steps, when he decides to publish (about 15 minutes)

Nothing below has been done.

1. Sign in at https://developer.zapier.com with the Zapier account that should own the integration.
2. In a terminal, in this folder:
   - `npm install`
   - `npx zapier-platform login`
   - `npx zapier-platform register "Pip"`
   - `npx zapier-platform validate`
   - `npx zapier-platform push`
3. Test it privately first: in the Zap editor, search for "Pip" (it shows as a private app on that account), connect it
   with a TEST Fork Zapier door, and run one Zap each way.
4. To let one owner use it without a public listing: `npx zapier-platform users:add owner@their-email.com 0.1.0`
   (or share the invite link from the developer page).
5. A public listing is a separate application with Zapier's review (they ask for a logo, a description, a test
   account, and usually some live users first). That is the step the brief says to stop before.

## Listing copy (draft)

- **Name:** Pip
- **Tagline:** AI teammates for local businesses.
- **Description:** Pip builds AI teammates that do real work for a local business: answering customers, following up,
  keeping records straight. Connect Pip to Zapier to tell your Pip team when something happens in any app you use, and
  to start a Zap whenever a teammate finishes something.
- **Category:** AI Tools (secondary: Customer Support).
- **Role of the listing owner:** "I work for Pip."

## Limits to say out loud

- The trigger is checked on Zapier's polling schedule (every 1 to 15 minutes by plan), not instantly.
- Each Zap run uses the owner's Zapier tasks. Pip does not pay for or see their Zapier account.
- The feed holds the last 50 updates. A Zap that was off for a long time can miss older ones.
- Fields that look like secrets (password, token, card number) are dropped on the way in.
