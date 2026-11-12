#!/usr/bin/env bash
# Starts the shopping list app on the server - also after an update or a config change.
#   ./start.sh
# If a new image file (shopping-list-<version>.tar.gz) was uploaded next to this script, it is loaded into
# Docker first and then deleted. Then the database and the app are (re)started and the health check is
# awaited. Flyway migrates the database when the app starts.
set -euo pipefail
cd "$(dirname "$0")"

for required in .env config/application.properties config/jwt.jwk; do
  [ -e "$required" ] || { echo "Missing $required - see doc/deployment.md (first setup)." >&2; exit 1; }
done

image=$(ls -1 shopping-list-*.tar.gz 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$image" ]; then
  echo "== Loading $image"
  docker load -i "$image"
  rm -f shopping-list-*.tar.gz   # the image is in Docker now; older versions stay there for a rollback
fi

echo "== Starting"
# --force-recreate: the app also picks up a changed config/application.properties.
docker compose up -d --force-recreate app
docker image prune -f >/dev/null   # only unnamed leftovers; tagged versions stay

port=$(sed -n 's/^APP_PORT=//p' .env | tail -1)
url="http://127.0.0.1:${port:-4723}/api/health"
for _ in $(seq 1 30); do
  if curl -fs "$url"; then echo; echo "== Running"; exit 0; fi
  sleep 2
done
echo "The app didn't answer on $url - last log lines:" >&2
docker compose logs --tail 40 app >&2
exit 1
