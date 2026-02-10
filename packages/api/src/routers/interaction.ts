import { router, protectedProcedure } from '../index';
import { z } from 'zod';

export const interactionRouter = router({
  toggleLike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Implement like logic
      return { success: true };
    }),
});
