#!/bin/bash
# Daily share-attribution retention job. Run by cron on the VPS (repo root).
# Cron: 17 3 * * * /bin/bash /root/raivstream/scripts/share-retention.sh >> /root/raivstream/share-retention.log 2>&1
#   bash scripts/share-retention.sh
set -euo pipefail
cd /root/raivstream

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.local/share/pnpm"
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"

echo "=== $(date -u +%FT%TZ) share-retention ==="
pnpm --filter @raivstream/api share:retention
echo "=== done ==="
