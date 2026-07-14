---
name: Session scaffold system
description: Live field map of a conversation — auto-generates every 15 messages, stored on the conversation row, injected into system prompt, viewable via Map icon panel.
---

# Session scaffold system

## The rule
The scaffold is a JSON field on `conversations.scaffold` (migration 0010). It is generated in the background after every 15th message (15, 30, 45…) and injected into the system prompt as a `## Session Scaffold` block after relationship context, before tool capability.

**Why:** The user thinks constellationally and runs 12hr+ sessions. The scaffold lets the model hold the field of the conversation without the user having to re-explain it — and lets the user recover emergent insights without interrupting their thinking.

## Structure
```json
{
  "inTheAir": ["active unresolved threads"],
  "landed": ["what's actually been figured out"],
  "connections": ["relationships formed between separate things"],
  "holdingTension": ["unresolved things still exerting pressure"],
  "updatedAt": "ISO timestamp"
}
```

## How to apply
- `storage.updateConversationScaffold(id, jsonString)` — dedicated method, not part of `updateConversation`
- `generateScaffoldForConversation()` in `server/routes.ts` — uses `createProvider().generateStream()`, extracts JSON with regex, saves; silent on error
- `shouldGenerateScaffold(messageCount)` — `count >= 15 && count % 15 === 0`
- Trigger: `setImmediate()` after `res.end()` in the chat route — truly fire-and-forget
- GET `/api/conversations/:id/scaffold` — returns parsed scaffold or null
- POST `/api/conversations/:id/scaffold` — manual trigger; responds immediately, generates in background
- Frontend: `ScaffoldPanel.tsx` with 4 sections (Wind/Anchor/GitBranch/Zap icons), auto-polls every 60s, manual refresh button

## Zod schema note
`Conversation` type in `shared/schema.ts` is defined via an explicit Zod schema (`conversationSchema`), NOT Drizzle's `$inferSelect`. Adding a column to the Drizzle table definition alone is not enough — must also add it to `conversationSchema` or TypeScript won't know about it.
