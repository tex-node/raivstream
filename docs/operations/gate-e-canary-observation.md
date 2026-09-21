# Gate E — Production Canary Observation Plan (fal / MiniMax / Claude / GPT-4o / ElevenLabs)

**Date:** 2026-09-21
**Status:** ACTIVE — 10% Claude rollout + fal image/video live
**Owner:** texdevices@gmail.com (operator, allowlisted for the Claude engine)

## 1. Scope

| Provider | Prod state | Canary risk surface |
|---|---|---|
| fal.ai — FLUX2 (image) | Live | Real per-image cost; failure/refund path |
| MiniMax H3-Max Turbo — H3_MAX (video) | Live | Real per-second cost; long jobs (up to 15s) |
| Claude Sonnet — narrative engine | **10% rollout** (+ allowlist) | Per-call cost; quality/refusal; R16 safety |
| GPT-4o — ProductionManifest structurer | Enabled, inert (no UI) | No traffic until a manifest path calls it |
| ElevenLabs — TTS | Enabled, fail-closed | `story:speech_generation` rate UNSET → calls refuse |

## 2. Observation window

- **48–72 hours** at `STORY_NARRATIVE_ENGINE_ROLLOUT=10`.
- Run `scripts/canary-status.sh` (VPS-side) at least once a day; spot-check PM2 errors after each deploy.

## 3. Metrics to watch (and where)

| Metric | Where | Target |
|---|---|---|
| `generation_jobs` by model × status (48h) | canary-status §jobs | FLUX2/H3_MAX COMPLETED ≥ 95% |
| `generation_jobs.errorCode` (PROVIDER_ERROR / RATE_LIMITED / STORAGE_FAILED) | canary-status §jobs | no systematic error code |
| Story provider provenance (`story_chapters.providerMetadata.provider`) | canary-status §chapters | claude-narrative vs openai-compatible vs local-fallback counts |
| Claude fallbacks (`[narrativeEngine] story fallback`) | PM2 `raivstream-web` logs | < 5% of story generations |
| `credit_operations` (refund outbox) | canary-status §refunds | no FAILED / spiking PENDING |
| `/api/health` + `/api/ready` | canary-status | healthy + fal capabilities enabled |
| Admin surfaces | `/admin/providers`, `/admin/jobs`, `/admin/fal-refunds`, `/admin/revenue` | no anomalies |

## 4. Go / No-go

**GO to `ROLLOUT=100`** (Gate F step) when, over the window:
- FLUX2 + H3_MAX generation success ≥ 95% with no single dominant error code.
- Claude story generation fallback rate < 5% and no repeated R16-safety rejections.
- `credit_operations` clean (no failed refunds); cost within the budgeted amount for the 10% slice.
- No 5xx spikes on `/api/health`.

**NO-GO / ROLLBACK** (any of):
- Generation success < 90% or a recurring provider error (provider outage/contract drift).
- Claude fallback > 15% or repeated moderation/safety failures.
- Unexpected cost spike (e.g. runaway retries), refund outbox failures, or any data/auth incident.

## 5. Rollback (instant, reversible)

1. `STORY_NARRATIVE_ENGINE_ROLLOUT=0` — stops Claude for everyone but the allowlist.
2. `STORY_NARRATIVE_ENGINE_ENABLED=false` — full Claude disable.
3. `FAL_*` switches off / `FAL_KEY` removed — disables fal image/video.
4. Redeploy (atomic; env files preserved by the deploy workflow).

## 6. Next steps after the window

- Bump `ROLLOUT` 10 → 100 (or step 25 → 50 → 100), observe 24h at each step.
- Complete the Gate D human visual sign-off (9 outputs in
  `docs/operations/gate-d-fal-quality-evaluation.md`).
- When the manifest UI ships, monitor GPT-4o structurer calls (credit gate + errors).
- Set the `story:speech_generation` credit rate before exposing ElevenLabs scene narration.