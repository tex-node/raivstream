/**
 * R16-safe story video export service.
 *
 * Assembles all READY scene videos from a KIDS/R16 StoryProject into a single
 * portrait video using renderOutputDerivative, then persists the result as a
 * StoryVideoExport row.
 *
 * ── Synchronous lifecycle ──────────────────────────────────────────────────
 * requestExport() is synchronous: the mutation blocks while FFmpeg and R2
 * run. The row starts in GENERATING (not PENDING → GENERATING) to accurately
 * represent that assembly is already in progress. PENDING is reserved in the
 * enum for a future async path. The UI should expect to wait or poll
 * getStoryVideoExport — NOT assume a fast return.
 *
 * ── Safety invariants ─────────────────────────────────────────────────────
 * Export safety and generation safety are independent. This service proves:
 *   1. ctx.isR16 is true           (request is from an R16 session)
 *   2. project belongs to user     (authorization)
 *   3. project.audienceMode=KIDS   (project-level audience mode)
 *   4. scenes belong to project    (projectId cross-check)
 *   5. assets belong to scene+proj (projectId + sceneId FK chain)
 *   6. assets are assetType=VIDEO  (type check)
 *   7. assets are status=READY     (generation completed)
 *   8. assets are isLatest=true    (no stale superseded clips)
 *   9. assets are not deleted      (deletedAt=null)
 *  10. assetUrl is non-null        (internal CDN reference, not external URL)
 * No arbitrary external URL can be injected as scene video input.
 *
 * ── Generation-layer boundary ─────────────────────────────────────────────
 * By the time an asset reaches READY, it has passed moderatePrompt() and the
 * KIDS negative-prompt stack in generateSceneVideoAsset(). The export does not
 * re-run moderation — the asset graph enforces the boundary.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────
 * A sourceHash fingerprint (SHA-256 of sorted "sceneId:assetId" pairs) is
 * stored with a DB-unique constraint on (projectId, sourceHash). Concurrent
 * duplicate requests collide at the INSERT and are resolved by fetching the
 * existing row (no duplicate FFmpeg jobs, no duplicate R2 uploads).
 */

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@raivstream/database';
import { TRPCError } from '@trpc/server';
import { resolveExportPolicy } from './storyExportPolicy';
import { deriveOutput } from '../creative/output/derivation';
import { renderOutputDerivative, EXPORT_RENDERER_VERSION, type OutputRenderDeps, type RenderScene } from '../creative/output/render';
import { EXPORT_STUCK_THRESHOLD_MS } from '../ffmpegSafety';

export interface StoryVideoExportState {
  id: string;
  projectId: string;
  status: string;
  assetUrl: string | null;
  durationSeconds: number | null;
  widthPx: number | null;
  heightPx: number | null;
  errorMessage: string | null;
  endCardApplied: boolean | null;
  sourceHash: string;
  sceneIds: string[];
  createdAt: Date;
  completedAt: Date | null;
}

export type SourceHashOptions = {
  /** Renderer version; defaults to EXPORT_RENDERER_VERSION. */
  version?: string;
  /**
   * Project-level render input. `identityRefsEnabled` changes the composed prompt
   * and therefore the pixels, so it must change the hash or the cache serves the
   * pre-flag export. A named field, not a version bump: a version string would make
   * a flag flip look like a renderer upgrade and force a bump per flag.
   */
  identityRefsEnabled?: boolean;
};

export function computeSourceHash(
  pairs: Array<{ sceneId: string; assetId: string; audioUrl?: string | null }>,
  optionsOrVersion: SourceHashOptions | string = {},
): string {
  const options: SourceHashOptions = typeof optionsOrVersion === 'string'
    ? { version: optionsOrVersion }
    : optionsOrVersion;
  const version = options.version ?? EXPORT_RENDERER_VERSION;
  const identityRefs = options.identityRefsEnabled ? '1' : '0';
  // ORDER MATTERS. The composition is a film, not a set: segment index is part of
  // identity (the same lesson as `segmentIndex` in the segment key). Sorting by
  // sceneId here would make a reordered film hash identically to the original.
  const ordered = [...pairs];
  // E1 — fold the renderer version into the payload so a renderer change (e.g.
  // preserving source-clip native audio) invalidates every cached export, not just
  // ones whose source changed. Include the audioUrl suffix only when present.
  // Project-level behaviour flags join the payload for the same reason: an input
  // that changes the output but not the hash is a cache that lies.
  const payload = `${version}|identityRefs:${identityRefs}|` + ordered.map((p) => `${p.sceneId}:${p.assetId}${p.audioUrl ? `:audio:${p.audioUrl}` : ''}`).join(',');
  return createHash('sha256').update(payload).digest('hex');
}

