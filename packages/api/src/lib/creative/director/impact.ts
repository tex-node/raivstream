/**
 * Raivstream 5.0 — Director impact analysis.
 *
 * Minimal-impact principle: change the smallest meaningful scope required.
 * Normalizes the interpreter's impact decision against the actual plan and
 * reports downstream production impact (which scenes must regenerate).
 */

import type { CreativeProductionPlanState } from '../production/plan';
import type { ImpactLevel } from './types';

export interface ImpactAnalysis {
  impact: ImpactLevel;
  affectedSceneIndices: number[];
  /** What must be regenerated downstream (never providers — just scope). */
  downstream: string[];
}

export function analyzeImpact(input: {
  declared: ImpactLevel;
  sceneIndices: number[];
  totalScenes: number;
}): ImpactAnalysis {
  const indices = [...new Set(input.sceneIndices.filter((index) => index >= 0 && index < input.totalScenes))].sort((a, b) => a - b);
  let impact: ImpactLevel = input.declared;
  if (indices.length === 0) impact = 'NONE';
  else if (impact === 'MULTI_SCENE' && indices.length === 1) impact = 'LOCAL';
  else if (impact === 'LOCAL' && indices.length > 1) impact = 'MULTI_SCENE';
  else if (impact === 'PROJECT' && indices.length === 1) impact = 'MULTI_SCENE';

  return {
    impact,
    affectedSceneIndices: indices,
    downstream: indices.length === input.totalScenes
      ? ['regenerate all scenes']
      : [`regenerate ${indices.length} scene${indices.length === 1 ? '' : 's'} (continuity seeds refreshed)`],
  };
}

export function planSceneIds(plan: CreativeProductionPlanState, indices: number[]): string[] {
  return indices
    .map((index) => plan.scenes[index])
    .filter(Boolean)
    .map((scene) => scene.sceneId);
}