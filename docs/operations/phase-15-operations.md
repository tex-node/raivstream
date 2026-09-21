# Phase 15 — Reliability & Operations Runbook

Operational guide for the Phase 15 reliability surface. Code lives in
`packages/api/src/lib` (`providerRateLimit.ts`, `credits.ts`, `jobModel.ts`);
this document covers configuration and procedures.

## 1. Provider rate limiting / backpressure

In-process, per-provider limits applied in `submitGenerationJob`. Over-cap
submissions fail fast with a retryable `RATE_LIMITED` error.

| Env var | Default | Meaning |
|---|---|---|
| `PROVIDER_MAX_CONCURRENCY` | `0` | Max simultaneous in-flight submits per provider. `0` = unlimited. |
| `PROVIDER_MIN_INTERVAL_MS` | `0` | Minimum spacing between submits per provider. `0` = no spacing. |

Scope: **per process**. A multi-process deployment needs a shared backend
(Upstash). Start with generous caps and lower based on provider 429s.

## 2. Retry & dead letter

- `GenerationJob.retryCount` / `errorCode`; `MAX_JOB_RETRIES = 3` (`generators/jobModel.ts`).
- `generation.retry` (user) re-drives a failed job up to the budget, re-charging credits with refund-on-failure.
- **Dead-letter view**: `admin.listGenerationJobs({ deadLetter: true })` — FAILED jobs that exhausted the budget.
- **Dead-letter re-drive**: `admin.resetDeadLetterJob({ jobId })` resets the retry budget (no credit change) so the owner can retry.

## 3. Reserve/settle reconciliation (flag-guarded)

When `CREDIT_RESERVE_SETTLE_ENABLED=true`, credits use reserve → settle → release.
A crash between reserve and settle leaves a HELD `CreditReservation`.

- **Reconcile**: run `releaseStuckReservations(prisma, olderThanMs)` from a periodic scheduler (e.g. hourly, `olderThanMs = 24h`). Idempotent and financially neutral.
- Monitor HELD reservation counts that exceed the expected in-flight window.

## 4. Probes

- **Liveness** — `GET /api/health` (DB reachable → 200).
- **Readiness** — `GET /api/ready` (DB + R2 reachability + redacted provider summary → 200 when DB is up). Use for canary/rollback gating.

## 5. Backup & disaster recovery

- **Database (Postgres/Supabase)**: scheduled `pg_dump` to off-host storage; verify restore **monthly** into a scratch DB and run `prisma migrate status`.
- **Object storage (R2)**: enable bucket versioning; a lifecycle rule for non-current versions. Movie render segments (`…/movies/{jobId}/segments/`) are transient (removed after success) — a lifecycle rule to expire that prefix after ~7 days is safe.
- **Secrets**: `.env` stored outside the repo (`/root/raivstream/.env` on the VPS); rotate `JWT_*`, `FAL_KEY`, R2, Paystack/Stripe keys on a schedule and after any suspected exposure.
- **Recovery drill**: restore DB + R2 to staging, boot the app, confirm `/api/ready` is green and a test generation succeeds.

## 6. Load testing

- Target the read paths (feed, story workspace) and the generation submit path separately.
- Generation submits are provider-bound — exercise `PROVIDER_MAX_CONCURRENCY` / `PROVIDER_MIN_INTERVAL_MS` to confirm `RATE_LIMITED` backpressure behaves and clients retry.
- Watch: p95 submit latency, `RATE_LIMITED` rate, provider error rate, DB connection saturation.

## 7. Capacity planning

Inputs: MAU, generations/user/day, avg credits/generation, provider cost/unit.
Track (Phase 13 dashboards): cost per image/video, queue wait, provider latency/failure, refund rate. Scale triggers: DB connection count, worker backlog, provider quota headroom.

## 8. Known limitations (not yet built)

- No durable queue / dedicated worker process (generation is request-scoped; movie renders use an in-process `setImmediate`).
- Rate limiting is per-process (no distributed backend).
- Notification delivery for the FAL refund monitor is still approval-gated (see `docs/operations/fal-refund-monitoring-production-design.md`).
