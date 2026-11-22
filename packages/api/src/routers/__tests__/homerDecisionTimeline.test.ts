/**
 * The three write points (2026-11-22).
 *
 * `timeline.ts` could append, `profile.ts` could derive, and nothing called either: the table was live and empty. These tests
 * cover the wiring in the Homer router, because the interesting failures are wiring failures —
 *
 *   - a proposal written at acceptance time instead of when it is shown (a rejection then has nothing to point at);
 *   - an acceptance that forgets `supersedes` (the profile cannot tell a fresh decision from a replaced one);
 *   - a `projectId` accepted from the caller without checking the caller owns it (anyone writes into anyone's history);
 *   - the front door, which has no project yet, either throwing or writing an orphan row.
 *
 * The four-row loop at the end is the acceptance the plan asks for: propose → reject → propose → accept, then derive.
 */
import { describe, expect, it } from 'vitest';
import { creativeHomerRouter } from '../creative/homer';
import { proposeDirectingDecision } from '../../lib/homer/directing';
import { deriveCreatorProfile } from '../../lib/homer/profile';
import type { HomerStoryState } from '../../lib/homer/types';
import type { DecisionEvent } from '../../lib/homer/timeline';

const USER = { id: 'user_1', role: 'CREATOR' as const, username: 'creator' };

function claim<T>(value: T) {
  return { value, provenance: 'PROPOSED' as const };
}

function makeState(overrides: Partial<HomerStoryState> = {}): HomerStoryState {
  return {
    version: 'homer_v1',
    interpretedAt: '2026-11-22T00:00:00.000Z',
    storyText: 'A lighthouse keeper finds a bird that will not leave.',
    premise: claim('A keeper and a bird'),
    genre: claim('drama'),
    tone: claim('quiet'),
    themes: claim(['solitude']),
    emotionalDirection: claim('stillness → warmth'),
    audienceMode: 'GENERAL',
    entities: { characters: [], locations: [], objects: [] },
    relationships: [],
    beats: [],
    structuralArc: claim({ beginning: [], development: [], escalation: [], climax: [], consequence: [], resolution: [] }),
    threads: [],
    canon: [],
    complexity: {
      score: 1,
      level: 'SIMPLE' as const,
      factors: {
        characterCount: 0,
        locationCount: 0,
        beatCount: 0,
        threadCount: 0,
        temporalComplexity: 'linear' as const,
        relationshipComplexity: 0,
        narrativeLength: 'short' as const,
      },
      seriesCandidate: false,
    },
    episodeBoundaries: [],
    ...overrides,
  } as HomerStoryState;
}

/**
 * Only the tables these procedures touch. `at` advances by one second per row so ordering is deterministic without
 * depending on the wall clock.
 */
function fakeDb(ownedProjectIds: string[] = ['project_1']) {
  const events: DecisionEvent[] = [];
  let sequence = 0;

  const prisma = {
    creativeProject: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        ownedProjectIds.includes(where.id) && where.userId === USER.id ? { id: where.id } : null,
    },
    creativeBible: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
    homerDecisionEvent: {
      create: async ({ data }: { data: Omit<DecisionEvent, 'id' | 'at'> }) => {
        sequence += 1;
        const row = {
          ...data,
          id: `evt_${sequence}`,
          at: new Date(Date.UTC(2026, 10, 22, 9, 0, sequence)),
        } as DecisionEvent;
        events.push(row);
        return row;
      },
      findMany: async ({ where, take }: { where: { projectId: string }; take?: number }) =>
        events
          .filter((row) => row.projectId === where.projectId)
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .slice(0, take ?? 200),
    },
  };

  return { prisma, events };
}

function callerFor(prisma: unknown) {
  return creativeHomerRouter.createCaller({
    prisma,
    user: USER,
    isR16: false,
    ip: '127.0.0.1',
  } as never);
}

describe('proposeDecision records the proposal when it is shown', () => {
  it('appends one PROPOSED row and returns its id', async () => {
    const { prisma, events } = fakeDb();
    const caller = callerFor(prisma);
    const state = makeState();

    const result = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      category: 'VISUAL_TREATMENT',
      existingDecisions: [],
    });

    const expected = proposeDirectingDecision('VISUAL_TREATMENT', state, []);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectId: 'project_1',
      category: 'VISUAL_TREATMENT',
      label: expected.label,
      value: expected.value,
      provenance: 'HOMER_PROPOSAL',
      outcome: 'PROPOSED',
      supersedes: null,
    });
    expect(result.proposalEventId).toBe(events[0].id);
  });

  it('writes nothing before a project exists, and says so', async () => {
    const { prisma, events } = fakeDb();
    const caller = callerFor(prisma);

    const result = await caller.proposeDecision({
      storyState: makeState() as unknown as Record<string, unknown>,
      category: 'MOOD',
      existingDecisions: [],
    });

    expect(events).toHaveLength(0);
    expect(result.proposalEventId).toBeNull();
    expect(result.decision.category).toBe('MOOD');
  });

  it("refuses a project the caller does not own, and appends nothing", async () => {
    const { prisma, events } = fakeDb(['someone_elses_project']);
    const caller = callerFor(prisma);

    await expect(
      caller.proposeDecision({
        projectId: 'project_1',
        storyState: makeState() as unknown as Record<string, unknown>,
        category: 'VISUAL_TREATMENT',
        existingDecisions: [],
      }),
    ).rejects.toThrow(/Project not found/);
    expect(events).toHaveLength(0);
  });
});

