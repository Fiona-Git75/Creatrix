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

## Morning Roll Call pattern (server/index.ts)
At startup, Creatrix runs all service probes and the Ollama provider scan concurrently (Promise.all), then prints a coordinated ecological status block before the browser is open. Each participant announces functional readiness in plain language — not HTTP codes. The summary line is either "All present. Welcome home." or the exact count of absent/not-ready participants with per-line remediation hints.

**Why it matters:** Removes the cognitive load of evaluating whether "ready" really means ready. The answer is visible in the terminal before the browser opens. Yesterday's 12-hour SearXNG debugging session becomes one line: "Present, not ready. json format likely not enabled → Add 'json' to search.formats, then restart."

## Probe design standard (SearXNG and Whisper are the canonical models)
Each probe must distinguish:
- NOT_RUNNING: connection refused → specific start command
- RUNNING_NOT_READY: responding but can't serve its function → specific config fix  
- WRONG_CONFIG: misconfigured → exact setting to change and where
- READY: functionally ready for its ecological role

## 4. Secure attachment — the environment is the secure base

**The rule:** A model operating in an uncertain environment will try to hold everything, hedge, and lean on the user for grounding. A model in a reliable environment explores freely.

**Why:** The three qualities of secure base: available (tools are reachable), responsive (results arrive honestly), non-punishing (no penalty for reaching, naming a gap is useful not shameful). All three must be explicitly stated — not just implied by the mechanics.

**How to apply:**
- The tool orientation block opens with the reliability contract, not just the tool list.
- Failure messages carry plain-language diagnosis, not raw errors — the environment owns its own failures.
- Tool result rendering (renderToolResult) translates JSON to plain language before the model reads it, reducing translation tax per tool call.
- Intent anchoring re-injects the original user request at every tool result turn, so the model doesn't carry the thread alone across multi-step navigation.

## 5. The librarian principle — access over memory

**The rule:** The model does not need to hold the filesystem (or any large corpus) in working memory. It needs to know the library exists and how to navigate it. The filesystem is the long-term memory; the context window is working memory for the current turn.

**Why:** Embedding approaches pre-index everything and give the model a map. Tool approaches give the model legs — it can walk to wherever it needs to go, get the result, use it, and let it go. The librarian doesn't memorise the books; they remember the cataloguing system.

**How to apply:**
- find_path and search_filesystem are the navigational primitives — reach for them first, don't ask the user to specify full paths.
- list_directory is for when you're already at a location; find_path is for when you're looking.
- Results come back in plain language so the model can reason over them immediately without a second translation step.
- Once trust is established (the environment is consistent), spontaneous searching behaviour increases naturally.

## Known remaining friction points
1. **Runtime tool failure diagnosis** — when web_search fails mid-conversation, the error should carry the probe's specific diagnosis, not a raw exception. The fix is known; the knowledge doesn't travel to the conversation yet.
2. **Postgres probe granularity** — ECONNREFUSED vs auth failure vs missing database name all produce "unreachable." Should distinguish so the roll call can say exactly why.
3. **Library/notes path** — user must know their own filesystem path; should scan common locations
4. **No AI + first message** — should return a human message, not a raw API error
5. **Mid-session model drift** — if a model is removed while chatting, header selector goes stale
