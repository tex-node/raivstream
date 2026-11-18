# Handoff — Phase 16 step 1: one real run through the worker

Paste this file into the new chat. It is the state, the two decisions owed, the free proof that costs nothing, and the
one paid run — with the corrections this repo requires.

## Where the repo is

- Branch `fix/phase16-liveness-resume`, commit `0a3fd44`, based on `main` = `11fbb27`. **Not pushed, no PR.**
- It holds: the liveness split, the deterministic resume index, the schema + migration, and the tests for both.
- Gates on it: API **230 files / 2,732 passed, 5 skipped**, exit 0 · API + web type-checks **0** · web strict lint **0** ·
  plan gate **3/3** · `prisma validate` clean.
- Credit spend this arc: **0 for the last two sessions.** The 1,000-credit step-1 ceiling is **authorized and unspent**.
- Plan (`docs/rushfeature.md`) is at **0 dated lines and 9 resolving `**Status.**` pointers** — never add a date to it.

## Where the proof sequence stopped

| # | step | state |
|---|---|---|
| 0 | heartbeat column · pgboss · imports · scripts type-check | done |
| 0.5 | a job is claimed | done — `SENT=` + `CLAIMED=` + `batch done` |
| 1 | one run through the worker | **owed — the previous run was a no-op (0 credits, 0 assets)** |
| 2 | five-episode batch | owed |
| 3 | kill mid-batch (web stays up, health `missing-worker`) | owed |
| 4 | **lease expiry without a restart — the clause: the sweep must fire on expiry, not on boot** | owed |
| 5 | resume · health both directions | owed |

## What changed last session, and what it changes here

1. **Liveness is the worker's own stamp.** `WorkerHeartbeat` (`worker_heartbeats`, one row per worker name) + migration
   `20261118120000_worker_heartbeat`. `scripts/creative-worker.ts` upserts it every 30 s, holding work or not.
   `queueHealth({ queued, workerLastSeenAt, lastRunProgressAt?, now, livenessMs? })` reads **only** the stamp and has four
   states: `healthy` / `idle` / `idle-no-worker` (no alarm) / `missing-worker` (the alarm). **The migration is unapplied on
   every environment.** The worker fails soft: one `liveness stamp failed` line, then it keeps running.
2. **Resume is deterministic.** `packages/api/src/lib/creative/production/resumeIndex.ts` decides READY first, then recency,
   then id — a total order. Rows left `QUEUED`/`GENERATING` under a READY key are reported as `shadowed`:
   `[creative.resume] shadowed=N` and `ProductionRunResult.shadowed`. The three orphans from the step-1 diagnosis should now
   print as **`shadowed=3`**, which is the free, live confirmation of that diagnosis.
3. **The handler tail is fixed.** `batch done` prints on both exits and the error is logged with its message, so the kill
   test can read the completion line as proof.

## The two decisions owed before any spend

- **Apply the migration** on the environment the worker uses. Additive: one table, no backfill, `IF NOT EXISTS`.
  `cd packages/database && pnpm exec prisma migrate deploy`, then confirm `worker_heartbeats` in `information_schema.tables`.
- **Name a project with genuinely missing assets, and a ceiling.** At the seeded rates (FLUX2 80, H3_MAX 200) a **3-scene
  plan is ≈840 credits** (3 stills + 3 videos) and fits the unspent 1,000; a **4-scene plan is ≈1,120** and would hit the
  ceiling mid-run, so the run would end `PARTIAL` with a capped spend — a ceiling, not a cost. Confirm the spec count from
  `run_started totalScenes=` and the first asset's feature key before authorising.

**Do not reset data to force generation.** Rejected last session and still rejected: it spends credits to manufacture a
quote for work already done.

## Phase A — the free proof (zero credits)

Nothing here charges. It closes the health verdict in both directions and reproduces the orphan count.

1. **Apply the migration** and verify the table. See above.
2. **Add an external reader — a worker cannot report its own absence.** There is no reader today: the health line prints
   inside the worker process, so a stopped worker prints nothing and the only way to see the verdict is to restart it,
   which stamps a fresh liveness row and masks the state being tested. Write `scripts/creative-queue-health.ts`: read
   `WorkerHeartbeat` for `creative-worker`, count non-terminal runs, call `queueHealth`, print one line. It is also the shape
   a later admin endpoint reuses, so it is not throwaway.
3. **Worker up, queue empty:** expect `[creative-worker] started: concurrency=4 providerConcurrency=2
   queue=creative-production`, then the interval line `health=idle ... last check-in Ns ago`; the reader also says `idle`.
