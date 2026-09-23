/**
 * Raivstream 5.0 — Creative Memory service.
 *
 * MEMORY = what happened while creating (creator preferences, approved
 * decisions, rejected ideas, important notes). Distinct from the Bible:
 *   BIBLE  = what is true
 *   MEMORY = what happened
 * Rejected AI assumptions are remembered here so they are not silently
 * reintroduced.
 */

import type { PrismaClient } from '@raivstream/database';
import type { CreativeMemoryKind } from '../shared/types';

export class MemoryService {
  async record(
    prisma: PrismaClient,
    input: { projectId: string; kind: CreativeMemoryKind; content: Record<string, unknown> },
  ): Promise<void> {
    await prisma.creativeMemory.create({
      data: { projectId: input.projectId, kind: input.kind, content: input.content as never },
    });
  }

  async list(prisma: PrismaClient, projectId: string): Promise<Array<{ kind: CreativeMemoryKind; content: Record<string, unknown>; createdAt: Date }>> {
    const rows = await prisma.creativeMemory.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({ kind: row.kind as CreativeMemoryKind, content: row.content as Record<string, unknown>, createdAt: row.createdAt }));
  }
}

export const memoryService = new MemoryService();