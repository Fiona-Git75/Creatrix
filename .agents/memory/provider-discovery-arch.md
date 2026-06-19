---
name: Provider discovery architecture
description: How provider/model resolution works; what is authoritative and what is a hint.
---

## Rule
`connectionId` is the explicit provider identity boundary. `defaultModel` on the connection record is a UI hint only — never used for request resolution. The live scan (`/api/providers/status`) is the single source of truth for which models are available.

## Structure
- **A — Discovery**: `server/providers/discovery.ts` → `getProvidersStatus()` scans all configured connections + auto-discovers localhost:11434 / :1234. 30s in-memory cache, 2min background refresh via `startBackgroundRefresh()`.
- **B — Model snapshot**: per-connection, returned inside each `ProviderStatus` entry.
- **C — Resolution**: `resolveModelToProvider(modelId, providers)` in the same file — given a model id, returns the first online connection that has it.

**Why:** Removing `defaultModel` as authoritative eliminates silent fallback chains where a stale stored name drove the wrong model on every cold start.

## Key contracts
- `GET /api/providers/status` → `{ providers: ProviderStatus[], suggested: SuggestedProvider[], scannedAt }` — one call, all connections, live status.
- `POST /api/providers/refresh` → force-invalidates the 30s cache.
- `Chat.tsx` init uses `providerStatus.providers` (first online → first model), not `connection.defaultModel`.
- `selectedConnectionId` is preserved in Chat state and sent explicitly on every chat request.
- `/api/status` still exists for backward compat; it now delegates to `getProvidersStatus()` internally.

## What to preserve
- Do not collapse providers into a flat merged list — each connection stays separate.
- `connections` table stays as the user-configured endpoint registry.
- `defaultModel` field kept in DB schema (don't migrate it away) but ignored in resolution.
