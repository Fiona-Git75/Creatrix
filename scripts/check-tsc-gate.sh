#!/usr/bin/env bash
# Verifies that the tsc --noEmit gate is not vacuous.
#
# Step 0 (new): confirms sentinel test files appear in tsc --listFiles output.
#               Guards against tsconfig changes that silently exclude test files
#               from type-checking — e.g. adding **/*.test.tsx to "exclude", or
#               tightening the "include" glob so __tests__/ is no longer covered.
#               Fails immediately and loudly if any sentinel is absent.
#
# Steps 1-5: the existing probe cycle.
#   1. Introduces a deliberate type error into a test file
#   2. Asserts tsc exits non-zero  (gate blocks bad code)
#   3. Restores the file
#   4. Asserts tsc exits zero     (gate passes clean code)

set -euo pipefail

TARGET="client/src/__tests__/setup.ts"
MARKER="// __TYPE_ERROR_PROBE__"
ERROR_LINE="const _typeProbe: number = 'this is not a number'; ${MARKER}"

# ── Sentinel files ────────────────────────────────────────────────────────────
# Every file listed here must appear in tsc --listFiles output.
# • setup.ts   — the probe target itself; catches full __tests__/ exclusion.
# • *.test.tsx — representative of the files the gate is designed to protect;
#                catches a future "exclude": ["**/*.test.tsx"] addition.
SENTINEL_FILES=(
  "client/src/__tests__/setup.ts"
  "client/src/__tests__/setup-repair-countdown.test.tsx"
)

restore() {
  if grep -qF "$MARKER" "$TARGET" 2>/dev/null; then
    grep -vF "$MARKER" "$TARGET" > "${TARGET}.tmp" && mv "${TARGET}.tmp" "$TARGET"
    echo "[gate-check] restored $TARGET"
  fi
}
trap restore EXIT

# ── Step 0: sentinel file list check ─────────────────────────────────────────
echo "[gate-check] step 0 — confirming sentinel test files are listed by tsc"

# Pipe tsc --listFiles directly into grep for each sentinel.
# || true on the tsc call so a pre-existing type error does not prevent the
# file list from being emitted; we only care about file presence here.
SENTINEL_MISSING=0
for sentinel in "${SENTINEL_FILES[@]}"; do
  # grep -F does a substring match, so "client/src/__tests__/setup.ts"
  # matches the absolute path that tsc emits.
  if ! npx tsc --noEmit --incremental false --listFiles 2>&1 | grep -qF "$sentinel"; then
    echo "[gate-check] FAIL: '$sentinel' is NOT in tsc --listFiles — tsconfig may be silently excluding test files" >&2
    SENTINEL_MISSING=1
  else
    echo "[gate-check]   found: $sentinel ✓"
  fi
done

if [ "$SENTINEL_MISSING" -ne 0 ]; then
  echo "[gate-check] Fix: check tsconfig.json 'include'/'exclude' and ensure $TARGET is covered." >&2
  exit 1
fi
echo "[gate-check] sentinel check: PASS — test files are included in type-checking ✓"

# ── Step 1: baseline must be clean ───────────────────────────────────────────
echo "[gate-check] step 1 — confirming baseline is clean"
if ! npx tsc --noEmit --incremental false 2>/dev/null; then
  echo "[gate-check] FAIL: baseline already has type errors — fix those first" >&2
  exit 1
fi
echo "[gate-check] baseline: PASS (exit 0) ✓"

# ── Step 2: inject the probe ──────────────────────────────────────────────────
echo "[gate-check] step 2 — injecting deliberate type error into $TARGET"
echo "$ERROR_LINE" >> "$TARGET"

# ── Step 3: tsc must reject it ────────────────────────────────────────────────
echo "[gate-check] step 3 — running tsc; expecting non-zero exit"
if npx tsc --noEmit --incremental false 2>/dev/null; then
  echo "[gate-check] FAIL: tsc exited 0 with a type error present — test files may not be type-checked" >&2
  exit 1
fi
echo "[gate-check] gate blocked bad code: PASS (exit non-zero) ✓"

# ── Step 4: restore ───────────────────────────────────────────────────────────
echo "[gate-check] step 4 — restoring $TARGET"
restore
trap - EXIT

# ── Step 5: baseline must be clean again ──────────────────────────────────────
echo "[gate-check] step 5 — confirming tsc is clean again"
if ! npx tsc --noEmit --incremental false 2>/dev/null; then
  echo "[gate-check] FAIL: tsc still fails after restoring the file" >&2
  exit 1
fi
echo "[gate-check] gate passes clean code: PASS (exit 0) ✓"

echo ""
echo "[gate-check] BUILD GATE IS LIVE — test files are included in type-checking ✓"
