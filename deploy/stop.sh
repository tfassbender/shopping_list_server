#!/usr/bin/env bash
# Stops the shopping list app and its database on the server.
#   ./stop.sh
# The data stays (Docker volume shopping-list_db-data); ./start.sh starts everything again.
set -euo pipefail
cd "$(dirname "$0")"
docker compose down
echo "== Stopped (the database volume is kept)"
