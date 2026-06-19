---
name: Resident Study design philosophy
description: Core UX principle — system accountability over user configuration. Drives all UI/feature decisions.
---

# Design principle: system accountability

**The rule:** The software should carry its own weight and report in, rather than wait for the user to configure it. Users should never have to infer, guess, or rummage.

**Why:** This is the stated goal of the project owner. Every feature decision should be measured against it.

**How to apply:**
- Anywhere the system already has enough information to act, it should act and report — not ask.
- Technical details (ports, endpoints, provider types, filesystem paths) belong behind "Advanced" or hidden entirely.
- Error messages should say what happened in plain language, not expose raw Node/fetch errors.
- Empty/failure states should always include the next step, not just signal the problem.

## Already implemented
- Morning briefing (`/api/status`) — scans Ollama/LM Studio on every launch, reports model changes
- Discovery panel — auto-detects local AI, never shows ports/endpoints
- Connection form — URL-first, provider auto-detected, Advanced collapsible for the rest
- Connection health — ✗ icon now shows tooltip reason ("Nothing is running at this address")
- Stream errors — humanized server-side before reaching the client
- EmptyState "no AI" — shows "Open Settings" link inline

## Known remaining friction points
1. **Library/notes path** — user must know their own filesystem path; should scan common locations (Obsidian vault, ~/notes, ~/Documents) and offer what it finds
2. **No AI + first message** — sending a message before any connection is configured should return a human message, not a raw API error
3. **Mid-session model drift** — if a model is removed while chatting (`ollama rm`), the header selector goes stale; background poll every few minutes would keep it honest
