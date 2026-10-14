/**
 * Phase 17 — I2V chain continuity vs. creator regeneration.
 *
 * The video path seeds each scene from the LAST frame of the previous scene's
 * clip so straight-through generation flows smoothly across cuts. But when a
 * creator regenerates a scene's still AFTER the previous clip already existed,
 * chaining would animate the previous scene's content instead of their new
 * still. In that case the scene's own still wins.
 *
 * Pure policy — no I/O. The caller supplies the two timestamps it already has.
 */
export type VideoSeedSource = 'own-still' | 'prev-last-frame';

export interface VideoSeedInput {
  /** 1-based scene order within the project. */
  orderIndex: number;
  /** createdAt of the scene's latest READY IMAGE asset (its own still). */
  sceneImageCreatedAt?: Date | null;
  /** createdAt of the previous scene's latest READY VIDEO asset. */
  prevVideoCreatedAt?: Date | null;
  /** Whether a previous READY VIDEO with an assetUrl exists at all. */
  hasPrevVideo: boolean;
}

export function chooseVideoSeedSource(input: VideoSeedInput): VideoSeedSource {
  if (!input.orderIndex || input.orderIndex <= 1) return 'own-still';
  if (!input.hasPrevVideo) return 'own-still';

  const still = input.sceneImageCreatedAt ? new Date(input.sceneImageCreatedAt).getTime() : null;
  const prev = input.prevVideoCreatedAt ? new Date(input.prevVideoCreatedAt).getTime() : null;

  // Regeneration wins: the scene's still was produced after the chain source existed.
  if (still != null && prev != null && still > prev) return 'own-still';

  return 'prev-last-frame';
}
