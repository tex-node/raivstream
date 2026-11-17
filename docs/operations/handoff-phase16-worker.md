# Handoff — Phase 16 worker, step 1 (2026-11-17)

Paste this file into the new chat. It is the state, the verified facts, and the three deliverables with the
corrections this repo requires.

## Where the repo is

- `main` = `eac5cbb`, tree clean, last merged PR **#449**.
- Gates: API type-check 0 · web type-check 0 · strict lint 0 · `planHasNoHistory` 3/3 · **2,716 API + 207 web tests**.
- Credit spend so far this arc: **6,312**. The **1,000-credit ceiling for step 1 is authorized and unspent**.
- Plan (`docs/rushfeature.md`) is at **0 dated lines and 9 resolving `**Status.**` pointers** — never add a date to it.

## The sequence, and where it stopped

| # | step | state |
|---|---|---|
| 0 | heartbeat column · pgboss · imports · scripts type-check | #448 **done** (scripts type-check: see correction 3) |
| 0.5 | a job is claimed | #449 **done** — `SENT=…` + `CLAIMED=` + `batch done` |
| 1 | one run through the worker | **owed — needs the sender** |
| 2 | five-episode batch | owed |
| 3 | kill mid-batch (web stays up, health `missing-worker`) | owed |
| 4 | **lease expiry without a restart — the clause: the sweep must fire on expiry, not on boot** | owed |
| 5 | resume · health both directions | owed |

## Verified facts that change the code you were about to write

1. **`CreativeProductionRunStatus` has no `QUEUED`.** The enum is `RUNNING | COMPLETED | PARTIAL | FAILED | CANCELLED`
   (`packages/database/schema.prisma`). `status: 'QUEUED'` will not compile. Either create the row as `RUNNING` (what
   the service already does) or add `QUEUED` in its own migration — that is a decision, not a detail.
2. **`runCreativeProduction` takes a project, not run ids.**
   `runCreativeProduction(prisma, { projectId, runId?, attempt? }, deps?, options?)` — `packages/api/src/lib/creative/production/runner.ts:139`.
   `{ runIds, ceiling }` is not its shape. The ceiling is read from the run row (`creditCeiling`) and enforced by
   `assertWithinCeiling({ runId, ceiling, spent, nextCost })`.
3. **Run rows are already created** at `packages/api/src/lib/creative/production/service.ts:390` with
   `status: 'RUNNING'`, `totalScenes`, `stage: 'creating_scenes'`, `contextSnapshot`. The sender should reuse that
   create and then enqueue — not invent a second one.
4. **`scripts/` is still not independently type-checked.** #448 claimed it was; that was false (`tsconfig.scripts.json`
   extended a `tsconfig.base.json` that does not exist). #449 corrected the config, which then transitively compiles the
   API under different options and fails on config artifacts. Fixing it properly needs project references or a shared
   base. Do not restate the old claim.
5. **`export.story` does have a sender** — `storyVideoExportService.ts:178` calls `enqueueStoryExport`. It never claimed
   because **no daemon ran**, not because nothing sends.
6. pg-boss v12 hands the handler a **job array**; `job.id` is not where the id lives (the claim line printed
   `undefined`). Log `job.data.runIds`, and keep `batch done` as the evidence, not the CLAIMED line alone.

## File 1 — the sender (replaces the fire-and-forget at service.ts:398)

```ts
// packages/api/src/lib/creative/production/service.ts — inside `produce`, replacing `void runCreativeProduction(...)`
// No fallback to in-process execution: a sender that falls back is two paths again, and the fallback is the one that
// would run in the web tier.
const boss = await (await import('../../jobs')).getBoss();
await boss.createQueue(CREATIVE_PRODUCTION_QUEUE); // idempotent; pg-boss does not create on send reliably

const run = runId
  ? { id: runId }
  : await prisma.creativeProductionRun.create({
      data: { projectId: project.id, status: 'RUNNING', totalScenes: plan.scenes.length, stage: 'queued', creditCeiling: 1000 },
    });

// The ceiling travels on the ROW (creditCeiling), which the runner already reads; the job carries identity only.
await boss.send(CREATIVE_PRODUCTION_QUEUE, { projectId: project.id, runId: run.id }, {
  retryLimit: 0,          // a retry is a resume decision, not an automatic repeat
  expireInMinutes: 30,
  singletonKey: run.id,   // one live job per run: the batch's idempotency at the queue level
});
return { started: true, runId: run.id }; // the client polls the run row
```

## File 2 — the worker's handler (scripts/creative-worker.ts, where `boss.work` is wired)

```ts
await boss.work<{ projectId: string; runId: string }>(
  CREATIVE_PRODUCTION_QUEUE,
  { batchSize: 1 },
  async ([job]) => {
    const { projectId, runId } = job.data;
    // CLAIMED carries the run id: this is the line the kill test reads.
    console.info(`[creative-worker] CLAIMED runId=${runId} jobId=${job.id ?? 'undefined'} process=creative-worker`);
    const { runCreativeProduction } = await import('../packages/api/src/lib/creative/production/runner.ts');
    await runCreativeProduction(prisma as never, { projectId, runId });
    console.info(`[creative-worker] DONE runId=${runId}`);
  },
);
```

Also required for the kill test to mean anything: **the worker must sweep on a timer**, not only at boot. It already
sweeps every 60s in `scripts/creative-worker.ts`; keep it, and make sure the run's `heartbeatAt` is stamped **during**
the run (the runner does not stamp it today — that is the next small edit).

## File 3 — the single run at 1,000 credits

1. Pick the candidate from #446: the project with **1 approval, 3 completed runs, 15 assets, 4,760 credits**.
2. Start the worker (`set -a; . apps/web/.env.local; set +a; ./node_modules/.bin/tsx scripts/creative-worker.ts`).
3. Call the sender once. Capture: the CLAIMED line, wall clock to terminal status, `creditsSpent`, assets produced,
   terminal status, and a web request served while the run was in flight.
4. Quote the batch as **this run's `creditsSpent` × 5**, beside the six-run average of **44.4** and the observed max of
   **920** — and name any variance.
5. **Do not run the batch.** The quote is the deliverable.

## Silent-failure checks to keep

- The worker starts **before** anything is submitted.
- The sender has **no in-process fallback** — otherwise the web tier runs the batch again.
- The ceiling is on the row (`creditCeiling: 1000`), not only in the job payload.
- A `SENT=` with no `CLAIMED=` is a **binding** problem, not a provisioning one — diagnose, don't retry.
- A recovery path that only fires on boot is not a recovery path (the lease clause).
- Plan edits stay de-dated and keep resolving pointers; run `planHasNoHistory` after every plan edit.

## Recording

Plan entry (`docs/rushfeature.md`), `docs/operations/roadmap-history.md`, and `SESSION.md` — corrected in place, with the
original preserved where something was wrong. Branch off `main`, never commit to it, verify the branch after the switch,
`git status --porcelain | grep -v '^??'` before claiming clean.