describe('approveAndSave and rejectDecision record what the creator did', () => {
  it('an acceptance points at the proposal it came from', async () => {
    const { prisma, events } = fakeDb();
    const caller = callerFor(prisma);
    const state = makeState();

    const proposal = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      category: 'VISUAL_TREATMENT',
      existingDecisions: [],
    });

    await caller.approveAndSave({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      decisions: [
        {
          category: 'VISUAL_TREATMENT',
          label: proposal.decision.label,
          value: proposal.decision.value,
          rationale: proposal.decision.rationale,
          proposalEventId: proposal.proposalEventId,
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      outcome: 'ACCEPTED',
      provenance: 'USER_APPROVED',
      supersedes: proposal.proposalEventId,
      value: proposal.decision.value,
    });
  });

  it('a rejection keeps the proposal id, which is why proposals are written first', async () => {
    const { prisma, events } = fakeDb();
    const caller = callerFor(prisma);

    const proposal = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: makeState() as unknown as Record<string, unknown>,
      category: 'MOOD',
      existingDecisions: [],
    });

    await caller.rejectDecision({
      projectId: 'project_1',
      category: 'MOOD',
      label: proposal.decision.label,
      value: proposal.decision.value,
      rationale: 'Too cold for this one.',
      proposalEventId: proposal.proposalEventId,
    });

    expect(events[1]).toMatchObject({
      outcome: 'REJECTED',
      provenance: 'USER_EXPLICIT',
      supersedes: proposal.proposalEventId,
      rationale: 'Too cold for this one.',
    });
  });

  it('an explicit decision with no proposal supersedes nothing', async () => {
    const { prisma, events } = fakeDb();
    const caller = callerFor(prisma);

    await caller.approveAndSave({
      projectId: 'project_1',
      storyState: makeState() as unknown as Record<string, unknown>,
      decisions: [
        { category: 'PACING', label: 'Pacing', value: 'slow_burn', rationale: 'I want it slow.', provenance: 'USER_EXPLICIT' },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'ACCEPTED', provenance: 'USER_EXPLICIT', supersedes: null });
  });
});

describe('the loop the plan asks for', () => {
  it('propose, reject, propose, accept — four rows, two outcomes, and a profile that can read them', async () => {
    const { prisma, events } = fakeDb();
    const caller = callerFor(prisma);
    const state = makeState();

    // 1. Homer proposes a look; the creator declines it.
    const first = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      category: 'VISUAL_TREATMENT',
      existingDecisions: [],
    });
    await caller.rejectDecision({
      projectId: 'project_1',
      category: 'VISUAL_TREATMENT',
      label: first.decision.label,
      value: first.decision.value,
      rationale: 'Not this look.',
      proposalEventId: first.proposalEventId,
    });

    // 2. Homer proposes again; this time it is accepted.
    const second = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      category: 'VISUAL_TREATMENT',
      existingDecisions: [first.decision as never],
    });
    await caller.approveAndSave({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      decisions: [
        {
          category: 'VISUAL_TREATMENT',
          label: second.decision.label,
          value: second.decision.value,
          rationale: second.decision.rationale,
          proposalEventId: second.proposalEventId,
        },
      ],
    });

    expect(events.map((event) => event.outcome)).toEqual(['PROPOSED', 'REJECTED', 'PROPOSED', 'ACCEPTED']);
    expect(new Set(events.map((event) => event.outcome))).toEqual(new Set(['PROPOSED', 'REJECTED', 'ACCEPTED']));

    // Both decisions point at the proposal they answer — the rejection must, or the profile cannot count it.
    expect(events[1].supersedes).toBe(events[0].id);
    expect(events[3].supersedes).toBe(events[2].id);

    // The first real read of the timeline: one rejection, one acceptance, so the axis has evidence and a lean of 0.
    // VISUAL_TREATMENT is evidence for REVEAL (how much the image gives away) — the map had to be widened for Homer's own
    // categories before this could count at all.
    const profile = deriveCreatorProfile(events);
    expect(profile.empty).toBe(false);
    expect(profile.evidenceCount).toBe(2);
    const reveal = profile.axes.find((axis) => axis.axis === 'REVEAL')!;
    expect(reveal).toMatchObject({ accepted: 1, rejected: 1, lean: 0 });
    expect(reveal.because).toContain('in 1 of 2 decisions');
  });

  it('the timeline reader returns newest first, with what replaced each decision resolved', async () => {
    const { prisma } = fakeDb();
    const caller = callerFor(prisma);
    const state = makeState();

    const first = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      category: 'VISUAL_TREATMENT',
      existingDecisions: [],
    });
    const second = await caller.proposeDecision({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      category: 'VISUAL_TREATMENT',
      existingDecisions: [first.decision as never],
    });
    await caller.approveAndSave({
      projectId: 'project_1',
      storyState: state as unknown as Record<string, unknown>,
      decisions: [
        {
          category: 'VISUAL_TREATMENT',
          label: second.decision.label,
          value: second.decision.value,
          rationale: second.decision.rationale,
          proposalEventId: second.proposalEventId,
        },
      ],
    });

    const timeline = await caller.decisionTimeline({ projectId: 'project_1' });
    expect(timeline.events).toHaveLength(3);
    // Newest first.
    expect(timeline.events[0].outcome).toBe('ACCEPTED');
    expect(timeline.events[2].outcome).toBe('PROPOSED');
    // The accepted value is what replaced the earlier proposal.
    expect(timeline.events[2].replacedBy).toBe(second.decision.value);
  });
});
