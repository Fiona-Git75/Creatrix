#!/usr/bin/env bash
# Verifies that the tsc --noEmit gate is not vacuous:
#   1. Introduces a deliberate type error into a test file
#   2. Asserts tsc exits non-zero  (gate blocks bad code)
#   3. Restores the file
#   4. Asserts tsc exits zero     (gate passes clean code)

set -euo pipefail

TARGET="client/src/__tests__/setup.ts"
MARKER="// __TYPE_ERROR_PROBE__"
ERROR_LINE="const _typeProbe: number = 'this is not a number'; ${MARKER}"

restore() {
  if grep -qF "$MARKER" "$TARGET" 2>/dev/null; then
    grep -vF "$MARKER" "$TARGET" > "${TARGET}.tmp" && mv "${TARGET}.tmp" "$TARGET"
    echo "[gate-check] restored $TARGET"
  fi
}
trap restore EXIT

echo "[gate-check] step 1 — confirming baseline is clean"
if ! npx tsc --noEmit --incremental false 2>/dev/null; then
  echo "[gate-check] FAIL: baseline already has type errors — fix those first" >&2
  exit 1
fi
echo "[gate-check] baseline: PASS (exit 0) ✓"

echo "[gate-check] step 2 — injecting deliberate type error into $TARGET"
echo "$ERROR_LINE" >> "$TARGET"

echo "[gate-check] step 3 — running tsc; expecting non-zero exit"
if npx tsc --noEmit --incremental false 2>/dev/null; then
  echo "[gate-check] FAIL: tsc exited 0 with a type error present — test files may not be type-checked" >&2
  exit 1
fi
echo "[gate-check] gate blocked bad code: PASS (exit non-zero) ✓"

echo "[gate-check] step 4 — restoring $TARGET"
restore
trap - EXIT

echo "[gate-check] step 5 — confirming tsc is clean again"
if ! npx tsc --noEmit --incremental false 2>/dev/null; then
  echo "[gate-check] FAIL: tsc still fails after restoring the file" >&2
  exit 1
fi
echo "[gate-check] gate passes clean code: PASS (exit 0) ✓"

echo ""
echo "[gate-check] BUILD GATE IS LIVE — test files are included in type-checking ✓"
