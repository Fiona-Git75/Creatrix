---
name: Cold-start gaps — next session
description: Three issues surfaced during cold-start validation; to be implemented next session.
---

## Context

Surfaced during a full cold-start validation (fresh DB, no connections). The bootstrap contract gaps (createConnection not writing settings.default_connection_id, DiscoveryPanel not auto-scanning, "Use this" submitting empty defaultModel) were fixed this session. Three issues remain.

---

## Issue 1 — Logging does not surface actionable failures

**Problem:** System Log UI shows "System healthy / All clear" even when the system is unusable (no connections configured, Ollama offline). The health check passes because DB is up and the process is alive — but that is not the user's definition of healthy.

**What's needed:** Explicit WARNING and ERROR log entries for:
- No connections configured (system starts with empty connections table)
- Connection configured but offline at startup (e.g. Ollama endpoint unreachable)
- Connection endpoint returns unexpected response (wrong model format, auth failure)
- Substrate service unreachable (Whisper, SearXNG) when configured

**Where to write these:** The `system_logs` table already exists. The startup scan in `server/index.ts` and `server/providers/discovery.ts` should insert WARNING/ERROR rows there when scans fail or find nothing, not just `console.log`.

**User's framing:** "I don't need npm to give me a running narrative, but it should surface warning → failure errors explicitly."

---

## Issue 2 — Model cards not implemented (or incomplete)

**Problem:** The model selector dropdown shows "Ollama — Offline — check connection in Settings" — a single line of status. There are no model cards.

**What model cards need to show:**
- Model name + provider badge
- What the model is good at (capability tags: code, writing, reasoning, vision, etc.)
- What it doesn't do well (honest limitations)
- Health state: not configured / disconnected / wrong endpoint / healthy
- Context window size if known
- Whether it supports vision/tools/streaming

**Why this matters:** The user is a writer. Model selection is a meaningful creative choice, not a settings dropdown. The card should give enough signal to make that choice without going to the provider's docs.

**Where to build:** Model cards likely belong in the model selector component and/or a dedicated "Models" panel inside ConnectionsDialog. The capability data for known models (llama3.2, mistral, gpt-4o, etc.) can be a static registry on the server with live health overlaid at render time.

---

## Issue 3 — Tool list and signals ✓ (already working well)

User confirmed the tool list and tool signals are "totally on point." No action needed here. Do not regress this.
