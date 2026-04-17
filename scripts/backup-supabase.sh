#!/bin/bash
# /home/kiko/backups/backup-supabase.sh
# Daily Supabase database backup via pg_dump
# Keeps last 14 backups, runs on Hetzner cron
# Cost: $0 (Hetzner flat rate)

set -e

BACKUP_DIR="/home/kiko/backups/db"
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
FILENAME="kiko_backup_${TIMESTAMP}.sql.gz"
KEEP_DAYS=14

# Supabase connection string (set via environment or .env)
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres.dwiywqeleyckzcxbwrlb:${SUPABASE_DB_PASSWORD}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."
pg_dump "$DB_URL" --no-owner --no-privileges --clean --if-exists 2>/dev/null | gzip > "$BACKUP_DIR/$FILENAME"

SIZE=$(du -h "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date)] Backup complete: $FILENAME ($SIZE)"

# Cleanup old backups
find "$BACKUP_DIR" -name "kiko_backup_*.sql.gz" -mtime +$KEEP_DAYS -delete
REMAINING=$(ls -1 "$BACKUP_DIR"/kiko_backup_*.sql.gz 2>/dev/null | wc -l)
echo "[$(date)] Retained $REMAINING backups (keeping last ${KEEP_DAYS} days)"
