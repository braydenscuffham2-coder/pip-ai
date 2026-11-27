import { assert, assertEquals } from "jsr:@std/assert@1";
import { ackFor, afterAck, alike, sameTurn } from "./voice-turns.ts";

Deno.test("the pairs the phone side really sent twice are one turn", () => {
  assert(sameTurn("Can I book an appointment for Tuesday at 7:00 p.m.?", "Can I book an appointment for Tuesday at seven p.m.?"));
  assert(sameTurn("Brayden Scuffham.", "Brayden Scuffum."));
  assert(sameTurn("What time do you guys open?", "what time do you guys open"));
  assert(sameTurn("Hi.", "Hi"));
});

Deno.test("something new, a correction, or more words is not the same turn", () => {
  assert(!sameTurn("I'd like a table", "I'd like a table for six on Friday"));
  assert(!sameTurn("Tuesday", "Thursday"));
  assert(!sameTurn("Yes.", "No."));
  assert(!sameTurn("Yes.", "Yeah, and can you also tell me where to park?"));
  assert(!sameTurn("A table for 6 at 7", "A table for 8 at 7"), "a different number is a different thing");
  assert(!sameTurn("My number is 951-660-8970", "My number is 951-660-8971"));
  assert(!sameTurn("", "hello"));
  assert(!sameTurn("...", "..."), "nothing heard twice is not a sentence said twice");
});

Deno.test("alike is 1 for the same words and falls with every changed letter", () => {
  assertEquals(alike("We OPEN at five!", "we open at five"), 1);
  assert(alike("scuffham", "scuffum") > 0.7);
  assert(alike("tuesday", "thursday") < 0.85);
  assertEquals(alike("", "x"), 0);
});

Deno.test("the acknowledgement fits what was heard, rotates, and is skipped when it would be odd", () => {
  assertEquals(ackFor("What time do you open?", 0, false), "Let's see.");
  assertEquals(ackFor("do you take walk ins", 1, false), "Okay.");
  assertEquals(ackFor("It's Dana, 208-555-0142.", 0, false), "Okay.");
  assertEquals(ackFor("It's Dana, 208-555-0142.", 2, false), "Got it.");
  assertEquals(ackFor("...", 3, false), "");
  assertEquals(ackFor("", 3, false), "");
  assertEquals(ackFor("Thanks, bye.", 3, true), "");
  for (let t = 0; t < 12; t++) assert(!/sure|yes|no\b/i.test(ackFor("can I bring a cake?", t, false)), "never a word that sounds like an answer");
});

Deno.test("an answer does not repeat the acknowledgement it follows", () => {
  assertEquals(afterAck("Okay.", "Okay, we open at five."), "We open at five.");
  assertEquals(afterAck("Got it.", "Got it. What's the best number?"), "What's the best number?");
  assertEquals(afterAck("Okay.", "We open at five."), "We open at five.");
  assertEquals(afterAck("Okay.", "Okay."), "Okay.");
  assertEquals(afterAck("", "Okay, we open at five."), "Okay, we open at five.");
  assertEquals(afterAck("Let's see.", "Let's see, Friday is open."), "Friday is open.");
});
