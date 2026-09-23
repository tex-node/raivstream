# Raivstream 5.0 — Creative Production Runbook

Operational procedures for the 5.0 creative layer. Goal: diagnose and recover a
creative production without opening raw generation/provider internals.

---

## 1. Signals

- **Health:** `curl -s https://app.raivstream.com/api/health` (and `r16.`).
- **Process:** `pm2 status raivstream-web` / `pm2 logs raivstream-web --lines 60 --nostream`.
- **Structured events:** logs tagged `[creative.production]` — `run_started`,
  `asset_started`, `asset_ready`, `asset_failed`, `run_finished`. These never
  contain prompts, story text, URLs or secrets.
- **Metrics:** `creative.observability.metrics` (P50/P95 per stage),
  `creative.observability.timings`.
- **Run monitor:** `bash scripts/creative-run-monitor.sh 10` → exit 2 if any
  `RUNNING` run has a stale heartbeat (>10m).

## 2. Diagnose a failed / partial run

```bash
# Operator CLI (sanitized provenance + failures, no provider internals):
pnpm exec tsx scripts/creative-run-diagnostics.ts <projectId>
```

Returns: project status/stage, latest run (status/attempt/stage/heartbeat),
per-scene asset status, sanitized failure messages, and the provenance chain
(versions, directives, review runs, approvals, outputs). Provider/model/prompt
details are normalized to `provider: "internal"`.

Creator-facing equivalent: `creative.production.diagnostics` (owner-scoped).

## 3. Recover a stuck run (process restart)

1. Confirm staleness: `bash scripts/creative-run-monitor.sh 10`.
2. Resume:
   - Creator UI: the project page can call `creative.production.recover`.
   - Operator: call `recoverStuckProductions(prisma, undefined, { userId })`
     (or via the endpoint). It reuses the same run row (attempt +1), skips READY
     assets, regenerates only what is missing, and finalizes the run.
3. Verify: `scripts/creative-run-diagnostics.ts <projectId>` → run `COMPLETED`
   or `PARTIAL`, project `REVIEW`, completed assets unchanged.

Idempotent: recovery is a no-op while a run is genuinely active (fresh heartbeat
and in-flight assets).

## 4. Partial failure (some scenes failed)

- Unaffected scenes are never regenerated. "Retry N scenes" re-runs only the
  failed/missing assets (the runner skips READY).
- A content rejection (`CONTENT_REJECTED`) is deterministic and never retried;
  credits are refunded. Direct a change instead of retrying.

## 5. Feature-flag rollback

Turn off the affected stage without redeploying (env, then
`pm2 restart raivstream-web --update-env`):

```
RAIVSTREAM_5_ENABLED=false            # disable the whole 5.0 layer
RAIVSTREAM_5_PRODUCTION_ENABLED=false # stop new productions (reads still work)
RAIVSTREAM_5_DIRECTOR_ENABLED=false
RAIVSTREAM_5_OUTPUT_ENABLED=false
```

Existing projects/data remain intact; only the gated endpoints return FORBIDDEN.

## 6. Deployment rollback

- **Code:** `git revert <commit>` (or reset to the prior commit) and push to
  `main`; CI does an atomic `.next-build` swap and PM2 restart with health checks.
- **Schema:** the Phase 9 migration is additive. To roll back:
  ```sql
  DROP TABLE IF EXISTS "creative_production_runs";
  DROP TYPE IF EXISTS "CreativeProductionRunStatus";
  ```
  Prefer forward-fix; rollback drops run history only (creative projects,
  assets, versions, approvals and outputs are untouched).

## 7. Database backup / restore

- **Backup:** `docker exec supabase-db pg_dump -U supabase_admin -d postgres > /root/raivstream/backups/<name>.sql`
- **Restore (verified):** restore into a scratch DB and compare counts before
  dropping it (see `docs/operations/phase-9-launch-readiness.md`, Gate 6).
- Migrations: `pnpm --filter @raivstream/database exec prisma migrate deploy`
  (idempotent; runs in CI before the build).

## 8. Provider / R2 failure

- fal refund/recovery: `docs/operations/fal-refund-recovery-runbook.md`.
- R2/storage failure surfaces as per-asset `FAILED` with a sanitized message;
  the run continues. Retry after storage is healthy.
- Provider health: `/api/health` + the `[creative.production]` failure rate.

## 9. Safety incident (moderation / R16)

- Every creative generation is moderated at the adapter boundary; a rejection
  fails only that asset and refunds credits.
- R16 is blocked at the API (`creativeProcedure`) and the web middleware
  (`/create`, `/projects`, `/series`, `/studio`). If R16 content is suspected,
  verify both layers and check `R16_BLOCKED_ROUTES`.
- Do not disable moderation to unblock a creator; direct a change instead.

## 10. Escalation checklist

1. Health + PM2 status.
2. `creative-run-diagnostics.ts <projectId>`.
3. Stale runs → recover.
4. Confirm flags; consider stage rollback.
5. If systemic: revert the last deploy, then investigate offline.
