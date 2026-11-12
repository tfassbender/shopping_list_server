#!/usr/bin/env bash
# Daily database backup: pg_dump of the running stack into backups/, keeps the last 14 days.
# Run in the app directory on the server (part of the release archive, next to docker-compose.yml),
# e.g. by cron (see doc/deployment.md):
#   15 3 * * * cd <app directory> && ./backup.sh >> backups/backup.log 2>&1
set -euo pipefail
mkdir -p backups
file="backups/shoppinglist-$(date +%F).sql.gz"
docker compose exec -T db pg_dump -U shoppinglist --clean --if-exists shoppinglist | gzip > "$file.tmp"
mv "$file.tmp" "$file"
find backups -name 'shoppinglist-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup written: $file"
