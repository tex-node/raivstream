import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * D-004 Phase 1 - organization scoping.
 *
 * The properties that matter are authorization and non-leakage: a member of one
 * org must never see another org's students or videos, and a STUDENT membership
 * must not grant roster access at all.
 */

function makePrisma(opts: {
  membership?: { id: string; organizationId: string; userId: string; role: string } | null;
  students?: string[];
  videos?: unknown[];
  exports?: unknown[];
} = {}) {
  const calls: Record<string, unknown[]> = { video: [], storyVideoExport: [], organizationMember: [] };

  const prisma = {
    calls,
    organizationMember: {
      findFirst: vi.fn(async (args: unknown) => {
        calls.organizationMember.push(args);
        return opts.membership ?? null;
      }),
      findMany: vi.fn(async () => (opts.students ?? []).map((userId) => ({ userId }))),
    },
    organization: {
      findUnique: vi.fn(async () => ({ id: 'org-1', name: 'Test School', slug: 'test-school', type: 'SCHOOL' })),
    },
    video: {
      count: vi.fn(async () => 3),
      findMany: vi.fn(async (args: unknown) => {
        calls.video.push(args);
        return opts.videos ?? [];
      }),
    },
    storyVideoExport: {
      count: vi.fn(async () => 7),
      findMany: vi.fn(async (args: unknown) => {
        calls.storyVideoExport.push(args);
        return opts.exports ?? [];
      }),
    },
    user: { findMany: vi.fn(async () => [{ id: 's1', username: 'student-one' }]) },
  };

  return prisma;
}

function caller(prisma: ReturnType<typeof makePrisma>, role: 'CREATOR' | 'ADMIN' = 'CREATOR') {
  return appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    user: { id: 'u1', email: 'm@school.test', username: 'mod', displayName: 'Mo', role },
  } as never);
}

describe('organization scoping', () => {
  it('rejects a caller with no membership of the requested org', async () => {
    const prisma = makePrisma({ membership: null });

    await expect(caller(prisma).organization.getDashboard({ orgId: 'org-2' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a STUDENT membership - membership is not authorization to see the roster', async () => {
    // The middleware's where clause filters role IN (ORG_ADMIN, ORG_MODERATOR),
    // so a STUDENT row yields no membership.
    const prisma = makePrisma({ membership: null });

    await expect(caller(prisma).organization.listStudents({ orgId: 'org-1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    const args = prisma.calls.organizationMember[0] as {
      where: { organizationId: string; userId: string; status: string; role: { in: string[] } };
    };
    expect(args.where).toMatchObject({
      organizationId: 'org-1',
      userId: 'u1',
      status: 'ACTIVE',
      role: { in: ['ORG_ADMIN', 'ORG_MODERATOR'] },
    });
  });

  it('scopes every video query to the org\u2019s own students', async () => {
    const prisma = makePrisma({
      membership: { id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'ORG_MODERATOR' },
      students: ['s1', 's2'],
    });

    await caller(prisma).organization.listVideos({ orgId: 'org-1', limit: 10 });

    for (const call of prisma.calls.video) {
      expect((call as { where: { creatorId: { in: string[] } } }).where.creatorId.in).toEqual(['s1', 's2']);
    }
    for (const call of prisma.calls.storyVideoExport) {
      expect((call as { where: { userId: { in: string[] } } }).where.userId.in).toEqual(['s1', 's2']);
    }
  });

  it('passes the moderation filter through to the published query', async () => {
    const prisma = makePrisma({
      membership: { id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'ORG_ADMIN' },
      students: ['s1'],
    });

    await caller(prisma).organization.listVideos({ orgId: 'org-1', moderationStatus: 'PENDING', limit: 10 });

    expect((prisma.calls.video[0] as { where: { moderationStatus?: string } }).where.moderationStatus).toBe('PENDING');
  });

  it('returns both sources in the dashboard stats (published + exports)', async () => {
    const prisma = makePrisma({
      membership: { id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'ORG_MODERATOR' },
      students: ['s1'],
    });

    const result = await caller(prisma).organization.getDashboard({ orgId: 'org-1' });

    expect(result.stats.publishedCount).toBe(3);
    expect(result.stats.exportCount).toBe(7);
    expect(result.stats.studentCount).toBe(1);
  });

  it('admin procedures are admin-gated, not open to creators', async () => {
    const prisma = makePrisma();

    await expect(caller(prisma, 'CREATOR').admin.listOrganizations())
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
