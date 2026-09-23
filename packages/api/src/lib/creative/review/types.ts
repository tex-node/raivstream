/**
 * Raivstream 5.0 — Review domain types.
 *
 * Findings are human-readable, actionable objects the Director can consume —
 * not scoreboards. Raw critic data stays available for diagnostics only.
 */

export const REVIEW_CATEGORIES = ['STORY', 'CHARACTER', 'WORLD', 'VISUAL', 'AUDIO', 'CONTINUITY', 'PACING', 'TECHNICAL'] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export type EntityType = 'PROJECT' | 'SCENE' | 'SHOT' | 'CHARACTER' | 'WORLD' | 'ASSET';

export interface EntityReference {
  type: EntityType;
  id?: string;
  name?: string;
}

export interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  description: string;
  affectedEntities: EntityReference[];
  suggestedAction?: string;
  /** Default action offered in the UI (KEEP / FIX / REVIEW). */
  resolution?: 'KEEP' | 'FIX' | 'REVIEW';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Diagnostics — never shown to creators by default. */
  raw?: Record<string, unknown>;
}

export interface ReviewRunState {
  id: string;
  projectId: string;
  sceneId: string | null;
  assetId: string | null;
  status: string;
  findings: ReviewFinding[];
  provider: string | null;
  createdAt: Date;
}