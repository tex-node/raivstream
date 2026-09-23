import { router } from '../../trpc';
import { creativeProjectRouter } from './project';
import { creativeIntentRouter } from './intent';

/**
 * Raivstream 5.0 — Creative API surface.
 * Registers as `creative` on the root router.
 */
export const creativeRouter = router({
  project: creativeProjectRouter,
  intent: creativeIntentRouter,
});