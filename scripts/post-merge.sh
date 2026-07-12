#!/bin/bash
set -e

# Set up git identity (ephemeral per sandbox — must run on every restart).
# GIT_CONFIG_GLOBAL is set by Replit to a path under /run/replit/user/<uid>/
# which is recreated on each sandbox boot, so we recreate the identity here.
if [ -n "$GIT_CONFIG_GLOBAL" ]; then
  mkdir -p "$(dirname "$GIT_CONFIG_GLOBAL")"
  git config --global user.name "Replit Agent"
  git config --global user.email "agent@replit.dev"
fi

npm install
npm run db:push -- --force
