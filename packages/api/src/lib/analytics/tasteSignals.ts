/**
 * Taste signals — the instrumentation Homer's style profile needs (2026-11-16).
 *
 * The profile itself is deferred; this is the prerequisite, and it is useful on its own as prompt-quality
 * analytics. Four events, and the JOIN KEY matters more than the payload: an `accepted` that cannot be matched
 * to the `shown` it accepted is a count, not a signal, and a profile learned from counts is the twenty-second
 * rule with a taste label.
 *
 * Two constraints from the arc:
 *  - **No story text is logged.** `AnalyticsEvent` is not the place for a creator's writing, so a suggestion is
 *    identified by a stable hash (`suggestion_key`) and by lengths, never by content.
 *  - **Dismissal is not the same as never-seen.** A suggestion that disappears without an explicit dismissal was
 *    never rejected; it was not acted on. Only a real dismiss emits `suggestion_rejected`.
 */
import { createHash } from 'node:crypto';
import { axisForSuggestion, type StyleAxis } from './styleAxes';
import type { PrismaClient } from '@raivstream/database';
import { trackAnalyticsEvent } from '../analytics';

export const TASTE_EVENTS = [
  'suggestion_shown',
  'suggestion_accepted',
  'suggestion_rejected',
  'text_edited',
] as const;

export type TasteEventName = (typeof TASTE_EVENTS)[number];

/** Where the suggestion came from - the dimension a style profile would eventually segment on. */
export const TASTE_KINDS = ['rewrite', 'question', 'director'] as const;
export type TasteKind = (typeof TASTE_KINDS)[number];

export const TASTE_SURFACES = ['paragraph_rewrite', 'chapter_edit', 'director_instruction'] as const;
export type TasteSurface = (typeof TASTE_SURFACES)[number];

/** Stable identity for a suggestion: the same text yields the same key, and the text itself is not stored. */
export function suggestionKey(kind: TasteKind, text: string): string {
  const hash = createHash('sha256').update(`${kind}\u0000${text.trim()}`).digest('hex').slice(0, 16);
  return `${kind}:${hash}`;
}

export interface TasteSignal {
  eventName: TasteEventName;
  properties: {
    /** Joins accepted/rejected to the shown event. */
    suggestionKey?: string;
    kind?: TasteKind;
    surface?: TasteSurface;
    /** Lengths only - never the text. */
    textLength?: number;
    /** Which style axis this suggestion moves (2026-11-16). Part of the join: same text, different axis is a different suggestion. */
    axis?: StyleAxis;
    beforeLength?: number;
    afterLength?: number;
  };
}

export function shownSignal(kind: TasteKind, text: string, label?: string): TasteSignal {
  return {
    eventName: 'suggestion_shown',
    properties: {
      suggestionKey: suggestionKey(kind, text),
      kind,
      textLength: text.trim().length,
      axis: label ? axisForSuggestion(kind, label) : 'unclassified',
    },
  };
}

export function acceptedSignal(kind: TasteKind, text: string, label?: string): TasteSignal {
  return {
    eventName: 'suggestion_accepted',
    properties: {
      suggestionKey: suggestionKey(kind, text),
      kind,
      axis: label ? axisForSuggestion(kind, label) : 'unclassified',
    },
  };
}

/** Only an explicit dismissal emits this; a suggestion that was merely never used emits nothing. */
export function rejectedSignal(kind: TasteKind, text: string, reason?: string): TasteSignal {
  return {
    eventName: 'suggestion_rejected',
    properties: {
      suggestionKey: suggestionKey(kind, text),
      kind,
      textLength: text.trim().length,
      axis: 'unclassified' as StyleAxis,
      ...(reason ? { reason } : {}),
    } as TasteSignal['properties'] & { reason?: string },
  };
}

export function editedSignal(surface: TasteSurface, beforeLength: number, afterLength: number): TasteSignal {
  return { eventName: 'text_edited', properties: { surface, beforeLength, afterLength } };
}

/**
 * Write one taste signal. Reuses `AnalyticsEvent.properties` (structured JSON, already indexed by name and time)
 * rather than adding a table: the profile phase will force a schema decision if it needs one, and inventing it
 * before the signals are known to be useful is how schemas become unreadable.
 */
export async function trackTasteSignal(
  prisma: PrismaClient,
  input: {
    userId: string;
    projectId: string | null;
    eventName: TasteEventName;
    properties: TasteSignal['properties'] & { reason?: string; hint?: string; axis?: StyleAxis };
  },
): Promise<void> {
  // The axis is resolved HERE from the product label, so the mapping lives in one place and the hint itself is
  // never stored - only the axis it mapped to.
  const { hint, ...rest } = input.properties;
  const axis = rest.axis ?? (hint && rest.kind ? axisForSuggestion(rest.kind, hint) : 'unclassified');
  await trackAnalyticsEvent(prisma, {
    userId: input.userId,
    projectId: input.projectId ?? undefined,
    event: input.eventName,
    properties: { ...rest, axis },
  });
}
