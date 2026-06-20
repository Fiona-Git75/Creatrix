---
name: Creatrix design philosophy
description: Three core principles — system accountability, epistemic grounding, legibility over mystery. Drives all UI/feature decisions.
---

# Design principles

## 1. System accountability over user configuration

**The rule:** The software should carry its own weight and report in, rather than wait for the user to configure it. Users should never have to infer, guess, or rummage.

**Why:** Every feature decision should be measured against it.

**How to apply:**
- Anywhere the system already has enough information to act, it should act and report — not ask.
- Technical details (ports, endpoints, provider types, filesystem paths) belong behind "Advanced" or hidden entirely.
- Error messages should say what happened in plain language, not expose raw Node/fetch errors.
- Empty/failure states should always include the next step, not just signal the problem.

## 2. Epistemic grounding — truth is relational

**The rule:** Models without evidence access cannot be expected to behave like epistemically grounded systems. Truth is not an internal property of the model — it is a relationship between model and accessible evidence.

**Why:** The capability system exists so the model has structurally verifiable access to real-world information, not just memorized weights.

**How to apply:**
- Every "heavy" capability (search, transcription, vision) should have a Docker-backed substrate — one command to start, one endpoint to point at, tool lights up.
- Fallbacks (DDG HTML for search) are honest degradation, not a substitute for grounded access.
- The `requires` field on a CapabilityDefinition is the contract. Docker is the fulfillment.
- If a substrate is down, the tool must go inactive — never expose a non-functional tool to the model.

## 3. Legibility over mystery

**The rule:** The system must make its own validity immediately perceptible with minimal cognitive effort. The goal is not to eliminate complexity, but to make it legible.

**Why:** The user shouldn't have to guess. The model shouldn't have to guess. The system announces its own truth.

**How to apply:**
- Truth coherence indicator (ToolStatusChip): 🟢 all substrates healthy / 🟡 fallbacks engaged / 🔴 tool exposed but non-functional. This is system truth coherence status, not infrastructure status.
- Tool ontology visible in sidebar: model sees same picture the user sees.
- Inactive tools shown with plain-language reason and next step — never silently absent.
- Substrate probes are cached, non-blocking, background — the truth layer must never be slower than the cognition layer.

## Implementation landmarks

- Morning briefing (`/api/status`) — scans Ollama/LM Studio on every launch
- Discovery panel — auto-detects local AI, never shows ports
- Tool activation graph — `requires` field drives both system-prompt filtering and sidebar status
- `/api/substrate/health` — background probes, cached, returns coherence: green/amber/red
- ToolStatusChip — exposes "System truth" section showing coherence issues

## Known remaining friction points
1. **Library/notes path** — user must know their own filesystem path; should scan common locations
2. **No AI + first message** — should return a human message, not a raw API error
3. **Mid-session model drift** — if a model is removed while chatting, header selector goes stale
