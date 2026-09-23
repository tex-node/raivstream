/**
 * Raivstream 5.0 — contextual Director suggestions.
 *
 * Direct must behave like a director who has been following THIS project, not a
 * generic idea generator. Suggestions are derived from the current creative
 * context (brief, bible, characters, brand, plan/scene, review findings) and are
 * outcome-oriented (never camera/provider/technical instructions).
 *
 * Pure and unit-testable; it only reads context — the Director engine is
 * unchanged and consumes the resulting `instruction` strings.
 */

import type { CreativeBriefState, CreativeBibleState, CreativeProjectType } from '../shared/types';
import type { CreativeProductionPlanState } from '../production/plan';

export interface DirectorSuggestion {
  /** Creator-facing outcome. */
  label: string;
  /** Semantic instruction handed to director.propose/applyInstruction. */
  instruction: string;
}

export interface DirectorSuggestionInput {
  projectType: CreativeProjectType | string;
  brief?: CreativeBriefState | null;
  bible?: CreativeBibleState | null;
  plan?: CreativeProductionPlanState | null;
  reviewFindings?: Array<{ suggestedFixInstruction?: string; description?: string; category?: string }>;
  currentSceneId?: string | null;
}

function firstCharacterName(bible?: CreativeBibleState | null): string | undefined {
  const characters = (bible?.characters ?? []) as Array<{ name?: string }>;
  return characters.find((character) => character.name)?.name;
}

function hasBrand(bible?: CreativeBibleState | null): boolean {
  const brand = bible?.brand as Record<string, unknown> | undefined;
  return Boolean(brand && (brand.brandIdentity || brand.name || brand.product));
}

export function buildDirectorSuggestions(input: DirectorSuggestionInput): DirectorSuggestion[] {
  const suggestions: DirectorSuggestion[] = [];
  const seen = new Set<string>();
  const push = (label: string, instruction: string) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ label, instruction });
  };

  // 1. Ground in actual review findings first (the most relevant corrections).
  for (const finding of (input.reviewFindings ?? []).slice(0, 2)) {
    if (finding.suggestedFixInstruction) {
      push(finding.description ? `Fix: ${finding.description.slice(0, 60)}` : 'Fix the flagged issue', finding.suggestedFixInstruction);
    }
  }

  const character = firstCharacterName(input.bible);

  // 2. Type-specific semantic directions.
  switch (input.projectType) {
    case 'COMMERCIAL':
      push('Make the product the hero', 'Make the product the hero with stronger visual emphasis.');
      push('Make it feel more premium', 'Make it feel more premium and luxurious.');
      push('Strengthen the transformation', 'Make the benefit and transformation clearer and more compelling.');
      break;
    case 'EDUCATION':
      push('Make it clearer', 'Make the explanation clearer and simpler for the audience.');
      push('Add a stronger example', 'Strengthen the example so the idea is easier to grasp.');
      push('Make the recap stick', 'Make the ending recap clear and memorable.');
      break;
    case 'TRANSFORMATION':
      push('Strengthen the before and after', 'Make the before and after transformation more striking.');
      push('Make it feel more premium', 'Make it feel more premium and cinematic.');
      break;
    case 'STORY':
    default:
      push('Make the opening more dramatic', 'Make the opening more dramatic.');
      push('Make the ending more hopeful', 'Make the ending hopeful.');
      break;
  }

  // 3. Character-aware (only when a character actually exists).
  if (character) {
    push(`Make ${character} more confident`, `Make ${character} more confident.`);
    push(`Make ${character} more emotional`, `Make ${character} more emotional.`);
  }

  // 4. Scene-aware (when the creator is focused on a scene).
  if (input.currentSceneId && input.plan?.scenes) {
    const index = input.plan.scenes.findIndex((scene) => scene.sceneId === input.currentSceneId);
    if (index >= 0) push(`Focus Scene ${index + 1}`, `Make scene ${index + 1} stronger.`);
  }

  // 5. Brand-aware.
  if (hasBrand(input.bible)) {
    push('Lean into the brand', 'Bring the brand identity forward more confidently.');
  }

  // 6. Always offer the mind-reader option last.
  push('You decide', 'Improve this — decide what needs the most work and make it better.');

  return suggestions.slice(0, 6);
}
