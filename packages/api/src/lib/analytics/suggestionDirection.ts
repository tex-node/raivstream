/**
 * Signed direction (2026-11-16).
 *
 * `more`, `less`, `different`, or `null` - what a suggestion ASKS FOR, not what the creator answered. The profile
 * could already see which axis moved but not which way: "Strengthen conflict" and "Explore another ending" are both
 * pacing, and a profile weighing them identically would learn that this creator likes pacing, not which pacing.
 *
 * It lives on the MAPPING, not the event: direction is a property of the suggestion's text, so two acceptances of
 * the same suggestion cannot disagree about it. `null` is real - it means the suggestion has no directional axis.
 */
export const SUGGESTION_DIRECTIONS = ['more', 'less', 'different', 'null'] as const;
export type SuggestionDirection = 'more' | 'less' | 'different' | null;

const DIRECTION_BY_LABEL: Record<string, SuggestionDirection> = {
  'strengthen conflict': 'more',
  'increase tension': 'more',
  'explore another ending': 'different',
  'strengthen the transformation': 'more',
  'make the recap stick': 'more',
  'make it feel more premium': 'more',
  'make it funnier': 'more',
  'make it clearer': 'more',
  'make the ending more hopeful': 'more',
  'make the product the hero': 'more',
  'establish the world': 'more',
  'show the character': 'more',
  'add a stronger example': null,
  'develop this idea': null,
};

export function directionForLabel(label: string): SuggestionDirection {
  return DIRECTION_BY_LABEL[label.trim().toLowerCase()] ?? null;
}

export function directionForSuggestion(kind: 'rewrite' | 'question' | 'director', label: string): SuggestionDirection {
  if (kind === 'question') return null;
  return directionForLabel(label);
}
