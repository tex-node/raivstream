/**
 * Style axes — what a suggestion MOVED, not what a creator accepted (2026-11-16).
 *
 * The instrumentation already records shown / accepted / rejected / edited, joined by a suggestion key. That
 * answers "how often", which is engagement. A style profile needs "which axis", and this module supplies it
 * without a model call: every suggestion surface is a **small enumerable set of product labels**, so the axis is
 * **mapped**, never inferred by a provider call — a classifier that costs a call per chip is a cost that grows
 * with every render.
 *
 * Four axes plus an honest `unclassified`:
 *  - **pacing**   — how fast the story moves; tension, conflict, rhythm, length of a beat.
 *  - **framing**  — what the camera includes and how: composition, shot scale, movement, lens.
 *  - **lighting** — the light and its colour: key/fill, contrast, time of day, grade.
 *  - **tone**     — the emotional register: funny, hopeful, premium, warmer.
 *  - **unclassified** — a suggestion that does not move a style axis. "Develop this idea" is neither pacing nor
 *    tone; forcing it into one teaches the profile noise.
 */

export const STYLE_AXES = ['pacing', 'framing', 'lighting', 'tone', 'unclassified'] as const;
export type StyleAxis = (typeof STYLE_AXES)[number];

/**
 * The director's own labels. Written by hand from `buildDirectorSuggestions`, because the labels are fixed
 * product copy — a mapping table, not a classifier.
 */
export const DIRECTOR_LABEL_AXES: Record<string, StyleAxis> = {
  // pacing — how the story moves
  'strengthen conflict': 'pacing',
  'increase tension': 'pacing',
  'make the ending more hopeful': 'tone',
  'strengthen the transformation': 'pacing',
  'make the recap stick': 'pacing',
  'add a stronger example': 'unclassified',
  // tone — emotional register
  'make it feel more premium': 'tone',
  'make it funnier': 'tone',
  'make it clearer': 'tone',
  'make the product the hero': 'framing',
  // framing — what the camera shows
  'establish the world': 'framing',
  'show the character': 'framing',
};

/** The story rewrite chips, whose labels are already axis-shaped. */
export const REWRITE_ACTION_AXES: Record<string, StyleAxis> = {
  'develop this idea': 'unclassified',
  'strengthen conflict': 'pacing',
  'explore another ending': 'pacing',
  'make this funnier': 'tone',
  'increase tension': 'pacing',
};

/** Critic findings carry a category; map the ones that name a style axis. */
const CRITIC_CATEGORY_AXES: Record<string, StyleAxis> = {
  pacing: 'pacing',
  composition: 'framing',
  framing: 'framing',
  lighting: 'lighting',
  tone: 'tone',
  emotion: 'tone',
  style: 'tone',
};

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function axisForDirectorLabel(label: string): StyleAxis {
  return DIRECTOR_LABEL_AXES[normalise(label)] ?? 'unclassified';
}

export function axisForRewriteAction(action: string): StyleAxis {
  return REWRITE_ACTION_AXES[normalise(action)] ?? 'unclassified';
}

export function axisForCriticCategory(category: string | null | undefined): StyleAxis {
  if (!category) return 'unclassified';
  return CRITIC_CATEGORY_AXES[normalise(category)] ?? 'unclassified';
}

/** Context-sensitive: pick the table that names the surface the suggestion came from. */
export function axisForSuggestion(kind: 'rewrite' | 'question' | 'director', label: string): StyleAxis {
  if (kind === 'rewrite') return axisForRewriteAction(label);
  if (kind === 'director') return axisForDirectorLabel(label);
  // Question options are answers, not directions - they do not move a style axis.
  return 'unclassified';
}
