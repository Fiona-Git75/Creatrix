---
name: Replit lockfile portability
description: package-lock.json exported from Replit contains internal proxy URLs that break npm ci outside Replit
---

## Rule
Replit bakes `http://package-firewall.replit.local/npm/...` URLs into the `resolved` field of every entry in `package-lock.json`. These URLs are unreachable outside Replit's infrastructure, causing `npm ci` to hang on DNS retries and eventually fail to install any packages at all.

**Why:** Replit routes all npm traffic through an internal package firewall proxy. The proxy URL ends up in the lockfile because npm records the actual URL it fetched each tarball from.

**Symptoms that are actually this problem:**
- `npm ci` appears to hang or stall for minutes with no output
- Build tools (tsx, vite, esbuild, etc.) appear "not found" after `npm ci` completes
- `npm exec <tool> --version` works (uses npm's package resolution / cache) but `npm run <script>` fails with "command not found"
- `RUN ls node_modules/.bin` in Docker shows the directory is empty or missing after `npm ci`

**How to apply:**
- In the Dockerfile, add a `sed` pass before `npm ci`:
  ```dockerfile
  RUN sed -i 's|http://package-firewall.replit.local/npm|https://registry.npmjs.org|g' \
          package-lock.json
  ```
- Document this in README/replit.md so cloners aren't surprised
- Also affects anyone running `npm ci` locally from an exported copy — they should run the same substitution or use `npm install` instead
- The fix is in `Dockerfile` and documented in `replit.md` for this project
- A support ticket has been raised with Replit to fix at the platform level
