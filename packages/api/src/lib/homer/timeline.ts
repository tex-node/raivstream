/**
 * The decision timeline (2026-11-22).
 *
 * Homer's current state is a JSON array that gets overwritten, so it cannot answer "what did Homer propose, what did the creator reject, and what
 * replaced what". These helpers write and read the append-only record beside it. Every write is an event; nothing is ever updated in place, because
 * a history you can edit is not a history.
 */
import type { CreativeDecisionCategory } from './directingTypes';

export type DecisionProvenance = 'USER_EXPLICIT' | 'USER_APPROVED' | 'HOMER_INFERENCE' | 'HOMER_PROPOSAL';
export type DecisionOutcome = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'REPLACED';

export interface DecisionEvent {
  id: string;
  projectId: string;
  category: CreativeDecisionCategory;
  label: string;
  value: string;
  rationale: string;
  provenance: DecisionProvenance;
  outcome: DecisionOutcome;
  supersedes: string | null;
  at: Date;
}

export interface TimelinePrisma {
  homerDecisionEvent: {
    create(args: { data: Omit<DecisionEvent, 'id' | 'at'> }): Promise<DecisionEvent>;
    findMany(args: { where: { projectId: string }; orderBy: { at: 'asc' | 'desc' }; take?: number }): Promise<DecisionEvent[]>;
  };
}

/** Append one event. The caller decides the outcome; this function never guesses one. */
export async function appendDecisionEvent(
  prisma: TimelinePrisma,
  event: Omit<DecisionEvent, 'id' | 'at'>,
): Promise<DecisionEvent> {
  return prisma.homerDecisionEvent.create({ data: event });
}

/** Record a Homer proposal, so a rejection later has something to point at. */
export async function recordProposal(prisma: TimelinePrisma, input: Omit<DecisionEvent, 'id' | 'at' | 'outcome' | 'supersedes'>) {
  return appendDecisionEvent(prisma, { ...input, outcome: 'PROPOSED', supersedes: null });
}

/** Accept a proposal: the acceptance points at the proposal it came from. */
export async function recordAcceptance(prisma: TimelinePrisma, input: Omit<DecisionEvent, 'id' | 'at' | 'outcome'>) {
  return appendDecisionEvent(prisma, { ...input, outcome: 'ACCEPTED' });
}

/** Reject a proposal. The rejection keeps the proposal id, which is why proposals are written first. */
export async function recordRejection(prisma: TimelinePrisma, input: Omit<DecisionEvent, 'id' | 'at' | 'outcome'>) {
  return appendDecisionEvent(prisma, { ...input, outcome: 'REJECTED' });
}

/**
 * The timeline, newest first, with each event's *replacement* resolved: a decision in the same category that came after it and was accepted.
 * Derived rather than stored, so it cannot drift out of agreement with the events themselves.
 */
export async function loadDecisionTimeline(prisma: TimelinePrisma, projectId: string, take = 200): Promise<Array<DecisionEvent & { replacedBy: string | null }>> {
  const events = await prisma.homerDecisionEvent.findMany({ where: { projectId }, orderBy: { at: 'asc' }, take });
  const accepted = events.filter((event) => event.outcome === 'ACCEPTED');
  return events
    .map((event) => {
      const successor = accepted.find((candidate) => candidate.category === event.category && candidate.at > event.at);
      return { ...event, replacedBy: successor ? successor.value : null };
    })
    .reverse();
}
