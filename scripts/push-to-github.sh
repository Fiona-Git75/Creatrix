#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/Fiona-Git75/Creatrix.git"
GIT_DIR="/home/runner/workspace/.git"

echo "── GitHub sync ──────────────────────────────────"

# 1. Token check
if [[ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]]; then
  echo "✗  GITHUB_PERSONAL_ACCESS_TOKEN is not set — cannot push."
  exit 1
fi

REMOTE_URL="https://x-access-token:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/Fiona-Git75/Creatrix.git"

# 2. Clear any stale lock files left by crashed git processes
for lock in \
  "$GIT_DIR/index.lock" \
  "$GIT_DIR/refs/remotes/origin/main.lock" \
  "$GIT_DIR/packed-refs.lock"; do
  if [[ -f "$lock" ]]; then
    echo "  removing stale lock: $lock"
    rm -f "$lock"
  fi
done

# 3. Git identity (ephemeral /run filesystem — must be set each time)
GIT_CFG_DIR="/run/replit/user/$(id -u)/.config/git"
mkdir -p "$GIT_CFG_DIR"
cat > "$GIT_CFG_DIR/config" << 'EOF'
[user]
        name  = Replit Agent
        email = agent@replit.dev
EOF

# 4. Pull remote changes (rebase so our commits stay on top)
echo "  fetching from GitHub…"
git -c "url.${REMOTE_URL}.insteadOf=${REPO}" fetch origin 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  echo "✓  Already up to date — nothing to push."
  exit 0
fi

# Check if we need to rebase (remote has commits we don't)
MERGE_BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
if [[ -n "$MERGE_BASE" && "$MERGE_BASE" != "$REMOTE" ]]; then
  echo "  rebasing onto origin/main…"
  git -c "url.${REMOTE_URL}.insteadOf=${REPO}" rebase origin/main 2>&1
fi

# 5. Push
echo "  pushing to GitHub…"
git -c "url.${REMOTE_URL}.insteadOf=${REPO}" push origin main 2>&1

echo "✓  Push complete."
echo "   HEAD: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
