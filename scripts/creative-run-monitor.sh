#!/usr/bin/env bash
# Raivstream 5.0 — creative production-run monitor (launch readiness, gate 6).
#
# Reports creative production runs stuck in RUNNING with a stale heartbeat, so
# an operator can decide to recover them (creative.production.recover) without
# opening provider internals. Exit code 2 when stale runs exist (alert-friendly).
#
# Usage: bash scripts/creative-run-monitor.sh [staleMinutes]

set -euo pipefail
STALE_MIN="${1:-10}"

ROWS=$(docker exec supabase-db psql -U supabase_admin -d postgres -tAc \
  "select r.id || ' | project=' || r.\"projectId\" || ' | heartbeat=' || to_char(r.\"heartbeatAt\", 'YYYY-MM-DD HH24:MI:SS') || ' | attempt=' || r.attempt from creative_production_runs r where r.status = 'RUNNING' and r.\"heartbeatAt\" < now() - interval '${STALE_MIN} minutes' order by r.\"heartbeatAt\" asc")

if [ -n "${ROWS}" ]; then
  echo "STALE CREATIVE RUNS (older than ${STALE_MIN}m):"
  echo "${ROWS}"
  echo "Recover with: creative.production.recover (per user) or recoverStuckProductions."
  exit 2
fi

echo "creative runs healthy (no RUNNING runs older than ${STALE_MIN}m)"
