import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { PrismaClient } from '@raivstream/database';
import { enforceRateLimit } from './lib/resilience/rateLimitMiddleware';

// Generic context shape — concrete context is created per-adapter (see apps/web/src/app/api/trpc)
export interface Context {
  prisma: PrismaClient;
  userId: string | null;
  isR16?: boolean;
  /** Client IP, resolved from x-forwarded-for / x-real-ip at the adapter. */
  ip?: string | null;
  /** Populated by orgModeratorProcedure for org-scoped requests. */
  orgMembership?: { id: string; organizationId: string; userId: string; role: 'ORG_ADMIN' | 'ORG_MODERATOR' };
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    premiumTier: string;
    verified: boolean;
    followerCount: number;
    followingCount: number;
    totalViews: number;
    totalLikes: number;
  } | null;
}

const IS_PROD = process.env.NODE_ENV === 'production';

// tRPC initialization
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Structured insufficient-credit payload (R16-01). Carried on the error
    // `cause` by `insufficientCreditsError` and projected to the client as
    // `data.credit` — never merged into the human message.
    const cause = error.cause as { credit?: unknown } | undefined;
    const credit =
      cause && typeof cause === 'object' && cause.credit && typeof cause.credit === 'object'
        ? (cause.credit as { required: number; balance: number; shortfall: number; featureKey: string })
        : null;
    // Rate-limit rejection (§1.4) — tRPC maps TOO_MANY_REQUESTS to HTTP 429 but
    // cannot set Retry-After, so the backoff hint travels in the error body.
    const rateLimit =
      cause && typeof cause === 'object' && 'retryAfterMs' in cause && 'bucket' in cause
        ? (cause as unknown as { bucket: string; retryAfterMs: number })
        : null;
    return {
      ...shape,
      // Strip stack traces and internal messages in production (security: #9 on checklist)
      message: IS_PROD && error.code === 'INTERNAL_SERVER_ERROR'
        ? 'An internal error occurred'
        : shape.message,
      data: {
        ...shape.data,
        // Never expose stack traces to the client in production
        stack: IS_PROD ? undefined : shape.data?.stack,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        ...(credit ? { credit } : {}),
        ...(rateLimit ? { rateLimit: { bucket: rateLimit.bucket, retryAfterMs: rateLimit.retryAfterMs } } : {}),
      },
    };
  },
});

// Middleware for authenticated routes
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Middleware for admin-only routes (ADMIN role required)
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  if (ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Middleware for admin + moderator routes
const isAdminOrModerator = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'MODERATOR') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderator access required' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Middleware for the Raivstream 5.0 creative layer.
// The semantic studio has no kids/R16 mode, so — like /generate and
// /story-studio — it must never be reachable from the R16 surface. This is the
// API-level guarantee; the web middleware also blocks the routes.
const isNotR16 = t.middleware(({ ctx, next }) => {
  if (ctx.isR16) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream Studio is not available in R16 mode.' });
  }
  return next();
});

// Middleware for R16-only endpoints (e.g. R16 story video export).
// Complements isNotR16: that blocks R16 users from the 5.0 studio;
// requireR16 blocks non-R16 users from R16-specific procedures.
const requireR16 = t.middleware(({ ctx, next }) => {
  if (!ctx.isR16) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This endpoint is only available in R16 mode.' });
  }
  return next();
});

// Rate limiting (operational patterns §1.4). Runs after the auth middleware in
// every tier so `ctx.user` is populated; the bucket is chosen from the role and
// the procedure path. State lives in Redis, shared with every process.
const rateLimit = t.middleware(async ({ ctx, path, next }) => {
  await enforceRateLimit({
    path,
    user: ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null,
    userId: ctx.userId,
    ip: ctx.ip ?? null,
  });
  return next();
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure.use(rateLimit);
export const protectedProcedure = t.procedure.use(isAuthed).use(rateLimit);
export const creativeProcedure = t.procedure.use(isAuthed).use(isNotR16).use(rateLimit);
export const r16Procedure = t.procedure.use(isAuthed).use(requireR16).use(rateLimit);
export const adminProcedure = t.procedure.use(isAdmin).use(rateLimit);
export const moderatorProcedure = t.procedure.use(isAdminOrModerator).use(rateLimit);

/**
 * D-004 - org-scoped access.
 *
 * Every org-scoped procedure must carry `input.orgId`; this reads it from the
 * input rather than a header so the check cannot be bypassed by calling a
 * different route, and so the org is always explicit at the call site.
 *
 * Only ORG_ADMIN / ORG_MODERATOR with ACTIVE status pass: a STUDENT is a member
 * but must not see the roster or other students' work.
 */
const hasOrgRole = t.middleware(async ({ ctx, next, input }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  const orgId = (input as { orgId?: unknown } | undefined)?.orgId;
  if (typeof orgId !== 'string' || orgId.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'orgId is required' });
  }

  const membership = await ctx.prisma.organizationMember.findFirst({
    where: {
      organizationId: orgId,
      userId: ctx.user.id,
      status: 'ACTIVE',
      role: { in: ['ORG_ADMIN', 'ORG_MODERATOR'] },
    },
    select: { id: true, organizationId: true, userId: true, role: true },
  });

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization access required' });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      orgMembership: {
        ...membership,
        role: membership.role as 'ORG_ADMIN' | 'ORG_MODERATOR',
      },
    },
  });
});

// A passthrough input parser runs BEFORE the guard, so `input.orgId` is populated
// inside the middleware. Without it, `.use()` middlewares can observe `input` as
// undefined when the caller supplies its schema via a later `.input(...)`.
export const orgModeratorProcedure = t.procedure
  .input((raw: unknown) => raw as { orgId?: string })
  .use(hasOrgRole)
  .use(rateLimit);
export const middleware = t.middleware;
