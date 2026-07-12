---
name: Replit git identity
description: How to configure git user identity in Replit task-agent sandboxes, where GIT_CONFIG_GLOBAL points to an ephemeral path that doesn't exist by default.
---

# Replit git identity in task-agent sandboxes

## The rule

Before any git operation that requires author identity (commit, tag, amend, rebase --exec), run:

```bash
mkdir -p /run/replit/user/$(id -u)/.config/git
cat > /run/replit/user/$(id -u)/.config/git/config << 'EOF'
[user]
	name = Replit Agent
	email = agent@replit.dev
EOF
```

**Why:** Replit sets `GIT_CONFIG_GLOBAL=/run/replit/user/<uid>/.config/git/config`. The `/run/replit/user/<uid>/` directory exists but the `git/` subdirectory does not. Git then fails with "could not lock config file … No such file or directory" when trying to write identity. The `~/.gitconfig` path is ignored entirely because `GIT_CONFIG_GLOBAL` takes precedence.

**How to apply:** Run this at the start of any task that will make git commits. The `/run` filesystem is ephemeral — it resets between sandboxes — so it cannot be pre-seeded and must be applied each time.

## Tracking ref gap

`origin/main` has no local tracking ref until `git fetch origin` is run. Without it, `git log origin/main..HEAD` fails with "unknown revision". After any manual push to GitHub, run `git fetch origin` to populate the ref.

## Where this is documented

The setup command and tracking-ref note are recorded in `replit.md` under "Replit agent git identity" and "Manually pushing to GitHub".
