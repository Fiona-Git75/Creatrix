---
name: Server startup order — listen before Vite
description: httpServer.listen must be called before setupVite so port 5000 opens immediately. A placeholder route serves 200 while Vite initializes.
---

# Server Startup Order

## The Rule
In `server/index.ts` (development mode), call `httpServer.listen(port)` BEFORE `setupVite()`. Add a middleware that returns HTTP 200 for `req.path === "/"` while Vite is initializing (so health checks pass), then set `viteReady = true` after `setupVite` completes.

## Why
The original order (setupVite THEN listen) caused the port to not open until after Vite's dependency pre-bundling completed. Vite's first-run optimization can take 2–30+ seconds. If a health check fires during this window, it sees no port and may report failure.

## How to Apply
Current `server/index.ts` already implements this correctly:
1. Register API routes
2. Add flag-based placeholder middleware (200 for "/" while not viteReady)
3. `httpServer.listen(port)` → port opens immediately
4. `setupVite(httpServer, app)` → Vite initializes (takes 1–5s)
5. Set `viteReady = true`
