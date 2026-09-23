# Raivstream 5.0 — Launch Ratification Records

Two launch conditions require a **named owner** decision. Owners and threshold values are **not invented** here; this document is the ratification instrument. Record the outcome in `docs/operations/launch-closure-evidence.json`, then run `scripts/launch-closure-check.ts`.

---

## A. Alert Routing Ownership (Gate 6, condition 2)

Severity matrix (fill Owner / Initial response / Escalation — currently `OPEN`):

| Severity | Example | Owner | Initial response | Escalation |
|---|---|---|---|---|
| P0 | Production outage (`/api/health` failing, PM2 down, DB unreachable) | `OPEN` | `OPEN` | `OPEN` |
| P1 | Major degradation (failure-rate spike, all runs stale, R2/provider outage) | `OPEN` | `OPEN` | `OPEN` |
| P2 | Individual workflow failure (a project PARTIAL/FAILED, render failure) | `OPEN` | `OPEN` | `OPEN` |
| P3 | Non-blocking anomaly (single retry, isolated auto-recovered run) | `OPEN` | `OPEN` | `OPEN` |

Mechanism already delivered: `docs/operations/alert-routing.md` maps signals → severity; `scripts/creative-run-monitor.sh` and `scripts/creative-storage-monitor.sh` emit exit codes 2/3; `/api/health` is the P0 signal.

**To ratify:** fill `owners.P0..P3`, `escalation`, set `alertsWired=true`, `ratified=true`, `ratifiedBy`, `date` in the evidence file. Confirm the two monitors are wired to the alert channel.

---

## B. Storage Threshold Ratification (Gate 6, condition 3)

The monitor `scripts/creative-storage-monitor.sh` is **report-only** until thresholds are set. Proposed values (derived from the measured baseline 2026-09-23: 29 assets, 0 failed, 0 stuck, 0 stale runs, DB 25 MB) are **proposals pending ratification**:

| Metric | Proposed warning | Proposed critical |
|---|---|---|
| Total creative produced assets | 50,000 | 100,000 |
| FAILED assets (absolute) | 100 | 500 |
| Stuck GENERATING assets (>30m) | 10 | 50 |
| Stale RUNNING runs (>10m) | 1 | 5 |

**To ratify:** set `values.totalAssetsWarn/Crit`, `values.failedAssetsWarn`, `values.stuckAssetsWarn`, `values.staleRunsWarn`, `ratified=true`, `ratifiedBy`, `date`, `enforcementEnabled=true` in the evidence file, and export the same values to the monitor environment (e.g. the cron wrapper):
```
CREATIVE_ASSET_WARN=50000
CREATIVE_ASSET_CRIT=100000
CREATIVE_FAILED_WARN=100
CREATIVE_STUCK_WARN=10
```

---

## C. Ratification record

| Condition | Ratified by | Date | Outcome |
|---|---|---|---|
| Alert routing ownership | `OPEN` | — | `OPEN` |
| Storage thresholds | `OPEN` | — | `OPEN` |

Once both rows are filled and recorded in the evidence JSON, run `scripts/launch-closure-check.ts` to regenerate the acceptance matrix and final decision.
