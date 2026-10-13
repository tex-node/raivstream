/**
 * Phase 4b — share link procedures (create/revoke/list/resolve) + schema invariant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: vi.fn(async () => ({ allowed: true, flagged: false, categories: [], scores: {} })),
  moderationRejectMessage: vi.fn(() => 'rejected'),
  suggestSafeRewrite: vi.fn(async () => null),
}));
vi.mock('../../lib/analytics', () => ({ analytics: { track: vi.fn(async () => undefined) } }));

import { storyRouter } from '../story';
import { Prisma } from '@raivstream/database';

const VIDEO = {
  id: 'v1', status: 'READY', isPublic: true, withdrawnAt: null as Date | null,
  moderationStatus: 'APPROVED', isKidsSafe: true,
};

function makePrisma(over: Partial<typeof VIDEO> = {}) {
  const video = { ...VIDEO, ...over };
  const links: any[] = [];
  const attributions: any[] = [];
  return {
    video: { findFirst: vi.fn(async () => ({ ...video, creator: { username: 'ada', displayName: 'Ada', avatarUrl: null } })) },
    shareLink: {
      findFirst: vi.fn(async ({ where }: any) => links.find((l) => (!where.videoId || l.videoId === where.videoId) && (!where.sharerId || l.sharerId === where.sharerId) && (where.revokedAt !== null || !l.revokedAt)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => links.find((l) => l.token === where.token) ?? null),
      findMany: vi.fn(async () => links),
      create: vi.fn(async ({ data }: any) => { const row = { id: `l${links.length + 1}`, createdAt: new Date(), revokedAt: null, ...data }; links.push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const l = links.find((x) => x.id === where.id); Object.assign(l, data); return l; }),
    },
    shareAttribution: {
      create: vi.fn(async ({ data }: any) => { attributions.push(data); return data; }),
    },
    __links: links,
    __attributions: attributions,
  };
}

const ctx = (prisma: unknown, userId: string | null) => ({ user: userId ? { id: userId, role: 'USER' } : null, isR16: false, prisma }) as never;

beforeEach(() => vi.clearAllMocks());

describe('createShareLink', () => {
  it('creates a token for the owner of an approved, live, KIDS video', async () => {
    const prisma = makePrisma();
    const res = await storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' });
    expect(res.token).toBeTruthy();
    expect(res.url).toContain(res.token);
    expect(prisma.shareLink.create).toHaveBeenCalledTimes(1);
  });

  it('is idempotent per (videoId, sharerId) — reuses a non-revoked link', async () => {
    const prisma = makePrisma();
    const caller = storyRouter.createCaller(ctx(prisma, 'u1'));
    const a = await caller.createShareLink({ videoId: 'v1' });
    const b = await caller.createShareLink({ videoId: 'v1' });
    expect(b.token).toBe(a.token);
    expect(prisma.shareLink.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-APPROVED video', async () => {
    const prisma = makePrisma({ moderationStatus: 'PENDING' });
    await expect(storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('rejects a non-KIDS (non-R16) video', async () => {
    const prisma = makePrisma({ isKidsSafe: false });
    await expect(storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('rejects a withdrawn video', async () => {
    const prisma = makePrisma({ withdrawnAt: new Date() });
    await expect(storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('revokeShareLink', () => {
  it('is idempotent', async () => {
    const prisma = makePrisma();
    const caller = storyRouter.createCaller(ctx(prisma, 'u1'));
    const { token } = await caller.createShareLink({ videoId: 'v1' });
    await caller.revokeShareLink({ token });
    await caller.revokeShareLink({ token });
    expect(prisma.shareLink.update).toHaveBeenCalledTimes(1);
  });
});

describe('resolveShareLink', () => {
  it('writes an anonymous attribution (viewerUserId null) and returns the OWNER handle', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' });
    const token = prisma.__links[0].token as string;

    const res = await storyRouter.createCaller(ctx(prisma, null)).resolveShareLink({ token });
    expect(prisma.__attributions[0]).toEqual({ shareLinkId: prisma.__links[0].id, viewerUserId: null });
    expect(res.creatorHandle).toBe('ada'); // owner, never the sharer
    expect('sharerId' in res).toBe(false);
  });

  it('writes a signed-in attribution (viewerUserId = user id)', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' });
    const token = prisma.__links[0].token as string;
    await storyRouter.createCaller(ctx(prisma, 'viewer-9')).resolveShareLink({ token });
    expect(prisma.__attributions[0]).toEqual({ shareLinkId: prisma.__links[0].id, viewerUserId: 'viewer-9' });
  });

  it('404s a revoked link', async () => {
    const prisma = makePrisma();
    const owner = storyRouter.createCaller(ctx(prisma, 'u1'));
    const { token } = await owner.createShareLink({ videoId: 'v1' });
    await owner.revokeShareLink({ token });
    await expect(storyRouter.createCaller(ctx(prisma, null)).resolveShareLink({ token })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('404s a withdrawn video and writes NO attribution', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma, 'u1')).createShareLink({ videoId: 'v1' });
    const token = prisma.__links[0].token as string;
    prisma.video.findFirst = vi.fn(async () => null) as never; // not APPROVED+public+live
    await expect(storyRouter.createCaller(ctx(prisma, null)).resolveShareLink({ token })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.__attributions).toHaveLength(0);
  });
});

describe('schema invariant', () => {
  it('ShareAttribution has NO ip field', () => {
    const model = (Prisma as unknown as { dmmf: { datamodel: { models: Array<{ name: string; fields: Array<{ name: string }> }> } } })
      .dmmf.datamodel.models.find((m) => m.name === 'ShareAttribution');
    expect(model).toBeTruthy();
    const names = model!.fields.map((f) => f.name.toLowerCase());
    expect(names).not.toContain('ip');
    expect(names).not.toContain('ipaddress');
    expect(names).toEqual(expect.arrayContaining(['sharelinkid', 'vieweruserid', 'createdat']));
  });
});
