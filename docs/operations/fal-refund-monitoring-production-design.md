# FAL Refund Monitoring — Production-Ready Architecture & Approval Review

**Status:** Design / approval preparation only. No implementation, deployment, credentials, or activation.
**Baseline commit:** `988a5ad7bb7a199cb8956880a22eb1ac0148de56` (`feat: add FAL refund monitoring alerts and dry-run command`)
**Legend:** [IMPLEMENTED] verified in the current commit · [PROPOSED] recommended design · [ASSUMPTION] stated belief needing confirmation · [REQUIRES INSPECTION] not verified in this review · [DECISION] needs explicit approval.

---

## 1. Executive recommendation

Adopt a **scheduled, one-shot, read-only monitor** (systemd timer preferred) that reads refund operations, applies durable cooldown/dedup state, and delivers alerts through channels the platform already or can safely integrate:
- **Primary:** email via **Resend** (already a dependency and used for password reset).
- **Secondary (optional):** a Slack/Teams incoming webhook.
- Durable cooldown state in **Postgres** (same database, additive table).
- **No unattended refund recovery.** Monitoring produces alerts only; refund execution stays manual and separately approved.

Production activation must be a **separate approval** after a staging rehearsal, because the current monitor guard deliberately refuses anything that is not `RAIVSTREAM_ENV=staging` [IMPLEMENTED], and because production email domain/recipients and DB privileges are not yet verified [REQUIRES INSPECTION].

---

## 2. Current safety boundary [IMPLEMENTED]

- Read-only detection: `getRefundOperationsOverview()`, `detectRefundRecoveryAlerts()`, `runRefundAlertCycle()` perform only count/aggregate/find queries; no claim/complete, no balance/ledger mutation, no FAL/R2/generation calls.
- Alert kinds/severity: `EXHAUSTED` → CRITICAL; `STALE_FAILED` → WARNING; `RECENT_FAILURE` → WARNING at ≥3, CRITICAL at ≥10.
- Cooldown: in-process `selectAlertsToNotify()` with default 6h; `nextState` map returned but **not durably persisted by default**.
- Delivery: `dryRunAlertSink` prints redacted `[refund-alert][dry-run]` lines; **no external notification**.
- Command: `scripts/fal-refund-monitor.ts`, staging-guarded via `assertStagingEnvironment()` (requires `RAIVSTREAM_ENV=staging`, rejects `NODE_ENV=production`, blocks known production DB hosts), exit codes 0/1/2.
- No scheduler, cron, systemd timer, worker, or notification sink is active.

**Not in scope now and must not change:** refund execution, credit mutation, unattended recovery.

---

## 3. Proposed architecture [PROPOSED]

```
systemd timer (per env)
   └─ wrapper (sources host secret file; sets RAIVSTREAM_ENV)
        └─ pnpm fal:refund:monitor  (one-shot, read-only)
             ├─ Postgres: read refund operations (existing CreditOperation)
             ├─ Postgres: durable cooldown + delivery state (new additive table)
             └─ Dispatcher
                  ├─ Primary: Resend email
                  └─ Secondary: Slack/Teams webhook
```

Key properties:
- **One-shot process** per tick (no long-running worker initially) → simple deploy/rollback, no queue.
- **Read-only DB role** for the monitor [DECISION].
- **Environment separation:** staging job uses staging DB and staging secret file; production job uses production env file and a production-only guard. The two must never share a secret file or DB.
- **Egress allowlist:** only the notification provider endpoints.

---

## 4. Scheduling recommendation [PROPOSED]

