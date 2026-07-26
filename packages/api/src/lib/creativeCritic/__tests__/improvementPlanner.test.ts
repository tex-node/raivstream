import { describe, expect, it } from 'vitest';
import { applyCriticImprovementsToCreativeSpecification, flattenImprovementPlan } from '../improvementPlanner';

describe('creative critic improvement planner', () => {
  const criticResult = {
    overallScore: 68,
    scores: {
      characterIdentity: 80,
      continuity: 70,
      composition: 60,
      lighting: 60,
      emotion: 70,
      visualStyle: 75,
      environment: 65,
      storyAlignment: 70,
      sceneClarity: 65,
      technicalQuality: 65,
    },
    strengths: ['Readable story beat'],
    issues: [],
    improvementPlan: {
      composition: ['Use a wider establishing frame'],
      emotion: ['Increase curiosity in Max'],
    },
    recommendation: 'REGENERATE' as const,
    confidence: 88,
  };

  it('does not mutate the original creative specification', () => {
    const original = { version: 1, scene: 'Road', unrelated: { keep: true } };
    const updated = applyCriticImprovementsToCreativeSpecification({
      creativeSpecification: original,
      criticResult,
      sourceCriticRunId: 'run1',
      version: 2,
    });
    expect(original).toEqual({ version: 1, scene: 'Road', unrelated: { keep: true } });
    expect(updated).toMatchObject({
      version: 2,
      scene: 'Road',
      unrelated: { keep: true },
      sourceCriticRunId: 'run1',
      criticRecommendation: 'REGENERATE',
      criticOverallScore: 68,
    });
    expect(updated.compilerGuidance).toEqual([
      'composition: Use a wider establishing frame',
      'emotion: Increase curiosity in Max',
    ]);
  });

  it('does not create meaningless guidance for empty plans', () => {
    expect(flattenImprovementPlan({})).toEqual([]);
  });
});
