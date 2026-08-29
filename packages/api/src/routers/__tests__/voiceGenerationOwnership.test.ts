import { describe, expect, it } from 'vitest';
import { ensureAudioCueOwnership } from '../story';

/**
 * Section 27.E — ownership. The service-layer idempotency/concurrency/take-
 * selection/R16 behaviors (Sections 27.F/I/J) that depend on the real DB
 * unique constraint and real transactional semantics are proven against
 * the actual database in the staging qualification (Sections 29-33) rather
 * than duplicated here against a mock — that is the more rigorous proof
 * for exactly those DB-constraint-dependent behaviors, matching this
 * project's own established preference for real execution over synthetic
 * mocks wherever practical.
 */
function prismaMock(cues: Array<{ id: string; projectId: string; track: { id: string; type: string; planId: string } }>) {
  return {
    storyProject: {
      findFirst: async ({ where }: any) => (cues.some((c) => c.projectId === where.id) || where.id === 'project-with-no-cues' ? { id: where.id, userId: where.userId } : null),
    },
    audioCue: {
      findFirst: async ({ where }: any) => {
        const cue = cues.find((c) => c.id === where.id && c.projectId === where.track.plan.projectId);
        if (!cue) return null;
        return { id: cue.id, track: cue.track };
      },
    },
  } as any;
}

describe('ensureAudioCueOwnership (Section 27.E)', () => {
  it('allows a cue that belongs to the caller\'s own project', async () => {
    const ctx = { prisma: prismaMock([{ id: 'cue-1', projectId: 'project-a', track: { id: 'track-1', type: 'DIALOGUE', planId: 'plan-1' } }]), user: { id: 'user-a' }, isR16: false };
    await expect(ensureAudioCueOwnership(ctx, 'project-a', 'cue-1')).resolves.toMatchObject({ id: 'cue-1' });
  });

  it('denies a cue that belongs to a different project (User B cannot generate speech for User A\'s cue)', async () => {
    const ctx = { prisma: prismaMock([{ id: 'cue-1', projectId: 'project-a', track: { id: 'track-1', type: 'DIALOGUE', planId: 'plan-1' } }]), user: { id: 'user-b' }, isR16: false };
    await expect(ensureAudioCueOwnership(ctx, 'project-b', 'cue-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('denies a cue id that does not exist at all', async () => {
    const ctx = { prisma: prismaMock([]), user: { id: 'user-a' }, isR16: false };
    await expect(ensureAudioCueOwnership(ctx, 'project-a', 'nonexistent-cue')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('denies R16 context entirely, before even checking the cue (Section 23/27.J)', async () => {
    const ctx = { prisma: prismaMock([{ id: 'cue-1', projectId: 'project-a', track: { id: 'track-1', type: 'DIALOGUE', planId: 'plan-1' } }]), user: { id: 'user-a' }, isR16: true };
    await expect(ensureAudioCueOwnership(ctx, 'project-a', 'cue-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