**Recommended: systemd timer** on the application host (same VPS today), over cron:
- Better logging (`journald`), `OnFailure=` handling, `RandomizedDelaySec` jitter, `Persistent=true` for missed ticks, and `TimeoutStartSec`.
- Single-flight per tick is inherent (timer won't start a second unit instance); add a **DB advisory lock** for defense-in-depth against manual runs.

Suggested unit parameters:
- Frequency: every **15 minutes** (`OnCalendar=*:0/15`). [DECISION: 5/15/60m]
- `RandomizedDelaySec=60`, `Persistent=true`, `TimeoutStartSec=120`.
- `ExecStart=/root/raivstream-secrets/run-fal-refund-monitor.sh` (wrapper; 0700, root) which `set -a; . <env-file>; set +a` then runs the command.
- Retry: systemd `Restart=on-failure` is not applicable to one-shot services; instead rely on the next tick + `OnFailure=` alert unit.
- Failure visibility: non-zero exit logs to journald; a `OnFailure=` unit sends an ops alert (careful: avoid alert loops) OR the DB delivery log records the failure for the admin view.

Env guard requirements:
- Staging: existing guard (`RAIVSTREAM_ENV=staging`) [IMPLEMENTED].
- Production: **do not weaken** the staging guard. Introduce a separate, reviewed production monitor path that requires `RAIVSTREAM_ENV=production`, a read-only DB credential, and a production-only secret file. [DECISION]
- Duplicate-run prevention: systemd single instance + `pg_advisory_lock` around the run.
- Rollback: `systemctl disable --now <timer>`; no schema/deploy dependency (state table is additive).
- Staging vs production separation: distinct env files, distinct DB targets, distinct notification recipients/channels (e.g., `#alerts-staging` vs on-call).

---

## 5. Durable state design [PROPOSED]

**Storage:** Postgres via Prisma (same DB). Avoids ephemeral local files. (A host-local file is explicitly rejected for production except as a documented, non-authoritative cache.)

**Proposed additive models (migration required):**

```
model AlertCooldownState {
  id            String   @id @default(cuid())
  environment   String   // "staging" | "production"
  alertKey      String   // deterministic dedupKey
  lastNotifiedAt DateTime
  lastSeverity  String
  updatedAt     DateTime @updatedAt
  @@unique([environment, alertKey])
}

model AlertDeliveryLog {
  id             String   @id @default(cuid())
  environment    String
  alertKey       String
  severity       String
  channel        String   // "email" | "slack" | ...
  status         String   // SENT | FAILED | SUPPRESSED
  attempt        Int      @default(1)
  errorCategory  String?  // redacted
  createdAt      DateTime @default(now())
  @@index([environment, createdAt])
  @@index([alertKey, createdAt])
}
```

- **Alert identity/fingerprint:** the existing deterministic `dedupKey` (e.g., `fal-refund:exhausted`, `fal-refund:failure:connection`). Add `environment` to prevent cross-env suppression.
- **Cooldown duration:** 6h default [IMPLEMENTED constant]; per-severity overrides proposed (e.g., CRITICAL 1h, WARNING 12h). [DECISION]
- **Concurrent execution/locking:** `SELECT ... FOR UPDATE` on the cooldown row when claiming a notification, or `pg_advisory_xact_lock(hashtext(env||alertKey))`; combined with systemd single-flight.
- **Retention/cleanup:** keep `AlertCooldownState` (one row per key); prune `AlertDeliveryLog` older than e.g. 90 days via a bounded delete in the same job.
- **Restart behavior:** durable rows survive restarts; cooldown enforced across restarts.
- **Migration/rollback:** additive `CREATE TABLE`; rollback = stop timer + drop tables (no data dependency).
- **State store unavailable:** fail **closed for delivery** (log, exit non-zero, no silent alert flood) but **never** block refund reads or degrade refund execution. If the DB is unreachable the monitor cannot evaluate anyway; alert on the monitor failure itself via systemd `OnFailure`.

---

## 6. Notification delivery design [PROPOSED]

Channels:
- **Primary — email via Resend** [IMPLEMENTED dependency + usage in `forgot-password`]. Note: that code uses `onboarding@resend.dev` (Resend sandbox); real ops mail requires a **verified sending domain** and a monitored inbox/alias. [REQUIRES INSPECTION / DECISION]
- **Secondary — Slack or Teams incoming webhook** (optional; no dependency today). Slack signing-secret verification for inbound; outbound webhook URL is itself a secret.
- **Incident platforms (PagerDuty) / SMS:** defer unless on-call SLAs demand it. [DECISION]

Routing by severity:
- CRITICAL → primary + secondary immediately; page on-call if incident platform adopted.
- WARNING → primary (email) only; digest-eligible.
- INFO → daily digest only.

Delivery mechanics:
- Per-channel timeout (e.g., 10s), bounded retries (3) with exponential backoff within the same run; on exhaustion mark `FAILED` in `AlertDeliveryLog` and (for CRITICAL) attempt the secondary channel.
- Delivery confirmation: provider acceptance recorded (Resend message id / webhook 2xx); do not treat “enqueued” as “seen”.
- Idempotency: one send per `(environment, alertKey, cooldown window)`; re-sends only after cooldown or on a severity escalation.
- Rate limits: cap messages per run and per hour; batch WARNING/INFO.
- Suppression/batching: **recovery/resolution** notifications when a previously-alerting key becomes healthy (only if a prior alert was sent).
- Maintenance windows: suppress non-CRITICAL during declared windows; CRITICAL always sends.

---

## 7. Security and secret management [PROPOSED]

- Secrets on host in root-only files (`0600`) outside the repo, e.g. `/root/raivstream-secrets/fal-refund-monitor.env` — same pattern as the existing staging secret file [IMPLEMENTED pattern].
- **Never** in source control, logs, alert payloads, DB rows, or command output; reuse the existing redaction for alert text.
- Rotation: rotate `RESEND_API_KEY`/webhook URLs on a schedule and on offboarding; document a rotation runbook.
- Least privilege: a **read-only DB role** for the monitor (SELECT on `credit_operations`, plus the two state tables) rather than the app superuser. [DECISION / REQUIRES INSPECTION of current role setup]
- Outbound network: allowlist only Resend/Slack endpoints at the host firewall/Caddy egress.
- Webhook protection: verify provider signatures where available; keep webhook URLs secret; rotate on leak.
- Audit logging: `AlertDeliveryLog` records redacted channel/status/attempts; who/what/when for each notification.
- Access review: periodic review of who can read the secret file and the ops inbox.

---

## 8. Alert-fatigue and escalation policy [PROPOSED]

- Severity definitions as in §2 (keep). Calibrate `REPEATED_FAILURE_THRESHOLD`/`CRITICAL` against observed data before production (see §11).
- Deduplication by `(environment, alertKey)`.
- Cooldown: CRITICAL 1h, WARNING 12h, INFO digest (proposed; current single 6h constant). [DECISION]
- Grouping: single consolidated message per run listing counts by key, not one message per operation.
- Escalation timing: CRITICAL unacknowledged for 30m → secondary channel / page (if adopted).
- Recovery notifications: emit a RESOLVED message when a key transitions from alerting to healthy.
- Daily summaries: WARNING/INFO roll-up once per day.
- Threshold changes: only after ≥2 weeks of production data; require a reviewer; version the constants.

---

## 9. Failure-mode analysis

| Failure mode | Impact | Mitigation | Risk |
|---|---|---|---|
| Monitor DB unreachable | No evaluation/alerts | systemd `OnFailure`, monitor-down alert path | false-negative |
| Notification provider down | Alerts not delivered | retries + secondary channel + `FAILED` log | false-negative |
| Duplicate scheduler runs | Duplicate alerts | systemd single-flight + advisory lock + idempotent state | duplicate |
| Cooldown state lost | Alert storm | durable Postgres state | noise |
| Over-sensitive thresholds | Alert fatigue | calibration window; digest | false-positive |
| Under-sensitive thresholds | Missed stuck refunds | CRITICAL on exhausted; review cadence | false-negative |
| Monitor accidentally gains write scope | Credit mutation | read-only DB role; code performs no writes | high-severity (mitigated) |
| Production path reuses staging guard assumptions | Guard bypass | explicit production guard + review | high-severity |
| Secret leakage in alert payload/logs | Credential exposure | redaction + no secrets in payloads | high-severity |
| **Accidental refund execution** | Credit mutation | **unattended recovery is not in scope; monitor has no execution authority** | catastrophic (prevented by separation) |

Emergency disable: `systemctl disable --now <timer>`; rotate webhook/API secrets if leak suspected; the monitor can be fully removed without touching refund/credit paths.

---

## 10. Production readiness checklist [PROPOSED]

- [ ] Environment guard for production defined and reviewed (no weakening of staging guard).
- [ ] Read-only DB role created and tested; monitor cannot write refund/credit tables.
- [ ] State tables migrated (additive) in staging, then production, with backups.
- [ ] Secrets in root-only host files; rotation runbook written.
- [ ] Verified sending domain + ops recipient list (email); optional Slack/Teams webhook.
- [ ] systemd unit + timer installed, single-flight verified, `OnFailure` tested.
- [ ] Dashboards/observability: admin FAL Refunds page + monitor-run logs + delivery log view.
- [ ] Staging rehearsal (below) passed end-to-end including a real test email to an ops alias.
- [ ] Production canary: 24–48h at low frequency with delivery to a staging/test channel before ops channels.
- [ ] Rollback rehearsed; emergency disable documented.
- [ ] Ownership/on-call assigned; runbook updated with alert meanings and response times.
- [ ] Explicit sign-off that **unattended recovery remains disabled**.

---

## 11. Testing and validation plan [PROPOSED]

Extend existing focused tests (already cover threshold/severity/cooldown/dry-run [IMPLEMENTED]) with:
- Threshold classification and severity assignment (boundary 2/3/10).
- Cooldown across process restarts using the durable store (integration against Postgres).
- Concurrent runs: advisory-lock contention → single delivery.
- State-store failures: DB down → fail closed for delivery, no storm, non-zero exit.
- Notification provider failures: timeout/5xx → retries → `FAILED` log → secondary channel.
- Retry/timeout behavior with an injected fake provider.
- Redaction: no URLs/emails/tokens/user ids in payloads or logs.
- Environment guard: staging guard unchanged; production guard denies misconfigured runs.
- Duplicate suppression and recovery/resolution notifications.
- Emergency disable: timer disabled → no runs; no side effects on refund/credit paths.
- End-to-end staging rehearsal with a real email to an internal alias (approved), then a controlled provider-failure drill.

---

## 12. Open decisions requiring explicit approval [DECISION]

1. Scheduler choice (systemd timer vs cron vs endpoint) and frequency.
2. Production guard design and whether production monitoring is in scope now.
3. Durable state schema (tables above) and migration approval.
4. Notification provider(s): Resend email + optional Slack/Teams; verified domain & recipients.
5. Severity-based cooldown values and escalation timings.
6. Read-only DB role provisioning and credential ownership.
7. Retention period for `AlertDeliveryLog` and data-privacy review.
8. Whether PagerDuty/SMS is needed (on-call SLA).
9. Explicit confirmation that **unattended refund recovery is out of scope**.

---

## 13. Recommended implementation sequence [PROPOSED]

1. Inspect/confirm: production DB role model, Resend domain status, host egress, on-call ownership. [REQUIRES INSPECTION]
2. Add durable state models + migration (additive) and a DB-backed cooldown store; unit + integration tests.
3. Add channel adapters (Resend first; Slack optional) behind an interface with injected fakes; retries/timeouts/redaction tests.
4. Add the production-guard wrapper + systemd unit/timer in **staging** only; run the rehearsal.
5. Review results; then, under a separate approval, enable production canary at low frequency to a test channel.
6. Promote to ops channels; document runbook; schedule threshold calibration review at 2 weeks.

---

## Approval gate

Before any implementation or production activation, the following must be explicitly approved:

1. **Scope confirmation:** monitoring/alerting only; **unattended refund recovery remains disabled and out of scope**.
2. **Scheduler + frequency** and the **production environment guard design** (staging guard must not be weakened).
3. **Durable state schema + migration** approval, plus a **read-only DB role**.
4. **Notification channels and recipients**, including a **verified sending domain** and secret-storage/rotation plan.
5. **Alert-fatigue parameters** (cooldowns, escalation timing, retention).
6. **Staging rehearsal plan** and a **production canary window** with rollback/emergency-disable procedures.
7. Named **owner/on-call** accountable for alert response.

No production behavior changes, credential configuration, worker activation, or recovery automation may begin until these are approved.
