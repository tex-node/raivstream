/**
 * D-004 Phase 1 - organizations for R16 training cohorts (view-only).
 *
 * Two access shapes:
 *   org.*    - scoped to the caller's membership via orgModeratorProcedure
 *   admin.*  - cross-org, via adminProcedure
 *
 * Phase 1 shows BOTH published `Video` rows and completed `StoryVideoExport`
 * rows. The read-only pass justified this: production had 4 published R16 videos
 * from a single creator but 35 READY exports, with zero overlap by URL. A
 * published-only dashboard would have been four items.
 *
 * Privacy: nothing here reads prompts, generation-job internals or credit usage.
 * Org staff see what a school already has - accounts, videos, moderation status.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure, orgModeratorProcedure } from '../trpc';
import { orgAwardProcedures } from './awards';

const orgIdSchema = z.object({ orgId: z.string().min(1) });
const cursorSchema = z.object({ createdAt: z.string().min(1), id: z.string().min(1) });

type UnifiedMedia = {
  id: string;
  title: string;
  source: 'published' | 'export';
  thumbnailUrl: string | null;
  videoUrl: string;
  creatorUsername: string;
  status: 'APPROVED' | 'PENDING' | 'FLAGGED' | 'REJECTED' | null;
  createdAt: Date;
};

/** Username lookup for export rows: StoryVideoExport has no user relation. */
async function usernamesFor(prisma: unknown, userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const users = await (prisma as {
    user: { findMany: (args: unknown) => Promise<Array<{ id: string; username: string }>> };
  }).user.findMany({ where: { id: { in: unique } }, select: { id: true, username: true } });

  return new Map(users.map((u) => [u.id, u.username]));
}

/**
 * Active member user ids for an org - the scope boundary for every query.
 *
 * EVERY role counts: an ORG_ADMIN or ORG_MODERATOR may also be a creator, and
 * scoping to STUDENT only made a coordinator's own work vanish from the
 * dashboard the moment they were promoted (found in the Phase 1 walkthrough).
 */
async function memberIdsFor(prisma: unknown, orgId: string): Promise<string[]> {
  const rows = await (prisma as {
    organizationMember: {
      findMany: (args: unknown) => Promise<Array<{ userId: string }>>;
    };
  }).organizationMember.findMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

/** ORG_ADMIN of this org, ACTIVE - or FORBIDDEN. Stricter than the view guard. */
async function assertOrgAdmin(
  ctx: { prisma: unknown; user: { id: string } },
  orgId: string,
): Promise<void> {
  const membership = await (ctx.prisma as {
    organizationMember: { findFirst: (args: unknown) => Promise<{ role: string } | null> };
  }).organizationMember.findFirst({
    where: { organizationId: orgId, userId: ctx.user.id, status: 'ACTIVE', role: 'ORG_ADMIN' },
    select: { role: true },
  });

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization admin access required' });
  }
}

