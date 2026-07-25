// Re-export tRPC base helpers from dedicated file (avoids circular deps with routers)
export type { Context } from './trpc';
export { router, publicProcedure, protectedProcedure, adminProcedure, moderatorProcedure, middleware } from './trpc';

import { router } from './trpc';

// Import sub-routers
import { authRouter } from './routers/auth';
import { videoRouter } from './routers/video';
import { feedRouter } from './routers/feed';
import { interactionRouter } from './routers/interaction';
import { userRouter } from './routers/user';
import { analyticsRouter } from './routers/analytics';
import { generationRouter } from './routers/generation';
import { runpodRouter } from './routers/runpod';
import { adminRouter } from './routers/admin';
import { notificationRouter } from './routers/notification';
import { storyRouter } from './routers/story';
import { academyRouter } from './routers/academy';

// Root app router
export const appRouter = router({
  auth: authRouter,
  video: videoRouter,
  feed: feedRouter,
  interaction: interactionRouter,
  user: userRouter,
  analytics: analyticsRouter,
  generation: generationRouter,
  runpod: runpodRouter,
  admin: adminRouter,
  notification: notificationRouter,
  story: storyRouter,
  academy: academyRouter,
});

export type AppRouter = typeof appRouter;
