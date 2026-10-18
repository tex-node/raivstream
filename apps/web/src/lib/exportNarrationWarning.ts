/**
 * D-030 — narration is optional, and the export applies it only when EVERY
 * scene has it. `storyVideoExportService` computes the same all-or-nothing
 * decision server-side: a partial set would give the renderer a mix it rejects
 * (its mux path is all-or-nothing), so partial narration exports clip audio
 * only.
 *
 * The creator is warned only in the partial case:
 *   - 0 narrated scenes  → the ordinary clip-audio export, nothing to warn about
 *   - all narrated       → the expected fully-narrated export
 *   - some narrated      → narration will be dropped; say so BEFORE the click
 *
 * Shared by both export surfaces — `story-playground/new` (the primary R16
 * surface) and the project layout bar — so the rule and the copy cannot drift.
 */

export type SceneNarrationLike = { narrationAudioUrl?: string | null };

export function countScenesWithNarration(scenes: ReadonlyArray<SceneNarrationLike>): number {
  return scenes.filter((scene) => Boolean(scene.narrationAudioUrl)).length;
}

/** The warning copy, or null when there is nothing to warn about. */
export function partialNarrationWarning(scenes: ReadonlyArray<SceneNarrationLike>): string | null {
  const total = scenes.length;
  const withNarration = countScenesWithNarration(scenes);
  if (total === 0 || withNarration === 0 || withNarration >= total) return null;
  return `${withNarration} of ${total} scenes have narration. Export will use clip audio only.`;
}
