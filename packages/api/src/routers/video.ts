import { router, protectedProcedure, publicProcedure } from '../index';
import { z } from 'zod';

export const videoRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.video.findUnique({
        where: { id: input.id },
        include: {
          creator: true,
          categories: { include: { category: true } },
        },
      });
    }),
  
  // Add more video procedures here
});