4. **Stop the worker, wait past the 120 s liveness limit, queue empty:** the reader must say **`idle-no-worker`**, not
   `missing-worker`. That is the distinction the old check could not make. A live worker that is merely idle never reports
   down again.
5. **The no-op run, with the worker up.** Read the project id from run `cmwla6g2z00019v708q37iam9`
   (`creative_production_runs.projectId`) — do not copy a project id from a handoff. That plan has no pending asset, so the
   run generates nothing and **cannot charge**. Expect, in order: `CLAIMED runId=… jobId=…`, `[creative.resume]
   shadowed=3`, `run_finished … generated=0`, then **`batch done: runId=…`**. Run row: `COMPLETED`, `creditsSpent=0`,
   `readyScenes=0`, `totalScenes=4`.
6. **The missing-worker arm, worker still stopped.** Enqueue the same no-op job, then read with the script: a `RUNNING` row
   with no live stamp must be **`missing-worker`**. Start the worker, let it claim, expect the same zero spend and a second
   `batch done`.

If `shadowed=3` does not appear, **stop and report**: the diagnosis did not reproduce its own evidence, and the paid run
must not be spent on a theory that failed its free test.

## Phase B — the one paid run (≤ 1,000 credits)

1. Use the authorised project (Phase A's decision). The ceiling lives on `CreativeProductionRun.creditCeiling`, not in the
   job payload — read it back from the row.
2. Start the worker **before** submitting.
3. Submit once through the app path (`service.ts` sender → `boss.send`, `retryLimit: 0`, `singletonKey: runId`). No
   in-process fallback exists and none may be added; a sender that falls back is two paths again.
4. Capture, as measured values:

| captured | where |
|---|---|
| `CLAIMED` with run id and job id | worker stdout |
| wall clock to terminal status | worker stdout + run row |
| `creditsSpent` and the matching `credit_transactions` rows | DB |
| `readyScenes` / `failedScenes` / assets produced | run row |
| `shadowed` count | worker stdout `[creative.resume]` |
| terminal status and `lastError` | run row |
| one web request served while the run was in flight (HTTP 200) | web log |

5. Quote the batch as **this run's `creditsSpent` × 5**, beside the six-run average of **44.4** and the observed max of
   **920**, and name any variance. **Do not run the batch.** The quote is the deliverable.

## Prerequisite that is still not on the table

`ecosystem.config.cjs` defines `raivstream-worker` as the **export** worker (`packages/api/src/worker/index.ts`). The
creative worker has **no PM2 entry**, so steps 2–4 would be run against a hand-started script and a terminal close would
be mistaken for a crash. Add one in its own diff — `cwd ./`, `script ./node_modules/.bin/tsx
scripts/creative-worker.ts`, `env_file ./.env`, its own memory cap — and record that the web deploy does **not** restart
it.

## Verified facts that change the code you might write

1. `queueHealth`'s signature is `{ queued, workerLastSeenAt, lastRunProgressAt?, now, livenessMs? }`; `lastProcessedAt` is
   gone. The only caller is `scripts/creative-worker.ts`.
2. `CREATIVE_WORKER_NAME = 'creative-worker'` is the row key; the worker also stamps `pid` and `host`.
3. `ProductionRunStatus` in `productionWorker.ts` now includes `PARTIAL`, matching the Prisma enum. Do not re-narrow it.
4. `byKey` in `runner.ts` comes from `buildResumeIndex(existing)`; do not reintroduce an inline `new Map(existing.map(...))`.
5. `scripts/` type-check is **red with 68 pre-existing errors**, two of them the `.ts`-extension dynamic imports the worker
   already carried. Do not claim it green and do not fix unrelated scripts.
6. API `eslint` has **1 pre-existing error** (`rushAcademyTemplate.test.ts`, `no-assign-module-variable`). Not yours.
7. A job claimed while the worker is alive can still throw after `run_finished` (export derivation). That is why the tail is
   wrapped; a `batch done ... outcome=error` line is a **finding**, not noise.

## Stop conditions

`shadowed=0` on the no-op project · a `SENT=` with no `CLAIMED=` (binding, not provisioning — diagnose, don't retry) · a
run row that says `COMPLETED` with `creditsSpent > 0` and `readyScenes = 0` · `failedScenes > 0` on a plan that had no
moderation reason in the log. Diagnose; never retry blindly and never reset rows to make a run look successful.

## Recording

Plan entry in `docs/rushfeature.md` (de-dated — no `YYYY-MM-DD` anywhere), `docs/operations/roadmap-history.md` (dated,
newest first), and `SESSION.md` (it went stale because two sessions skipped it). Push the branch, open the PR, run the
gates, merge after CI. Run `planHasNoHistory` after every plan edit; it is a test, not a habit.
