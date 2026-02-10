import { initTRPC, TRPCError } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { auth } from '@clerk/nextjs';
import { prisma } from '@raivstream/database';
import superjson from 'superjson';
import { ZodError } from 'zod';

// Context creation
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { userId } = auth();

  let user = null;
  if (userId) {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });
  }

  return {
    prisma,
    user,
    userId,
  };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// tRPC initialization
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
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
      user: ctx.user,
    },
  });
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const middleware = t.middleware;

// Import sub-routers
import { videoRouter } from './routers/video';
import { feedRouter } from './routers/feed';
import { interactionRouter } from './routers/interaction';
import { userRouter } from './routers/user';

// Root app router
export const appRouter = router({
  video: videoRouter,
  feed: feedRouter,
  interaction: interactionRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
