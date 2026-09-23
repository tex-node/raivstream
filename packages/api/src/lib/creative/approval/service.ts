/**
 * Raivstream 5.0 — ApprovalService (Slice 5A).
 *
 * Version-specific approval: CREATIVE / PRODUCTION / OUTPUT. A previously
 * approved version is NEVER silently left approved after a material creative
 * change — creating a new version (Director direct/explore) invalidates prior
 * approvals. Non-material changes (re-review, production retry on the same
 * version) do not invalidate the CREATIVE approval.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeApprovalEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';

export type ApprovalDecision = 'approve' | 'reject' | 'request_changes';
export type ApprovalKind = 'CREATIVE' | 'PRODUCTION' | 'OUTPUT';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'INVALIDATED';

export interface ApprovalState {
  id: string;
  projectId: string;
  versionId: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  note: string | null;
  updatedAt: Date;
}

const DECISION_TO_STATUS: Record<ApprovalDecision, ApprovalStatus> = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  request_changes: 'CHANGES_REQUESTED',
};

export class ApprovalService {
  async decide(
    prisma: PrismaClient,
    input: { projectId: string; versionId: string; kind: ApprovalKind; decision: ApprovalDecision; note?: string; userId?: string },
  ): Promise<ApprovalState> {
    if (!isCreativeApprovalEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 approval is not enabled.');
    const version = await prisma.creativeVersion.findFirst({ where: { id: input.versionId, projectId: input.projectId } });
    if (!version) throw new CreativeError('PROJECT_NOT_FOUND', 'Version not found.');
    const status = DECISION_TO_STATUS[input.decision];
    const row = await prisma.creativeApproval.upsert({
      where: { versionId_kind: { versionId: input.versionId, kind: input.kind as never } },
      update: { status: status as never, decidedById: input.userId ?? null, note: input.note ?? null },
      create: { projectId: input.projectId, versionId: input.versionId, kind: input.kind as never, status: status as never, decidedById: input.userId ?? null, note: input.note ?? null },
    });
    return { id: row.id, projectId: row.projectId, versionId: row.versionId, kind: row.kind as ApprovalKind, status: row.status as ApprovalStatus, note: row.note, updatedAt: row.updatedAt };
  }

  async isApproved(prisma: PrismaClient, input: { projectId: string; versionId: string; kind?: ApprovalKind }): Promise<boolean> {
    const kind = input.kind ?? 'CREATIVE';
    const row = await prisma.creativeApproval.findUnique({ where: { versionId_kind: { versionId: input.versionId, kind: kind as never } } });
    return row?.status === 'APPROVED';
  }

  async list(prisma: PrismaClient, input: { projectId: string }): Promise<Array<ApprovalState & { versionNumber: number }>> {
    const rows = await prisma.creativeApproval.findMany({
      where: { projectId: input.projectId },
      orderBy: { updatedAt: 'desc' },
      take: 60,
      include: { version: { select: { versionNumber: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      versionId: row.versionId,
      kind: row.kind as ApprovalKind,
      status: row.status as ApprovalStatus,
      note: row.note,
      updatedAt: row.updatedAt,
      versionNumber: row.version.versionNumber,
    }));
  }

  /** Material change (new version) → invalidate every APPROVED approval for the project. */
  async invalidateProjectApprovals(prisma: PrismaClient, projectId: string): Promise<void> {
    await prisma.creativeApproval.updateMany({
      where: { projectId, status: 'APPROVED' },
      data: { status: 'INVALIDATED' as never },
    });
  }
}

export const approvalService = new ApprovalService();