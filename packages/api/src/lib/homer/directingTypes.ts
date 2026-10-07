/**
 * Homer Directing — shared TypeScript types.
 * Pure type definitions — no runtime imports.
 */

export type CreativeDecisionCategory =
  | 'VISUAL_TREATMENT'
  | 'MOOD'
  | 'WORLD_TREATMENT'
  | 'TIME_OF_DAY'
  | 'PACING'
  | 'CHARACTER_PRESENTATION'
  | 'CAMERA_PERSPECTIVE';

export type DirectingDecisionProvenance =
  | 'USER_EXPLICIT'
  | 'USER_APPROVED'
  | 'HOMER_INFERENCE'
  | 'HOMER_PROPOSAL';

export interface DirectingChoice {
  value: string;
  label: string;
}

export interface HomerCreativeDecision {
  id: string;
  category: CreativeDecisionCategory;
  label: string;     // "Visual treatment"
  value: string;     // "dreamlike_realism"
  rationale: string; // Why this was chosen
  provenance: DirectingDecisionProvenance;
  createdAt: string;
}

export interface HomerDirectingQuestion {
  category: CreativeDecisionCategory;
  label: string;
  question: string;
  explanation?: string;
  choices: DirectingChoice[];
}

export interface HomerDirectingNextResult {
  question: HomerDirectingQuestion | null; // null = directing is complete
  inferred: HomerCreativeDecision[];       // Homer-auto-resolved in this pass
  totalDecisions: number;
  isComplete: boolean;
}
