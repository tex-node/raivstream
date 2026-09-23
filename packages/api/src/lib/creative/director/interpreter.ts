/**
 * Raivstream 5.0 — Directive interpreter (deterministic).
 *
 * Turns a natural-language directive into a semantic intent: mode, scope,
 * change, preserve, impact, and the affected scene indices. Deterministic and
 * unit-testable; covers the golden directives. The Director never touches
 * providers/prompts — this is pure creative reasoning.
 */

import type { CreativeProductionPlanState } from '../production/plan';
import type { DirectiveInternal, ImpactLevel } from './types';

function lower(text: string): string {
  return text.toLowerCase();
}

function sceneNumber(text: string): number | null {
  const match = lower(text).match(/scene\s+(\d+)/);
  return match ? Math.max(0, Number(match[1]) - 1) : null;
}

export function interpretDirective(
  instruction: string,
  plan: CreativeProductionPlanState,
): DirectiveInternal {
  const text = lower(instruction);
  const totalScenes = plan.scenes.length;
  const lastIndex = Math.max(0, totalScenes - 1);

  // EXPLORE — variations, original preserved.
  if (/three (different )?endings|three versions|three variations|give me \d+ endings/.test(text)) {
    const count = text.match(/(\d+) endings/) ? Number(text.match(/(\d+) endings/)![1]) : 3;
    return {
      mode: 'EXPLORE',
      intent: 'explore ending variations',
      scope: 'STORY',
      changes: [{ scope: 'STORY', field: 'ending', to: `${count} variations` }],
      preserves: ['story premise', 'characters', 'world', 'established scenes'],
      impact: 'PROJECT',
      affectedSceneIndices: [lastIndex],
      exploreCount: Math.min(Math.max(count, 2), 5),
      executionPlan: [
        { step: 'Snapshot current version', service: 'version' },
        { step: 'Create N ending branches', service: 'director' },
        { step: 'Produce the chosen ending', service: 'production' },
      ],
    };
  }

  // PRESERVE-everything-except — "Keep everything except the wardrobe."
  const wardrobe = text.match(/keep everything except (the )?(wardrobe|outfit|clothes)/);
  if (wardrobe) {
    return {
      mode: 'DIRECT',
      intent: 'change wardrobe only',
      scope: 'CHARACTER',
      changes: [{ scope: 'CHARACTER', field: 'wardrobe', to: 'changed wardrobe' }],
      preserves: ['character identity', 'appearance', 'age', 'relationships', 'world', 'story purpose'],
      impact: 'MULTI_SCENE',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Update character wardrobe in the bible', service: 'director' },
        { step: 'Regenerate affected scenes', service: 'production' },
      ],
    };
  }

  // Confidence / emotion — character state changes, identity preserved.
  if (/make (her|him|the character|the protagonist) more confident/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'increase character confidence',
      scope: 'CHARACTER',
      changes: [{ scope: 'CHARACTER', field: 'state.confidence', to: 'higher' }],
      preserves: ['character identity', 'appearance', 'wardrobe', 'world', 'story premise', 'approved decisions'],
      impact: 'MULTI_SCENE',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Resolve character', service: 'director' },
        { step: 'Update character state', service: 'director' },
        { step: 'Regenerate affected scenes', service: 'production' },
      ],
    };
  }
  if (/make (her|him|the character|the protagonist) more emotional/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'increase emotional expression',
      scope: 'CHARACTER',
      changes: [{ scope: 'CHARACTER', field: 'state.emotionalExpression', to: 'more emotional' }],
      preserves: ['character identity', 'appearance', 'wardrobe', 'world', 'story premise'],
      impact: 'MULTI_SCENE',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Update character state', service: 'director' },
        { step: 'Regenerate affected scenes', service: 'production' },
      ],
    };
  }

  // Ending tone.
  const endingMatch = text.match(/make the ending (hopeful|bittersweet|dramatic|darker|happier)/);
  if (endingMatch) {
    return {
      mode: 'DIRECT',
      intent: `make the ending ${endingMatch[1]}`,
      scope: 'STORY',
      changes: [{ scope: 'STORY', field: 'ending', to: endingMatch[1] }],
      preserves: ['story premise', 'characters', 'world', 'all unaffected scenes'],
      impact: 'PROJECT',
      affectedSceneIndices: [lastIndex],
      executionPlan: [
        { step: 'Identify affected ending scenes', service: 'director' },
        { step: 'Update the ending in the plan', service: 'director' },
        { step: 'Regenerate the ending scenes', service: 'production' },
      ],
    };
  }

  // Lighting — local.
  const lightingScene = sceneNumber(text);
  if (/warm (the )?lighting|make (it|scene \d+) warmer|warmer lighting/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'warm the lighting',
      scope: 'VISUAL',
      changes: [{ scope: 'VISUAL', field: 'lighting', to: 'warm' }],
      preserves: ['story', 'characters', 'world', 'all other scenes'],
      impact: 'LOCAL',
      affectedSceneIndices: lightingScene !== null ? [lightingScene] : [0],
      executionPlan: [
        { step: 'Apply warm lighting to the scene', service: 'director' },
        { step: 'Regenerate the scene', service: 'production' },
      ],
    };
  }

  // Pacing — opening faster.
  if (/make the opening faster/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'make the opening faster',
      scope: 'STORY',
      changes: [{ scope: 'STORY', field: 'pacing.opening', to: 'faster' }],
      preserves: ['characters', 'world', 'story premise', 'all later scenes'],
      impact: 'LOCAL',
      affectedSceneIndices: [0],
      executionPlan: [
        { step: 'Tighten the opening beat', service: 'director' },
        { step: 'Regenerate the opening scene', service: 'production' },
      ],
    };
  }

  // Visual language / premium.
  if (/more (cinematic|premium|luxurious)/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'elevate the visual language',
      scope: 'VISUAL',
      changes: [{ scope: 'VISUAL', field: 'visualLanguage', to: 'more premium, cinematic' }],
      preserves: ['story', 'characters', 'world', 'continuity'],
      impact: 'MULTI_SCENE',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Update the visual language in the bible', service: 'director' },
        { step: 'Regenerate affected scenes', service: 'production' },
      ],
    };
  }

  // Dialogue tone.
  if (/dialogue less formal/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'make the dialogue less formal',
      scope: 'AUDIO',
      changes: [{ scope: 'AUDIO', field: 'dialogue', to: 'less formal' }],
      preserves: ['story', 'characters', 'world'],
      impact: 'MULTI_SCENE',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Rewrite dialogue delivery', service: 'director' },
        { step: 'Regenerate narration', service: 'production' },
      ],
    };
  }

  // World richness.
  if (/world feel richer|richer world/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'make the world feel richer',
      scope: 'WORLD',
      changes: [{ scope: 'WORLD', field: 'worldDetail', to: 'richer' }],
      preserves: ['story', 'characters', 'premise'],
      impact: 'PROJECT',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Deepen world references in the bible', service: 'director' },
        { step: 'Regenerate affected scenes', service: 'production' },
      ],
    };
  }

  // Child-safe.
  if (/suitable for children|child-safe|for kids/.test(text)) {
    return {
      mode: 'DIRECT',
      intent: 'make this suitable for children',
      scope: 'PROJECT',
      changes: [{ scope: 'PROJECT', field: 'audience', to: 'children', from: 'current' }, { scope: 'PROJECT', field: 'safety', to: 'child-safe' }],
      preserves: ['story', 'characters', 'world'],
      impact: 'PROJECT',
      affectedSceneIndices: plan.scenes.map((_, index) => index),
      executionPlan: [
        { step: 'Apply child-safe constraints to the bible', service: 'director' },
        { step: 'Regenerate the project', service: 'production' },
      ],
    };
  }

  // Generic fallback — a single-scene local change if a scene is named.
  if (lightingScene !== null || /scene \d+/.test(text)) {
    const index = lightingScene ?? sceneNumber(text) ?? 0;
    return {
      mode: 'DIRECT',
      intent: 'adjust a single scene',
      scope: 'SCENE',
      changes: [{ scope: 'SCENE', field: 'scene', to: text.slice(0, 120) }],
      preserves: ['everything else'],
      impact: 'LOCAL',
      affectedSceneIndices: [index],
      executionPlan: [{ step: 'Adjust the scene', service: 'director' }, { step: 'Regenerate the scene', service: 'production' }],
    };
  }

  return {
    mode: 'DIRECT',
    intent: 'apply a project-wide creative direction',
    scope: 'PROJECT',
    changes: [{ scope: 'PROJECT', field: 'creativeDirection', to: text.slice(0, 160) }],
    preserves: ['characters', 'world', 'continuity'],
    impact: 'PROJECT' as ImpactLevel,
    affectedSceneIndices: plan.scenes.map((_, index) => index),
    executionPlan: [{ step: 'Interpret the direction', service: 'director' }, { step: 'Regenerate the project', service: 'production' }],
  };
}