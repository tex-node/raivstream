# Raivstream 5.0 — Launch Readiness

**Milestone:** Production Hardening / Launch Readiness (not a feature slice).
**Question:** Can we safely expose the 5.0 creative experience to real users at meaningful scale?
**Baseline:** 563/563 API tests · web type-check + lint + build clean · migration deployed · live smoke P/X/R PASS.

---

## Gate 1 — Reliability

**Principle enforced:** a failure affects the smallest possible creative scope.

| Failure | Behaviour | Evidence |
|---|---|---|
| Provider timeout | That asset FAILS; the run continues; `PARTIAL` | `launch.test.ts` |
| Provider rejection | Same; per-asset isolation | `launch.test.ts`, `runner.test.ts` |
| Partial scene failure | Unaffected scenes stay READY; `PARTIAL` | `runner.test.ts` |
| Application restart | Detached run dies → stale heartbeat → recover resumes | live Journey R |
| Database interruption | Provider/DB errors are caught per asset; run finalizes | `runner.ts` try/catch/finally |
| R2 / storage failure | That asset FAILS; no other asset touched | `launch.test.ts` |
| Duplicate production request | `produce` is idempotent while a run is active | `phase9.test.ts` |
| Repeated retry | Bounded (`maxAttempts`), never unbounded | `launch.test.ts` |
| Stale run recovery | Reuses the same run (attempt+1); skips READY assets | live Journey R + `phase9.test.ts` |
| Output rendering failure | Output FAILS; originals untouched | `output.test.ts` |
| Review provider unavailable | Review run FAILS gracefully; never blocks | `review.test.ts` |

Residual: database-level interruption (DB down) surfaces as per-asset failures and a `FAILED`/`PARTIAL` run; recovery is via `creative.production.recover` once the DB is healthy. No cross-project blast radius.

## Gate 2 — Data & provenance

`buildRunDiagnostics` (`packages/api/src/lib/creative/production/diagnostics.ts`) returns the full chain and is exposed as `creative.production.diagnostics`:

```
project → plan(contextSnapshot) → production run → produced assets
        → review runs → directives → versions → approvals → outputs
```

Every artifact is attributable to its project, version, series/studio context, directive, production run and source asset. Provider/model/prompt internals are normalized to `provider: "internal"` and are asserted absent in tests. Verified live against a real smoke project.

## Gate 3 — Safety & rights

**Two launch blockers were found and fixed:**

1. **Moderation bypass.** The 5.0 generation adapter called `submitGenerationJob` directly with no moderation. Fixed: `generateStill`/`generateVideo` now call `moderatePrompt` at the boundary (the lowest layer), so the semantic layer can never bypass moderation. A rejection is a typed `CONTENT_REJECTED` error → fails only that asset, refunds credits, and is never retried. (`safety.test.ts`, live `phase9-safety-probe.ts` PASS.)
2. **R16 not gated.** Creative routers used `protectedProcedure`, so R16 could reach the studio. Fixed: a new `creativeProcedure` (auth + `isNotR16`) guards **all 67** creative procedures, and `/create`, `/projects`, `/series`, `/studio` were added to the web middleware `R16_BLOCKED_ROUTES`. Live check: `/create?r16=1`, `/projects/x?r16=1`, `/studio/x?r16=1`, `/series/x?r16=1` all 307 → `/`.

Additional safety properties:
- **Inheritance cannot propagate restricted content:** Series/Studio context reaches generation only as prompts, which are moderated at the adapter. Restricted canon therefore fails at generation, not downstream.
- **Outputs inherit safety context:** `output.render` re-encodes already-moderated produced assets; it generates no new content.
- **Approval does not override safety:** approval is creative-state only; generation always moderates first. Safety and creative approval remain separate.

Residual (out of 5.0 scope, tracked): reference-image/likeness UGC consent controls remain as previously implemented; VEED/UGC stays feature-off pending consent controls.

## Gate 4 — Performance

Deterministic stages (production VPS, n=400, `phase9-perf-baseline.ts`):

| Stage | P50 | P95 | max |
|---|---|---|---|
| intent.interpret | 0.02 ms | 0.04 ms | 2.51 ms |
| plan.build | 0.01 ms | 0.02 ms | 3.05 ms |
| preview.build | 0.00 ms | 0.00 ms | 0.82 ms |
| context.build | 0.00 ms | 0.00 ms | 1.75 ms |
| capability.route | 0.03 ms | 0.07 ms | 3.80 ms |
| director.interpret | 0.00 ms | 0.00 ms | 0.10 ms |
| output.derive | 0.00 ms | 0.00 ms | 0.00 ms |

