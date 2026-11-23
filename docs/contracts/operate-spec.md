# The operate contract (`operate/1`)

An **operator** is a teammate that runs a whole recurring process on its own: who to contact, when, how many times, and when to stop, with a record of every case. It is not a new runtime. The Forge compiles one `operate` primitive into ordinary `teammate/1` jobs plus a small `operate` block, and everything that already enforces limits (the job engine, the consent gate, the send guard) keeps enforcing them.

The code that decides is `supabase/functions/_shared/operate.ts`. This page is the same rules in words. If they disagree, the code is right and this page is a bug.

Everything here is behind the flag `operate_lane`, which is **off** by default. With it off, an operator cannot go live, save through the Board, send, post, or show in the Portal.

## The three processes

A process is a code-level template. A new one is a code change, never a spec change.

| Process | Reaches | Opens a case from | At most | At least apart | Stops after |
| --- | --- | --- | --- | --- | --- |
| `content_social` | the public | a weekly schedule | 3 posts a week | 24 hours | 7 days |
| `review_requests` | a customer | a finished job record | 2 touches | 72 hours | 14 days |
| `quote_followup` | a customer | a sent quote record | 3 touches | 72 hours | 14 days |

A spec may be stricter than these numbers, never looser. The database holds the same table (`operator_process_rules`) and a test keeps the two identical.

## The block

```json
{
  "contract": "teammate/1",
  "jobs": [ "...ordinary jobs, checked by checkSpec..." ],
  "operate": {
    "version": "operate/1",
    "process": "review_requests",
    "goal": "One plain sentence for the owner.",
    "case":    { "from": { "tool": "field_service", "records": "job" }, "closes_when": ["replied", "opted_out", "max_touches", "max_days"] },
    "touches": { "max": 2, "min_gap_hours": 72, "channels": ["email"] },
    "audience": { "who": "every_customer" },
    "public":  { "posts": false },
    "approvals": { "brand_voice": false, "accounts": [] },
    "stages": [ { "id": "ask", "job": "ask_for_review", "does": "Asks once, then one reminder." } ]
  }
}
```

A block that breaks any rule is refused whole. Nothing is trimmed to fit. Worked examples that pass the check: [`content social`](examples/operator/content-social.json), [`review requests`](examples/operator/review-requests.json), [`quote follow-up`](examples/operator/quote-followup.json).

### Rules the checker enforces

- **A case never starts from a record no job can see.** `case.from` names a tool and a kind of record, and some job must have `read` on it. Posting to the public opens a case from a schedule; a customer process opens one from a record.
- **`opted_out` is always in `closes_when`.** A person who says stop is never contacted again.
- **At least 24 hours between touches, ever.** Nothing is contacted twice in a day.
- **Review requests go to every customer.** The audience is `every_customer` or a named stage in the owner's software. Anything that picks customers by how happy they are (rating, stars, sentiment, "only the good ones") is refused, in the audience and in the stage name. That is Google's review policy and the FTC's rule.
- **Public posts**: up to three channels from `facebook`, `instagram`, `google_business`; the first N posts need the owner (`first_n:5` by default, at most 50), and `approvals.brand_voice` and each account must be approved.
- **The process decides the purpose of a send**, not the job. A review request by email is transactional (it is about a job the customer already had); by text it is marketing and needs marketing consent. A quote follow-up is transactional on either channel because the customer asked for the quote.

## How a case runs

Customer processes are **case-driven**. The job has no trigger of its own that sends; a case does.

1. **Open.** A matching event (a finished job, a sent quote) calls `operator_case_open`. The case holds a short whitelisted context (`first_name`, `name`, `email`, `service`, `when`; never an amount), and the recipient is bound to the case.
2. **Drive.** Each tick, `operator_case_due` returns the cases whose next touch is due. `pip-jobs` starts one run per case per touch.
3. **Reserve before sending.** `operator_case_touch` reserves the touch *before* the message goes out, so a crash can cost a touch but can never send an extra one.
4. **Check the send.** `operator_send_check` returns the purpose for this channel and confirms the recipient is the one the case was opened for. The live consent gate (`portal_email_gate`) still decides after that. The message carries the AI line and the STOP line, and `portal_outbound_sent` records it.
5. **Close.** A case closes on one of `replied`, `opted_out`, `completed`, `max_touches`, `max_days`. When a case closes, a trigger empties its stored context.

Posts are different: `operator_post_reserve` is fail-closed. If the approval, the account, the weekly cap or the first-N check cannot be answered, no post goes out, and the touch is spent.

## Approvals

`operator_approvals` holds what the owner has approved: the brand voice and each connected account, once.

- **Request** may come from the owner or from the founder on the owner's behalf. Staff cannot request.
- **Approve** is the owner only, with a fresh sign-in. The founder cannot approve for the owner, even as a member of the business.
- **Revoke** is open to owner, staff and founder. Revoking pauses the stage jobs with the reason `missing_approval`, and posting stops until it is approved again.

The Portal routes are `GET /business/:bid/agents/:sid/operator` and `POST /business/:bid/agents/:sid/operator-approval`. With the flag off they answer `not_found`.

## What the operator will not do

- Invent a review, a testimonial, a result, a price, an offer or a guarantee. The post check refuses text that does.
- Use a customer's name or photo in a public post without the owner approving that post.
- Contact anyone who said stop, or whose consent row is missing.
- Send a text. Operators offer email only until a real Twilio number and 10DLC registration exist (`operatorSend` refuses any other channel).
- Touch money, or change a record. An operator's tools are the same reviewed tools every job gets.

## The Forge's operator lane

An API-key build that names one operator primitive in `uses` is compiled with no model by `compileForForge` (`compileOperator`, then `checkSpec` and `checkOperate`). Its test stage is `dryRun`: made-up cases pushed through every rule in made-up time (including 08:00 to 20:00 local calling hours), and the result must pass before the teammate is ready. More than one operator in one teammate is refused; they are separate teammates. Operators always go through review before staging. Board (MCP) saves cannot carry an `operate` block.

## Known limits (state them to owners honestly)

- While a case is open its context holds the customer's email in plain text; the trigger empties it when the case closes.
- Replying to an operator's message closes the case on a best-effort basis.
- Public posting needs Meta app review before any real post can go out. Until then the posting tool (`social_posting` in the content-social example) is a tool Pip does not have, so the Forge reports it as a gap that blocks go-live. That is the intended state, not a bug.
- A scan does not yet propose operators on its own; the gate, scorer and Forge know them, the public scan prompts do not.
- Counts per contact per day across runs rely on the database's cadence rules, not on the run's own counter.
- SMS review requests depend on advice from a lawyer and on 10DLC, neither of which exists yet.
