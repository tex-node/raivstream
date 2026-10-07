/**
 * Homer — Canon management.
 *
 * Wraps the decision-precedence model for canon facts.
 * USER_EXPLICIT always outranks HOMER_INFERENCE — a lower precedence value wins.
 * Existing canon facts from DB are treated as EXISTING_CANON (rank 2).
 */

import type { DecisionOwner, HomerCanonFact } from './types';
import { DECISION_PRECEDENCE } from './types';

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

/**
 * Attempt to set a canon fact.
 * Returns the updated list if the write was accepted, or the original list
 * if the incoming fact was blocked by a higher-precedence fact.
 */
export function setCanonFact(
  canon: HomerCanonFact[],
  incoming: Omit<HomerCanonFact, 'id' | 'establishedAt'>,
): { canon: HomerCanonFact[]; accepted: boolean; blockedBy?: HomerCanonFact } {
  const existing = canon.find((f) => f.label === incoming.label);

  if (existing) {
    const existingRank = DECISION_PRECEDENCE[existing.owner];
    const incomingRank = DECISION_PRECEDENCE[incoming.owner];

    // Lower number = higher priority. Refuse if existing outranks incoming.
    if (existingRank <= incomingRank) {
      return { canon, accepted: false, blockedBy: existing };
    }
    // Replace with the higher-priority incoming fact
    const updated = canon.map((f) =>
      f.label === incoming.label ? buildFact(incoming) : f,
    );
    return { canon: updated, accepted: true };
  }

  return { canon: [...canon, buildFact(incoming)], accepted: true };
}

function buildFact(f: Omit<HomerCanonFact, 'id' | 'establishedAt'>): HomerCanonFact {
  return {
    id: `canon_${f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
    label: f.label,
    value: f.value,
    owner: f.owner,
    establishedAt: new Date().toISOString(),
  };
}

/**
 * Merge incoming canon (e.g. from DB) into a new list, respecting precedence.
 * Existing facts with higher precedence block lower-precedence overwrites.
 */
export function mergeCanon(
  existing: HomerCanonFact[],
  incoming: HomerCanonFact[],
): HomerCanonFact[] {
  let result = [...existing];
  for (const fact of incoming) {
    const r = setCanonFact(result, { label: fact.label, value: fact.value, owner: fact.owner });
    result = r.canon;
  }
  return result;
}

/**
 * Convert user decisions (from InterpretStoryInput) to USER_EXPLICIT canon facts.
 */
export function userDecisionsToCanon(
  decisions: Array<{ label: string; value: unknown }>,
): HomerCanonFact[] {
  return decisions.map((d) => buildFact({ label: d.label, value: d.value, owner: 'USER_EXPLICIT' }));
}

/**
 * Get the effective value for a label, respecting precedence order.
 */
export function getCanonValue(canon: HomerCanonFact[], label: string): unknown {
  const fact = canon.find((f) => f.label === label);
  return fact?.value;
}

/**
 * Check if a label is locked by USER_EXPLICIT or USER_APPROVED.
 */
export function isUserLocked(canon: HomerCanonFact[], label: string): boolean {
  const fact = canon.find((f) => f.label === label);
  if (!fact) return false;
  return fact.owner === 'USER_EXPLICIT' || fact.owner === 'USER_APPROVED';
}

/**
 * Build Homer inference canon facts from story state.
 * These are low-precedence (HOMER_INFERENCE) and will not override user facts.
 */
export function buildHomerInferenceCanon(
  inferences: Array<{ label: string; value: unknown }>,
): HomerCanonFact[] {
  return inferences.map((d) => buildFact({ label: d.label, value: d.value, owner: 'HOMER_INFERENCE' }));
}
