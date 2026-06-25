---
name: Runtime coherence architecture
description: The setup wizard sequence is the living contract; coherence = current state measured against commissioning record. Distinct from health checks.
---

## The principle

"Right relationship with itself, and its user." (Fiona's framing — keep it.)

Health asks: "is X up?"
Coherence asks: "was X commissioned, and is it still in the expected relationship?"

The distinction matters at 2am: coherence tells you what was *expected*, what changed, and exactly what to do — not just that something is offline.

## What was built

`server/runtime/manifest.ts` — reads the bootstrap record from `system_logs` (category: "bootstrap", message contains "BOOTSTRAP COMPLETE") and constructs a `RuntimeManifest` describing what this installation expects. This is the declaration, not the measurement.

`server/runtime/coherence.ts` — `measureCoherence(manifest)` compares current state against the manifest. Returns `CoherenceReport` with `CoherenceItem[]` — each item has `component`, `expected`, `actual` (coherent/degraded/absent), `message`, and `action`.

`GET /api/system/coherence` — on-demand full coherence report as JSON.

On startup (server/index.ts): after the discovery scan completes, the manifest is loaded and coherence is measured. Results are written to syslog with category "runtime" (purple badge in SystemLogPanel). Format:
```
✓ Database — Database is reachable.
⚠ ollama (localhost:11434) — commissioned but currently unreachable.
  action: Run `ollama serve` in a terminal.
Coherence: 1/2 items coherent
```

## Why

The setup wizard sequence (database → AI connection → services → commissioning record) IS the coherence contract. Previously it was sealed as a tombstone and never read again. Now it's the standard every boot is measured against.

**Why:** a system should be able to explain the gap between what was established and what is present now — without tribal knowledge or a debugger.

## How to apply

- If adding a new required substrate, add it to the commissioning wizard AND to `measureCoherence()` so the contract stays complete.
- The manifest comes from the DB bootstrap record — never hardcode expectations in coherence.ts.
- Coherence is a startup-time check (slow, involves probes). Don't call it on every health poll.
- `scanConnectionLite()` in discovery.ts is the equivalent for probe-time: no profile enrichment, 5s Promise.race timeout. Use it whenever a quick reachability check is needed without full model enrichment.
