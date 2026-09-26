import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { PrismaClient } from '@raivstream/database';

// Generic context shape — concrete context is created per-adapter (see apps/web/src/app/api/trpc)
export interface Context {
  prisma: PrismaClient;
  userId: string | null;
  isR16?: boolean;
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

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const creativeProcedure = t.procedure.use(isAuthed).use(isNotR16);
export const r16Procedure = t.procedure.use(isAuthed).use(requireR16);
export const adminProcedure = t.procedure.use(isAdmin);
export const moderatorProcedure = t.procedure.use(isAdminOrModerator);
export const middleware = t.middleware;
