#!/bin/bash
# Gate E canary status snapshot. Run on the VPS (repo root) once a day.
#   bash scripts/canary-status.sh
set -euo pipefail
cd /root/raivstream

url=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
db=$(echo "$url" | sed -E 's#.*/([^/?#]+)([?#].*)?#\1#')
user=$(echo "$url" | sed -E 's#^[a-z]+://([^:@/]+):.*#\1#')
pass=$(echo "$url" | sed -E 's#^[a-z]+://[^:@/]+:([^@/]*)@.*#\1#')

echo "=== $(date -u +%FT%TZ) canary status ==="

echo "-- health / ready --"
curl -s -m 15 https://app.raivstream.com/api/health; echo
curl -s -m 15 https://app.raivstream.com/api/ready; echo

echo "-- generation_jobs last 48h by model x status --"
docker exec -i -e PGPASSWORD="$pass" supabase-db psql -U "$user" -d "$db" -c "SELECT model, status, count(*), count(*) FILTER (WHERE \"errorCode\" IS NOT NULL) AS with_err FROM generation_jobs WHERE \"createdAt\" > now() - interval '48 hours' GROUP BY 1,2 ORDER BY 1,2;"

echo "-- error codes last 48h --"
docker exec -i -e PGPASSWORD="$pass" supabase-db psql -U "$user" -d "$db" -c "SELECT \"errorCode\", count(*) FROM generation_jobs WHERE \"createdAt\" > now() - interval '48 hours' AND \"errorCode\" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;"

echo "-- story provider provenance (all time, by provider) --"
docker exec -i -e PGPASSWORD="$pass" supabase-db psql -U "$user" -d "$db" -v ON_ERROR_STOP=1 -c "SELECT \"providerMetadata\"->>'provider' AS provider, count(*) FROM story_chapters WHERE \"providerMetadata\" ? 'provider' GROUP BY 1 ORDER BY 2 DESC;"

echo "-- credit_operations last 48h (refund outbox) --"
docker exec -i -e PGPASSWORD="$pass" supabase-db psql -U "$user" -d "$db" -c "SELECT status, count(*) FROM credit_operations WHERE \"createdAt\" > now() - interval '48 hours' GROUP BY 1 ORDER BY 2 DESC;"

echo "-- pm2 errors (last 25) --"
pm2 logs raivstream-web --lines 25 --nostream 2>/dev/null | grep -iE 'error|narrative|claude|fal|h3|structur' | tail -25 || echo "(none)"