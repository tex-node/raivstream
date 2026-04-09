/**
 * Admin router — all procedures require ADMIN role.
 * Moderator-safe procedures use moderatorProcedure.
 */

import { z } from 'zod';
import { router, adminProcedure, moderatorProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const adminRouter = router({
  // ─── Overview Stats ────────────────────────────────────────────────────────

  /**
   * Dashboard overview cards:
   * total users, new today, total credit balance, total view hours,
   * total videos, total generation jobs, total revenue (credit purchases)
   */
  getOverview: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newUsersToday,
      usersByRole,
      usersByTier,
      totalVideos,
      totalCreditsInCirculation,
      totalViewHours,
      totalGenerationJobs,
      jobsByStatus,
      jobsByModel,
      recentRevenue,
    ] = await Promise.all([
      // Total users
      ctx.prisma.user.count(),

      // New sign-ups today
      ctx.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),

      // Users by role
      ctx.prisma.user.groupBy({ by: ['role'], _count: { id: true } }),

      // Users by premium tier
      ctx.prisma.user.groupBy({ by: ['premiumTier'], _count: { id: true } }),

      // Total published videos
      ctx.prisma.video.count({ where: { status: 'READY' } }),

      // Sum of all credit balances
      ctx.prisma.creditBalance.aggregate({ _sum: { balance: true } }),

      // Total watch seconds → hours (sum of watchTime across all interactions)
      ctx.prisma.videoInteraction.aggregate({ _sum: { watchTime: true } }),

      // Total generation jobs
      ctx.prisma.generationJob.count(),

      // Generation jobs by status
      ctx.prisma.generationJob.groupBy({ by: ['status'], _count: { id: true } }),

      // Generation jobs by model
      ctx.prisma.generationJob.groupBy({ by: ['model'], _count: { id: true }, _sum: { creditsUsed: true } }),

      // Total credits purchased (last 30 days)
      ctx.prisma.creditTransaction.aggregate({
        where: {
          type: 'PURCHASE',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const totalWatchSeconds = totalViewHours._sum.watchTime ?? 0;

    return {
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.id])),
        byTier: Object.fromEntries(usersByTier.map((r) => [r.premiumTier, r._count.id])),
      },
      content: {
        totalVideos,
        totalWatchHours: Math.round(totalWatchSeconds / 3600),
      },
      credits: {
        inCirculation: totalCreditsInCirculation._sum.balance ?? 0,
        totalGenerationJobs,
        jobsByStatus: Object.fromEntries(jobsByStatus.map((r) => [r.status, r._count.id])),
        jobsByModel: jobsByModel.map((r) => ({
          model: r.model,
          count: r._count.id,
          creditsUsed: r._sum.creditsUsed ?? 0,
        })),
      },
      revenue: {
        last30DaysCreditsPurchased: recentRevenue._sum.amount ?? 0,
        last30DaysTransactions: recentRevenue._count.id,
      },
    };
  }),

  // ─── User Management ────────────────────────────────────────────────────────

  /**
   * List users with search, filter by role/tier, and pagination.
   */
  listUsers: moderatorProcedure
    .input(z.object({
      search:   z.string().optional(),
      role:     z.enum(['VIEWER', 'CREATOR', 'MODERATOR', 'ADMIN']).optional(),
      tier:     z.enum(['FREE', 'VIEWER', 'CREATOR']).optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const where = {
        ...(input.search && {
          OR: [
            { email:       { contains: input.search, mode: 'insensitive' as const } },
            { username:    { contains: input.search, mode: 'insensitive' as const } },
            { displayName: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }),
        ...(input.role && { role: input.role }),
        ...(input.tier && { premiumTier: input.tier }),
      };

      const [users, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          skip,
          take: input.pageSize,
          orderBy: { createdAt: 'desc' },
          select: {
            id:           true,
            email:        true,
            username:     true,
            displayName:  true,
            avatarUrl:    true,
            role:         true,
            premiumTier:  true,
            verified:     true,
            followerCount:true,
            totalViews:   true,
            createdAt:    true,
            creditBalance: { select: { balance: true } },
            _count: {
              select: { videos: true, generationJobs: true },
            },
          },
        }),
        ctx.prisma.user.count({ where }),
      ]);

      return {
        users: users.map((u) => ({
          ...u,
          creditBalance: u.creditBalance?.balance ?? 0,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /**
   * Get a single user's full admin details.
   */
  getUser: moderatorProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        include: {
          creditBalance: true,
          _count: {
            select: {
              videos: true,
              generationJobs: true,
              followers: true,
              following: true,
            },
          },
        },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      // Recent credit transactions
      const recentTx = await ctx.prisma.creditTransaction.findMany({
        where:   { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        take:    20,
      });

      return { user, recentTx };
    }),

  /**
   * Update a user's role (ADMIN only).
   */
  setUserRole: adminProcedure
    .input(z.object({
      userId: z.string(),
      role:   z.enum(['VIEWER', 'CREATOR', 'MODERATOR', 'ADMIN']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Prevent demoting yourself
      if (input.userId === ctx.user.id && input.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot demote yourself' });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data:  { role: input.role },
      });

      return { success: true };
    }),

  /**
   * Manually adjust a user's credit balance (add or deduct).
   */
  adjustCredits: adminProcedure
    .input(z.object({
      userId:      z.string(),
      amount:      z.number().int(), // positive = add, negative = deduct
      description: z.string().min(1, 'Reason required'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId, amount, description } = input;

      // Get or create balance record
      const existing = await ctx.prisma.creditBalance.findUnique({ where: { userId } });
      const before   = existing?.balance ?? 0;
      const after    = Math.max(0, before + amount); // floor at 0

      await ctx.prisma.$transaction([
        ctx.prisma.creditBalance.upsert({
          where:  { userId },
          create: { userId, balance: after },
          update: { balance: after },
        }),
        ctx.prisma.creditTransaction.create({
          data: {
            userId,
            amount:        after - before, // actual delta (may differ if floored)
            type:          amount > 0 ? 'BONUS' : 'USAGE',
            description:   `[Admin: ${ctx.user.username}] ${description}`,
            balanceBefore: before,
            balanceAfter:  after,
          },
        }),
      ]);

      return { before, after, delta: after - before };
    }),

  /**
   * Ban / unban a user (lock their account indefinitely).
   */
  setUserBan: adminProcedure
    .input(z.object({
      userId: z.string(),
      banned: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot ban yourself' });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: {
          lockedUntil: input.banned
            ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // ~100 years
            : null,
        },
      });

      return { success: true };
    }),

  // ─── Credit Rate Management ─────────────────────────────────────────────────

  /**
   * List all feature credit rates.
   */
  listCreditRates: moderatorProcedure.query(async ({ ctx }) => {
    return ctx.prisma.featureCreditRate.findMany({
      orderBy: [{ isActive: 'desc' }, { featureKey: 'asc' }],
    });
  }),

  /**
   * Update a feature's credit cost.
   */
  updateCreditRate: adminProcedure
    .input(z.object({
      id:            z.string(),
      creditsPerUnit: z.number().int().min(0),
      isActive:      z.boolean().optional(),
      description:   z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.featureCreditRate.update({
        where: { id },
        data,
      });
    }),

  /**
   * Create a new credit rate entry.
   */
  createCreditRate: adminProcedure
    .input(z.object({
      featureKey:    z.string().min(1),
      creditsPerUnit: z.number().int().min(0),
      unitLabel:     z.string().default('request'),
      description:   z.string().optional(),
      isActive:      z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.featureCreditRate.create({ data: input });
    }),

  // ─── Generation Jobs ────────────────────────────────────────────────────────

  /**
   * List recent generation jobs across all users.
   */
  listGenerationJobs: moderatorProcedure
    .input(z.object({
      status:   z.enum(['QUEUED', 'GENERATING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
      model:    z.enum(['NANO_BANANA', 'GROK_IMAGINE', 'LTX2', 'WAN_25', 'KLING', 'HIGGSFIELD', 'VEO3']).optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const skip  = (input.page - 1) * input.pageSize;
      const where = {
        ...(input.status && { status: input.status }),
        ...(input.model  && { model:  input.model  }),
      };

      const [jobs, total] = await Promise.all([
        ctx.prisma.generationJob.findMany({
          where,
          skip,
          take:    input.pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, username: true, email: true, avatarUrl: true },
            },
          },
        }),
        ctx.prisma.generationJob.count({ where }),
      ]);

      return {
        jobs,
        total,
        page:       input.page,
        pageSize:   input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  // ─── Content Moderation ────────────────────────────────────────────────────

  /**
   * List videos pending moderation review.
   * Moderators and admins can access this.
   */
  moderationQueue: moderatorProcedure
    .input(z.object({
      status:   z.enum(['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED']).default('PENDING'),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const [videos, total] = await Promise.all([
        ctx.prisma.video.findMany({
          where: { moderationStatus: input.status },
          skip,
          take: input.pageSize,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            thumbnailUrl: true,
            mp4Url: true,
            tags: true,
            status: true,
            moderationStatus: true,
            isKidsSafe: true,
            contentRating: true,
            createdAt: true,
            creator: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
            },
            moderationLogs: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        }),
        ctx.prisma.video.count({ where: { moderationStatus: input.status } }),
      ]);

      return {
        videos,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /**
   * Approve / reject / flag a video.
   */
  moderateVideo: moderatorProcedure
    .input(z.object({
      videoId: z.string(),
      action:  z.enum(['approve', 'reject', 'flag']),
      reason:  z.string().max(500).optional(),
      isKidsSafe:    z.boolean().optional(),
      contentRating: z.enum(['G', 'PG', 'PG-13', 'R']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findUnique({ where: { id: input.videoId } });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found' });

      const moderationStatus =
        input.action === 'approve' ? 'APPROVED' :
        input.action === 'reject'  ? 'REJECTED'  :
        'FLAGGED';

      // For rejected videos, also block them from the feed
      const statusUpdate = input.action === 'reject' ? { status: 'BLOCKED' as const } : {};

      await ctx.prisma.$transaction([
        ctx.prisma.video.update({
          where: { id: input.videoId },
          data: {
            moderationStatus,
            ...(input.isKidsSafe    !== undefined ? { isKidsSafe: input.isKidsSafe }       : {}),
            ...(input.contentRating !== undefined ? { contentRating: input.contentRating } : {}),
            ...statusUpdate,
          },
        }),
        ctx.prisma.moderationLog.create({
          data: {
            videoId:     input.videoId,
            moderatorId: ctx.user.id,
            action:      input.action,
            reason:      input.reason,
            automated:   false,
          },
        }),
      ]);

      return { success: true, moderationStatus };
    }),

  /**
   * Get moderation stats for the overview.
   */
  getModerationStats: moderatorProcedure.query(async ({ ctx }) => {
    const [pending, approved, rejected, flagged] = await Promise.all([
      ctx.prisma.video.count({ where: { moderationStatus: 'PENDING' } }),
      ctx.prisma.video.count({ where: { moderationStatus: 'APPROVED' } }),
      ctx.prisma.video.count({ where: { moderationStatus: 'REJECTED' } }),
      ctx.prisma.video.count({ where: { moderationStatus: 'FLAGGED' } }),
    ]);
    return { pending, approved, rejected, flagged };
  }),

  // ─── Revenue / Transaction History ─────────────────────────────────────────

  /**
   * List credit purchase transactions for revenue view.
   */
  listPurchases: moderatorProcedure
    .input(z.object({
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const [txs, total, totals] = await Promise.all([
        ctx.prisma.creditTransaction.findMany({
          where:   { type: 'PURCHASE' },
          skip,
          take:    input.pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        }),
        ctx.prisma.creditTransaction.count({ where: { type: 'PURCHASE' } }),
        ctx.prisma.creditTransaction.aggregate({
          where: { type: 'PURCHASE' },
          _sum:  { amount: true },
          _count: { id: true },
        }),
      ]);

      return {
        transactions: txs,
        total,
        totalPages: Math.ceil(total / input.pageSize),
        page:       input.page,
        pageSize:   input.pageSize,
        allTimeCreditsSold:   totals._sum.amount ?? 0,
        allTimeTransactions:  totals._count.id,
      };
    }),
});