function compareMedia(a: UnifiedMedia, b: UnifiedMedia): number {
  const delta = b.createdAt.getTime() - a.createdAt.getTime();
  if (delta !== 0) return delta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export const organizationRouter = router({
  // D-004 Phase 2 - awards (org-scoped).
  ...orgAwardProcedures,
  /** Bootstrap the UI from the URL slug: org identity + the caller's own role. */
  resolveSlug: protectedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.prisma.organization.findUnique({
        where: { slug: input.slug },
        select: { id: true, name: true, type: true, slug: true, inviteCode: true },
      });

      // Deliberately the same error for "no such org" and "not a member": telling
      // an outsider that a slug exists is itself a leak.
      if (!org) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization not available' });
      }

      const membership = await ctx.prisma.organizationMember.findFirst({
        where: { organizationId: org.id, userId: ctx.user.id, status: 'ACTIVE' },
        select: { role: true },
      });

      if (!membership) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization not available' });
      }

      return {
        orgId: org.id,
        name: org.name,
        slug: org.slug,
        type: org.type,
        role: membership.role,
        inviteCode: org.inviteCode,
      };
    }),

  /**
   * D-004 - org-admin self-service. A school coordinator must be able to onboard
   * their own people without a Raivstream admin in the loop; ORG_MODERATOR is
   * view-only by design, so this guard is stricter than orgModeratorProcedure.
   */
  addMember: protectedProcedure
    .input(z.object({
      orgId: z.string().min(1),
      email: z.string().email(),
      role: z.enum(['ORG_ADMIN', 'ORG_MODERATOR', 'STUDENT']),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.orgId);

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, username: true, email: true },
      });
      // Same Phase 1 rule as the admin path: never mint an account from a typo.
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No account with that email.' });

      const existing = await ctx.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: input.orgId, userId: user.id } },
        select: { id: true, role: true, status: true },
      });
      if (existing) return { ...existing, user, created: false };

      const created = await ctx.prisma.organizationMember.create({
        data: { organizationId: input.orgId, userId: user.id, role: input.role, status: 'ACTIVE', invitedBy: ctx.user.id },
        select: { id: true, role: true, status: true },
      });

      return { ...created, user, created: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.orgId);

      // Removing yourself would leave an org nobody can administer.
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove yourself from the organization.' });
      }

      const membership = await ctx.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: input.orgId, userId: input.userId } },
        select: { id: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND', message: 'Membership not found.' });

      await ctx.prisma.organizationMember.update({ where: { id: membership.id }, data: { status: 'REMOVED' } });
      return { success: true as const };
    }),

  /**
   * Self-service onboarding: a student redeems an invite code and becomes a
   * STUDENT member. Deliberately cannot join twice, and cannot resurrect a
   * membership an admin removed.
   */
  joinWithCode: protectedProcedure
    .input(z.object({ code: z.string().min(4).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const code = input.code.trim();

      const org = await ctx.prisma.organization.findUnique({
        where: { inviteCode: code },
        select: { id: true, name: true, slug: true },
      });
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'That invite code is not valid.' });

      const existing = await ctx.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: org.id, userId: ctx.user.id } },
        select: { role: true, status: true },
      });

      if (existing?.status === 'ACTIVE') {
        return { orgId: org.id, name: org.name, slug: org.slug, role: existing.role, joined: false };
      }
      if (existing?.status === 'REMOVED') {
        // Re-joining by code would quietly undo an admin's removal.
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You were removed from this organization. Ask an admin to re-add you.' });
      }

      const membership = existing
        ? await ctx.prisma.organizationMember.update({
            where: { organizationId_userId: { organizationId: org.id, userId: ctx.user.id } },
            data: { status: 'ACTIVE', role: 'STUDENT' },
            select: { role: true },
          })
        : await ctx.prisma.organizationMember.create({
            data: { organizationId: org.id, userId: ctx.user.id, role: 'STUDENT', status: 'ACTIVE' },
            select: { role: true },
          });

      return { orgId: org.id, name: org.name, slug: org.slug, role: membership.role, joined: true };
    }),

  /**
   * The caller's active memberships. Used by the feed banner: "are you part of a
   * school program?" only makes sense for someone who is not in one yet.
   */
  myOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.prisma.organizationMember.findMany({
      where: { userId: ctx.user.id, status: 'ACTIVE' },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, type: true } },
      },
    });

    return memberships.map((m) => ({ ...m.organization, role: m.role }));
  }),

  /**
   * Rotate the join code. ORG_ADMIN of this org, or a Raivstream admin acting
   * cross-org (admins are usually not members of the org they administer).
   * Invalidates every copy of the old code immediately.
   */
  regenerateInviteCode: protectedProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const isPlatformAdmin = ctx.user.role === 'ADMIN';
      if (!isPlatformAdmin) await assertOrgAdmin(ctx, input.orgId);

      const { randomBytes } = await import('node:crypto');
      const inviteCode = randomBytes(6).toString('hex'); // 12 hex chars

      const updated = await ctx.prisma.organization.update({
        where: { id: input.orgId },
        data: { inviteCode },
        select: { inviteCode: true },
      });

      return { inviteCode: updated.inviteCode };
    }),

  getDashboard: orgModeratorProcedure
    .input(orgIdSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
        select: { id: true, name: true, slug: true, type: true },
      });
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });

      const studentIds = await memberIdsFor(ctx.prisma, input.orgId);

      const [publishedCount, exportCount, approvedCount, pendingCount, videos, exports] = await Promise.all([
        ctx.prisma.video.count({ where: { creatorId: { in: studentIds } } }),
        ctx.prisma.storyVideoExport.count({ where: { userId: { in: studentIds }, status: 'READY' } }),
        ctx.prisma.video.count({ where: { creatorId: { in: studentIds }, moderationStatus: 'APPROVED' } }),
        ctx.prisma.video.count({ where: { creatorId: { in: studentIds }, moderationStatus: 'PENDING' } }),
        ctx.prisma.video.findMany({
          where: { creatorId: { in: studentIds } },
          orderBy: [{ createdAt: 'desc' }],
          take: 10,
          select: {
            id: true, title: true, thumbnailUrl: true, mp4Url: true, hlsMasterUrl: true,
            moderationStatus: true, createdAt: true, creator: { select: { username: true } },
          },
        }),
        ctx.prisma.storyVideoExport.findMany({
          where: { userId: { in: studentIds }, status: 'READY', assetUrl: { not: null } },
          orderBy: [{ createdAt: 'desc' }],
          take: 10,
          select: {
            id: true, assetUrl: true, createdAt: true, userId: true,
            project: { select: { title: true } },
          },
        }),
      ]);

      const exportNames = await usernamesFor(ctx.prisma, exports.map((e) => e.userId));

      const recent: UnifiedMedia[] = [
        ...videos.map((v) => ({
          id: v.id,
          title: v.title,
          source: 'published' as const,
          thumbnailUrl: v.thumbnailUrl ?? null,
          videoUrl: (v.hlsMasterUrl ?? v.mp4Url) ?? '',
          creatorUsername: v.creator?.username ?? 'unknown',
          status: v.moderationStatus,
          createdAt: v.createdAt,
        })),
        ...exports.map((e) => ({
          id: e.id,
          title: e.project?.title ?? 'Story export',
          source: 'export' as const,
          thumbnailUrl: null,
          videoUrl: e.assetUrl ?? '',
          creatorUsername: exportNames.get(e.userId) ?? 'unknown',
          status: null,
          createdAt: e.createdAt,
        })),
      ]
        .filter((item) => item.videoUrl.length > 0)
        .sort(compareMedia)
        .slice(0, 10);

      return {
        org,
        stats: {
          memberCount: studentIds.length,
          publishedCount,
          exportCount,
          approvedCount,
          pendingCount,
        },
        recentActivity: recent,
      };
    }),

  listStudents: orgModeratorProcedure
    .input(orgIdSchema.extend({ cursor: cursorSchema.optional(), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const before = input.cursor ? new Date(input.cursor.createdAt) : null;
      if (before && Number.isNaN(before.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cursor.' });
      }

      const members = await ctx.prisma.organizationMember.findMany({
        where: {
          organizationId: input.orgId,
          status: 'ACTIVE',
          ...(before ? { createdAt: { lt: before } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        select: { id: true, createdAt: true, role: true, user: { select: { id: true, username: true, email: true } } },
      });

      const page = members.slice(0, input.limit);
      const last = page[page.length - 1];

      return {
        items: page.map((m) => ({
          userId: m.user.id,
          username: m.user.username,
          email: m.user.email,
          role: m.role,
          joinedAt: m.createdAt,
        })),
        nextCursor:
          members.length > input.limit && last
            ? { createdAt: last.createdAt.toISOString(), id: last.id }
            : null,
      };
    }),

  listVideos: orgModeratorProcedure
    .input(
      orgIdSchema.extend({
        type: z.enum(['published', 'export']).optional(),
        moderationStatus: z.enum(['APPROVED', 'PENDING', 'FLAGGED', 'REJECTED']).optional(),
        cursor: cursorSchema.optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const before = input.cursor ? new Date(input.cursor.createdAt) : null;
      if (before && Number.isNaN(before.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cursor.' });
      }

      const studentIds = await memberIdsFor(ctx.prisma, input.orgId);
      if (studentIds.length === 0) return { items: [], nextCursor: null };

      const take = input.limit + 1;
      const wantPublished = !input.type || input.type === 'published';
      const wantExport = !input.type || input.type === 'export';

      const [videos, exports] = await Promise.all([
        wantPublished
          ? ctx.prisma.video.findMany({
              where: {
                creatorId: { in: studentIds },
                ...(input.moderationStatus ? { moderationStatus: input.moderationStatus } : {}),
                ...(before ? { createdAt: { lt: before } } : {}),
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take,
              select: {
                id: true, title: true, thumbnailUrl: true, mp4Url: true, hlsMasterUrl: true,
                moderationStatus: true, createdAt: true, creator: { select: { username: true } },
              },
            })
          : Promise.resolve([]),
        wantExport
          ? ctx.prisma.storyVideoExport.findMany({
              where: {
                userId: { in: studentIds },
                status: 'READY',
                assetUrl: { not: null },
                ...(before ? { createdAt: { lt: before } } : {}),
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take,
              select: {
                id: true, assetUrl: true, createdAt: true, userId: true,
                project: { select: { title: true } },
              },
            })
          : Promise.resolve([]),
      ]);

      const exportNames = await usernamesFor(ctx.prisma, exports.map((e) => e.userId));

      const merged: UnifiedMedia[] = [
        ...videos.map((v) => ({
          id: v.id,
          title: v.title,
          source: 'published' as const,
          thumbnailUrl: v.thumbnailUrl ?? null,
          videoUrl: (v.hlsMasterUrl ?? v.mp4Url) ?? '',
          creatorUsername: v.creator?.username ?? 'unknown',
          status: v.moderationStatus,
          createdAt: v.createdAt,
        })),
        ...exports.map((e) => ({
          id: e.id,
          title: e.project?.title ?? 'Story export',
          source: 'export' as const,
          thumbnailUrl: null,
          videoUrl: e.assetUrl ?? '',
          creatorUsername: exportNames.get(e.userId) ?? 'unknown',
          status: null,
          createdAt: e.createdAt,
        })),
      ]
        .filter((item) => item.videoUrl.length > 0)
        .sort(compareMedia);

      const page = merged.slice(0, input.limit);
      const last = page[page.length - 1];

      return {
        items: page,
        nextCursor:
          merged.length > input.limit && last
            ? { createdAt: last.createdAt.toISOString(), id: last.id }
            : null,
      };
    }),
});

/**
 * Admin (cross-org) procedures, spread into `adminRouter` so they live at
 * `admin.*` without duplicating the org helpers above.
 */
export const adminOrganizationProcedures = {
  listOrganizations: adminProcedure.query(async ({ ctx }) => {
    const orgs = await ctx.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, slug: true, type: true, createdAt: true,
        members: { select: { role: true, status: true } },
      },
    });

    const ids = orgs.map((o) => o.id);
    const [videoCounts, exportCounts] = await Promise.all([
      ctx.prisma.video.groupBy({ by: ['creatorId'], _count: { _all: true } }),
      ctx.prisma.storyVideoExport.groupBy({ by: ['userId'], _count: { _all: true } }),
    ]);

    const videoByUser = new Map(videoCounts.map((v) => [v.creatorId, v._count._all]));
    const exportByUser = new Map(exportCounts.map((e) => [e.userId, e._count._all]));

    const studentsByOrg = await ctx.prisma.organizationMember.findMany({
      where: { organizationId: { in: ids }, role: 'STUDENT', status: 'ACTIVE' },
      select: { organizationId: true, userId: true },
    });

    return orgs.map((org) => {
      const students = studentsByOrg.filter((m) => m.organizationId === org.id);
      const videoCount = students.reduce(
        (sum, m) => sum + (videoByUser.get(m.userId) ?? 0) + (exportByUser.get(m.userId) ?? 0),
        0,
      );

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        type: org.type,
        studentCount: students.length,
        moderatorCount: org.members.filter(
          (m) => m.status === 'ACTIVE' && (m.role === 'ORG_ADMIN' || m.role === 'ORG_MODERATOR'),
        ).length,
        videoCount,
        createdAt: org.createdAt,
      };
    });
  }),

  getOrganization: adminProcedure
    .input(orgIdSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
        select: { id: true, name: true, slug: true, type: true, createdAt: true, inviteCode: true },
      });
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });

      const members = await ctx.prisma.organizationMember.findMany({
        where: { organizationId: org.id },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, role: true, status: true, createdAt: true,
          user: { select: { id: true, username: true, email: true } },
        },
      });

      return { org, members };
    }),

  createOrganization: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(120),
      slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes only'),
      type: z.enum(['SCHOOL', 'INSTITUTION', 'PROGRAM']).default('SCHOOL'),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.organization.findUnique({ where: { slug: input.slug }, select: { id: true } });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'That slug is already taken.' });

      // The creator is the first ORG_ADMIN, created in the same statement: an org
      // with no admin is unreachable, and a two-step create could leave one behind
      // if the membership write failed.
      return ctx.prisma.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          type: input.type,
          members: {
            create: { userId: ctx.user.id, role: 'ORG_ADMIN', status: 'ACTIVE' },
          },
        },
        select: { id: true, name: true, slug: true, type: true, inviteCode: true },
      });
    }),

  addOrgMember: adminProcedure
    .input(z.object({
      orgId: z.string().min(1),
      email: z.string().email(),
      role: z.enum(['ORG_ADMIN', 'ORG_MODERATOR', 'STUDENT']),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, username: true, email: true },
      });
      // Phase 1 does not create accounts: a typo'd email must not mint a user.
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No account with that email.' });

      const existing = await ctx.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: input.orgId, userId: user.id } },
        select: { id: true, role: true, status: true },
      });
      if (existing) return { ...existing, user, created: false };

      const created = await ctx.prisma.organizationMember.create({
        data: { organizationId: input.orgId, userId: user.id, role: input.role, status: 'ACTIVE', invitedBy: ctx.user.id },
        select: { id: true, role: true, status: true },
      });

      return { ...created, user, created: true };
    }),

  updateOrgMemberRole: adminProcedure
    .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1), role: z.enum(['ORG_ADMIN', 'ORG_MODERATOR', 'STUDENT']) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: input.orgId, userId: input.userId } },
        select: { id: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND', message: 'Membership not found.' });

      return ctx.prisma.organizationMember.update({
        where: { id: membership.id },
        data: { role: input.role },
        select: { id: true, role: true, status: true },
      });
    }),

  removeOrgMember: adminProcedure
    .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // A platform admin removing themselves locks them out of the org they were
      // working in - this is exactly how "Test School" lost its only admin 16
      // seconds after a student was added.
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot remove yourself from the organization.',
        });
      }

      const membership = await ctx.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: input.orgId, userId: input.userId } },
        select: { id: true, role: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND', message: 'Membership not found.' });

      // Removing the last admin orphans the org: afterwards nobody can add
      // members or nominate, and nothing in the UI explains why.
      if (membership.role === 'ORG_ADMIN') {
        const otherAdmins = await ctx.prisma.organizationMember.count({
          where: {
            organizationId: input.orgId,
            role: 'ORG_ADMIN',
            status: 'ACTIVE',
            userId: { not: input.userId },
          },
        });
        if (otherAdmins === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'That is the last admin. Promote someone else before removing them.',
          });
        }
      }

      // Soft-remove: keeps the audit trail and lets re-adding restore the row.
      await ctx.prisma.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'REMOVED' },
      });

      return { success: true as const };
    }),
};
