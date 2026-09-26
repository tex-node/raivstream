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
import { deriveOutput } from '../creative/output/derivation';
import { renderOutputDerivative, type OutputRenderDeps, type RenderScene } from '../creative/output/render';

export interface StoryVideoExportState {
  id: string;
  projectId: string;
  status: string;
  assetUrl: string | null;
  durationSeconds: number | null;
  widthPx: number | null;
  heightPx: number | null;
  errorMessage: string | null;
  sourceHash: string;
  sceneIds: string[];
  createdAt: Date;
  completedAt: Date | null;
}

function computeSourceHash(pairs: Array<{ sceneId: string; assetId: string }>): string {
  const sorted = [...pairs].sort((a, b) => a.sceneId.localeCompare(b.sceneId));
  const payload = sorted.map((p) => `${p.sceneId}:${p.assetId}`).join(',');
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
    sourceHash: row.sourceHash,
    sceneIds: Array.isArray(row.sceneIds) ? (row.sceneIds as string[]) : [],
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

/** Prisma unique-constraint violation code. */
const PRISMA_UNIQUE_CONFLICT = 'P2002';

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
    // ── 1. R16 context check (defense-in-depth; r16Procedure enforces this at
    //       the procedure layer — this is the service-level invariant) ────────
    if (!input.isR16) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Story video export is only available in R16 mode.',
      });
    }

    // ── 2. Load and authorize project ───────────────────────────────────────
    const project = await prisma.storyProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
    });
    if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found.' });
    }

    // ── 3. R16/KIDS project invariant ────────────────────────────────────────
    if (project.audienceMode !== 'KIDS') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Story video export is only available for KIDS-mode projects.',
      });
    }

    // ── 4. Load canonical scene set — all scenes in deterministic order ──────
    const allScenes = await prisma.storySceneSeed.findMany({
      where: { projectId: input.projectId },
      orderBy: { orderIndex: 'asc' },
    });
    if (allScenes.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This story has no scenes.' });
    }
    const sceneIdList = allScenes.map((s) => s.id);

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
    const pairs = sceneIdList.map((sceneId) => ({
      sceneId,
      assetId: readyByScene.get(sceneId)!.id,
    }));
    const sourceHash = computeSourceHash(pairs);

    // Check for existing non-FAILED export with same hash (optimistic read).
    const existing = await prisma.storyVideoExport.findFirst({
      where: { projectId: input.projectId, sourceHash, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return serializeExport(existing);
    }

    // ── 7. Create export row directly in GENERATING state ────────────────────
    //       (synchronous: assembly runs inline; PENDING is not used here)
    let exportRow: Awaited<ReturnType<typeof prisma.storyVideoExport.create>>;
    try {
      exportRow = await prisma.storyVideoExport.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          status: 'GENERATING',
          sourceHash,
          sceneIds: sceneIdList as never,
        },
      });
    } catch (createErr: unknown) {
      // Concurrent request won the race and inserted the same (projectId,
      // sourceHash) row — retrieve and return it rather than failing.
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
        if (raceWinner) return serializeExport(raceWinner);
      }
      throw createErr;
    }

    // ── 8. Assemble via renderOutputDerivative ───────────────────────────────
    try {
      const scenes: RenderScene[] = sceneIdList.map((sceneId) => ({
        sceneId,
        videoUrl: readyByScene.get(sceneId)!.assetUrl,
      }));

      const totalRuntimeSeconds = sceneIdList.reduce(
        (sum, sceneId) => sum + (readyByScene.get(sceneId)!.durationSeconds ?? 4),
        0,
      );
      const derivation = deriveOutput('PORTRAIT', null, totalRuntimeSeconds);

      const rendered = await renderOutputDerivative(
        {
          scenes,
          derivation,
          r2Prefix: `story-exports/${input.projectId}/exports/${exportRow.id}`,
        },
        deps,
      );

      const updated = await prisma.storyVideoExport.update({
        where: { id: exportRow.id },
        data: {
          status: 'READY',
          assetUrl: rendered.assetUrl,
          r2Key: `story-exports/${input.projectId}/exports/${exportRow.id}/out.mp4`,
          completedAt: new Date(),
        },
      });
      return serializeExport(updated);
    } catch (error) {
      const updated = await prisma.storyVideoExport.update({
        where: { id: exportRow.id },
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
