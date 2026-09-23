/**
 * Raivstream 5.0 — Project state machine + NextAction derivation.
 *
 * The backend owns project state; the frontend never guesses it. NextAction is
 * derived from status (and, where relevant, whether a bible exists).
 */

import type { CreativeProjectStatus, NextAction } from '../shared/types';

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