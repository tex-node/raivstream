/**
 * Who is this creator? (2026-11-22)
 *
 * Homer's memory is a log plus a derivation, not a stored judgement. The log is `homer_decision_events` (append-only, one row per proposal,
 * acceptance and rejection). This file is the derivation: it reads the log and says which way the creator leans, with the evidence attached.
 *
 * Two rules make it a memory rather than a mood:
 *   - **Earned from acceptances and rejections, never from silence.** An ignored proposal moves nothing, because attention is not consent.
 *   - **Derived on read, never stored.** A materialised profile disagrees with the events the moment either changes; if this ever gets slow, cache
 *     it - do not make it the source of truth.
 */
export type ProfileAxis = 'STILLNESS' | 'CUT_RHYTHM' | 'REVEAL' | 'WARMTH';

export interface ProfileEvent {
  category: string;
  value: string;
  provenance: string;
  outcome: string;
  at: Date;
}

export interface AxisLean {
  axis: ProfileAxis;
  accepted: number;
  rejected: number;
  /** accepted - rejected, clipped to [-1, 1] by the counts it came from. */
  lean: number;
  /** One sentence a creator can read, naming the evidence. Never shown without it. */
  because: string;
}

export interface CreatorProfile {
  axes: AxisLean[];
  /** True when nothing has been accepted or rejected yet: the profile must not pretend to know anyone. */
  empty: boolean;
  evidenceCount: number;
}

const AXIS_OF_CATEGORY: Record<string, ProfileAxis> = {
  CAMERA: 'STILLNESS',
  MOVEMENT: 'STILLNESS',
  PACING: 'CUT_RHYTHM',
  EDIT: 'CUT_RHYTHM',
  EDITING: 'CUT_RHYTHM',
  FRAMING: 'REVEAL',
  LIGHTING: 'REVEAL',
  TONE: 'WARMTH',
  MOOD: 'WARMTH',
};

const AXES: ProfileAxis[] = ['STILLNESS', 'CUT_RHYTHM', 'REVEAL', 'WARMTH'];

const VERB: Record<ProfileAxis, string> = {
  STILLNESS: 'kept the camera still',
  CUT_RHYTHM: 'cut rather than held',
  REVEAL: 'withheld rather than showed',
  WARMTH: 'chose warmth',
};

/** Acceptances count for, rejections count against, everything else is ignored. */
export function deriveCreatorProfile(events: ProfileEvent[]): CreatorProfile {
  const tally = new Map<ProfileAxis, { accepted: number; rejected: number }>();
  for (const axis of AXES) tally.set(axis, { accepted: 0, rejected: 0 });
  let evidenceCount = 0;

  for (const event of events) {
    const axis = AXIS_OF_CATEGORY[event.category.toUpperCase()];
    if (!axis) continue;
    const bucket = tally.get(axis)!;
    if (event.outcome === 'ACCEPTED') { bucket.accepted += 1; evidenceCount += 1; }
    else if (event.outcome === 'REJECTED') { bucket.rejected += 1; evidenceCount += 1; }
  }

  const axes = AXES.map((axis) => {
    const { accepted, rejected } = tally.get(axis)!;
    const total = accepted + rejected;
    const lean = total === 0 ? 0 : (accepted - rejected) / total;
    return {
      axis,
      accepted,
      rejected,
      lean,
      because: total === 0
        ? 'Nothing decided yet on this axis.'
        : `You ${VERB[axis]} in ${accepted} of ${total} decisions.`,
    };
  });

  return { axes, empty: evidenceCount === 0, evidenceCount };
}
