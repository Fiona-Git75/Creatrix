#!/usr/bin/env bash
# ── Creatrix PostgreSQL backup ─────────────────────────────────────────────────
# canonical:   scripts/services/postgres-backup.sh
# purpose:     Dump the Creatrix database to a compressed file on an external
#              drive, then rotate old backups so the drive never fills silently.
#
# called by:   scripts/services/postgres-backup.service (systemd)
#              or: bash scripts/services/postgres-backup.sh (manual)
#
# configure:   Edit the two variables below, or export them in your environment
#              before running. Everything else is automatic.
#
# install:     See scripts/services/postgres-backup.timer for scheduling.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────

# Full path to the directory on your external HD where backups are written.
# The directory will be created if it does not exist — but only if the drive
# is already mounted. If the drive is not mounted, the script exits with an
# error rather than writing to whatever happens to be at that path.
BACKUP_DIR="${CREATRIX_BACKUP_DIR:-/mnt/external/creatrix-backups}"

# How many backup files to keep. Older files are deleted after a successful
# dump. 14 = two weeks of daily backups. Adjust to suit your drive size.
KEEP_LAST="${CREATRIX_BACKUP_KEEP:-14}"

# DATABASE_URL is read from the environment (same variable Creatrix uses).
# Set it in your shell or in the systemd service's EnvironmentFile.
DATABASE_URL="${DATABASE_URL:-}"

# ── Helpers ────────────────────────────────────────────────────────────────────

log() { echo "[creatrix-backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# ── Pre-flight checks ──────────────────────────────────────────────────────────

[[ -z "$DATABASE_URL" ]] && fail "DATABASE_URL is not set. Export it or add it to the systemd EnvironmentFile."

# Confirm the external HD is actually mounted, not just that the path exists.
# If the drive is unmounted, the bare directory mount-point still exists on the
# OS drive — writing there would silently fill the root partition.
BACKUP_MOUNT=$(df --output=target "$BACKUP_DIR" 2>/dev/null | tail -1 || true)
if [[ "$BACKUP_MOUNT" == "/" || "$BACKUP_MOUNT" == "/home" || -z "$BACKUP_MOUNT" ]]; then
  fail "Backup directory '$BACKUP_DIR' does not appear to be on a separate mount. " \
       "Is the external HD mounted? Check: mount | grep external"
fi
log "Drive check: $BACKUP_DIR is on mount $BACKUP_MOUNT ✓"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# ── Dump ───────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
OUTFILE="$BACKUP_DIR/creatrix-${TIMESTAMP}.sql.gz"
TMPFILE="${OUTFILE}.tmp"

log "Starting dump → $OUTFILE"
if pg_dump "$DATABASE_URL" | gzip > "$TMPFILE"; then
  mv "$TMPFILE" "$OUTFILE"
  SIZE=$(du -h "$OUTFILE" | cut -f1)
  log "Dump complete: $OUTFILE ($SIZE) ✓"
else
  rm -f "$TMPFILE"
  fail "pg_dump failed — backup was not written."
fi

# ── Rotate ─────────────────────────────────────────────────────────────────────

# Count existing backups (sorted oldest-first). Delete any beyond KEEP_LAST.
EXISTING=$(find "$BACKUP_DIR" -maxdepth 1 -name 'creatrix-*.sql.gz' | sort)
TOTAL=$(echo "$EXISTING" | grep -c . || true)

if (( TOTAL > KEEP_LAST )); then
  DELETE_COUNT=$(( TOTAL - KEEP_LAST ))
  log "Rotating: keeping $KEEP_LAST of $TOTAL backups, removing $DELETE_COUNT oldest"
  echo "$EXISTING" | head -n "$DELETE_COUNT" | while read -r OLD; do
    rm -f "$OLD"
    log "  deleted: $(basename "$OLD")"
  done
else
  log "Rotation: $TOTAL of $KEEP_LAST slots used — nothing to remove"
fi

log "Done."
