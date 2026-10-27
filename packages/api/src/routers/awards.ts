/**
 * D-004 Phase 2 - awards: categories, nominations, shortlisting.
 *
 * Two procedure groups, spread into their parent routers:
 *   adminAwardProcedures → `admin.*` (cross-org)
 *   orgAwardProcedures   → `org.*`   (org-scoped, via orgModeratorProcedure)
 *
 * TARGET INVARIANT: exactly one of `videoId` / `storyVideoExportId` is set, and
 * it agrees with `targetType`. The schema cannot express this - the two unique
 * indexes rely on NULLs being distinct, so a row with both ids, or with the
 * wrong one, is representable. It is enforced here instead.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@raivstream/database';
import { adminProcedure, orgModeratorProcedure, router } from '../trpc';

const nominationStatus = z.enum(['PENDING', 'SHORTLISTED', 'WINNER', 'REJECTED']);
const targetType = z.enum(['VIDEO', 'EXPORT']);

type NominationRow = {
  id: string;
  status: string;
  targetType: string;
  notes: string | null;
  createdAt: Date;
  category: { id: string; name: string } | null;
  video: { id: string; title: string; thumbnailUrl: string | null } | null;
  storyVideoExport: { id: string; project: { title: string } | null } | null;
};

/** Collapse the two target shapes into one row the UI can render. */
function serialiseNomination(row: NominationRow) {
  const isVideo = row.targetType === 'VIDEO';
  return {
    id: row.id,
    status: row.status,
    targetType: row.targetType,
    notes: row.notes,
    createdAt: row.createdAt,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? 'Unknown category',
    targetId: isVideo ? row.video?.id ?? null : row.storyVideoExport?.id ?? null,
    title: isVideo
      ? row.video?.title ?? 'Untitled video'
      : row.storyVideoExport?.project?.title ?? 'Story export',
    thumbnailUrl: isVideo ? row.video?.thumbnailUrl ?? null : null,
  };
}

/** Active member check, so an org cannot nominate outside its own roster. */
async function assertTargetInOrg(
  prisma: unknown,
  orgId: string,
  ownerUserId: string,
): Promise<void> {
  const membership = await (prisma as {
    organizationMember: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
  }).organizationMember.findFirst({
    where: { organizationId: orgId, userId: ownerUserId, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'That item belongs to someone outside this organization.',
    });
  }
}

export const adminAwardProcedures = {
  listAwardCategories: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.awardCategory.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, description: true, isActive: true, createdAt: true },
    });
  }),

  createAwardCategory: adminProcedure
    .input(z.object({ name: z.string().min(1).max(120), description: z.string().max(2_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.awardCategory.create({
        data: { name: input.name.trim(), description: input.description?.trim() || null },
        select: { id: true, name: true, description: true, isActive: true },
      });
    }),

  listAllNominations: adminProcedure
    .input(z.object({
      status: nominationStatus.optional(),
      orgId: z.string().min(1).optional(),
      categoryId: z.string().min(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.awardNomination.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.orgId ? { organizationId: input.orgId } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 500,
        select: {
          id: true, status: true, targetType: true, notes: true, createdAt: true,
          category: { select: { id: true, name: true } },
          video: { select: { id: true, title: true, thumbnailUrl: true } },
          storyVideoExport: { select: { id: true, project: { select: { title: true } } } },
          organization: { select: { id: true, name: true } },
          nominatedBy: { select: { id: true, username: true, email: true } },
        },
      });

      return rows.map((row) => ({
        ...serialiseNomination(row),
        organization: row.organization,
        nominatedBy: row.nominatedBy,
      }));
    }),

  updateNominationStatus: adminProcedure
    .input(z.object({ nominationId: z.string().min(1), status: nominationStatus }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.awardNomination.findUnique({
        where: { id: input.nominationId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nomination not found.' });

      return ctx.prisma.awardNomination.update({
        where: { id: input.nominationId },
        data: { status: input.status },
        select: { id: true, status: true },
      });
    }),
};

export const orgAwardProcedures = {
  getAwardCategories: orgModeratorProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .query(async ({ ctx }) => {
      return ctx.prisma.awardCategory.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, description: true },
      });
    }),

  nominate: orgModeratorProcedure
    .input(z.object({
      orgId: z.string().min(1),
      categoryId: z.string().min(1),
      targetType,
      targetId: z.string().min(1),
      notes: z.string().max(2_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.awardCategory.findUnique({
        where: { id: input.categoryId },
        select: { id: true, isActive: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Award category not found.' });
      if (!category.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That award category is closed.' });
      }

      // Resolve the target through the type the caller declared, and only set the
      // matching column - the other stays null, which is the invariant.
      let videoId: string | null = null;
      let storyVideoExportId: string | null = null;
      let ownerId: string;

      if (input.targetType === 'VIDEO') {
        const video = await ctx.prisma.video.findUnique({
          where: { id: input.targetId },
          select: { id: true, creatorId: true },
        });
        if (!video) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'That video does not exist.' });
        }
        videoId = video.id;
        ownerId = video.creatorId;
      } else {
        const exported = await ctx.prisma.storyVideoExport.findUnique({
          where: { id: input.targetId },
          select: { id: true, userId: true, status: true },
        });
        if (!exported) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'That story export does not exist.' });
        }
        if (exported.status !== 'READY') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only completed exports can be nominated.' });
        }
        storyVideoExportId = exported.id;
        ownerId = exported.userId;
      }

      await assertTargetInOrg(ctx.prisma, input.orgId, ownerId);

      try {
        const created = await ctx.prisma.awardNomination.create({
          data: {
            organizationId: input.orgId,
            categoryId: input.categoryId,
            targetType: input.targetType,
            videoId,
            storyVideoExportId,
            nominatedByUserId: ctx.user.id,
            notes: input.notes?.trim() || null,
          },
          select: { id: true, status: true },
        });
        return created;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This item has already been nominated for this category.',
          });
        }
        throw error;
      }
    }),

  listNominations: orgModeratorProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.awardNomination.findMany({
        where: { organizationId: input.orgId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true, status: true, targetType: true, notes: true, createdAt: true,
          category: { select: { id: true, name: true } },
          video: { select: { id: true, title: true, thumbnailUrl: true } },
          storyVideoExport: { select: { id: true, project: { select: { title: true } } } },
        },
      });

      return rows.map(serialiseNomination);
    }),
};
