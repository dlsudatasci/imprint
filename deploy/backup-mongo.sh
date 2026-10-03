#!/usr/bin/env bash
#
# Nightly dump of the imprint database. Install on the VM as
# /usr/local/sbin/imprint-backup.sh (root, 0700) and run from cron:
#
#   /etc/cron.d/imprint-backup:
#   17 18 * * * root /usr/local/sbin/imprint-backup.sh >> /var/log/imprint-backup.log 2>&1
#
# The VM clock is UTC, so 18:17 UTC is 02:17 in Manila (UTC+8), outside annotation hours.
#
# Credentials come from /etc/imprint-backup.yaml (root, 0600), which holds a
# single line:  uri: mongodb://imprint_backup:<password>@127.0.0.1:27017/?authSource=admin
# Reading them from a file keeps the password out of the process list.
#
# Keeps the newest $KEEP dumps. Writes to a .partial file first, so a dump that
# fails half way never replaces a good one.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/imprint}"
CONFIG="${CONFIG:-/etc/imprint-backup.yaml}"
DB="${DB:-imprint}"
KEEP="${KEEP:-14}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/$DB-$STAMP.archive.gz"

mongodump --config="$CONFIG" --db="$DB" --archive="$OUT.partial" --gzip --quiet
mv "$OUT.partial" "$OUT"
echo "$(date -Is) wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Oldest beyond KEEP are removed. ls -1t lists newest first.
ls -1t "$BACKUP_DIR"/"$DB"-*.archive.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
