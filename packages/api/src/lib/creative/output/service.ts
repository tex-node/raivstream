/**
 * Raivstream 5.0 — OutputService (Slice 5B).
 *
 * APPROVED VERSION → OUTPUT (16:9 / 9:16 / 1:1 / duration variants). Outputs
 * are derivatives of a version with provenance back to the source; the original
 * creative is never modified. Only versions with an APPROVED CREATIVE approval
 * can produce outputs. Rendering runs detached and marks READY/FAILED.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeOutputEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import { approvalService } from '../approval/service';
import type { CreativeProductionPlanState } from '../production/plan';
import { deriveOutput, type OutputDerivation, type OutputFormat } from './derivation';
import { renderOutputDerivative, type OutputRenderDeps, type RenderScene } from './render';

export interface OutputState {
  id: string;
  projectId: string;
  versionId: string;
  versionNumber: number;
  format: OutputFormat;
  durationSeconds: number | null;
  status: string;
  assetUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export class OutputService {
  /** Derive a new output derivative (validated against an APPROVED version). */
  async derive(
    prisma: PrismaClient,
    input: { projectId: string; versionId: string; format: OutputFormat; durationSeconds?: number | null },
  ): Promise<{ output: OutputState; derivation: OutputDerivation }> {
    if (!isCreativeOutputEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 outputs are not enabled.');
    const version = await prisma.creativeVersion.findFirst({ where: { id: input.versionId, projectId: input.projectId } });
    if (!version) throw new CreativeError('PROJECT_NOT_FOUND', 'Version not found.');
    if (!(await approvalService.isApproved(prisma, { projectId: input.projectId, versionId: input.versionId, kind: 'CREATIVE' }))) {
      throw new CreativeError('PLAN_NOT_APPROVED', 'Approve this version before creating outputs.');
    }
    const snapshot = version.snapshot as unknown as { plan?: CreativeProductionPlanState };
    // Provenance validation: a version without a plan cannot be derived from.
    if (!snapshot.plan) throw new CreativeError('PLAN_NOT_APPROVED', 'This version has no plan to derive from.');
    const totalRuntime = snapshot.plan.totalRuntimeSeconds ?? 30;
    const derivation = deriveOutput(input.format, input.durationSeconds ?? null, totalRuntime);

    const row = await prisma.creativeOutput.create({
      data: {
        projectId: input.projectId,
        versionId: input.versionId,
        format: input.format as never,
        durationSeconds: input.durationSeconds ?? null,
        status: 'PENDING',
      },
    });
    const output = await this.serialize(prisma, row.id);
    return { output, derivation };
  }

  /** Render a pending output (detached) from the version's produced scene media. */
  async render(
    prisma: PrismaClient,
    input: { projectId: string; outputId: string },
    deps: OutputRenderDeps = {},
  ): Promise<OutputState> {
    const row = await prisma.creativeOutput.findFirst({ where: { id: input.outputId, projectId: input.projectId } });
    if (!row) throw new CreativeError('PROJECT_NOT_FOUND', 'Output not found.');
    // Provenance validation: an output may only render while its source version
    // is still approved (a material Direct invalidates it).
    if (!(await approvalService.isApproved(prisma, { projectId: input.projectId, versionId: row.versionId, kind: 'CREATIVE' }))) {
      await prisma.creativeOutput.update({ where: { id: row.id }, data: { status: 'FAILED' as never, errorMessage: 'The source version is no longer approved. Re-approve it before rendering.' } });
      return this.serialize(prisma, row.id);
    }
    await prisma.creativeOutput.update({ where: { id: row.id }, data: { status: 'GENERATING' as never } });

    try {
      const version = await prisma.creativeVersion.findUnique({ where: { id: row.versionId } });
      const snapshot = version?.snapshot as unknown as { plan?: CreativeProductionPlanState } | null;
      const plan = snapshot?.plan;
      const produced = await prisma.creativeProducedAsset.findMany({
        where: { projectId: input.projectId, status: 'READY' },
        orderBy: { createdAt: 'asc' },
      });
      const byScene = new Map<string, { videoUrl?: string | null; stillUrl?: string | null }>();
      for (const asset of produced) {
        const entry = byScene.get(asset.sceneId) ?? {};
        if (asset.kind === 'VIDEO' && asset.assetUrl) entry.videoUrl = asset.assetUrl;
        if (asset.kind === 'IMAGE' && asset.assetUrl) entry.stillUrl = asset.assetUrl;
        byScene.set(asset.sceneId, entry);
      }
      const scenes: RenderScene[] = (plan?.scenes ?? [])
        .map((scene) => ({ sceneId: scene.sceneId, ...(byScene.get(scene.sceneId) ?? {}) }))
        .filter((scene) => scene.videoUrl || scene.stillUrl);

      const derivation = deriveOutput(row.format as OutputFormat, row.durationSeconds, plan?.totalRuntimeSeconds ?? 30);
      const rendered = await renderOutputDerivative(
        { scenes, derivation, r2Prefix: `creative/${input.projectId}/outputs/${row.id}` },
        deps,
      );
      await prisma.creativeOutput.update({
        where: { id: row.id },
        data: { status: 'READY' as never, assetUrl: rendered.assetUrl, thumbnailUrl: null, errorMessage: null },
      });
    } catch (error) {
      await prisma.creativeOutput.update({
        where: { id: row.id },
        data: { status: 'FAILED' as never, errorMessage: (error as Error).message.slice(0, 500) },
      });
    }
    return this.serialize(prisma, row.id);
  }

  async list(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<OutputState[]> {
    const project = await prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: input.userId } });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const rows = await prisma.creativeOutput.findMany({ where: { projectId: input.projectId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const versionIds = [...new Set(rows.map((row) => row.versionId))];
    const versions = versionIds.length ? await prisma.creativeVersion.findMany({ where: { id: { in: versionIds } } }) : [];
    const numberById = new Map(versions.map((version) => [version.id, version.versionNumber]));
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      versionId: row.versionId,
      versionNumber: numberById.get(row.versionId) ?? 0,
      format: row.format as OutputFormat,
      durationSeconds: row.durationSeconds,
      status: row.status,
      assetUrl: row.assetUrl,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    }));
  }

  private async serialize(prisma: PrismaClient, outputId: string): Promise<OutputState> {
    const row = await prisma.creativeOutput.findUnique({ where: { id: outputId }, include: { version: { select: { versionNumber: true } } } });
    if (!row) throw new CreativeError('PROJECT_NOT_FOUND', 'Output not found.');
    return {
      id: row.id,
      projectId: row.projectId,
      versionId: row.versionId,
      versionNumber: row.version.versionNumber,
      format: row.format as OutputFormat,
      durationSeconds: row.durationSeconds,
      status: row.status,
      assetUrl: row.assetUrl,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  }
}

export const outputService = new OutputService();