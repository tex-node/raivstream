import { describe, expect, it } from 'vitest';
import { appendDecisionEvent, loadDecisionTimeline, recordAcceptance, recordProposal, recordRejection } from '../timeline';

const BASE = new Date('2026-11-22T10:00:00Z');
const at = (minutes: number) => new Date(BASE.getTime() + minutes * 60_000);

function fakePrisma() {
  const rows: any[] = [];
  return {
    rows,
    homerDecisionEvent: {
      create: async ({ data }: any) => {
        const row = { ...data, id: 'ev' + (rows.length + 1), at: at(rows.length) };
        rows.push(row);
        return row;
      },
      findMany: async ({ where, orderBy }: any) => {
        const filtered = rows.filter((row) => row.projectId === where.projectId);
        return orderBy.at === 'asc' ? filtered.slice() : filtered.slice().reverse();
      },
    },
  };
}

const base: any = { projectId: 'p1', category: 'CAMERA', label: 'Camera', value: 'wide, locked off', rationale: 'the Keaton read' };

describe('the decision timeline', () => {
  it('writes a proposal before it can be rejected', async () => {
    const prisma = fakePrisma();
    const proposal = await recordProposal(prisma as never, { ...base, provenance: 'HOMER_PROPOSAL' });
    expect(proposal.outcome).toBe('PROPOSED');
    const rejection = await recordRejection(prisma as never, { ...base, provenance: 'USER_EXPLICIT', supersedes: proposal.id });
    expect(rejection.outcome).toBe('REJECTED');
    expect(rejection.supersedes).toBe(proposal.id);
  });

  it('never edits a row: three outcomes are three events', async () => {
    const prisma = fakePrisma();
    await recordProposal(prisma as never, { ...base, provenance: 'HOMER_PROPOSAL' });
    await recordAcceptance(prisma as never, { ...base, provenance: 'USER_APPROVED', supersedes: 'ev1' });
    await appendDecisionEvent(prisma as never, { ...base, value: 'handheld', provenance: 'USER_EXPLICIT', outcome: 'ACCEPTED', supersedes: 'ev2' });
    expect(prisma.rows).toHaveLength(3);
    expect(prisma.rows.map((row) => row.outcome)).toEqual(['PROPOSED', 'ACCEPTED', 'ACCEPTED']);
  });

  it('resolves what replaced what, from the events rather than a stored field', async () => {
    const prisma = fakePrisma();
    await recordProposal(prisma as never, { ...base, provenance: 'HOMER_PROPOSAL' });
    await recordAcceptance(prisma as never, { ...base, value: 'handheld', provenance: 'USER_EXPLICIT', supersedes: null });
    const timeline = await loadDecisionTimeline(prisma as never, 'p1');
    // newest first
    expect(timeline[0]!.value).toBe('handheld');
    // the proposal was replaced by the later accepted decision in the same category
    expect(timeline[1]!.replacedBy).toBe('handheld');
    // and the newest has no successor
    expect(timeline[0]!.replacedBy).toBeNull();
  });

  it('is scoped to one project', async () => {
    const prisma = fakePrisma();
    await recordProposal(prisma as never, { ...base, provenance: 'HOMER_PROPOSAL' });
    await recordProposal(prisma as never, { ...base, projectId: 'p2', provenance: 'HOMER_PROPOSAL' });
    expect(await loadDecisionTimeline(prisma as never, 'p1')).toHaveLength(1);
  });
});
