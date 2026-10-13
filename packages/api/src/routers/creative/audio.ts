import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { generateMusicForVersion } from '../../lib/creative/audio/service';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code =
      error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' :
      error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' :
      error.code === 'PLAN_NOT_APPROVED' ? 'BAD_REQUEST' :
      'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeAudioRouter = router({
  /**
   * Generate the music soundtrack for an approved Creative 5.0 version.
   *
   * Authorization:
   *   - Caller must be authenticated (isAuthed via creativeProcedure)
   *   - Caller must not be in R16 mode (isNotR16 via creativeProcedure)
   *   - creativeProjectId must be owned by the caller
   *   - creativeVersionId must belong to creativeProjectId
   *   - The version must carry an APPROVED CREATIVE approval record
   *
   * Idempotent: repeated calls return the existing materialised track
   * (creditsUsed=0, reused=true) without a new charge.
   */
  generateMusic: creativeProcedure
    .input(
      z.object({
        creativeProjectId: z.string(),
        creativeVersionId: z.string(),
        /** Optional creator-supplied text; overrides inferred music brief when provided. */
        creatorInstructions: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Project ownership check — prevents callers from generating music for
      // projects they do not own.
      const project = await ctx.prisma.creativeProject.findFirst({
        where: { id: input.creativeProjectId, userId: ctx.user.id },
        select: { id: true },
      });
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative project not found.' });
      }

      // Version → project relationship check — prevents ID confusion attacks
      // where a caller supplies a versionId from a different project.
      const version = await ctx.prisma.creativeVersion.findFirst({
        where: { id: input.creativeVersionId, projectId: input.creativeProjectId },
        select: { id: true },
      });
      if (!version) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative version not found.' });
      }

      try {
        const result = await generateMusicForVersion(ctx.prisma, {
          creativeVersionId: input.creativeVersionId,
          creativeProjectId: input.creativeProjectId,
          userId: ctx.user.id,
          creatorInstructions: input.creatorInstructions,
        });

        if (result === null) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Creative audio is not enabled on this server.' });
        }

        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error, 'Music generation failed.');
      }
    }),
});
