/**
 * Promote an asset to UNDER_REVIEW before a critic run.
 *
 * `creativeStatus` is the review lifecycle; `status` is the media lifecycle, and
 * the critic mutation historically checked only the second. After a sweep demotes
 * an orphaned asset to DRAFT, re-scoring it would leave a scored asset claiming
 * it is unreviewed.
 *
 * Only DRAFT is promoted: an APPROVED or REJECTED asset may legitimately be
 * re-reviewed, and demoting it back to UNDER_REVIEW would erase a human decision.
 */
export async function promoteForReview(
  prisma: {
    storySceneAsset: {
      updateMany: (args: unknown) => Promise<{ count: number }>;
      findUnique: (args: unknown) => Promise<{ creativeStatus?: string | null } | null>;
    };
  },
  assetId: string,
  log: (message: string) => void = console.info,
): Promise<{ promoted: boolean; status: string | null }> {
  const promoted = await prisma.storySceneAsset.updateMany({
    where: { id: assetId, creativeStatus: 'DRAFT' },
    data: { creativeStatus: 'UNDER_REVIEW' },
  });

  if (promoted.count > 0) return { promoted: true, status: 'UNDER_REVIEW' };

  // Not DRAFT: legitimate for APPROVED/REJECTED, a signal for anything else.
  // Never throw - scoring an approved asset is a valid second opinion.
  const current = await prisma.storySceneAsset.findUnique({
    where: { id: assetId },
    select: { creativeStatus: true },
  });
  const status = current?.creativeStatus ?? null;
  log(`[critic] rerun on asset ${assetId} left creativeStatus=${status} unchanged`);
  return { promoted: false, status };
}
