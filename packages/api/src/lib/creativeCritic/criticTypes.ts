import { z } from 'zod';

export const CREATIVE_CRITIC_VERSION = 'phase-8b-v1';

export const criticIssueCategorySchema = z.enum([
  'CHARACTER',
  'CONTINUITY',
  'COMPOSITION',
  'LIGHTING',
  'EMOTION',
  'STYLE',
  'ENVIRONMENT',
  'STORY',
  'CLARITY',
  'TECHNICAL',
]);

export const criticRecommendationSchema = z.enum(['APPROVE', 'SUGGEST_REFINEMENT', 'REGENERATE']);

export const creativeCriticResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  scores: z.object({
    characterIdentity: z.number().min(0).max(100),
    continuity: z.number().min(0).max(100),
    composition: z.number().min(0).max(100),
    lighting: z.number().min(0).max(100),
    emotion: z.number().min(0).max(100),
    visualStyle: z.number().min(0).max(100),
    environment: z.number().min(0).max(100),
    storyAlignment: z.number().min(0).max(100),
    sceneClarity: z.number().min(0).max(100),
    technicalQuality: z.number().min(0).max(100),
  }),
  strengths: z.array(z.string().min(1).max(240)).max(8),
  issues: z.array(z.object({
    category: criticIssueCategorySchema,
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    description: z.string().min(1).max(360),
  })).max(12),
  improvementPlan: z.object({
    character: z.array(z.string().min(1).max(220)).max(6).optional(),
    continuity: z.array(z.string().min(1).max(220)).max(6).optional(),
    composition: z.array(z.string().min(1).max(220)).max(6).optional(),
    lighting: z.array(z.string().min(1).max(220)).max(6).optional(),
    emotion: z.array(z.string().min(1).max(220)).max(6).optional(),
    style: z.array(z.string().min(1).max(220)).max(6).optional(),
    environment: z.array(z.string().min(1).max(220)).max(6).optional(),
    story: z.array(z.string().min(1).max(220)).max(6).optional(),
    technical: z.array(z.string().min(1).max(220)).max(6).optional(),
  }).default({}),
  recommendation: criticRecommendationSchema,
  confidence: z.number().min(0).max(100),
});

export type CreativeCriticResult = z.infer<typeof creativeCriticResultSchema>;
export type CreativeCriticRecommendation = z.infer<typeof criticRecommendationSchema>;

export type CreativeCriticInput = {
  assetUrl: string;
  assetId: string;
  projectId: string;
  sceneId: string;
  creativeSpecification: Record<string, unknown>;
  storyDna?: unknown;
  visualDna?: unknown;
  characterDirector?: unknown;
  sceneDirector?: unknown;
  selectedVisualStyle?: string | null;
  previousActiveSceneAsset?: Record<string, unknown> | null;
  previousSceneCreativeSpecification?: Record<string, unknown> | null;
  providerMetadata?: Record<string, unknown> | null;
  generationMetadata?: Record<string, unknown> | null;
};

export type CreativeCriticProviderResult = {
  provider: string;
  model?: string;
  result: CreativeCriticResult;
};

export function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in creative critic response');
    return JSON.parse(match[0]);
  }
}
