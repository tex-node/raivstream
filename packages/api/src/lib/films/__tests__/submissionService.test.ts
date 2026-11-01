import { describe, expect, it, vi } from 'vitest';
import { filmmakerByUsername, listApprovedFilms, reviewFilm, submitFilm } from '../submissionService';

const ON = { FILMS_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv;
const OFF = {} as unknown as NodeJS.ProcessEnv;

const READY_VIDEO = { id: 'video-1', status: 'READY', moderationStatus: 'APPROVED', title: 'A film' };
const TERMS = [
  { id: 'terms-1', shareBps: 500, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
];

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    video: { findFirst: vi.fn(async () => READY_VIDEO), update: vi.fn(), updateMany: vi.fn() },
    revenueTerms: { findMany: vi.fn(async () => TERMS) },
    filmSubmission: {
      create: vi.fn(async ({ data }: any) => ({ id: 'sub-1', ...data })),
      findUnique: vi.fn(async () => ({ id: 'sub-1', status: 'PENDING', videoId: 'video-1', acceptedRevenueTermsId: 'terms-1' })),
      update: vi.fn(async ({ data }: any) => ({ id: 'sub-1', ...data })),
      findMany: vi.fn(async () => []),
    },
    user: { findFirst: vi.fn(async () => null) },
    ...overrides,
  } as any;
}

describe('submission — the pin happens at submit, not at approval', () => {
  it('pins the terms in force when the filmmaker submits', async () => {
    const prisma = prismaMock();
    const submission = await submitFilm(prisma, { userId: 'u1', videoId: 'video-1' }, ON);
    expect(submission.acceptedRevenueTermsId).toBe('terms-1');
    expect(prisma.filmSubmission.create).toHaveBeenCalledTimes(1);
  });

  it('pins the terms the submitter was shown when one is supplied', async () => {
    const prisma = prismaMock();
    const submission = await submitFilm(prisma, { userId: 'u1', videoId: 'video-1', termsId: 'terms-1' }, ON);
    expect(submission.acceptedRevenueTermsId).toBe('terms-1');
  });

  it('refuses to submit when no terms are in force', async () => {
    const prisma = prismaMock({ revenueTerms: { findMany: vi.fn(async () => []) } });
    await expect(submitFilm(prisma, { userId: 'u1', videoId: 'video-1' }, ON)).rejects.toThrow(/No revenue terms/);
  });

  it('is inert when FILMS_ENABLED is not armed in this process', async () => {
    const prisma = prismaMock();
    await expect(submitFilm(prisma, { userId: 'u1', videoId: 'video-1' }, OFF)).rejects.toThrow(/not enabled/);
    expect(prisma.filmSubmission.create).not.toHaveBeenCalled();
  });
});

describe('review — approval is not publication', () => {
  it('approving a submission never writes to the video', async () => {
    const prisma = prismaMock();
    const updated = await reviewFilm(prisma, { submissionId: 'sub-1', reviewerId: 'admin-1', action: 'APPROVE' }, ON);
    expect(updated.status).toBe('APPROVED');
    // The assertion that keeps this queue from being a moderation bypass.
    expect(prisma.video.update).not.toHaveBeenCalled();
    expect(prisma.video.updateMany).not.toHaveBeenCalled();
  });

  it('rejects without a reason — a decline trail must say why', async () => {
    const prisma = prismaMock();
    await expect(reviewFilm(prisma, { submissionId: 'sub-1', reviewerId: 'admin-1', action: 'REJECT' }, ON))
      .rejects.toThrow(/decline reason is required/);
    expect(prisma.filmSubmission.update).not.toHaveBeenCalled();
  });

  it('rejects with a reason and records reviewer and timestamp', async () => {
    const prisma = prismaMock();
    const updated = await reviewFilm(prisma, { submissionId: 'sub-1', reviewerId: 'admin-1', action: 'REJECT', reason: 'Audio dropout at 00:42.' }, ON);
    expect(updated.status).toBe('REJECTED');
    expect(updated.declineReason).toContain('Audio dropout');
    expect(updated.reviewedById).toBe('admin-1');
    expect(updated.reviewedAt).toBeInstanceOf(Date);
    expect(prisma.video.update).not.toHaveBeenCalled();
  });
});

describe('attribution — derived from the profile join, never copied', () => {
  it('reads the display name from the profile at request time', async () => {
    const prisma = prismaMock({
      user: { findFirst: vi.fn(async () => ({ id: 'u1', username: 'ada', displayName: 'Ada O.', creatorProfile: { displayName: 'Ada Obi', bio: null, avatarUrl: null, socialLinks: null, isVerified: true } })) },
    });
    const filmmaker = await filmmakerByUsername(prisma, 'ada', ON);
    expect(filmmaker?.displayName).toBe('Ada Obi');
  });

  it('renaming the profile changes attribution without touching a video row', async () => {
    // Same user, renamed profile. The service must return the new name and must not
    // have issued any video write to get there.
    const prisma = prismaMock({
      user: { findFirst: vi.fn(async () => ({ id: 'u1', username: 'ada', displayName: 'Ada O.', creatorProfile: { displayName: 'Ada Obi-Nwosu', bio: null, avatarUrl: null, socialLinks: null, isVerified: true } })) },
    });
    const filmmaker = await filmmakerByUsername(prisma, 'ada', ON);
    expect(filmmaker?.displayName).toBe('Ada Obi-Nwosu');
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it('falls back to the account name when no profile exists', async () => {
    const prisma = prismaMock({
      user: { findFirst: vi.fn(async () => ({ id: 'u1', username: 'ada', displayName: 'Ada O.', creatorProfile: null })) },
    });
    expect((await filmmakerByUsername(prisma, 'ada', ON))?.displayName).toBe('Ada O.');
  });

  it('watch and filmmaker surfaces are inert when the flag is off', async () => {
    const prisma = prismaMock();
    expect(await listApprovedFilms(prisma, OFF)).toEqual([]);
    expect(await filmmakerByUsername(prisma, 'ada', OFF)).toBeNull();
  });
});