The semantic layer is effectively free; perceived latency is provider-bound.

Real-provider reference (live smoke): **FIRST_VISUAL 5.8 s**, H3 clip ≈ 25–31 s, full 2-scene production ≈ minutes. `[creative.production]` emits `FIRST_VISUAL` and per-asset durations, and `creative.observability.metrics` exposes P50/P95 for `intent.interpret`, `plan.build`, `production.produce`, `production.status`, `review.run`, `output.derive`, `output.render`. Establishing production P50/P95 for the provider stages is now an ongoing measurement, not a build task. **FIRST_VISUAL remains the primary product metric.**

## Gate 5 — UX acceptance (human)

Protocol: run first-time creators through the loop **without explaining the architecture**, and measure whether they can restate *what Raivstream understood* (not merely find features). Target flow:

```
Tell Raivstream → What I understood → The plan → Creation → Review → Direct → Approval → Output
```

Success = the creator can describe the change/preserve/impact before applying a directive, and can act on a review finding without translating it into a prompt. Status: **PENDING — requires real creators** (cannot be automated).

## Gate 6 — Operational readiness

| Item | Status | Evidence / location |
|---|---|---|
| Backup/restore | ✅ verified | pre-Phase9 dump restored into a scratch DB; counts matched (27 users / 12 videos / 7 projects / 20 assets) |
| Migration rollback strategy | ✅ documented | runbook §Rollback |
| PM2/process recovery | ✅ | live restart + health green |
| Stale-run monitoring | ✅ | `scripts/creative-run-monitor.sh` (exit 2 on stale) |
| Error logging | ✅ | structured `[creative.production]` events (no prompts/URLs/secrets) |
| Production alerts | ⚠️ partial | monitor script is cron-ready; alert routing is an ops policy decision |
| Storage capacity | ⚠️ manual | R2 usage checked via Cloudflare; document thresholds |
| Generation cost visibility | ⚠️ partial | credit ledger + `MODEL_FEATURE_KEY` rates; add a cost dashboard later |
| Failed-run investigation | ✅ | `creative.production.diagnostics` + `scripts/creative-run-diagnostics.ts` (no raw internals) |
| Incident runbook | ✅ | `docs/operations/creative-production-runbook.md` |
| Feature-flag rollback | ✅ | per-stage `RAIVSTREAM_5_*` flags |
| Database / R2 / provider health | ✅ | `/api/health`, provider gates, fal refund runbook |
| Deployment rollback | ✅ | revert commit → CI atomic swap |

**Key question — can the team diagnose a failed run without raw provider internals?** Yes: `creative.production.diagnostics` (creator-scoped) and `creative-run-diagnostics.ts` (operator CLI) return the run, scene/asset status, sanitized failures and the full provenance chain.

---

## Formal checklist

```
RAIVSTREAM 5.0 — PRODUCTION READINESS

ARCHITECTURE     ✓ frozen · ✓ project/series/studio context · ✓ shared engine
CREATION         ✓ intent · ✓ brief · ✓ bible · ✓ plan · ✓ preview
PRODUCTION       ✓ real generation · ✓ continuity · ✓ durable runs · ✓ recovery
                 ✓ partial failure · ✓ FIRST_VISUAL telemetry
JUDGMENT         ✓ review · ✓ findings · ✓ direct · ✓ change+preserve · ✓ impact
                 ✓ targeted regeneration
DELIVERY         ✓ versioning · ✓ approval · ✓ invalidation · ✓ outputs · ✓ provenance
VALIDATION       ✓ 563/563 tests · ✓ 4/4 golden journeys · ✓ real providers/R2/ffmpeg
                 ✓ live smoke P/X/R · ✓ recovery test · ✓ context-to-provider

REMAINING        □ UX acceptance (human)   □ alert routing policy
                 □ storage thresholds      □ generation cost dashboard
```

## Decision

**Conditional GO.** The two safety blockers are fixed and deployed; reliability, provenance and operational diagnosis are in place. Broad exposure is gated on: (1) human UX acceptance (Gate 5), and (2) the four operational policy items above. No further capability work is required.
