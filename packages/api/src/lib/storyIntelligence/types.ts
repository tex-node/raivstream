import { z } from 'zod';
import type { StoryAudienceMode } from '../storyTextService';

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
};

export interface StoryIntelligenceProvider {
  readonly name: string;
  planStory(input: PlanStoryInput): Promise<StoryBlueprint>;
  enhanceNarrative(input: EnhanceNarrativeInput): Promise<string>;
  directScenes(input: DirectScenesInput): Promise<DirectedScene[]>;
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
