# Phase 9B.2B — Release-Candidate Packaging Checkpoint

**Status:** Ready to package. **Not committed, pushed, or deployed** — this document is the packaging review requested before any of those happen; commit/push/deploy still requires explicit instruction.
**Scope:** Audio & Performance layer (Phase 9B.2) through the immutable A/B render-snapshot qualification (Phase 9B.2B).
**Worktree:** `C:/Raiv/raivstream-phase9b2-audio` (branch `codex/phase-9b2-audio-performance`), diffed against `origin/main`.

## Focused rerun (this checkpoint, fresh)

| Check | Result |
|---|---|
| API typecheck (`tsc --noEmit`) | clean, 0 errors |
| Web typecheck (`tsc --noEmit`) | clean, 0 errors |
| Full API test suite | **118/118 passed**, 15/15 test files |
| Source diff scan (`console.log`/`debugger`/`TODO`/`FIXME`/`HACK`/stray env deletes) across every modified `packages/api/src` and `apps/web/src` file | **zero hits** |
| 8-scenario real-ffmpeg checkpoint | not re-run — no renderer/mixing code changed since its last 8/8 pass (only qualification/diagnostic scripts changed this round) |
| Migration static diff vs. Prisma-generated SQL | previously verified additive/clean for both migrations (Phase 9B.2 / 9B.2B rounds); schema unchanged since |

## File-by-file release scope

### Ship — schema & migrations
- `packages/database/schema.prisma` (M)
- `packages/database/migrations/20260827120000_audio_performance_phase9b2/`
- `packages/database/migrations/20260827180000_audio_blueprint_hash_phase9b2b/`

**Exclude — do not stage:** `packages/database/migrations/migration_lock.toml`. Standing instruction from earlier in this work: kept locally only, as a `prisma migrate diff` verification aid, not part of release scope.

### Ship — application source
- `apps/web/src/app/story-playground/[projectId]/page.tsx` (M) — Audio Workspace tab/lanes/inspector
- `packages/api/src/lib/analytics.ts` (M)
- `packages/api/src/lib/credits.ts` (M)
- `packages/api/src/lib/movieRenderWorker.ts` (M) — strict per-cue audio resolution branch
- `packages/api/src/lib/r2.ts` (M) — `getPublicUrlForKey` addition
- `packages/api/src/lib/sequencePlanning.ts` (M)
- `packages/api/src/routers/admin.ts` (M)
- `packages/api/src/routers/story.ts` (M) — Audio Plan CRUD, ownership checks, render snapshot/idempotency wiring
- `packages/api/src/lib/audioMixing.ts` (new)
- `packages/api/src/lib/audioPlanning.ts` (new)

### Ship — tests
- `packages/api/src/lib/__tests__/audioCreditGate.test.ts`
- `packages/api/src/lib/__tests__/audioMixing.test.ts`
- `packages/api/src/lib/__tests__/audioPlanning.test.ts`
- `packages/api/src/lib/__tests__/movieRenderWorkerAudio.test.ts`
- `packages/api/src/routers/__tests__/audioAssetOwnership.test.ts`

### Ship — durable qualification/architecture docs
- `docs/adr/phase-9b2-audio-performance.md`
- `docs/architecture/audio-performance-layer.md`
- `docs/operations/phase-9b2-pure-rendering-checkpoint.md` + `phase-9b2-pure-rendering-checkpoint-results.json`
- `docs/operations/phase-9b2-staging-qualification.md`
- `docs/operations/phase-9b2b-audio-asset-ownership.md`
- `docs/operations/phase-9b2b-audio-workspace-acceptance.md`
- `docs/operations/phase-9b2b-persistence-checkpoint.md`
- `docs/operations/phase-9b2b-storage-key-provenance.md`
- `docs/operations/phase-9b2b-strict-worker-asset-resolution.md`
- `docs/operations/phase-9b2b-typed-rejection-and-render-identity.md`
- `docs/operations/phase-9b2b-audio-ab-snapshot-qualification.md`
- `docs/operations/phase-9b2b-release-candidate-checkpoint.md` (this document)
- `CLAUDE.md`, `ROADMAP.md`, `SESSION.md` (M)

### Ship — durable checkpoint/diagnostic scripts (reusable, each backs a doc above or is general-purpose)
- `scripts/phase9b2-audio-render-checkpoint.ts` — 8-scenario real-ffmpeg regression checkpoint, re-run whenever renderer/mixing code changes
- `packages/api/scripts/phase9b2b-persistence-checkpoint.ts`
- `packages/api/scripts/phase9b2b-audio-workspace-acceptance.ts`
- `packages/api/scripts/phase9b2b-audio-ab-snapshot-qualification.ts` — the A/B snapshot qualification itself
- `packages/api/scripts/phase9b2b-ab-snapshot-reload-check.ts` — paired companion (separate-process persistence proof); kept alongside the qualification script it's needed to reproduce
- `packages/api/scripts/phase9b2b-ab-snapshot-cleanup.ts` — paired teardown companion; kept for the same reason — the qualification script is only safely re-runnable against real DB/R2 with this available
- `packages/api/scripts/check-failed-job-stage.ts` — general-purpose, job-id-parameterized diagnostic tool with ongoing value beyond this checkpoint

### Exclude — disposable, no ongoing value
- `packages/api/scripts/phase9b2b-diagnostic-demo-broken-fixture.ts` — a one-off harness written solely to validate `check-failed-job-stage.ts` against a real induced failure; its own header says "NOT part of the A/B qualification." The evidence it produced (bucket-D classification, the `currentStage`-vs-event-history bug it caught) is already captured in prose in `phase-9b2b-audio-ab-snapshot-qualification.md`'s addendum. Recommend leaving this out of the commit — local-only tooling, or delete it from the worktree.

No other scratch/inspection scripts exist in the tracked worktree to exclude — the ad hoc one-off inspection scripts used during live debugging this session (`check-jobx-stages.ts`, `verify-ab-cleanup.ts`, `find-leftover-asset.ts`, etc.) were written directly to the local scratchpad and the VPS, never into this git worktree, so `git status` never saw them and there is nothing to prune there.

## Caveats carried forward, not silently resolved

- **Browser-visual verification remains unavailable in this environment** (Claude-in-Chrome's controlled browser process has no network route to this machine's loopback interface — confirmed via a decisive isolated test earlier in this work, not fixable this session). The Audio Workspace UI was qualified via `phase9b2b-audio-workspace-acceptance.ts` (real `appRouter.createCaller` calls against real staging Postgres, exercising every acceptance criterion previously listed) rather than an actual browser screenshot. This is documented as an open caveat in `phase-9b2b-audio-workspace-acceptance.md`, not marked as a passed visual/browser leg.
- **No production credit rate is configured** for `story:speech_generation`/`story:audio_generation` — the fail-closed helper exists but nothing charges for it yet (confirmed via `seed.ts` and `origin/main` diff, documented earlier this phase).
- **Staging and production share one R2 bucket/credentials** (no isolated staging object-storage target) — documented in the A/B qualification report; this checkpoint's real-storage-path proof necessarily used real (shared) R2 credentials for one small, disposable, QA-scoped object, explicitly authorized and cleaned up.

## Outstanding decision

This document proposes the ship/exclude split above; it does not stage, commit, push, or deploy anything. Say the word and I'll `git add` exactly the "Ship" file list (excluding `migration_lock.toml` and the diagnostic-demo script), and stop wherever you'd like in the commit → push → deploy sequence.
