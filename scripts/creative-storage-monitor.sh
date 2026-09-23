#!/usr/bin/env bash
# Raivstream 5.0 — creative storage & asset-health monitor (launch closure, Gate 6).
#
# Reports creative asset volume, failed/stuck assets and run health, and (when
# thresholds are configured) exits non-zero on breach. Thresholds are NOT
# invented here: set the env vars below to owner-ratified values; otherwise the
# script runs report-only.
#
#   CREATIVE_ASSET_WARN / CREATIVE_ASSET_CRIT   total creative produced assets
#   CREATIVE_FAILED_WARN                        FAILED assets (absolute)
#   CREATIVE_STUCK_WARN                         assets stuck GENERATING older than 30m
#
# Exit codes: 0 ok/report-only · 2 warning · 3 critical
#
# Usage: bash scripts/creative-storage-monitor.sh

set -euo pipefail

PSQL() { docker exec supabase-db psql -U supabase_admin -d postgres -tAc "$1"; }

TOTAL=$(PSQL "select count(1) from creative_produced_assets")
READY=$(PSQL "select count(1) from creative_produced_assets where status='READY'")
FAILED=$(PSQL "select count(1) from creative_produced_assets where status='FAILED'")
STUCK=$(PSQL "select count(1) from creative_produced_assets where status in ('GENERATING','QUEUED') and \"updatedAt\" < now() - interval '30 minutes'")
STALE_RUNS=$(PSQL "select count(1) from creative_production_runs where status='RUNNING' and \"heartbeatAt\" < now() - interval '10 minutes'")
DB_SIZE=$(PSQL "select pg_size_pretty(pg_database_size('postgres'))")
R2_OBJECTS=$(PSQL "select count(1) from creative_produced_assets where \"assetUrl\" is not null")

echo "RAIVSTREAM 5.0 — creative storage & asset health"
echo "total_assets=${TOTAL} ready=${READY} failed=${FAILED} stuck_generating_30m=${STUCK}"
echo "stale_runs_10m=${STALE_RUNS} r2_linked_objects=${R2_OBJECTS} db_size=${DB_SIZE}"

STATUS=0
if [ -n "${CREATIVE_ASSET_CRIT:-}" ] && [ "${TOTAL}" -ge "${CREATIVE_ASSET_CRIT}" ]; then echo "CRITICAL: total assets >= ${CREATIVE_ASSET_CRIT}"; STATUS=3; fi
if [ -n "${CREATIVE_ASSET_WARN:-}" ] && [ "${TOTAL}" -ge "${CREATIVE_ASSET_WARN}" ]; then echo "WARNING: total assets >= ${CREATIVE_ASSET_WARN}"; [ "${STATUS}" -lt 2 ] && STATUS=2; fi
if [ -n "${CREATIVE_FAILED_WARN:-}" ] && [ "${FAILED}" -ge "${CREATIVE_FAILED_WARN}" ]; then echo "WARNING: failed assets >= ${CREATIVE_FAILED_WARN}"; [ "${STATUS}" -lt 2 ] && STATUS=2; fi
if [ -n "${CREATIVE_STUCK_WARN:-}" ] && [ "${STUCK}" -ge "${CREATIVE_STUCK_WARN}" ]; then echo "WARNING: stuck assets >= ${CREATIVE_STUCK_WARN}"; [ "${STATUS}" -lt 2 ] && STATUS=2; fi

if [ "${STALE_RUNS}" -gt 0 ]; then echo "WARNING: ${STALE_RUNS} stale RUNNING run(s) — recover via creative.production.recover"; [ "${STATUS}" -lt 2 ] && STATUS=2; fi

if [ "${STATUS}" -eq 0 ] && [ -z "${CREATIVE_ASSET_WARN:-}${CREATIVE_FAILED_WARN:-}${CREATIVE_STUCK_WARN:-}${CREATIVE_ASSET_CRIT:-}" ]; then
  echo "report-only (no thresholds configured — see docs/operations/alert-routing.md)"
fi

echo "exit=${STATUS}"
exit "${STATUS}"
