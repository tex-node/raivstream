import { router, protectedProcedure } from '../index';
import { z } from 'zod';

export const feedRouter = router({
  forYou: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Implement feed logic
      return {
        videos: [],
        nextCursor: undefined,
      };
    }),
});
