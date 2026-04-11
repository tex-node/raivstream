import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';

export const notificationRouter = router({
  /** Unread notification count — used for the navbar badge */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.notification.count({
      where: { recipientId: ctx.user.id, read: false },
    });
    return { count };
  }),

  /** Paginated list of notifications for the current user */
  list: protectedProcedure
    .input(z.object({
      limit:  z.number().min(1).max(50).default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const notifications = await ctx.prisma.notification.findMany({
        where: {
          recipientId: ctx.user.id,
          ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          video: {
            select: { id: true, title: true, thumbnailUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (notifications.length > input.limit) {
        const last = notifications.pop()!;
        nextCursor = last.createdAt.toISOString();
      }

      return { notifications, nextCursor };
    }),

  /** Mark a single notification as read */
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.notification.updateMany({
        where: { id: input.id, recipientId: ctx.user.id },
        data:  { read: true },
      });
      return { success: true };
    }),

  /** Mark all notifications as read */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.notification.updateMany({
      where: { recipientId: ctx.user.id, read: false },
      data:  { read: true },
    });
    return { success: true };
  }),
});
