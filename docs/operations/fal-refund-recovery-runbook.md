# FAL Refund Recovery — Operations Runbook

Scope: the crash-safe FAL refund outbox (`CreditOperation`) and its manual,
staging-only recovery command. This is observability + operational readiness
only. **No scheduler, cron, worker, or automated recovery is enabled.**

## 1. State categories

| Category | Definition | Recovery picks it up? |
|---|---|---|
| Recoverable | `status IN (PENDING, FAILED)` **and** `attempts < FAL_REFUND_MAX_ATTEMPTS` (5) | Yes |
| Exhausted | `status = FAILED` **and** `attempts >= 5` | No — requires operator review |
| Completed | `status = COMPLETED` | No — financially inert |
| Stale failed | `status = FAILED` and `updatedAt` older than the stale threshold (default 24h; `FAL_REFUND_STALE_THRESHOLD_MS`) | Only if `attempts < 5` |

`PROCESSING` is a transient in-transaction state; it is never observable outside a
running transaction. Claim eligibility is unchanged by this runbook: a refund is
applied exactly once by the atomic claim, and completed operations are never
re-processed.

## 2. Normal recovery

```bash
# from the staging checkout, on the isolated staging host
RAIVSTREAM_ENV=staging pnpm fal:refund:recover 25
```

What it does:
- Scans up to `limit` recoverable operations (default 25; bounded 1..100).
- Executes each refund atomically (balance + REFUND ledger row + `COMPLETED`).
- Prints `refund-recovery: found=N completed=N skipped=N failed=N`
  followed by `refund-recovery: exhausted=N remaining=N` (best-effort, read-only).

What it does **not** do:
- No FAL provider calls, no R2 writes, no generation jobs, no manual credit edits.
- Never touches completed operations; never bypasses the attempt limit.

Exit codes (unchanged):
- `0` — command ran (including zero work).
- `1` — unrecoverable runtime error.
- `2` — environment/staging-guard refusal.

Verify completion: the operation row is `COMPLETED`, the user balance increased
once, and exactly one `REFUND` ledger row exists for the reference key.

Guard: the command refuses unless `RAIVSTREAM_ENV=staging`, `NODE_ENV != production`,
and the database host is not a known production host. It refuses **before** opening
a database connection.

## 3. Monitoring (read-only)

Admin surface: **Admin → FAL Refunds** (`/admin/fal-refunds`, ADMIN-only) backed by
the read-only `admin.refundOperations` procedure. It shows status counts,
recoverable vs exhausted amounts, oldest unresolved operation, recent failures
(key tag, category, attempts, amount, updated time, redacted error preview), and
operator-attention alerts. **No refund/retry/approve/credit buttons exist.**

Programmatic/service access: `getRefundOperationsOverview(prisma, options)` and
`detectRefundRecoveryAlerts(prisma, options)` in
`packages/api/src/lib/mediaProviders/refundOperationsMonitor.ts`. Metrics include:
recoverable/failed/exhausted/stale/completed counts, amounts awaiting recovery and
amounts in exhausted operations, oldest unresolved age, latest operation time, and
recent failures grouped by normalized category.

Safety: queries are parameterized and bounded (recent failures ≤ 50); error text is
redacted (URLs, connection strings, emails, long tokens); idempotency keys are
shown only as a stable non-reversible tag; no user records or secrets are returned.

## 4. Alert-ready detection (no scheduler)

`detectRefundRecoveryAlerts()` returns deduplicated candidates with stable
`dedupKey`s for a future scheduler/monitor:

| kind | dedupKey | trigger |
|---|---|---|
| `EXHAUSTED` | `fal-refund:exhausted` | any operation at/over the attempt limit |
| `STALE_FAILED` | `fal-refund:stale-failed` | failed operations beyond the stale threshold |
| `RECENT_FAILURE` | `fal-refund:failure:<category>` | recent failures of a given category (timeout/connection/constraint/storage/provider) |

This function does **not** send notifications. A future scheduler/worker may call it
and fan out to an alerting channel. Do not add cron/PM2/worker without a separate
approval.

## 5. Escalation — an operation reached the attempt limit

1. Do **not** manually edit balances or ledger rows.
2. Preserve the operation row and its ledger evidence.
3. Inspect the redacted error preview and related application logs.
4. Decide whether the failure is systemic (many operations, same category) or
   isolated.
5. Recover only through a separately approved procedure. Never bypass the outbox.

## 6. Prisma prerequisite

A fresh staging checkout may require client regeneration after schema changes
before the command works:

```bash
pnpm --filter @raivstream/database db:generate
```

## 7. Future invocation mechanism (documented, not implemented)

Options:
- systemd timer / cron invoking the command;
- a dedicated worker consuming `detectRefundRecoveryAlerts()` candidates;
- an authenticated, rate-limited operations endpoint;
- an application-integrated background pass.

Any future mechanism must preserve: the staging/production guard, atomic claim and
transaction boundaries, the attempt limit, exactly-once refund semantics, redacted
logging, and no unattended production recovery without explicit authorization.
