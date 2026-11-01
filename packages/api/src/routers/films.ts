import { z } from 'zod';
import { adminProcedure, protectedProcedure, publicProcedure, router } from '../trpc';
import { filmsEnabled, filmmakerByUsername, listApprovedFilms, reviewFilm, submitFilm } from '../lib/films/submissionService';

/**
 * Phase 3.5 — film ingestion, review and attribution.
 *
 * Every procedure re-checks `FILMS_ENABLED` **in the process that serves the
 * request**: a flag armed in `.env` but not in the running process must not open
 * the surface, and the service layer logs what it did so a run can be gated on it.
 */
export const filmsRouter = router({
  /** The terms the submit page displays before consent. */
  currentTerms: publicProcedure.query(async ({ ctx }) => {
    if (!filmsEnabled()) return null;
    const rows = await (ctx.prisma as any).revenueTerms.findMany({
      orderBy: { effectiveFrom: 'desc' },
      take: 1,
      select: { id: true, name: true, shareBps: true, effectiveFrom: true, effectiveTo: true },
    });
    return rows[0] ?? null;
  }),

  submit: protectedProcedure
    .input(z.object({
      videoId: z.string(),
      contentWarnings: z.array(z.string().max(80)).max(10).optional(),
      credits: z.unknown().optional(),
      termsId: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      submitFilm(ctx.prisma, {
        userId: ctx.user.id,
        videoId: input.videoId,
        contentWarnings: input.contentWarnings,
        credits: input.credits,
        termsId: input.termsId,
      }),
    ),

  mine: protectedProcedure.query(async ({ ctx }) => {
    if (!filmsEnabled()) return [];
    return (ctx.prisma as any).filmSubmission.findMany({
      where: { submittedById: ctx.user.id },
      orderBy: { submittedAt: 'desc' },
      include: { video: { select: { id: true, title: true, thumbnailUrl: true } } },
    });
  }),

  /** /watch */
  approved: publicProcedure.query(async ({ ctx }) => listApprovedFilms(ctx.prisma)),

  /** /filmmakers/[username] */
  filmmaker: publicProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => filmmakerByUsername(ctx.prisma, input.username)),

  /** /admin/films — the queue. */
  queue: adminProcedure.query(async ({ ctx }) => {
    if (!filmsEnabled()) return [];
    return (ctx.prisma as any).filmSubmission.findMany({
      where: { status: 'PENDING' },
      orderBy: { submittedAt: 'asc' },
      include: {
        video: { select: { id: true, title: true, thumbnailUrl: true, duration: true, moderationStatus: true, status: true } },
        submittedBy: { select: { id: true, username: true, displayName: true, creatorProfile: { select: { displayName: true } } } },
        acceptedRevenueTerms: { select: { id: true, name: true, shareBps: true } },
      },
    });
  }),

  review: adminProcedure
    .input(z.object({
      submissionId: z.string(),
      action: z.enum(['APPROVE', 'REJECT']),
      reason: z.string().max(500).optional(),
    }))
    .mutation(({ ctx, input }) =>
      reviewFilm(ctx.prisma, {
        submissionId: input.submissionId,
        reviewerId: ctx.user.id,
        action: input.action,
        reason: input.reason,
      }),
    ),
});
