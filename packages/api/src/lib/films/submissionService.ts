/**
 * Phase 3.5 — film ingestion, review and attribution.
 *
 * Three rules live here, and each has a test because each is a way the surface
 * could look right while being wrong:
 *
 * 1. TERMS ARE PINNED AT SUBMISSION, not at approval. The filmmaker consents to the
 *    terms on screen when they submit; pinning at approval would make the review
 *    window a terms-change window.
 * 2. APPROVAL IS NOT PUBLICATION. Accepting a submission must not touch the video's
 *    status or moderation state, or the films queue becomes a moderation bypass.
 * 3. ATTRIBUTION IS DERIVED from `CreatorProfile` at read time, never copied onto
 *    the video, so renaming a filmmaker propagates without touching video rows.
 */
import { TRPCError } from '@trpc/server';
import { termsEffectiveOn, type RevenueTermsRow } from './termsPinning';

export function filmsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FILMS_ENABLED === 'true';
}

function fail(message: string): never {
  throw new TRPCError({ code: 'FORBIDDEN', message });
}

export interface SubmitFilmInput {
  userId: string;
  videoId: string;
  contentWarnings?: string[];
  credits?: unknown;
  /** The terms the submitter was shown. Omitted → the currently effective terms. */
  termsId?: string;
}

export async function submitFilm(prisma: any, input: SubmitFilmInput, env: NodeJS.ProcessEnv = process.env) {
  if (!filmsEnabled(env)) fail('Film submissions are not enabled.');

  const video = await prisma.video.findFirst({
    where: { id: input.videoId, creatorId: input.userId },
    select: { id: true, status: true, moderationStatus: true, title: true },
  });
  if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
  if (video.status !== 'READY') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The film must be finished before it can be submitted.' });
  if (video.moderationStatus !== 'APPROVED') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The film must pass review before it can be submitted.' });

  const terms: RevenueTermsRow[] = await prisma.revenueTerms.findMany({
    select: { id: true, shareBps: true, effectiveFrom: true, effectiveTo: true },
  });
  const pinned = input.termsId
    ? terms.find((t) => t.id === input.termsId) ?? null
    : termsEffectiveOn(terms, new Date());
  if (!pinned) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No revenue terms are in force, so a submission cannot be pinned to any.' });
  }

  const submission = await prisma.filmSubmission.create({
    data: {
      videoId: video.id,
      submittedById: input.userId,
      status: 'PENDING',
      contentWarnings: input.contentWarnings ?? [],
      credits: (input.credits ?? null) as never,
      // PINNED HERE. Not at approval.
      acceptedRevenueTermsId: pinned.id,
    },
  });

  console.info(
    `[films.submit] submission=${submission.id} video=${video.id} user=${input.userId} pinnedTerms=${pinned.id} shareBps=${pinned.shareBps} source=${input.termsId ? 'supplied' : 'effective'}`,
  );

  return submission;
}

export interface ReviewFilmInput {
  submissionId: string;
  reviewerId: string;
  action: 'APPROVE' | 'REJECT';
  reason?: string;
}

export async function reviewFilm(prisma: any, input: ReviewFilmInput, env: NodeJS.ProcessEnv = process.env) {
  if (!filmsEnabled(env)) fail('Film review is not enabled.');

  const submission = await prisma.filmSubmission.findUnique({
    where: { id: input.submissionId },
    select: { id: true, status: true, videoId: true, acceptedRevenueTermsId: true },
  });
  if (!submission) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found.' });
  if (submission.status !== 'PENDING') {
    throw new TRPCError({ code: 'CONFLICT', message: `This submission is already ${submission.status}.` });
  }

  const approve = input.action === 'APPROVE';
  const reason = input.reason?.trim() ?? '';
  if (!approve && !reason) {
    // A rejection trail without a reason is weaker than it needs to be.
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A decline reason is required.' });
  }

  const updated = await prisma.filmSubmission.update({
    where: { id: submission.id },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      reviewedAt: new Date(),
      reviewedById: input.reviewerId,
      declineReason: approve ? null : reason,
    },
  });

  // NOTHING touches the video here. Approval is a decision about the submission;
  // publication is a property of the video, and conflating them turns this queue
  // into a moderation bypass.
  console.info(
    `[films.review] submission=${submission.id} video=${submission.videoId} action=${input.action} reviewer=${input.reviewerId} pinnedTerms=${submission.acceptedRevenueTermsId ?? 'none'} reason=${approve ? 'none' : 'provided'}`,
  );

  return updated;
}

/** Approved films for /watch. Attribution comes from the profile join. */
export async function listApprovedFilms(prisma: any, env: NodeJS.ProcessEnv = process.env) {
  if (!filmsEnabled(env)) return [];
  return prisma.filmSubmission.findMany({
    where: { status: 'APPROVED' },
    orderBy: { reviewedAt: 'desc' },
    include: {
      video: { select: { id: true, title: true, thumbnailUrl: true, duration: true, mp4Url: true, hlsMasterUrl: true } },
      submittedBy: { select: { id: true, username: true, displayName: true, creatorProfile: { select: { displayName: true, bio: true, avatarUrl: true } } } },
    },
  });
}

/** /filmmakers/[username]. The name is read from the profile at request time. */
export async function filmmakerByUsername(prisma: any, username: string, env: NodeJS.ProcessEnv = process.env) {
  if (!filmsEnabled(env)) return null;
  const user = await prisma.user.findFirst({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      creatorProfile: { select: { displayName: true, bio: true, avatarUrl: true, socialLinks: true, isVerified: true } },
    },
  });
  if (!user) return null;
  const films = await prisma.filmSubmission.findMany({
    where: { status: 'APPROVED', submittedById: user.id },
    orderBy: { reviewedAt: 'desc' },
    include: { video: { select: { id: true, title: true, thumbnailUrl: true, duration: true } } },
  });
  return {
    // Derived attribution: the profile wins when it exists, the account name is the fallback.
    displayName: user.creatorProfile?.displayName ?? user.displayName ?? user.username,
    bio: user.creatorProfile?.bio ?? null,
    avatarUrl: user.creatorProfile?.avatarUrl ?? null,
    isVerified: user.creatorProfile?.isVerified ?? false,
    username: user.username,
    films,
  };
}
