/**
 * Raivstream 5.0 — Director domain types (§37 contract).
 *
 * The Director is a semantic control system, not a chatbot. Every directive
 * yields CHANGE + PRESERVE + IMPACT. The Director never generates — it hands
 * off to the ProductionService.
 */

import type { EntityReference } from '../review/types';

export const DIRECTIVE_SCOPES = ['PROJECT', 'STORY', 'CHARACTER', 'WORLD', 'SCENE', 'SHOT', 'AUDIO', 'VISUAL', 'BRAND', 'OUTPUT'] as const;
export type DirectiveScope = (typeof DIRECTIVE_SCOPES)[number];

export const DIRECTIVE_MODES = ['DIRECT', 'EXPLORE', 'REVIEW'] as const;
export type DirectiveMode = (typeof DIRECTIVE_MODES)[number];

export const IMPACT_LEVELS = ['NONE', 'LOCAL', 'MULTI_SCENE', 'PROJECT', 'OUTPUT'] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export interface CreativeChange {
  scope: DirectiveScope;
  field: string;
  from?: unknown;
  to: unknown;
}

export interface ProductionChange {
  target: string;
  description: string;
}

export interface DirectorDecision {
  interpretation: string;
  directive: {
    instruction: string;
    intent: string;
    scope: DirectiveScope;
  };
  affectedEntities: EntityReference[];
  preservedEntities: EntityReference[];
  creativeChanges: CreativeChange[];
  productionChanges: ProductionChange[];
  continuityImplications: Array<{ type: string; description: string }>;
  approvalRequired: boolean;
  executionPlan: Array<{ step: string; service: string }>;
  impact: ImpactLevel;
  explanation?: string;
}

export interface DirectiveInternal {
  mode: DirectiveMode;
  intent: string;
  scope: DirectiveScope;
  changes: CreativeChange[];
  preserves: string[];
  impact: ImpactLevel;
  affectedSceneIndices: number[];
  exploreCount?: number;
  executionPlan: DirectorDecision['executionPlan'];
}