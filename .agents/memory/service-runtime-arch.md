---
name: Service runtime architecture
description: How Creatrix's service health checking works — self-describing services, probe contracts, what "ready" means per service.
---

# Service runtime architecture

Each service (Postgres, SearXNG, Whisper) is fully self-describing in `server/runtime/services/<name>.ts`:
- Its probe logic
- What "ready" means (not just HTTP 200)
- Failure interpretation and action hints
- firstLook diagnostic commands

The runtime manager (`server/runtime/service-runtime.ts`) probes all services in parallel, holds module-level state, and exposes `getServiceState(key)` / `getAllServiceStates()`. It runs a 30-second background timer started at server startup via `index.ts`.

**Why:** Old `health.ts` marked any HTTP response (even 404) as "up". The fix required each service to own its own readiness definition.

**What "ready" means per service:**
- Postgres: `SELECT 1` succeeds via a fresh `pg.Client` (not just port open)
- SearXNG: `GET /search?q=test&format=json` → HTTP 200 + `results` key present
  - HTTP 400 typically means `json` not in `formats` list in `searxng/settings.yml`
- Whisper: `GET /v1/models` → HTTP 200 + `data[]` has at least one model
  - Server running with no model loaded is "degraded", not "ready"

**How to apply:**
- When adding a new service, create `server/runtime/services/<name>.ts` implementing `ServiceDefinition`
- Register it in `SERVICES[]` in `service-runtime.ts`
- Add its endpoint key to `probeAll()` calls in `index.ts`
- `coherence.ts` reads from `getServiceState()` — no probe logic there
- `/api/substrate/health` returns backward-compatible shape from runtime state
- `/api/services/state` returns the full rich state for any future Services panel
