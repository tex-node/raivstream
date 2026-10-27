import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@raivstream/database';
import { appRouter } from '../../index';

/**
 * D-004 Phase 2 - nominations.
 *
 * The invariant under test: `targetType` must agree with which target actually
 * exists, the target's owner must be an ACTIVE member of the nominating org, and
 * a repeat nomination is a CONFLICT rather than a 500.
 */

type MockOpts = {
  videoOwner?: string | null;
  exportOwner?: string | null;
  orgMemberIds?: string[];
  categoryActive?: boolean;
  createThrowsP2002?: boolean;
};

function makePrisma(opts: MockOpts = {}) {
  const {
    videoOwner = 's1',
    exportOwner = 's1',
    orgMemberIds = ['s1', 's2'],
    categoryActive = true,
    createThrowsP2002 = false,
  } = opts;

  return {
    awardCategory: {
      findUnique: vi.fn(async () => ({ id: 'cat-1', isActive: categoryActive })),
      findMany: vi.fn(async () => [{ id: 'cat-1', name: 'Best Story', description: null }]),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cat-new', ...data })),
    },
    video: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        videoOwner === null ? null : { id: where.id, creatorId: videoOwner }),
    },
    storyVideoExport: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        exportOwner === null ? null : { id: where.id, userId: exportOwner, status: 'READY' }),
    },
    organizationMember: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; role?: unknown } }) => {
        // The guard asks for a moderator role; the ownership check asks by userId.
        if (where.role) return { id: 'm1', role: 'ORG_MODERATOR' };
        return orgMemberIds.includes(where.userId) ? { id: 'm-target' } : null;
      }),
    },
    awardNomination: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (createThrowsP2002) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: '5.22.0',
          });
        }
        return { id: 'nom-1', status: 'PENDING', ...data };
      }),
      findMany: vi.fn(async () => [
        {
          id: 'nom-1', status: 'PENDING', targetType: 'VIDEO', notes: null, createdAt: new Date(),
          category: { id: 'cat-1', name: 'Best Story' },
          video: { id: 'v1', title: 'Rainforest', thumbnailUrl: 't.png' },
          storyVideoExport: null,
          organization: { id: 'org-1', name: 'Test School' },
          nominatedBy: { id: 'u1', username: 'mod', email: 'mod@test.test' },
        },
        {
          id: 'nom-2', status: 'WINNER', targetType: 'EXPORT', notes: 'lovely', createdAt: new Date(),
          category: { id: 'cat-1', name: 'Best Story' },
          video: null,
          storyVideoExport: { id: 'e1', project: { title: 'The Long Walk' } },
          organization: { id: 'org-2', name: 'Other School' },
          nominatedBy: { id: 'u2', username: 'other', email: 'other@test.test' },
        },
      ]),
      findUnique: vi.fn(async () => ({ id: 'nom-1' })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => ({ id: 'nom-1', status: data.status })),
    },
    organization: { findUnique: vi.fn(async () => ({ id: 'org-1', name: 'Test School', slug: 'test-school', type: 'SCHOOL' })) },
  };
}

function caller(prisma: ReturnType<typeof makePrisma>, role: 'CREATOR' | 'ADMIN' = 'CREATOR') {
  return appRouter.createCaller({
    prisma: prisma as never,
    userId: 'u1',
    user: { id: 'u1', email: 'm@school.test', username: 'mod', displayName: 'Mo', role },
  } as never);
}

describe('awards - org.nominate', () => {
  it('rejects a target owned by someone outside the org', async () => {
    const prisma = makePrisma({ videoOwner: 'outsider' });

    await expect(
      caller(prisma).organization.nominate({
        orgId: 'org-1', categoryId: 'cat-1', targetType: 'VIDEO', targetId: 'v1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a VIDEO nomination whose id is not a video (invariant enforcement)', async () => {
    // The id exists only as an export, so the VIDEO lookup finds nothing.
    const prisma = makePrisma({ videoOwner: null });

    await expect(
      caller(prisma).organization.nominate({
        orgId: 'org-1', categoryId: 'cat-1', targetType: 'VIDEO', targetId: 'export-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(prisma.awardNomination.create).not.toHaveBeenCalled();
  });

  it('sets exactly one target column, leaving the other null', async () => {
    const prisma = makePrisma();

    await caller(prisma).organization.nominate({
      orgId: 'org-1', categoryId: 'cat-1', targetType: 'EXPORT', targetId: 'e1',
    });

    const data = (prisma.awardNomination.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(data.videoId).toBeNull();
    expect(data.storyVideoExportId).toBe('e1');
    expect(data.targetType).toBe('EXPORT');
  });

  it('turns a duplicate nomination into CONFLICT, not a 500', async () => {
    const prisma = makePrisma({ createThrowsP2002: true });

    await expect(
      caller(prisma).organization.nominate({
        orgId: 'org-1', categoryId: 'cat-1', targetType: 'VIDEO', targetId: 'v1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a closed category', async () => {
    const prisma = makePrisma({ categoryActive: false });

    await expect(
      caller(prisma).organization.nominate({
        orgId: 'org-1', categoryId: 'cat-1', targetType: 'VIDEO', targetId: 'v1',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('awards - admin shortlist', () => {
  it('returns nominations from more than one organization', async () => {
    const prisma = makePrisma();
    const rows = await caller(prisma, 'ADMIN').admin.listAllNominations({});

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.organization.name))).toEqual(new Set(['Test School', 'Other School']));
    // Both target shapes are normalised to the same fields.
    expect(rows[0]).toMatchObject({ title: 'Rainforest', targetType: 'VIDEO' });
    expect(rows[1]).toMatchObject({ title: 'The Long Walk', targetType: 'EXPORT' });
  });

  it('updates a nomination status', async () => {
    const prisma = makePrisma();
    const result = await caller(prisma, 'ADMIN').admin.updateNominationStatus({
      nominationId: 'nom-1', status: 'SHORTLISTED',
    });

    expect(result.status).toBe('SHORTLISTED');
  });

  it('keeps the shortlist admin-only', async () => {
    const prisma = makePrisma();
    await expect(caller(prisma, 'CREATOR').admin.listAllNominations({}))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
