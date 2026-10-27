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
    expect(result.stats.memberCount).toBe(1);
  });

  it('admin procedures are admin-gated, not open to creators', async () => {
    const prisma = makePrisma();

    await expect(caller(prisma, 'CREATOR').admin.listOrganizations())
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('org self-service (ORG_ADMIN only)', () => {
  function prismaFor(role: 'ORG_ADMIN' | 'ORG_MODERATOR' | 'STUDENT', userExists = true) {
    return {
      calls: [] as unknown[],
      organizationMember: {
        findFirst: vi.fn(async (args: unknown) => {
          (prismaFor as unknown as { lastArgs?: unknown }).lastArgs = args;
          return role === 'ORG_ADMIN' ? { role } : null;
        }),
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm-new', ...data })),
        update: vi.fn(async () => ({ id: 'm1', status: 'REMOVED' })),
      },
      user: {
        findUnique: vi.fn(async () => (userExists ? { id: 'u2', username: 'newbie', email: 'new@school.test' } : null)),
      },
    };
  }

  function asCaller(prisma: ReturnType<typeof prismaFor>) {
    return appRouter.createCaller({
      prisma: prisma as never,
      userId: 'u1',
      user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
    } as never);
  }

  it('rejects an ORG_MODERATOR - managing members is admin-level', async () => {
    const prisma = prismaFor('ORG_MODERATOR');
    await expect(
      asCaller(prisma).organization.addMember({ orgId: 'org-1', email: 'new@school.test', role: 'STUDENT' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows an ORG_ADMIN to add a member', async () => {
    const prisma = prismaFor('ORG_ADMIN');
    const result = await asCaller(prisma).organization.addMember({
      orgId: 'org-1', email: 'new@school.test', role: 'STUDENT',
    });

    expect(result.created).toBe(true);
    expect(prisma.organizationMember.create).toHaveBeenCalled();
  });

  it('does not create accounts for unknown emails', async () => {
    const prisma = prismaFor('ORG_ADMIN', false);
    await expect(
      asCaller(prisma).organization.addMember({ orgId: 'org-1', email: 'ghost@school.test', role: 'STUDENT' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(prisma.organizationMember.create).not.toHaveBeenCalled();
  });

  it('refuses to let an admin remove themselves', async () => {
    const prisma = prismaFor('ORG_ADMIN');
    await expect(
      asCaller(prisma).organization.removeMember({ orgId: 'org-1', userId: 'u1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
describe('organization invite codes', () => {
  function prismaFor(opts: {
    orgExists?: boolean;
    membership?: { role: string; status: string } | null;
  } = {}) {
    const { orgExists = true, membership = null } = opts;
    return {
      organization: {
        // Two different lookups share this method: slug availability (must be
        // null or createOrganization refuses) and invite-code redemption.
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if ('slug' in where) return null;
          return orgExists ? { id: 'org-1', name: 'Test School', slug: 'test-school' } : null;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'org-new', ...data })),
      },
      organizationMember: {
        findUnique: vi.fn(async () => membership),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm1', ...data })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm1', ...data })),
      },
    };
  }

  function asCaller(prisma: ReturnType<typeof prismaFor>, role: 'ADMIN' | 'CREATOR' = 'CREATOR') {
    return appRouter.createCaller({
      prisma: prisma as never,
      userId: 'u1',
      user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role },
    } as never);
  }

  it('makes the creating admin an ORG_ADMIN in the same write', async () => {
    const prisma = prismaFor();
    await asCaller(prisma, 'ADMIN').admin.createOrganization({ name: 'Test School', slug: 'test-school', type: 'SCHOOL' });

    const data = (prisma.organization.create.mock.calls[0] as [{ data: { members?: { create?: Record<string, unknown> } } }])[0].data;
    expect(data.members?.create).toMatchObject({ userId: 'u1', role: 'ORG_ADMIN', status: 'ACTIVE' });
  });

  it('rejects an unknown invite code', async () => {
    const prisma = prismaFor({ orgExists: false });
    await expect(asCaller(prisma).organization.joinWithCode({ code: 'nope-nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('joins as a STUDENT and is idempotent', async () => {
    const prisma = prismaFor();
    const first = await asCaller(prisma).organization.joinWithCode({ code: 'abc12345' });

    expect(first).toMatchObject({ slug: 'test-school', joined: true, role: 'STUDENT' });
    expect(prisma.organizationMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'STUDENT', status: 'ACTIVE' }),
    }));
  });

  it('does not resurrect a removed membership', async () => {
    const prisma = prismaFor({ membership: { role: 'STUDENT', status: 'REMOVED' } });
    await expect(asCaller(prisma).organization.joinWithCode({ code: 'abc12345' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(prisma.organizationMember.update).not.toHaveBeenCalled();
  });
});
describe('invite code rotation', () => {
  function prismaFor(isAdmin: boolean) {
    return {
      organizationMember: {
        findFirst: vi.fn(async () => (isAdmin ? { role: 'ORG_ADMIN' } : null)),
      },
      organization: {
        update: vi.fn(async ({ data }: { data: { inviteCode: string } }) => ({ inviteCode: data.inviteCode })),
      },
    };
  }

  function asCaller(prisma: ReturnType<typeof prismaFor>, role: 'ADMIN' | 'CREATOR' = 'CREATOR') {
    return appRouter.createCaller({
      prisma: prisma as never,
      userId: 'u1',
      user: { id: 'u1', email: 'a@b.test', username: 'u', displayName: 'U', role },
    } as never);
  }

  it('lets an ORG_ADMIN rotate the code to a new 12-char hex value', async () => {
    const prisma = prismaFor(true);
    const { inviteCode } = await asCaller(prisma).organization.regenerateInviteCode({ orgId: 'org-1' });

    expect(inviteCode).toMatch(/^[0-9a-f]{12}$/);
    expect(prisma.organization.update).toHaveBeenCalled();
  });

  it('lets a platform admin rotate a code for an org they do not belong to', async () => {
    const prisma = prismaFor(false);
    const { inviteCode } = await asCaller(prisma, 'ADMIN').organization.regenerateInviteCode({ orgId: 'org-1' });

    expect(inviteCode).toMatch(/^[0-9a-f]{12}$/);
  });

  it('rejects a plain member', async () => {
    const prisma = prismaFor(false);
    await expect(asCaller(prisma).organization.regenerateInviteCode({ orgId: 'org-1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});