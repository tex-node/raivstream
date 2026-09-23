/**
 * Raivstream 5.0 — shared creative domain contracts (types, enums, errors).
 * Independent of Prisma and independent of the legacy Story domain so the
 * semantic layer stays decoupled; adapters bridge to existing infrastructure.
 */

// ─── Project types & states (mirrors the roadmap) ────────────────────────────

export const CREATIVE_PROJECT_TYPES = ['STORY', 'EDUCATION', 'COMMERCIAL', 'TRANSFORMATION', 'UNKNOWN'] as const;
export type CreativeProjectType = (typeof CREATIVE_PROJECT_TYPES)[number];

export const CREATIVE_PROJECT_STATUSES = [
  'IDEA',
  'INTERPRETING',
  'PLANNING',
  'PREVIEW',
  'DIRECTING',
  'GENERATING',
  'REVIEW',
  'REFINING',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type CreativeProjectStatus = (typeof CREATIVE_PROJECT_STATUSES)[number];

export const CREATIVE_MEMORY_KINDS = ['PREFERENCE', 'DECISION', 'REJECTION', 'NOTE', 'DIRECTION'] as const;
export type CreativeMemoryKind = (typeof CREATIVE_MEMORY_KINDS)[number];

// ─── Next action ─────────────────────────────────────────────────────────────

export const NEXT_ACTIONS = [
  'UNDERSTAND_INTENT',
  'BUILD_BIBLE',
  'REVIEW_PLAN',
  'APPROVE_PREVIEW',
  'PRODUCE',
  'REVIEW_OUTPUT',
  'DIRECT',
  'APPROVE_OUTPUT',
  'EXPORT',
] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

// ─── Interpretation ──────────────────────────────────────────────────────────

export interface IntentQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** When true the UI offers a "Let Raivstream decide" choice. */
  canAutoDecide: boolean;
}

export interface CreativeInterpretation {
  projectType: CreativeProjectType;
  /** What the creator explicitly said, captured verbatim. */
  explicit: {
    durationSeconds?: number;
    format?: string;
    genre?: string;
    tone?: string;
    audience?: string;
    setting?: string;
    subject?: string;
  };
  /** What Raivstream reasonably concluded (never fabricated as certainty). */
  inferred: {
    objective?: string;
    message?: string;
    style?: string;
  };
  /** What materially affects the result but cannot be safely inferred. */
  uncertain: string[];
  /** Consequential questions the creator should answer (bounded, minimal). */
  questions: IntentQuestion[];
  /** Plain-language summary of the interpretation. */
  summary: string;
  /** Confidence in the project-type detection (0–1). */
  typeConfidence: number;
}

// ─── Creative state (brief / bible / memory, semantic) ───────────────────────

export interface CreativeBriefState {
  originalIntent: string;
  refinedIntent?: string;
  objective?: string;
  audience?: string;
  format?: string;
  durationSeconds?: number;
  genre?: string;
  tone?: string;
  theme?: string;
  setting?: string;
  attachments?: Record<string, unknown>[];
}

export interface CreativeBibleState {
  version: number;
  story?: Record<string, unknown>;
  characters?: Record<string, unknown>[];
  worlds?: Record<string, unknown>[];
  visualLanguage?: Record<string, unknown>;
  audioLanguage?: Record<string, unknown>;
  audience?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  canon?: Record<string, unknown>;
}

export interface CreativeMemoryEntry {
  kind: CreativeMemoryKind;
  content: Record<string, unknown>;
}

export interface CreativeProjectState {
  id: string;
  userId: string;
  title: string;
  projectType: CreativeProjectType;
  status: CreativeProjectStatus;
  legacyStoryProjectId: string | null;
  brief?: CreativeBriefState | null;
  bible?: CreativeBibleState | null;
  hasPlan: boolean;
  currentVersionId?: string | null;
  nextAction: NextAction;
  createdAt: Date;
  updatedAt: Date;
}