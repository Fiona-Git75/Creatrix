#!/bin/bash
set -e

# Set up git identity (ephemeral per sandbox — must run on every restart).
# GIT_CONFIG_GLOBAL is set by Replit to a path under /run/replit/user/<uid>/
# which is recreated on each sandbox boot, so we recreate the identity here.
if [ -n "$GIT_CONFIG_GLOBAL" ]; then
  mkdir -p "$(dirname "$GIT_CONFIG_GLOBAL")"
  git config --global user.name "Replit Agent"
  git config --global user.email "agent@replit.dev"
  # Verify the write took — exit rather than silently produce blank-author commits.
  _git_name="$(git config --global user.name 2>/dev/null)"
  if [ -z "$_git_name" ]; then
    echo "ERROR: git user.name is empty after identity setup." \
         "Commits would have a blank author. Aborting." >&2
    exit 1
  fi
  unset _git_name
  _git_email="$(git config --global user.email 2>/dev/null)"
  if [ -z "$_git_email" ]; then
    echo "ERROR: git user.email is empty after identity setup." \
         "Commits would have a blank email. Aborting." >&2
    exit 1
  fi
  unset _git_email
fi

npm install
npm run db:push -- --force
