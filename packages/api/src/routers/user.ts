import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    // Return full profile from DB (includes fields not in the auth context like bio, premiumUntil)
    return ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        role: true,
        premiumTier: true,
        premiumUntil: true,
        verified: true,
        followerCount: true,
        followingCount: true,
        totalViews: true,
        totalLikes: true,
      },
    });
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(50).optional(),
        bio: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: input,
        select: { id: true, displayName: true, bio: true },
      });
    }),

  getByUsername: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.user.findUnique({
        where: { username: input.username },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          role: true,
          verified: true,
          followerCount: true,
          followingCount: true,
          totalViews: true,
          badges: {
            select: {
              badge: {
                select: { id: true, name: true, description: true, iconUrl: true },
              },
            },
            orderBy: { awardedAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      // Check if the current viewer follows this profile
      let isFollowing = false;
      if (ctx.userId) {
        const follow = await ctx.prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: ctx.userId, followingId: profile.id } },
        });
        isFollowing = !!follow;
      }

      return { ...profile, isFollowing };
    }),

  /** Paginated list of followers for a given username */
  getFollowers: publicProcedure
    .input(z.object({
      username: z.string(),
      limit:    z.number().min(1).max(50).default(20),
      cursor:   z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const target = await ctx.prisma.user.findUnique({
        where:  { username: input.username },
        select: { id: true },
      });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const follows = await ctx.prisma.follow.findMany({
        where: {
          followingId: target.id,
          ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
        },
        include: {
          follower: {
            select: {
              id: true, username: true, displayName: true,
              avatarUrl: true, verified: true, followerCount: true, bio: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (follows.length > input.limit) {
        nextCursor = follows.pop()!.createdAt.toISOString();
      }

      return { users: follows.map((f) => f.follower), nextCursor };
    }),

  /** Paginated list of accounts a given username is following */
  getFollowing: publicProcedure
    .input(z.object({
      username: z.string(),
      limit:    z.number().min(1).max(50).default(20),
      cursor:   z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const target = await ctx.prisma.user.findUnique({
        where:  { username: input.username },
        select: { id: true },
      });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const follows = await ctx.prisma.follow.findMany({
        where: {
          followerId: target.id,
          ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
        },
        include: {
          following: {
            select: {
              id: true, username: true, displayName: true,
              avatarUrl: true, verified: true, followerCount: true, bio: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (follows.length > input.limit) {
        nextCursor = follows.pop()!.createdAt.toISOString();
      }

      return { users: follows.map((f) => f.following), nextCursor };
    }),

  /** Search users by username or display name */
  searchUsers: publicProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      if (!input.query.trim()) return [];
      return ctx.prisma.user.findMany({
        where: {
          OR: [
            { username:    { contains: input.query.trim(), mode: 'insensitive' } },
            { displayName: { contains: input.query.trim(), mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, username: true, displayName: true,
          avatarUrl: true, verified: true, followerCount: true, bio: true,
        },
        orderBy: { followerCount: 'desc' },
        take: 10,
      });
    }),

  // Current credit balance for the signed-in user
  creditBalance: protectedProcedure.query(async ({ ctx }) => {
    const balance = await ctx.prisma.creditBalance.findUnique({
      where: { userId: ctx.user.id },
      select: { balance: true, updatedAt: true },
    });
    return { balance: balance?.balance ?? 0, updatedAt: balance?.updatedAt ?? null };
  }),

  // Recent credit transactions (last 20)
  creditHistory: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.creditTransaction.findMany({
      where:   { userId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select: {
        id:           true,
        amount:       true,
        type:         true,
        featureKey:   true,
        description:  true,
        balanceAfter: true,
        createdAt:    true,
      },
    });
  }),

  // Returns episode gate status for the current FREE user.
  //
  // Limits:
  //   Guest (unauthenticated)  — 5 unique videos, tracked client-side
  //   FREE tier (signed-in)    — 10 unique videos tracked server-side
  //   VIEWER / CREATOR         — no limit
  //
  // When isGated is true, only isPremiumOnly=false content is still playable.
  // Premium content throws EPISODE_GATE_REACHED from trackProgress.
  episodeGate: protectedProcedure.query(async ({ ctx }) => {
    const LIMIT = 10;

    if (ctx.user.premiumTier !== 'FREE') {
      return { watched: 0, limit: LIMIT, isGated: false, freeContentOnly: false };
    }

    const watched = await ctx.prisma.watchHistory.count({
      where: { userId: ctx.user.id },
    });

    const isGated = watched >= LIMIT;
    return { watched, limit: LIMIT, isGated, freeContentOnly: isGated };
  }),

  becomeCreator: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { role: 'CREATOR' },
      select: { id: true, role: true },
    });
  }),

  toggleFollow: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot follow yourself' });
      }

      const existing = await ctx.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: ctx.user.id,
            followingId: input.targetUserId,
          },
        },
      });

      if (existing) {
        // Unfollow
        await ctx.prisma.follow.delete({
          where: {
            followerId_followingId: {
              followerId: ctx.user.id,
              followingId: input.targetUserId,
            },
          },
        });
        await ctx.prisma.$transaction([
          ctx.prisma.user.update({ where: { id: ctx.user.id }, data: { followingCount: { decrement: 1 } } }),
          ctx.prisma.user.update({ where: { id: input.targetUserId }, data: { followerCount: { decrement: 1 } } }),
        ]);
        return { following: false };
      } else {
        // Follow
        await ctx.prisma.follow.create({
          data: { followerId: ctx.user.id, followingId: input.targetUserId },
        });
        await ctx.prisma.$transaction([
          ctx.prisma.user.update({ where: { id: ctx.user.id }, data: { followingCount: { increment: 1 } } }),
          ctx.prisma.user.update({ where: { id: input.targetUserId }, data: { followerCount: { increment: 1 } } }),
        ]);
        // Fire-and-forget follow notification
        ctx.prisma.notification.create({
          data: {
            recipientId: input.targetUserId,
            senderId:    ctx.user.id,
            type:        'FOLLOW',
          },
        }).catch(() => {});
        return { following: true };
      }
    }),
});
