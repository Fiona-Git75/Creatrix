---
name: Creatrix Execution Contract
description: Non-negotiable architectural principles governing all feature work in Creatrix (and future projects by this user).
---

# Creatrix Execution Contract

## Core rule
Creatrix must behave identically in all environments. If behaviour changes by environment, it is a bug, not a feature.

## Tool activation
A tool is active ONLY if: (1) explicitly configured in .env or settings, (2) explicitly instantiated in code, (3) successfully validated at runtime. If any of those are missing → tool is OFF, no fallback, no proxy, no inference.

## No dual-path execution
Forbidden:
```
if (replit) use SDK
else use direct API
```
Allowed:
```
use direct API with explicit credentials
```

## Credentials
- `.env` is canonical, user-owned
- No platform overwrites
- No secret injection from runtime environments
- If config is missing → fail explicitly, loudly, with a clear message about what is missing

## Failure behaviour
MUST: fail loudly, log the missing dependency, stop tool activation.
MUST NOT: degrade silently, fall back, guess, "helpfully adapt".

## State ownership
All persistent state lives in local filesystem / repo / explicit database.
NOT in platform cache, Replit-managed state, hidden connector state, or runtime memory injection.

## Unified database model
There is exactly one storage implementation at runtime: `DatabaseStorage`, backed by `DATABASE_URL`.

**Forbidden:**
```typescript
// This creates two state universes — one persistent, one ephemeral — with no visible difference
export const storage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();
```

**Required:**
```typescript
// Fail loudly if config is missing. No fallback. No silent degradation.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
export const storage = new DatabaseStorage();
```

`MemStorage` may exist in the codebase for unit tests only. It must never be reachable from the production module graph.

**Why:** A silent in-memory fallback is indistinguishable from a real database to the running app but resets on every restart. This creates two state universes from one codebase, making environment-specific bugs invisible until they manifest as data loss. The rule: same inputs → same behaviour → one DB → explicit crash if missing.

**How to apply:** Any future change that introduces `if (DATABASE_URL)` branching in storage selection is a contract violation. Reject it.

## Platform independence
Creatrix must NOT assume: Replit runtime exists, connectors SDK exists, cloud auth proxy exists, hosted filesystem identity exists. If those exist → ignored unless explicitly configured.

## Replit-specific rule
Replit is a HOST, not a logic layer.
Replit connectors are OPTIONAL external adapters — never define core behaviour, never relied upon for correctness.
`REPL_ID`, `@replit/connectors-sdk` and similar → treat as environment noise.
Dev-only Replit vite plugins (cartographer, devBanner, runtimeErrorOverlay) are acceptable ONLY as dev-DX overlays gated on `REPL_ID`, because they add no logic and ship as devDependencies with no production impact.

## Mental model stabiliser
"I know nothing unless explicitly told in config or code."
No inference layers. No environment assumptions. No hidden intelligence from platform.

**Why:** User will deploy Creatrix locally and via Docker. Future GitHub users must get identical behaviour. Replit is used for development only; any Replit-specific logic that leaks into app behaviour breaks portability and is explicitly out of scope.

**How to apply:** Before writing any feature: does it work the same with REPLIT_ID unset and connectors-sdk removed? If not, redesign it.
