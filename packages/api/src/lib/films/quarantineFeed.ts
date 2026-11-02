/**
 * The feed clause that finally consumes the quarantine predicate.
 *
 * THE NULL TRAP, stated because it is the whole risk: a naive
 * `sourceProjectId: { notIn: quarantinedIds }` drops **every** row with a NULL source,
 * because `NULL NOT IN (...)` is *unknown*, not true. In Postgres that means the
 * predicate silently quarantines the entire historical library and every future
 * publication whose source is unknown — while looking exactly like a working filter.
 * Hence the explicit `OR: [{ sourceProjectId: null }, ...]` branch below, and a test
 * that fails if anyone "simplifies" it.
 */
import type { PrismaClient } from '@raivstream/database';
import { QUARANTINE_IDENTITY_FLOOR } from './quarantine';

export interface ProjectIdentity {
  projectId: string;
  /** Lowest characterIdentity across the assets scored for this project. */
  minIdentity: number | null;
  /** How many assets carried a numeric identity score. */
  scored: number;
  belowFloor: boolean;
}

/**
 * The single source of truth for "is this film below the identity floor".
 *
 * The feed clause and the film-page disclosure BOTH call this. If they computed it
 * separately they could disagree, and a film labelled below-threshold while still
 * appearing in the feed would be the false-pass shape wearing UI clothes.
 */
export async function projectIdentity(
  prisma: PrismaClient,
  projectId: string,
): Promise<ProjectIdentity> {
  const runs = await (prisma as never as {
    creativeCriticRun: { findMany: (args: unknown) => Promise<Array<{ characterIdentityScore: number | null }>> };
  }).creativeCriticRun.findMany({
    where: { projectId, characterIdentityScore: { not: null } },
    select: { characterIdentityScore: true },
  });

  const values = runs
    .map((run) => run.characterIdentityScore)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length === 0) {
    return { projectId, minIdentity: null, scored: 0, belowFloor: false };
  }
  const minIdentity = Math.min(...values);
  return { projectId, minIdentity, scored: values.length, belowFloor: minIdentity < QUARANTINE_IDENTITY_FLOOR };
}

/** Projects that are sourced AND below floor — the only ones quarantine may act on. */
export async function quarantinedProjectIds(prisma: PrismaClient): Promise<string[]> {
  const sourced = await (prisma as never as {
    video: { findMany: (args: unknown) => Promise<Array<{ sourceProjectId: string | null }>> };
  }).video.findMany({
    where: { sourceProjectId: { not: null } },
    select: { sourceProjectId: true },
    distinct: ['sourceProjectId'],
  });

  const projectIds = [...new Set(sourced.map((row) => row.sourceProjectId).filter((id): id is string => Boolean(id)))];
  if (projectIds.length === 0) return [];

  const runs = await (prisma as never as {
    creativeCriticRun: { findMany: (args: unknown) => Promise<Array<{ projectId: string; characterIdentityScore: number | null }>> };
  }).creativeCriticRun.findMany({
    where: { projectId: { in: projectIds }, characterIdentityScore: { not: null } },
    select: { projectId: true, characterIdentityScore: true },
  });

  const minByProject = new Map<string, number>();
  for (const run of runs) {
    const value = run.characterIdentityScore;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const current = minByProject.get(run.projectId);
    if (current === undefined || value < current) minByProject.set(run.projectId, value);
  }

  return projectIds.filter((id) => {
    const min = minByProject.get(id);
    // Unscored sourced project: unknown, so NOT quarantined (fail-open, as with assets).
    return min !== undefined && min < QUARANTINE_IDENTITY_FLOOR;
  });
}

/**
 * The `where` fragment for a feed query.
 *
 * The explicit NULL branch is load-bearing, not defensive style: without it the
 * historical library disappears. There is a test that fails if this is "simplified".
 */
export function feedQuarantineWhere(quarantinedIds: readonly string[]): Record<string, unknown> {
  if (quarantinedIds.length === 0) return {};
  return {
    OR: [
      { sourceProjectId: null },
      { sourceProjectId: { notIn: [...quarantinedIds] } },
    ],
  };
}
