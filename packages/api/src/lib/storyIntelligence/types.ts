import { z } from 'zod';
import type { StoryAudienceMode } from '../storyTextService';

// ─── Content Type ────────────────────────────────────────────────────────────

export const contentTypeSchema = z.enum([
  'EDUCATIONAL',
  'STORY',
  'COMMERCIAL',
  'ENTERTAINMENT',
  'DOCUMENTARY',
  'TRANSFORMATION',
]);
export type ContentType = z.infer<typeof contentTypeSchema>;

// ─── Educational Contract ────────────────────────────────────────────────────

export const educationalContractSchema = z.object({
  version: z.literal('education_contract_v1'),
  topic: z.string().min(1).max(200),
  targetAge: z.string().max(40),
  learningObjective: z.string().min(10).max(400),
  keyConcepts: z.array(z.string().max(120)).min(2).max(8),
  vocabularyLevel: z.enum(['very_simple', 'simple', 'moderate', 'advanced']),
  explanationStrategy: z.string().max(300),
  examplesToUse: z.array(z.string().max(150)).max(6).default([]),
  visualTeachingStrategy: z.string().max(300),
  narrationRequired: z.boolean().default(true),
  sceneProgression: z.array(z.string().max(120)).min(2).max(8),
  recapIncluded: z.boolean().default(true),
  antiCommercialTopics: z.array(z.string().max(80)).max(10).default([]),
});
export type EducationalContract = z.infer<typeof educationalContractSchema>;

// ─── Story Blueprint ────────────────────────────────────────────────────────

export const storyBlueprintSchema = z.object({
  version: z.literal('story_blueprint_v1'),
  premise: z.string().min(1).max(400),
  genre: z.string().max(80).optional(),
  tone: z.string().max(80).optional(),
  theme: z.string().max(120).optional(),
  audience: z.string().max(80).optional(),
  protagonist: z.object({
    name: z.string().max(80),
    goal: z.string().max(200),
    motivation: z.string().max(200).optional(),
    flaw: z.string().max(200).optional(),
  }),
  supportingCharacters: z.array(z.object({
    name: z.string().max(80),
    role: z.string().max(120),
    relationship: z.string().max(120).optional(),
  })).max(6).default([]),
  setting: z.string().max(200).optional(),
  conflict: z.string().max(300),
  stakes: z.string().max(200).optional(),
  emotionalArc: z.string().max(300).optional(),
  beats: z.array(z.object({
    label: z.string().max(60),
    description: z.string().max(200),
  })).min(3).max(8),
  continuityRules: z.array(z.string().max(200)).max(8).default([]),
});

export type StoryBlueprint = z.infer<typeof storyBlueprintSchema>;

// ─── Directed Scene ─────────────────────────────────────────────────────────

export const teachingRoleSchema = z.enum([
  'INTRODUCTION',
  'EXPLANATION',
  'EXAMPLE',
  'COMPARISON',
  'DEMONSTRATION',
  'REINFORCEMENT',
  'RECAP',
]);
export type TeachingRole = z.infer<typeof teachingRoleSchema>;

export const directedSceneSchema = z.object({
  version: z.literal('scene_director_v1'),
  ordinal: z.number().int().min(1),
  title: z.string().max(120),
  storyBeat: z.string().max(120),
  dramaticPurpose: z.string().max(200),
  location: z.string().max(120).optional(),
  timeOfDay: z.string().max(60).optional(),
  characters: z.array(z.string().max(80)).max(6).default([]),
  action: z.string().max(400),
  emotion: z.string().max(80).optional(),
  keyDialogue: z.string().max(300).optional(),
  visualFocus: z.string().max(200).optional(),
  cameraIntent: z.string().max(120).optional(),
  lightingIntent: z.string().max(120).optional(),
  continuityIn: z.string().max(200).optional(),
  continuityOut: z.string().max(200).optional(),
  mood: z.string().max(80).optional(),
  // Phase C — educational scene fields (optional; absent for non-educational content)
  learningObjective: z.string().max(300).optional(),
  teachingConcept: z.string().max(200).optional(),
  teachingRole: teachingRoleSchema.optional(),
  visualTeachingRequirement: z.string().max(300).optional(),
  narrationText: z.string().max(600).optional(),
  antiCommercialNote: z.string().max(200).optional(),
});

export type DirectedScene = z.infer<typeof directedSceneSchema>;

// ─── Provider Interface ──────────────────────────────────────────────────────

export type PlanStoryInput = {
  idea: string;
  answers: Array<{ questionText: string; selectedAnswer: string }>;
  audienceMode: StoryAudienceMode;
  existingCharacters?: Array<{ name: string; role?: string; visualDescription?: string }>;
};

export type EnhanceNarrativeInput = {
  blueprint: StoryBlueprint;
  storyTitle: string;
  storyBody: string;
  audienceMode: StoryAudienceMode;
  characterContext: string;
};

export type DirectScenesInput = {
  blueprint: StoryBlueprint;
  storyTitle: string;
  storyBody: string;
  audienceMode: StoryAudienceMode;
  sceneCount: number;
  characterContext: string;
  existingSceneHints?: Array<{ title: string; description: string; locationType?: string; mood?: string }>;
  educationalContract?: EducationalContract | null;
};

export type ClassifyContentInput = {
  idea: string;
  answers: Array<{ questionText: string; selectedAnswer: string }>;
  audienceMode: StoryAudienceMode;
};

export type PlanEducationInput = {
  idea: string;
  answers: Array<{ questionText: string; selectedAnswer: string }>;
  audienceMode: StoryAudienceMode;
  sceneCount: number;
};

export interface StoryIntelligenceProvider {
  readonly name: string;
  planStory(input: PlanStoryInput): Promise<StoryBlueprint>;
  enhanceNarrative(input: EnhanceNarrativeInput): Promise<string>;
  directScenes(input: DirectScenesInput): Promise<DirectedScene[]>;
  classifyContent(input: ClassifyContentInput): Promise<ContentType>;
  planEducation(input: PlanEducationInput): Promise<EducationalContract>;
}

// ─── Typed Failures ──────────────────────────────────────────────────────────

export type StoryIntelligenceErrorCode =
  | 'STORY_BLUEPRINT_INVALID'
  | 'STORY_BLUEPRINT_PROVIDER_FAILED'
  | 'NARRATIVE_ENHANCEMENT_FAILED'
  | 'SCENE_DIRECTION_INVALID'
  | 'STORY_INTELLIGENCE_TIMEOUT'
  | 'STORY_INTELLIGENCE_UNAVAILABLE';

export class StoryIntelligenceError extends Error {
  readonly code: StoryIntelligenceErrorCode;
  constructor(code: StoryIntelligenceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'StoryIntelligenceError';
    this.code = code;
    if (cause instanceof Error) (this as unknown as { cause: unknown }).cause = cause;
  }
}

// ─── Feature Flag ────────────────────────────────────────────────────────────

export function isStoryIntelligenceEnabled(): boolean {
  return process.env.STORY_INTELLIGENCE_V1_ENABLED === 'true';
}
