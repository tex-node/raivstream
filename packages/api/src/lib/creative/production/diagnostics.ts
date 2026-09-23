/**
 * Raivstream 5.0 — Production run diagnostics (Phase 9 launch readiness).
 *
 * Lets the team diagnose a failed creative production run WITHOUT opening raw
 * generation/provider internals. It returns the full provenance chain
 * (project → plan → run → assets → review → directive → version → approval →
 * output) and sanitized failure reasons — never prompts, provider job ids,
 * model names or signed URLs.
 */

import type { PrismaClient } from '@raivstream/database';
import { CreativeError } from '../shared/errors';
import { workspaceProgressFor } from '../project/state';
import type { CreativeBibleState } from '../shared/types';
import type { CreativeProductionPlanState } from './plan';

export interface RunDiagnostics {
  projectId: string;
  projectStatus: string;
  workspaceStage: string;
  planVersion: number | null;
  currentVersionId: string | null;
  run: {
    id: string;
    status: string;
    attempt: number;
    stage: string | null;
    startedAt: Date;
    heartbeatAt: Date;
    finishedAt: Date | null;
    lastError: string | null;
  } | null;
  summary: { total: number; ready: number; failed: number; generating: number; healthy: boolean };
  scenes: Array<{
    sceneId: string;
    title: string;
    status: string;
    assets: Array<{ id: string; kind: string; status: string; provider: string | null; errorMessage: string | null }>;
  }>;
  failures: Array<{ sceneId: string; kind: string; message: string }>;
  provenance: {
    seriesId: string | null;
    campaignId: string | null;
    contextSource: string | null;
    versions: Array<{ id: string; versionNumber: number; label: string | null; createdAt: Date }>;
    directives: Array<{ id: string; mode: string; instruction: string; impact: string; createdAt: Date }>;
    reviewRuns: Array<{ id: string; status: string; sceneId: string | null; findings: number }>;
    approvals: Array<{ versionId: string; kind: string; status: string }>;
    outputs: Array<{ id: string; versionId: string; format: string; status: string; errorMessage: string | null }>;
  };
}

type AssetRow = { id: string; sceneId: string; kind: string; status: string; provider: string | null; errorMessage: string | null };

function sceneStatus(assets: AssetRow[]): string {
  if (assets.length === 0) return 'PENDING';
  if (assets.some((a) => a.status === 'GENERATING' || a.status === 'QUEUED')) return 'GENERATING';
  if (assets.some((a) => a.status === 'FAILED')) return 'FAILED';
  if (assets.every((a) => a.status === 'READY')) return 'READY';
  return 'PENDING';
}

/** Normalize a provider label so no vendor/model internals leak to the UI. */
function normalizeProvider(provider: string | null): string | null {
  return provider ? 'internal' : null;
}

export async function buildRunDiagnostics(
  prisma: PrismaClient,
  input: { projectId: string; userId: string },
): Promise<RunDiagnostics> {
  const project = await prisma.creativeProject.findFirst({
    where: { id: input.projectId, userId: input.userId },
    include: { productionPlan: true, bible: true },
  });
  if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');

  const [assets, run, versions, directives, reviewRuns, approvals, outputs] = await Promise.all([
    prisma.creativeProducedAsset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } }) as unknown as Promise<AssetRow[]>,
    prisma.creativeProductionRun.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } }),
    prisma.creativeVersion.findMany({ where: { projectId: project.id }, orderBy: { versionNumber: 'desc' }, take: 20 }),
    prisma.creativeDirective.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.creativeReviewRun.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.creativeApproval.findMany({ where: { projectId: project.id }, orderBy: { updatedAt: 'desc' }, take: 40 }),
    prisma.creativeOutput.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  const plan = project.productionPlan?.plan as unknown as CreativeProductionPlanState | undefined;
  const bible = project.bible as unknown as CreativeBibleState | null;
  const sceneIds = plan?.scenes.map((scene) => scene.sceneId) ?? [...new Set(assets.map((asset) => asset.sceneId))];
  const titleById = new Map((plan?.scenes ?? []).map((scene) => [scene.sceneId, scene.title]));

  const scenes = sceneIds.map((sceneId) => {
    const sceneAssets = assets.filter((asset) => asset.sceneId === sceneId);
    return {
      sceneId,
      title: titleById.get(sceneId) ?? sceneId,
      status: sceneStatus(sceneAssets),
      assets: sceneAssets.map((asset) => ({ id: asset.id, kind: asset.kind, status: asset.status, provider: normalizeProvider(asset.provider), errorMessage: asset.errorMessage })),
    };
  });

  const ready = assets.filter((a) => a.status === 'READY').length;
  const failed = assets.filter((a) => a.status === 'FAILED').length;
  const generating = assets.filter((a) => a.status === 'GENERATING' || a.status === 'QUEUED').length;

  return {
    projectId: project.id,
    projectStatus: project.status,
    workspaceStage: workspaceProgressFor(project.status as never, Boolean(bible), Boolean(plan), Boolean(project.currentVersionId)).stage,
    planVersion: project.productionPlan?.version ?? null,
    currentVersionId: project.currentVersionId ?? null,
    run: run
      ? { id: run.id, status: run.status, attempt: run.attempt, stage: run.stage, startedAt: run.startedAt, heartbeatAt: run.heartbeatAt, finishedAt: run.finishedAt, lastError: run.lastError }
      : null,
    summary: { total: assets.length, ready, failed, generating, healthy: failed === 0 && generating === 0 },
    scenes,
    failures: assets.filter((a) => a.status === 'FAILED').map((a) => ({ sceneId: a.sceneId, kind: a.kind, message: a.errorMessage ?? 'Generation failed' })),
    provenance: {
      seriesId: project.seriesId ?? null,
      campaignId: project.campaignId ?? null,
      contextSource: plan?.contextSnapshot?.source ?? null,
      versions: versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, label: v.label, createdAt: v.createdAt })),
      directives: directives.map((d) => ({ id: d.id, mode: d.mode, instruction: d.instruction, impact: d.impact, createdAt: d.createdAt })),
      reviewRuns: reviewRuns.map((r) => ({ id: r.id, status: r.status, sceneId: r.sceneId, findings: ((r.findings as unknown as unknown[]) ?? []).length })),
      approvals: approvals.map((a) => ({ versionId: a.versionId, kind: a.kind, status: a.status })),
      outputs: outputs.map((o) => ({ id: o.id, versionId: o.versionId, format: o.format, status: o.status, errorMessage: o.errorMessage })),
    },
  };
}
