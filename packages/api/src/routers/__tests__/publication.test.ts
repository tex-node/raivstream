/**
 * Phase 4a — R16 publication lifecycle + feed/visibility filtering.
 * Mock-level: real router procedures via createCaller, prisma mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import { videoRouter } from '../video';
import { feedRouter } from '../feed';

type AnyFn = (args: any) => Promise<any>;

function makePrisma() {
  return {
    video: {
      findFirst: vi.fn<AnyFn>(),
      findUnique: vi.fn<AnyFn>(),
      findMany: vi.fn<AnyFn>(async () => []),
      update: vi.fn<AnyFn>(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'v1', ...data })),
    },
    analyticsEvent: { create: vi.fn<AnyFn>(async () => ({})) },
  };
}

const r16ctx = (prisma: unknown, userId = 'u1') => ({ user: { id: userId, role: 'USER' }, isR16: true, prisma }) as never;

const READY_ROW = {
  id: 'v1',
  creatorId: 'u1',
  status: 'READY',
  moderationStatus: 'PENDING',
  submittedForPublicationAt: null as Date | null,
  withdrawnAt: null as Date | null,
  moderationReason: null as string | null,
};

describe('submitForPublication', () => {
  it('succeeds for the owner of a READY video (leaves moderationStatus PENDING)', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await caller.submitForPublication({ videoId: 'v1' });
    const data = prisma.video.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.moderationStatus).toBe('PENDING');
    expect(data.submittedForPublicationAt).toBeInstanceOf(Date);
  });

  it('rejects a non-owner (NOT_FOUND)', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue(null);
    const caller = videoRouter.createCaller(r16ctx(prisma, 'someone-else'));
    await expect(caller.submitForPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a non-READY video', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW, status: 'PROCESSING' });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await expect(caller.submitForPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('rejects an already-submitted video', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW, submittedForPublicationAt: new Date() });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await expect(caller.submitForPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('withdrawPublication', () => {
  it('succeeds for the owner of a submitted video (sets withdrawnAt)', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW, submittedForPublicationAt: new Date() });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await caller.withdrawPublication({ videoId: 'v1' });
    const data = prisma.video.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.withdrawnAt).toBeInstanceOf(Date);
  });

  it('rejects a non-owner', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue(null);
    const caller = videoRouter.createCaller(r16ctx(prisma, 'someone-else'));
    await expect(caller.withdrawPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a video that was never submitted', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await expect(caller.withdrawPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('resubmitPublication', () => {
  it('succeeds from REJECTED (clears reason + withdrawnAt, back to PENDING)', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...{ ...READY_ROW, isKidsSafe: true }, moderationStatus: 'REJECTED', moderationReason: 'nope' });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await caller.resubmitPublication({ videoId: 'v1' });
    const data = prisma.video.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.moderationStatus).toBe('PENDING');
    expect(data.moderationReason).toBeNull();
    expect(data.withdrawnAt).toBeNull();
    expect(data.submittedForPublicationAt).toBeInstanceOf(Date);
  });

  it('succeeds from withdrawn', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW, submittedForPublicationAt: new Date(), withdrawnAt: new Date() });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await caller.resubmitPublication({ videoId: 'v1' });
    expect(prisma.video.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-owner', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue(null);
    const caller = videoRouter.createCaller(r16ctx(prisma, 'someone-else'));
    await expect(caller.resubmitPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a video that is neither rejected nor withdrawn', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ ...READY_ROW });
    const caller = videoRouter.createCaller(r16ctx(prisma));
    await expect(caller.resubmitPublication({ videoId: 'v1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('feed filtering', () => {
  it('R16 feed requires APPROVED and excludes withdrawn (so PENDING/REJECTED never appear)', async () => {
    const prisma = makePrisma();
    await feedRouter.createCaller({ prisma } as never).forYou({ kidsOnly: true, limit: 10 });
    const where = prisma.video.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.moderationStatus).toBe('APPROVED');
    expect(where.isKidsSafe).toBe(true);
    expect(where.withdrawnAt).toBeNull();
  });

  it('general feed excludes REJECTED and withdrawn', async () => {
    const prisma = makePrisma();
    await feedRouter.createCaller({ prisma } as never).forYou({ kidsOnly: false, limit: 10 });
    const where = prisma.video.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.moderationStatus).toEqual({ not: 'REJECTED' });
    expect(where.withdrawnAt).toBeNull();
  });

  it('creator grid (byCreator) excludes withdrawn', async () => {
    const prisma = makePrisma();
    await feedRouter.createCaller({ prisma } as never).byCreator({ creatorId: 'u1', limit: 10 });
    const where = prisma.video.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.withdrawnAt).toBeNull();
  });
});

describe('by-ID visibility (§3)', () => {
  it('non-owner/anonymous is restricted to APPROVED + public + not withdrawn + READY', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue(null);
    const caller = videoRouter.createCaller({ user: null, isR16: false, prisma } as never);
    await expect(caller.getById({ id: 'v1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const where = prisma.video.findFirst.mock.calls[0]![0].where as { OR: Array<Record<string, unknown>> };
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moderationStatus: 'APPROVED', isPublic: true, withdrawnAt: null, status: 'READY' }),
      ]),
    );
  });

  it('owner may read their own non-approved video (creatorId branch)', async () => {
    const prisma = makePrisma();
    prisma.video.findFirst.mockResolvedValue({ id: 'v1', title: 'Mine' });
    const caller = videoRouter.createCaller({ user: { id: 'u1', role: 'USER' }, isR16: false, prisma } as never);
    const v = await caller.getById({ id: 'v1' });
    expect(v).toMatchObject({ id: 'v1' });
    const where = prisma.video.findFirst.mock.calls[0]![0].where as { OR: Array<Record<string, unknown>> };
    expect(where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ creatorId: 'u1' })]));
  });
});
