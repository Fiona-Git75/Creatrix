---
name: Temporal grounding pattern
description: Current Brisbane time + conversation depth injected second in every system prompt; prevents model misreading time-of-day and losing track of session length.
---

# Temporal grounding pattern

## The rule
Inject current date/time (Brisbane, UTC+10, no DST) and conversation depth as the **second** block in every system prompt — immediately after `CREATRIX_ORIENTATION`, before the day note.

**Why:** The user is in Brisbane. Without this, models try to close the day at 11am, misread "recent", and have no sense of how long a session has been running. The depth signal lets the model reason about context pressure rather than silently compensate for slipping context.

## How to apply
```ts
// In server/routes.ts, after CREATRIX_ORIENTATION is pushed:
const nowBrisbane = new Date().toLocaleString("en-AU", {
  timeZone: "Australia/Brisbane",
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});
const currentConvo = await storage.getConversation(currentConversationId);
const temporalParts = [`**Right now:** ${nowBrisbane} (Brisbane)`];
if (currentConvo && currentConvo.messages.length > 1) {
  // duration + message count + explicit permission to name slippage
}
systemParts.push(`\n## Right now\n${temporalParts.join(" ")}`);
```

## Key decisions
- Brisbane is UTC+10 always — Queensland does not observe daylight saving
- Depth signal only appears when messages > 1 (no noise on fresh conversations)
- The framing "if something feels like it's slipping, name it" is deliberate — gives the model language to surface context pressure rather than compensating silently
- `currentConvo` is fetched once here and reused for scaffold injection + council mode below (avoids duplicate DB round-trips)
