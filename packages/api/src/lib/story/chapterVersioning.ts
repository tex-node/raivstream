/**
 * Phase 2 (R16-05) — chapter version history.
 *
 * Snapshot, not diff: every content change stores the PRIOR chapter state as a new
 * version row (full body), so history is complete and a restore is itself undoable.
 */
import type { PrismaClient } from '@raivstream/database';

export const CHAPTER_VERSION_SOURCES = ['EDIT', 'REWRITE_PARAGRAPH', 'REGENERATE', 'MANUAL'] as const;
export type ChapterVersionSource = (typeof CHAPTER_VERSION_SOURCES)[number];

/** Keep at most this many versions per chapter (newest win). */
export const CHAPTER_VERSION_CAP = 50;
/** Never prune below this many newest versions, whatever the cap. */
export const CHAPTER_VERSION_KEEP_LATEST = 10;

export interface ChapterSnapshotInput {
  chapterId: string;
  title: string | null;
  summary: string | null;
  body: string;
  createdByUserId: string;
  source: ChapterVersionSource;
  sourceMetadata?: Record<string, unknown> | null;
}

/**
 * Snapshot the chapter's CURRENT state as the next version, then prune. Call this
 * BEFORE applying a change — the version stores the prior state.
 */
export async function snapshotChapterVersion(prisma: PrismaClient, input: ChapterSnapshotInput) {
  const last = await prisma.storyChapterVersion.findFirst({
    where: { chapterId: input.chapterId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  const version = await prisma.storyChapterVersion.create({
    data: {
      chapterId: input.chapterId,
      versionNumber,
      title: input.title,
      summary: input.summary,
      body: input.body,
      createdByUserId: input.createdByUserId,
      source: input.source,
      sourceMetadata: (input.sourceMetadata ?? undefined) as never,
    },
  });

  await pruneChapterVersions(prisma, input.chapterId);
  return version;
}

/** Keep the newest max(CAP, KEEP_LATEST) versions; delete the rest. Returns the count deleted. */
export async function pruneChapterVersions(prisma: PrismaClient, chapterId: string): Promise<number> {
  const keep = Math.max(CHAPTER_VERSION_CAP, CHAPTER_VERSION_KEEP_LATEST);
  const versions = await prisma.storyChapterVersion.findMany({
    where: { chapterId },
    orderBy: { versionNumber: 'desc' },
    select: { id: true },
  });
  if (versions.length <= keep) return 0;
  const deleteIds = versions.slice(keep).map((v) => v.id);
  const res = await prisma.storyChapterVersion.deleteMany({ where: { id: { in: deleteIds } } });
  return res.count;
}

/**
 * Which scenes are affected by a chapter body edit (informational only).
 *
 * FINDING: there is no reliable chapter-text → scene mapping today — a
 * `StorySceneSeed` stores its own `title`/`description` and links back only via
 * `chapterId`, never a span of the chapter body. So a changed body conservatively
 * marks EVERY scene passed in `chapter.sceneSeeds` as affected. Callers wanting
 * project-wide conservatism should pass the project's scenes. Never regenerates.
 */
export function affectedSceneIdsForChapterEdit(
  chapter: { sceneSeeds?: ReadonlyArray<{ id: string }> | null },
  priorBody: string,
  newBody: string,
): string[] {
  if (priorBody === newBody) return [];
  return (chapter.sceneSeeds ?? []).map((seed) => seed.id);
}
