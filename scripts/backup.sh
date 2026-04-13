#!/bin/bash
# SQLite backup script for cctc database
# Creates timestamped backups and cleans up old ones (>7 days)
#
# Usage:
#   ./scripts/backup.sh                    # Uses default /data paths
#   DB_PATH=/path/to/cctc.db ./scripts/backup.sh  # Custom paths
#   BACKUP_DIR=/path/to/backups ./scripts/backup.sh

set -euo pipefail

DB_PATH="${DB_PATH:-/data/cctc.db}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cctc-$TIMESTAMP.db"

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

DELETED=$(find "$BACKUP_DIR" -name "cctc-*.db" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "Cleaned up $DELETED old backup(s) (older than $RETENTION_DAYS days)"
fi
