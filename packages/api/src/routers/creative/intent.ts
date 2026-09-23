import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
import { intentService } from '../../lib/creative/intent/service';
import { CreativeError } from '../../lib/creative/shared/errors';
import { CREATIVE_PROJECT_TYPES } from '../../lib/creative/shared/types';

function toTrpcError(error: unknown): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Intent interpretation failed.' });
}

export const creativeIntentRouter = router({
  interpret: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      projectType: z.enum(CREATIVE_PROJECT_TYPES).optional(),
    }))
    .query(({ input }) => {
      try {
        return intentService.interpret(input.text, input.projectType);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});