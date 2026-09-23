# Raivstream 5.0 — Alert Routing & Operational Thresholds

**Status of ownership fields:** `OPEN` = not yet assigned. Per launch rules, owners are **not invented**; a named owner must ratify each row before the Operations gate can move from CONDITIONAL to PASS.

This document defines the **mechanism** (signals, severity mapping, monitor wiring, escalation path). The owner names and the numeric storage thresholds remain to be ratified.

---

## 1. Signal sources

| Signal | Source |
|---|---|
| App / DB health | `GET /api/health` (app + R16) |
| Process health | `pm2 status raivstream-web` |
| Creative run health | `scripts/creative-run-monitor.sh` (stale RUNNING) |
| Creative storage / asset health | `scripts/creative-storage-monitor.sh` |
| Provider/asset failures | `[creative.production]` structured events |
| Credit/refund anomalies | `scripts/creative-cost-report.ts`, fal refund runbook |
| Latency regressions | `creative.observability.metrics` (P50/P95) |

## 2. Severity matrix

| Severity | Example | Owner | Initial response | Escalation |
|---|---|---|---|---|
| **P0** | Production outage (`/api/health` failing, PM2 down, DB unreachable) | `OPEN` | `OPEN` | `OPEN` |
| **P1** | Major degradation (generation failure rate spike, all runs stale, R2/provider outage) | `OPEN` | `OPEN` | `OPEN` |
| **P2** | Individual workflow failure (a project's production PARTIAL/FAILED, output render failure) | `OPEN` | `OPEN` | `OPEN` |
| **P3** | Non-blocking anomaly (single retried asset, isolated stale run auto-recovered) | `OPEN` | `OPEN` | `OPEN` |

> Suggested response *mechanisms* (not owners): P0 → runbook §1–2, revert deploy if systemic; P1 → runbook §3/§8, consider stage flag rollback; P2 → `creative-run-diagnostics.ts` then recover/retry; P3 → observe, no action unless recurring.

## 3. Monitor → severity mapping

| Monitor | Exit 0 | Exit 2 (warning) | Exit 3 (critical) |
|---|---|---|---|
| `creative-run-monitor.sh` | no stale runs | stale RUNNING run(s) → P2 | — |
| `creative-storage-monitor.sh` | within thresholds | asset/failed/stuck warn → P3/P2 | asset total ≥ crit → P1 |
| `/api/health` | healthy | — | unhealthy → P0 |

Recommended cadence (mechanism): run both monitor scripts on the existing daily canary cron (`0 6 * * *`) and additionally after each deploy; alert on non-zero exit. **Cadence values are proposals pending owner ratification.**

## 4. Storage thresholds (PROPOSED — pending ratification)

The monitor is report-only until these are set. Values below are **proposals** derived from the current measured baseline (2026-09-23: 30 creative assets, 0 failed after cleanup, 0 stuck, DB ~4 MB creative footprint), scaled for early-launch headroom. They must be ratified by the storage owner before enforcement.

| Metric | Warning | Critical | Frequency | Owner | Action | Escalation |
|---|---|---|---|---|---|---|
| Total creative produced assets | 50,000 | 100,000 | daily | `OPEN` | review asset growth, prune rejected assets | `OPEN` |
| FAILED assets (absolute) | 100 | 500 | daily | `OPEN` | investigate provider/moderation failures | `OPEN` |
| Stuck GENERATING assets (>30m) | 10 | 50 | daily | `OPEN` | recover runs, inspect provider | `OPEN` |
| Stale RUNNING runs (>10m) | 1 | 5 | daily + post-deploy | `OPEN` | `creative.production.recover` | `OPEN` |
| R2 creative object count | (see R2 dashboard) | — | weekly | `OPEN` | review retention | `OPEN` |
| DB size | — | — | weekly | `OPEN` | capacity review | `OPEN` |

Set via env (e.g. in the cron wrapper):
```
CREATIVE_ASSET_WARN=50000
CREATIVE_ASSET_CRIT=100000
CREATIVE_FAILED_WARN=100
CREATIVE_STUCK_WARN=10
```

## 5. Cost visibility

`scripts/creative-cost-report.ts` provides total / per-feature / per-project / per-scene / retry cost / volume / daily trend from the existing credit ledger. Output/render uses FFmpeg compute (no credit charge). Run weekly and on demand. A UI dashboard is POST-LAUNCH.

## 6. Closure requirement

To move the Operations gate to PASS:
1. Assign owners for P0–P3 and ratify the storage threshold values above.
2. Wire the two monitor scripts to the alert channel.
3. Confirm the escalation path.

Until then, the gate remains **CONDITIONAL**.
