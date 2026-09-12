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

## 4. Alerts — detection, severity, dedup/cooldown

`detectRefundRecoveryAlerts()` returns deduplicated candidates with stable
`dedupKey`s. `runRefundAlertCycle()` (read-only) chains detect → cooldown → dry-run
delivery and is exposed via the staging-only monitor command.

### 4.1 Alert model and severity rules

| Kind | dedupKey | Trigger | Severity |
|---|---|---|---|
| `EXHAUSTED` | `fal-refund:exhausted` | any operation at/over the attempt limit | **CRITICAL** |
| `STALE_FAILED` | `fal-refund:stale-failed` | failed operations beyond the stale threshold (default 24h) | **WARNING** |
| `RECENT_FAILURE` | `fal-refund:failure:<category>` | ≥ 3 recent failures of one category (timeout/connection/constraint/storage/provider) | **WARNING** (≥ 10 → **CRITICAL**) |

Repeated-failure thresholds: `REPEATED_FAILURE_THRESHOLD = 3`,
`REPEATED_FAILURE_CRITICAL_THRESHOLD = 10`. Categories are coarse and derived from
redacted error text.

### 4.2 Deduplication and cooldown

- Alerts are deduplicated by `dedupKey` (deterministic).
- `selectAlertsToNotify()` suppresses re-notification of the same key within a
  cooldown window (default **6h**; override `FAL_REFUND_ALERT_COOLDOWN_MS`) and
  returns `nextState` (dedupKey → last-notified ISO) suitable for persistence.
- The monitor command persists cooldown state only if `FAL_REFUND_ALERT_STATE_FILE`
  is set (staging-only path outside the repo); otherwise it is stateless/dry-run.

### 4.3 Monitoring command (read-only, dry-run)

```bash
# on the isolated staging host
RAIVSTREAM_ENV=staging pnpm fal:refund:monitor
# optional cooldown persistence:
FAL_REFUND_ALERT_STATE_FILE=/root/raivstream-secrets/fal-refund-alert-state.json \
  RAIVSTREAM_ENV=staging pnpm fal:refund:monitor
```

- Read-only: never claims/completes refunds, never mutates balances/ledger, never
  calls FAL/R2/generation.
- Default sink prints redacted dry-run lines: `[refund-alert][dry-run] severity=… key=… count=… :: …`
- Exit codes: `0` ran, `1` runtime error, `2` staging-guard refusal.
- **No external notification, scheduler, cron, PM2 worker, or automated recovery
  is activated.** Delivery remains dry-run.

### 4.4 Operator response

| Severity | Response |
|---|---|
| **CRITICAL** (`EXHAUSTED`, ≥10 repeated failures) | Investigate immediately; an operation is stuck at the attempt limit or a systemic failure is occurring. Do not edit balances. Follow §5 escalation. |
| **WARNING** (`STALE_FAILED`, ≥3 repeated failures) | Review on the next working pass; inspect the category and recent error previews; confirm whether a retry is warranted via the manual recovery command. |
| **INFO** | Informational; no action required. |

A future scheduler must not exceed the dry-run boundary without separate approval.

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
