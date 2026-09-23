/**
 * Raivstream 5.0 — CreativeCriticAdapter (Review).
 *
 * Bridges the 5.0 review layer to the EXISTING creative-critic engine without
 * writing to legacy Story tables: it calls `creativeCriticProvider.evaluate`
 * directly (the same analytical engine `runCreativeCritic` uses) and translates
 * the result into human-readable ReviewFindings. The evaluator is injectable so
 * the translation is unit-testable without a live AI provider.
 */

import { creativeCriticProvider, CreativeCriticUnavailableError } from '../../creativeCritic';
import type { CreativeCriticInput, CreativeCriticResult, CreativeCriticProviderResult } from '../../creativeCritic/criticTypes';
import type { CreativeBibleState } from '../shared/types';
import type { PlanScene } from '../production/plan';
import type { EntityReference, ReviewCategory, ReviewFinding } from './types';

export type CriticEvaluator = (input: CreativeCriticInput) => Promise<CreativeCriticProviderResult>;

const defaultEvaluator: CriticEvaluator = (input) => creativeCriticProvider.evaluate(input);

const CATEGORY_LABEL: Record<string, string> = {
  CHARACTER: 'Character',
  CONTINUITY: 'Continuity',
  COMPOSITION: 'Visual',
  LIGHTING: 'Lighting',
  EMOTION: 'Emotion',
  STYLE: 'Visual style',
  ENVIRONMENT: 'World',
  STORY: 'Story',
  CLARITY: 'Visual clarity',
  TECHNICAL: 'Technical',
};

const CATEGORY_MAP: Record<string, ReviewCategory> = {
  CHARACTER: 'CHARACTER',
  CONTINUITY: 'CONTINUITY',
  COMPOSITION: 'VISUAL',
  LIGHTING: 'VISUAL',
  EMOTION: 'CHARACTER',
  STYLE: 'VISUAL',
  ENVIRONMENT: 'WORLD',
  STORY: 'STORY',
  CLARITY: 'VISUAL',
  TECHNICAL: 'TECHNICAL',
};

export function buildCriticInput(input: {
  producedAsset: { id: string; assetUrl: string | null };
  sceneId: string;
  projectId: string;
  scene?: PlanScene;
  bible?: CreativeBibleState | null;
}): CreativeCriticInput {
  return {
    assetUrl: input.producedAsset.assetUrl ?? '',
    assetId: input.producedAsset.id,
    projectId: input.projectId,
    sceneId: input.sceneId,
    creativeSpecification: {
      bible: input.bible ?? {},
      scene: input.scene ? { title: input.scene.title, beat: input.scene.beat, description: input.scene.description, narration: input.scene.narration } : {},
    },
  };
}

export function translateCriticResult(
  result: CreativeCriticResult,
  refs: EntityReference[],
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const [index, strength] of result.strengths.slice(0, 3).entries()) {
    findings.push({
      id: `strength-${index}`,
      category: 'STORY',
      description: strength,
      affectedEntities: refs,
      resolution: 'KEEP',
      severity: 'LOW',
    });
  }

  for (const [index, issue] of result.issues.slice(0, 8).entries()) {
    const category = CATEGORY_MAP[issue.category] ?? 'VISUAL';
    const label = CATEGORY_LABEL[issue.category] ?? category;
    findings.push({
      id: `issue-${index}`,
      category,
      description: `${label} — ${issue.description}`,
      affectedEntities: refs,
      suggestedAction: `Review this ${category.toLowerCase().replace('_', ' ')} and direct a change if needed.`,
      resolution: 'REVIEW',
      severity: issue.severity,
      raw: { score: result.scores[issue.category.toLowerCase() as keyof typeof result.scores] ?? result.overallScore, issue },
    });
  }

  return findings;
}

/**
 * Evaluate a produced asset through the existing critic engine and translate.
 * Returns null when the critic is unavailable (graceful — review is optional).
 */
export async function evaluateWithCritic(
  input: { criticInput: CreativeCriticInput; refs: EntityReference[] },
  evaluator: CriticEvaluator = defaultEvaluator,
): Promise<{ findings: ReviewFinding[]; provider: string | null } | null> {
  try {
    const evaluated = await evaluator(input.criticInput);
    return { findings: translateCriticResult(evaluated.result, input.refs), provider: evaluated.provider };
  } catch (error) {
    if (error instanceof CreativeCriticUnavailableError) {
      console.warn('[creative.review] critic unavailable:', error.message);
      return null;
    }
    throw error;
  }
}