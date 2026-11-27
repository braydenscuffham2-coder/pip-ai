# Phone calls (lane 02)

How a call to a business's Pip number works, what is enforced where, and how to set it up. Texts are in `pip-run` and are described at the end.

## The path of a call

1. **Twilio** receives the call and asks `pip-voice /twilio/voice` what to do. `pip-voice` checks Twilio's signature, finds the business and teammate for the number (`voice_line_ctx`), opens a conversation, and makes a one-time pass for the call. Only a one-way code of the pass is stored.
2. `pip-voice` asks **ElevenLabs** to join ("register call") and hands Twilio the answer. ElevenLabs speaks the greeting at once, with no model involved.
3. For everything the caller says, ElevenLabs asks `pip-voice /llm/chat/completions`, sending the pass in a header. `pip-voice` takes only the caller's last sentence, sends it to **`pip-turn`** on the `voice` channel, and streams the reply back to be spoken.
4. When the speaking side closes, Twilio asks `pip-voice /twilio/after`: transfer, hang up, or say sorry because the call was cut off.
5. When the call ends, Twilio tells `pip-voice /twilio/status` how long it ran. One `usage_events` row, unit `voice_minute`, one per started minute.

## What is decided in code, not by a model

| Rule | Where |
| --- | --- |
| Every call opens with "Hi, this is NAME, an AI assistant for BUSINESS. I keep written notes of this call so the team can follow up." | `greeting()` in `pip-voice`; logged to `compliance_events` by `voice_call_start` |
| No audio is recorded | ElevenLabs agent setting; no Twilio recording is ever started |
| A caller's number is stored only as a one-way code and its last four digits | `voice_call_start` |
| The teammate, its tools and its limits | `pip-turn`, unchanged. ElevenLabs' own model, prompt, tools and fallback model are off |
| Words that sound like danger to a person get the 911 line and an urgent owner alert; no model is asked | `DANGER`, `SELF_HARM` in `pip-voice` |
| A call is transferred only to the number, and only inside the hours, on the business's `phone_lines` row | `voice_handoff` (database) |
| A teammate that is not live answers only for a business on the test list whose name starts with TEST | `voice_line_ctx` |
| One turn at a time per call, so an interrupting caller cannot make the teammate act twice | `voice_turn_open` |
| A call is billed once, whatever Twilio sends | `voice_call_end` |

## When something is down

| What fails | What the caller hears |
| --- | --- |
| ElevenLabs is down, slow (over 4 seconds) or answers with nonsense | "Thanks for calling BUSINESS. This is an automated message. Our phone assistant is not available right now. Please call back in a few minutes." The owner gets an urgent alert. |
| ElevenLabs drops in the middle of a call | "Sorry, we got cut off. Please call back. The team has been told you called." The owner is alerted. |
| `pip-turn` fails | "Sorry, I'm having trouble right now. I've let the team know, and someone will call you back. Goodbye." Urgent alert. |
| `pip-voice` itself is down | Twilio's backup address (a TwiML Bin with a plain message, set on the number). |

## Speed, measured

- The greeting needs no model: it starts when the call connects.
- For each later turn, the caller hears a short holding phrase if `pip-turn` has not answered in 0.7 seconds.
- `pip-turn` itself, measured on TEST Fork on November 17: **4.0, 4.9 and 6.6 seconds** for three ordinary turns, each of which used one tool. That is too slow for a phone call. The fix is in `pip-turn` (lane 01): no model thinking on the voice channel, shorter replies, and streaming the words as they are written.
- November 27: the first two are in. `pip-turn` runs on the fast model with no thinking, and on the voice channel it is told to answer in one or two short sentences and is given a small reply budget (320 tokens against 1,600). A spoken answer is a fraction of the length, so less time is spent writing it. **Not re-measured:** a voice turn can only be timed with the service key or a real call, and neither was used. Streaming is not built; it needs `pip-voice` to pass words through as they arrive.

## Setting up (after the pull request is merged and the migration approved)

1. Deploy `pip-voice` from the merge commit on `main`.
2. One ElevenLabs agent, shared by every business: custom model at `https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-voice/llm`, request header `x-pip-pass` = the variable `secret__pip_pass`, first message `{{pip_greeting}}`, fallback model off, no tools except "end call", no knowledge, guess-ahead turns off, audio in and out at u-law 8000 Hz, voice recording off. Its id goes in `forge_settings` under `voice` as `{"agent_id":"agent_..."}`.
3. On the Twilio number: "A call comes in" = `.../pip-voice/twilio/voice` (POST), "Primary handler fails" = the TwiML Bin, "Call status changes" = `.../pip-voice/twilio/status` (POST).
4. A `phone_lines` row for the business with `pip_number`, and for a TEST business `spec_id`.

## Tests

- `deno run -A supabase/functions/pip-voice/test/run.ts` (set `DENO_NO_PACKAGE_JSON=1`). Runs the real function against stand-ins for the database, `pip-turn`, ElevenLabs and Twilio: 83 checks.
- The migration was run and exercised against the real database inside a transaction that was rolled back.

## Not proven yet

- Anything on a real phone line.
- That ElevenLabs sends the pass header and the greeting the way its docs describe, and that its "end call" closes the line so Twilio asks `/twilio/after`. Both come from the vendors' current docs, not from a live call.
