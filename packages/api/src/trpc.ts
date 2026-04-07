import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { PrismaClient } from '@raivstream/database';

// Generic context shape — concrete context is created per-adapter (see apps/web/src/app/api/trpc)
export interface Context {
  prisma: PrismaClient;
  userId: string | null;
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

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const middleware = t.middleware;
