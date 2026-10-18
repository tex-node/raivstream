/**
 * Which narration procedure applies to a story project (D-012).
 *
 * The server already enforces this split — `generateEducationalNarration`
 * rejects non-educational projects and `generateStoryNarration` rejects
 * educational ones — but the UI used to branch on `isR16` alone, so every R16
 * project called the educational procedure and story projects failed with
 * PRECONDITION_FAILED.
 *
 * Content type decides first, because it is the axis the server guards on.
 * `isR16` never overrides an explicit EDUCATIONAL content type; it only picks
 * between the two narration providers for non-educational content.
 */
export type NarrationPath =
  | 'educational' // generateEducationalNarration
  | 'story' // generateStoryNarration
  | 'scene'; // generateSceneNarration

export function resolveNarrationPath(input: {
  isR16: boolean;
  contentType: string | null | undefined;
}): NarrationPath {
  // Educational content always uses the educational narration text/provider,
  // regardless of audience — the server rejects anything else.
  if (input.contentType === 'EDUCATIONAL') return 'educational';
  // Unknown content type on an R16 session is treated as a story: the
  // educational procedure would reject it outright, so routing to story is the
  // only path that can succeed.
  if (input.isR16) return 'story';
  return 'scene';
}

/** Procedure name, for logging and for asserting which path was taken. */
export function narrationProcedureFor(path: NarrationPath): string {
  switch (path) {
    case 'educational':
      return 'generateEducationalNarration';
    case 'story':
      return 'generateStoryNarration';
    case 'scene':
      return 'generateSceneNarration';
  }
}
