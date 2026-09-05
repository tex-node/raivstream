import type { DirectedScene, StoryBlueprint } from '../storyIntelligence/types';
import type { StoryAudienceMode } from '../storyTextService';

// ─── Version ─────────────────────────────────────────────────────────────────

export const VPC_VERSION = 'visual_prompt_v2' as const;
export type VpcVersion = typeof VPC_VERSION;

// ─── Medium ──────────────────────────────────────────────────────────────────

export type VpcMedium = 'IMAGE' | 'VIDEO';

// ─── Character Visual Lock ────────────────────────────────────────────────────
// Derived from CharacterMemoryRecord — no separate DB model needed.
// Represents visually immutable/slow-changing traits for cross-scene consistency.

export type CharacterVisualLock = {
  characterId: string;
  canonicalName: string;
  role?: string;
  species?: string;
  ageDescription?: string;
  gender?: string;
  physicalDescription?: string;
  signatureItems: string[];   // extracted accessories, clothing cues
  immutableTraits: string[];  // consistency rules
  isFocal: boolean;           // true for scene's first/primary character
};

// ─── Camera Model ─────────────────────────────────────────────────────────────
// Constrained vocabulary. Provider adapters may translate these to provider syntax.

export type ShotSize =
  | 'extreme_close_up'
  | 'close_up'
  | 'medium_close'
  | 'medium'
  | 'medium_wide'
  | 'wide'
  | 'extreme_wide';

export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'overhead' | 'dutch';

export type CameraMovement = 'static' | 'slow_pan' | 'slow_dolly_in' | 'slow_dolly_out' | 'gentle_tilt';

export type CameraSpec = {
  shotSize: ShotSize;
  angle: CameraAngle;
  movement?: CameraMovement;  // VIDEO only
  freeformHint?: string;      // passthrough for unrecognized hints
};

// ─── Composition ──────────────────────────────────────────────────────────────

export type CompositionLayout =
  | 'centered'
  | 'rule_of_thirds'
  | 'foreground_framing'
  | 'over_shoulder'
  | 'two_shot'
  | 'group'
  | 'negative_space';

export type CompositionSpec = {
  layout: CompositionLayout;
  verticalFraming: '9:16';
};

// ─── Lighting ─────────────────────────────────────────────────────────────────

export type LightingSpec = {
  quality: string;  // 'soft' | 'natural' | 'warm' | 'dramatic' | 'moonlight'
  moodHint?: string;
  freeformHint?: string;
};

// ─── Canonical Visual Prompt ──────────────────────────────────────────────────

export type CanonicalVisualPrompt = {
  version: VpcVersion;
  medium: VpcMedium;
  sceneId: string;
  storyTitle: string;
  sceneTitle: string;
  storyBeat?: string;
  dramaticPurpose?: string;
  focalSubject: string;
  characters: CharacterVisualLock[];
  action: string;
  emotion?: string;
  environment: string;
  timeOfDay?: string;
  weather?: string;
  spatialRelationships?: string;
  camera: CameraSpec;
  composition: CompositionSpec;
  lighting: LightingSpec;
  colorIntent?: string;
  continuity: string[];
  style: string;
  stylePromptBlock: string;
  requiredDetails: string[];
  forbiddenDetails: string[];
  negativePromptParts: string[];
  audienceMode: StoryAudienceMode;
  detectedConflicts: string[];  // non-fatal warnings
  // Rendered output
  renderedPrompt: string;
  renderedNegativePrompt: string;
};

// ─── Composer Input ───────────────────────────────────────────────────────────

export type CharacterMemoryInput = {
  id?: string;
  name: string;
  role?: string | null;
  species?: string | null;
  ageDescription?: string | null;
  gender?: string | null;
  visualDescription?: string | null;
  personalityTraits?: unknown;
  motivation?: string | null;
  fear?: string | null;
  goal?: string | null;
  favoriteExpression?: string | null;
  evolutionStage?: string | null;
  evolutionNotes?: string | null;
};

export type SceneInput = {
  id: string;
  title: string;
  description: string;
  locationType?: string | null;
  indoorOutdoor?: string | null;
  mood?: string | null;
  emotion?: string | null;
  cameraStyle?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  environmentMood?: string | null;
  lighting?: string | null;
  scenePace?: string | null;
  characters?: unknown;
  directorMetadata?: unknown;  // Phase A DirectedScene (stored as JSON)
};

export type ProjectInput = {
  title: string;
  originalIdea?: string | null;
  audienceMode?: string | null;
  visualStyle?: string | null;
  theme?: string | null;
  tone?: string | null;
  synopsis?: string | null;
  storyDna?: unknown;
  characterMemory?: CharacterMemoryInput[];
};

export type ChapterInput = {
  blueprint?: unknown;  // Phase A StoryBlueprint (stored as JSON)
};

export type VpcComposerInput = {
  scene: SceneInput;
  project: ProjectInput;
  chapter?: ChapterInput | null;
  medium: VpcMedium;
  maxPromptLength: number;
  maxNegativePromptLength: number;
  audienceMode: StoryAudienceMode;
  // Parsed Phase A structures (pre-validated by caller or null)
  directedScene?: DirectedScene | null;
  blueprint?: StoryBlueprint | null;
};

// ─── Composer Output ──────────────────────────────────────────────────────────

export type VpcComposerOutput = {
  canonical: CanonicalVisualPrompt;
  prompt: string;
  negativePrompt: string;
  styleUsed: string;
  characterIdentity: string;   // backward-compat string for analytics/logging
  composerVersion: VpcVersion;
  composerCost: 0;             // deterministic — always $0
};

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export type VpcErrorCode =
  | 'MISSING_SCENE_CONTEXT'
  | 'INVALID_CHARACTER_REFERENCE'
  | 'PROMPT_CONFLICT'
  | 'PROMPT_TOO_LARGE'
  | 'INVALID_STYLE'
  | 'UNSAFE_VISUAL_REQUEST';

export class VpcError extends Error {
  readonly code: VpcErrorCode;
  constructor(code: VpcErrorCode, message: string) {
    super(message);
    this.name = 'VpcError';
    this.code = code;
  }
}

// ─── Feature Flag ─────────────────────────────────────────────────────────────

export function isVisualPromptComposerV2Enabled(): boolean {
  return process.env.VISUAL_PROMPT_COMPOSER_V2_ENABLED === 'true';
}
