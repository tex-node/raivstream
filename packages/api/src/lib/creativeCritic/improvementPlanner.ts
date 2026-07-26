import type { CreativeCriticResult } from './criticTypes';

type CreativeSpecification = Record<string, unknown>;

export function flattenImprovementPlan(plan: CreativeCriticResult['improvementPlan']) {
  return Object.entries(plan)
    .flatMap(([category, items]) => (items ?? []).map((item) => `${category}: ${item}`))
    .filter(Boolean);
}

export function applyCriticImprovementsToCreativeSpecification(input: {
  creativeSpecification: CreativeSpecification;
  criticResult: CreativeCriticResult;
  sourceCriticRunId: string;
  version: number;
}) {
  return {
    ...input.creativeSpecification,
    version: input.version,
    sourceCriticRunId: input.sourceCriticRunId,
    criticRecommendation: input.criticResult.recommendation,
    criticOverallScore: input.criticResult.overallScore,
    criticImprovements: input.criticResult.improvementPlan,
    compilerGuidance: flattenImprovementPlan(input.criticResult.improvementPlan),
    updatedBy: 'creative-critic',
  };
}

export function improvementPlanSummary(plan: CreativeCriticResult['improvementPlan'], maxItems = 4) {
  return flattenImprovementPlan(plan).slice(0, maxItems);
}
