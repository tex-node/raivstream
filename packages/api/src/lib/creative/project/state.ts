/**
 * Raivstream 5.0 — Project state machine + NextAction derivation.
 *
 * The backend owns project state; the frontend never guesses it. NextAction is
 * derived from status (and, where relevant, whether a bible exists).
 */

import {
  WORKSPACE_STAGE_LABEL,
  WORKSPACE_STAGES,
  type CreativeProjectStatus,
  type NextAction,
  type WorkspaceProgress,
  type WorkspaceStage,
} from '../shared/types';

export const CREATIVE_STATE_ORDER: CreativeProjectStatus[] = [
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
];

export const ALLOWED_TRANSITIONS: Record<CreativeProjectStatus, CreativeProjectStatus[]> = {
  IDEA: ['INTERPRETING'],
  INTERPRETING: ['PLANNING', 'PREVIEW'],
  PLANNING: ['PREVIEW', 'REFINING'],
  PREVIEW: ['DIRECTING', 'REFINING', 'APPROVED'],
  DIRECTING: ['GENERATING', 'PREVIEW'],
  GENERATING: ['REVIEW', 'PREVIEW'],
  REVIEW: ['REFINING', 'DIRECTING', 'APPROVED'],
  REFINING: ['PREVIEW', 'DIRECTING', 'GENERATING'],
  APPROVED: ['GENERATING', 'PUBLISHED', 'REFINING'],
  PUBLISHED: ['ARCHIVED', 'REFINING'],
  ARCHIVED: ['IDEA'],
};

export function canTransition(from: CreativeProjectStatus, to: CreativeProjectStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Backend-derived next action for a project. */
export function nextActionFor(
  status: CreativeProjectStatus,
  hasBible: boolean,
  hasPlan = false,
): NextAction {
  switch (status) {
    case 'IDEA':
    case 'INTERPRETING':
      return 'UNDERSTAND_INTENT';
    case 'PLANNING':
      return hasPlan ? 'REVIEW_PLAN' : 'BUILD_BIBLE';
    case 'PREVIEW':
      return 'APPROVE_PREVIEW';
    case 'DIRECTING':
    case 'GENERATING':
      return 'PRODUCE';
    case 'REVIEW':
      return 'REVIEW_OUTPUT';
    case 'REFINING':
      return 'DIRECT';
    case 'APPROVED':
      return 'APPROVE_OUTPUT';
    case 'PUBLISHED':
      return 'EXPORT';
    case 'ARCHIVED':
      return 'UNDERSTAND_INTENT';
  }
}

// ─── Progressive disclosure: creator-facing workspace stage ──────────────────

/**
 * Map the (technical) project status to the single creator-facing stage.
 * The creator never sees INTERPRETING/PLANNING/REFINING — only the meaningful
 * moment they are in. Advanced detail (bible/plan/versions) is optional.
 */
export function workspaceStageFor(
  status: CreativeProjectStatus,
  hasBible: boolean,
  hasPlan: boolean,
  hasVersion: boolean,
): WorkspaceStage {
  switch (status) {
    case 'IDEA':
    case 'INTERPRETING':
      return 'UNDERSTAND';
    case 'PLANNING':
      return hasPlan ? 'PLAN' : 'UNDERSTAND';
    case 'PREVIEW':
      return 'PREVIEW';
    case 'DIRECTING':
    case 'GENERATING':
      return 'PRODUCE';
    case 'REVIEW':
    case 'REFINING':
      return 'REVIEW';
    case 'APPROVED':
    case 'PUBLISHED':
    case 'ARCHIVED':
      return 'DELIVER';
  }
}

export function workspaceProgressFor(
  status: CreativeProjectStatus,
  hasBible: boolean,
  hasPlan: boolean,
  hasVersion: boolean,
): WorkspaceProgress {
  const stage = workspaceStageFor(status, hasBible, hasPlan, hasVersion);
  const index = WORKSPACE_STAGES.indexOf(stage);
  return {
    stage,
    label: WORKSPACE_STAGE_LABEL[stage],
    completed: WORKSPACE_STAGES.slice(0, index),
    hasBible,
    hasPlan,
    hasVersion,
  };
}