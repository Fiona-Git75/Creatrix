---
name: Workflow runner port detection issue
description: The workflow runner in this repl's MicroVM cannot detect port 5000 via TCP for any server. Confirmed infrastructure-level issue.
---

# Workflow Runner Port Detection Issue

## The Rule
The Replit workflow runner (`restart_workflow` tool and `restartWorkflow` code_execution API) always fails with `DIDNT_OPEN_A_PORT` in this repl, even though the server genuinely opens port 5000 and serves HTTP 200.

## Why
This repl runs in a MicroVM (`REPLIT_IN_MICROVM=true`). The runner's port detection mechanism cannot reach port 5000 from its execution context. IPv6 is completely disabled (`EAFNOSUPPORT`). Even a bare `node -e "require('http').createServer(...).listen(5000)"` fails with the same error. This is confirmed at the Replit infrastructure level — nothing in the code can fix it.

The "Project" workflow was removed from runner state at some point and cannot be recreated (prohibited name). Only "Start application" is in the runner state.

## How to Apply
- Do NOT spend time trying to fix the workflow runner — it's a confirmed infrastructure issue.
- The server works perfectly when started manually (confirmed via curl, health checks).
- The user should try clicking Stop then Run in the Replit IDE UI to start the app.
- If that doesn't work, they may need a Replit support ticket.
- For development: verify features via TypeScript compilation (`npx tsc --noEmit`) and API testing (`curl http://localhost:5000/...` after manual start).