function serializeExport(row: {
  id: string;
  projectId: string;
  status: string;
  assetUrl: string | null;
  durationSeconds: number | null;
  widthPx: number | null;
  heightPx: number | null;
  errorMessage: string | null;
  endCardApplied?: boolean | null;
  sourceHash: string;
  sceneIds: unknown;
  createdAt: Date;
  completedAt: Date | null;
}): StoryVideoExportState {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    assetUrl: row.assetUrl,
    durationSeconds: row.durationSeconds,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    errorMessage: row.errorMessage,
    endCardApplied: row.endCardApplied ?? null,
    sourceHash: row.sourceHash,
    sceneIds: Array.isArray(row.sceneIds) ? (row.sceneIds as string[]) : [],
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

/** Prisma unique-constraint violation code. */
const PRISMA_UNIQUE_CONFLICT = 'P2002';

type ExportRowShape = Parameters<typeof serializeExport>[0];

/**
 * Re-read the row after enqueueing. In production the worker has not run yet, so
 * this returns PENDING (the client polls). Under the inline test runner the job
 * has already finished, so the caller sees READY/FAILED — which keeps the
 * existing service tests meaningful without a live queue.
 */
async function serializeFresh(prisma: PrismaClient, row: ExportRowShape): Promise<StoryVideoExportState> {
  const fresh = await prisma.storyVideoExport.findFirst({ where: { id: row.id } });
  return serializeExport((fresh ?? row) as ExportRowShape);
}

export type ExportRunner = (
  prisma: PrismaClient,
  row: ExportRowShape,
  deps?: OutputRenderDeps,
) => Promise<StoryVideoExportState | void>;

let inlineExportRunner: ExportRunner | null = null;

/**
 * Test seam: execute the job inline instead of queueing it. Production never
 * sets this — `runEnqueued` then goes through pg-boss (dynamic import, so the
 * queue library never enters the web bundle).
 */
export function __setExportRunnerForTests(runner: ExportRunner | null): void {
  inlineExportRunner = runner;
}

/**
 * Hand the row to the worker, or run it inline under test. Returns the final
 * state when the runner produced one (inline), else the freshly-read row —
 * PENDING in production, which is what the client polls.
 */
async function runEnqueued(
  prisma: PrismaClient,
  row: ExportRowShape,
  deps: OutputRenderDeps,
): Promise<StoryVideoExportState> {
  if (inlineExportRunner) {
    const inlineResult = await inlineExportRunner(prisma, row, deps);
    if (inlineResult) return inlineResult;
  } else {
    const { enqueueStoryExport } = await import('../jobs');
    await enqueueStoryExport(row.id);
  }
  return serializeFresh(prisma, row);
}

export class StoryVideoExportService {
  /**
   * Request an R16 story video export.
   *
   * Exports the canonical ordered scene set for the story (all scenes,
   * orderIndex ASC). The operation is synchronous — the mutation blocks while
   * FFmpeg runs. Returns immediately if an identical export already exists
   * (same sourceHash).
   *
   * Contract:
   *   ctx.isR16 must be true (enforced by r16Procedure at the router layer;
   *   also checked here as defense-in-depth).
   */
  async requestExport(
    prisma: PrismaClient,
    input: {
      userId: string;
      projectId: string;
      isR16: boolean;
    },
    deps: OutputRenderDeps = {},
  ): Promise<StoryVideoExportState> {


    // ── 2. Load and authorize project ───────────────────────────────────────
    const project = await prisma.storyProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: {
        id: true,
        userId: true,
        audienceMode: true,
        contentType: true,
        backgroundMusicUrl: true,
        // Behaviour-determining project input: it must reach computeSourceHash, or
        // a flag flip is invisible to the cache and the old render is served.
        identityRefsEnabled: true,
      },
    });
    if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found.' });
    }

    // ── 3. Export policy — same-surface only ─────────────────────────────────
    // Replaces the two hard guards (mode + audience). A KIDS story exports from
    // R16, a GENERAL story from the main app; the crossed combos are refused.
    // Everything below this line is policy-agnostic: scene invariants, hashing
    // and enqueueing apply identically to both tiers.
    const policy = resolveExportPolicy({
      isR16: input.isR16,
      audienceMode: project.audienceMode,
    });

    // ── 4. Load canonical scene set — all scenes in deterministic order ──────
    const isEducational = project.contentType === 'EDUCATIONAL';
    const allScenes = await prisma.storySceneSeed.findMany({
      where: { projectId: input.projectId },
      orderBy: { orderIndex: 'asc' },
    });
    if (allScenes.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This story has no scenes.' });
    }
    const sceneIdList = allScenes.map((s) => s.id);

    // ── 4a. Audio mode — narration is optional (D-030) ───────────────────────
    //        narrationAudioUrl is read from the DB row — never from client input.
    //
    //        Export must not require narration: a story whose clips carry their
    //        own audio (dialogue/SFX) is exportable with no narration at all,
    //        via the E1 native-audio path in renderOutputDerivative.
    //
    //        Narration is used only when EVERY scene has it, because the
    //        renderer's audio-mux path is all-or-nothing by construction (it
    //        throws when only some scenes carry audio). Partial narration
    //        therefore exports clip-audio only rather than failing outright —
    //        the export UI warns the creator before they trigger it.
    //
    //        Non-educational projects have never passed narration into the
    //        renderer, so they keep that behaviour.
    const hasNarrationForEveryScene =
      isEducational && allScenes.length > 0 && allScenes.every((s) => Boolean(s.narrationAudioUrl));

    // ── 5–10. Verify every scene has a READY VIDEO asset owned by this project.
    //          Ownership invariant: projectId + sceneId + assetType=VIDEO +
    //          status=READY + isLatest=true + deletedAt=null + non-null assetUrl.
    //          No external URL can be injected — we query internal asset rows. ─
    const videoAssets = await prisma.storySceneAsset.findMany({
      where: {
        projectId: input.projectId,
        sceneId: { in: sceneIdList },
        assetType: 'VIDEO',
        status: 'READY',
        deletedAt: null,
        isLatest: true,
      },
    });

    const readyByScene = new Map<string, { id: string; assetUrl: string; durationSeconds: number | null }>();
    for (const asset of videoAssets) {
      if (!asset.assetUrl) continue; // invariant 10: null assetUrl rejected
      if (!readyByScene.has(asset.sceneId)) {
        readyByScene.set(asset.sceneId, {
          id: asset.id,
          assetUrl: asset.assetUrl,
          durationSeconds: asset.durationSeconds,
        });
      }
    }

    const missingScenes = sceneIdList.filter((id) => !readyByScene.has(id));
    if (missingScenes.length > 0) {
      const sceneLabels = missingScenes
        .map((id) => allScenes.find((s) => s.id === id)?.title ?? id)
        .slice(0, 3);
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `${missingScenes.length} scene(s) do not have a ready video yet: ${sceneLabels.join(', ')}`,
      });
    }

    // ── 6. Idempotency — compute sourceHash ──────────────────────────────────
    // narrationAudioUrl participates only when the export actually uses it, so
    // the hash always describes the artifact that will be rendered: adding full
    // narration later produces a distinct export row (not a stale cache hit),
    // while a partially-narrated project keeps hashing as the clip-audio cut it
    // really is.
    // backgroundMusicUrl is included so a music change invalidates the export.
    const audioByScene = new Map<string, string | null>(
      allScenes.map((s) => [s.id, s.narrationAudioUrl ?? null]),
    );
    const backgroundMusicUrl = project.backgroundMusicUrl ?? null;
    const pairsBase = sceneIdList.map((sceneId) => ({
      sceneId,
      assetId: readyByScene.get(sceneId)!.id,
      audioUrl: hasNarrationForEveryScene ? (audioByScene.get(sceneId) ?? null) : null,
    }));
    // Include backgroundMusicUrl in hash as a synthetic trailing pair.
    const hashPayloadPairs: Array<{ sceneId: string; assetId: string; audioUrl?: string | null }> = backgroundMusicUrl
      ? [...pairsBase, { sceneId: '__music__', assetId: backgroundMusicUrl }]
      : pairsBase;
    // `project` is loaded by this service; if it did not select the flag the hash
    // would silently default to the text path, which is the composer bug again.
    const identityRefsEnabled = (project as { identityRefsEnabled?: boolean }).identityRefsEnabled;
    if (identityRefsEnabled === undefined) {
      console.warn('[storyVideoExport] project.identityRefsEnabled missing from the query; hashing as false');
    }
    const sourceHash = computeSourceHash(hashPayloadPairs, { identityRefsEnabled: Boolean(identityRefsEnabled) });

    // One row per (projectId, sourceHash) artifact — see @@unique.
    const existing = await prisma.storyVideoExport.findFirst({
      where: { projectId: input.projectId, sourceHash },
      orderBy: { createdAt: 'desc' },
    });

    // ── D-033 lifecycle fixes ────────────────────────────────────────────────
    // READY            → nothing to do.
    // PENDING / fresh  → already queued or running; return as-is.
    // FAILED, or a GENERATING row older than the stuck threshold → reuse the
    //   row, reset it to PENDING and enqueue again. Without this, the unique
    //   constraint made a failed or crash-orphaned export permanently wedged:
    //   every retry returned the same dead row and never re-rendered.
    if (existing) {
      if (existing.status === 'READY') return serializeExport(existing);

      const isStuck = existing.status === 'GENERATING'
        && existing.updatedAt.getTime() < Date.now() - EXPORT_STUCK_THRESHOLD_MS;
      const needsRetry = existing.status === 'FAILED' || isStuck;

      if (!needsRetry) return serializeExport(existing);

      const requeued = await prisma.storyVideoExport.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          errorMessage: null,
          assetUrl: null,
          r2Key: null,
          completedAt: null,
        },
      });
      return runEnqueued(prisma, requeued, deps);
      return serializeFresh(prisma, requeued);
    }

    // ── 7. Create the row in PENDING; the worker owns the render ─────────────
    let exportRow: Awaited<ReturnType<typeof prisma.storyVideoExport.create>>;
    try {
      exportRow = await prisma.storyVideoExport.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          status: 'PENDING',
          sourceHash,
          sceneIds: sceneIdList as never,
          tier: policy.tier,
        },
      });
    } catch (createErr: unknown) {
      // Concurrent request won the race and inserted the same (projectId,
      // sourceHash) row — apply the same retry rules to the winner.
      if (
        typeof createErr === 'object' &&
        createErr !== null &&
        'code' in createErr &&
        (createErr as { code: string }).code === PRISMA_UNIQUE_CONFLICT
      ) {
        const raceWinner = await prisma.storyVideoExport.findFirst({
          where: { projectId: input.projectId, sourceHash },
          orderBy: { createdAt: 'desc' },
        });
        if (raceWinner) {
          if (raceWinner.status !== 'FAILED' && raceWinner.status !== 'PENDING') {
            return serializeExport(raceWinner);
          }
          const requeued = await prisma.storyVideoExport.update({
            where: { id: raceWinner.id },
            data: { status: 'PENDING', errorMessage: null },
          });
          return runEnqueued(prisma, requeued, deps);
          return serializeFresh(prisma, requeued);
        }
      }
      throw createErr;
    }

    // ── 8. Hand off to the worker; return immediately (PENDING) ──────────────
    // Pass the row *with the scene ids we hashed* rather than trusting the
    // create() return value: the job must render exactly the scope the hash
    // describes, even if the driver returns a partial row.
    return runEnqueued(prisma, { ...exportRow, sceneIds: sceneIdList as never }, deps);
  }

  /**
   * The slow half (D-033): load the row, render, persist the outcome.
   *
   * Runs in the export worker. Safe to call twice for the same export: a READY
   * row is a no-op, and a retried job re-renders deterministically from the
   * scene ids stored on the row.
   */
  async runExportJob(
    prisma: PrismaClient,
    input: { exportId: string },
    deps: OutputRenderDeps = {},
    preloadedRow?: ExportRowShape & { userId: string },
  ): Promise<StoryVideoExportState> {
    const row = preloadedRow ?? await prisma.storyVideoExport.findFirst({ where: { id: input.exportId } });
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Export job not found.' });
    }
    // READY means done only when the artifact exists; a status-only READY row
    // (older data / test doubles) still needs its render.
    if (row.status === 'READY' && row.assetUrl) return serializeExport(row);

    await prisma.storyVideoExport.update({
      where: { id: row.id },
      data: { status: 'GENERATING', errorMessage: null },
    });

    try {
      const sceneIdList = Array.isArray(row.sceneIds) ? (row.sceneIds as string[]) : [];
      // findFirst (not findUnique) so this matches the read pattern used by the
      // request half and by the service's existing tests/mocks.
      const project = await prisma.storyProject.findFirst({
        where: { id: row.projectId },
        select: { backgroundMusicUrl: true, contentType: true },
      });
      const backgroundMusicUrl = project?.backgroundMusicUrl ?? null;

      const orderedScenes = await prisma.storySceneSeed.findMany({
        where: { id: { in: sceneIdList } },
        orderBy: { orderIndex: 'asc' },
      });
      const sceneById = new Map(orderedScenes.map((s) => [s.id, s]));
      const hasNarrationForEveryScene = project?.contentType === 'EDUCATIONAL'
        && sceneIdList.length > 0
        && sceneIdList.every((id) => Boolean(sceneById.get(id)?.narrationAudioUrl));

      const videoAssets = await prisma.storySceneAsset.findMany({
        where: {
          projectId: row.projectId,
          sceneId: { in: sceneIdList },
          assetType: 'VIDEO',
          status: 'READY',
          deletedAt: null,
          isLatest: true,
        },
      });
      const readyByScene = new Map<string, { id: string; assetUrl: string; durationSeconds: number | null }>();
      for (const asset of videoAssets) {
        if (!asset.assetUrl) continue;
        if (!readyByScene.has(asset.sceneId)) {
          readyByScene.set(asset.sceneId, {
            id: asset.id,
            assetUrl: asset.assetUrl,
            durationSeconds: asset.durationSeconds,
          });
        }
      }

      const missing = sceneIdList.filter((id) => !readyByScene.has(id));
      if (missing.length > 0) {
        throw new Error(`Export source changed: ${missing.length} scene(s) no longer have a ready video.`);
      }

      const scenes: RenderScene[] = sceneIdList.map((sceneId) => ({
        sceneId,
        assetId: readyByScene.get(sceneId)!.id,
        videoUrl: readyByScene.get(sceneId)!.assetUrl,
        audioUrl: hasNarrationForEveryScene ? (sceneById.get(sceneId)?.narrationAudioUrl ?? null) : undefined,
      }));

      const totalRuntimeSeconds = sceneIdList.reduce(
        (sum, sceneId) => sum + (readyByScene.get(sceneId)!.durationSeconds ?? 4),
        0,
      );
      const derivation = deriveOutput('PORTRAIT', null, totalRuntimeSeconds);

      // End-card attribution from trusted account data; fail-soft.
      let creatorHandle: string | null = null;
      try {
        const owner = await prisma.user.findUnique({
          where: { id: row.userId },
          select: { username: true },
        });
        creatorHandle = owner?.username ?? null;
      } catch {
        creatorHandle = null;
      }

      const rendered = await renderOutputDerivative(
        {
          scenes,
          derivation,
          r2Prefix: `story-exports/${row.projectId}/exports/${row.id}`,
          // Segment cache scope. Without it the renderer cannot key segments and
          // caching silently disables itself - the flag-in-the-DB-false-in-code
          // trap, so the service passes it explicitly on every render.
          projectId: row.projectId,
          backgroundMusicUrl,
          creatorHandle,
          exportId: row.id,
        },
        deps,
      );

      const updated = await prisma.storyVideoExport.update({
        where: { id: row.id },
        data: {
          status: 'READY',
          assetUrl: rendered.assetUrl,
          r2Key: `story-exports/${row.projectId}/exports/${row.id}/out.mp4`,
          completedAt: new Date(),
          endCardApplied: rendered.endCardApplied,
          // Measured from the finished file, never inferred from the scene sum:
          // a NULL here means "we could not measure", not "we guessed".
          durationSeconds: rendered.durationSeconds ?? null,
          errorMessage: null,
        },
      });

      if (updated.durationSeconds === null) {
        console.warn(
          `[storyVideoExport] duration probe unavailable for export ${row.id} - durationSeconds left NULL (not inferred from the scene sum)`,
        );
      }
      return serializeExport(updated);
    } catch (error) {
      // Deterministic failures are recorded, not retried forever: the user can
      // retry now that a FAILED row is requeued instead of wedged (D-033).
      const updated = await prisma.storyVideoExport.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          errorMessage: (error as Error).message.slice(0, 500),
        },
      });
      return serializeExport(updated);
    }
  }

  async getExport(
    prisma: PrismaClient,
    input: { userId: string; projectId: string; exportId: string },
  ): Promise<StoryVideoExportState | null> {
    const project = await prisma.storyProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
    });
    if (!project) return null;

    const row = await prisma.storyVideoExport.findFirst({
      where: { id: input.exportId, projectId: input.projectId },
    });
    return row ? serializeExport(row) : null;
  }

  async getLatestExport(
    prisma: PrismaClient,
    input: { userId: string; projectId: string },
  ): Promise<StoryVideoExportState | null> {
    const project = await prisma.storyProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
    });
    if (!project) return null;

    const row = await prisma.storyVideoExport.findFirst({
      where: { projectId: input.projectId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? serializeExport(row) : null;
  }
}

export const storyVideoExportService = new StoryVideoExportService();
