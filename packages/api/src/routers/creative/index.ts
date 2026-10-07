import { router } from '../../trpc';
import { creativeProjectRouter } from './project';
import { creativeIntentRouter } from './intent';
import { creativeHomerRouter } from './homer';
import { creativeProductionRouter } from './production';
import { creativeReviewRouter } from './review';
import { creativeDirectorRouter } from './director';
import { creativeApprovalRouter } from './approval';
import { creativeOutputRouter } from './output';
import { creativeSeriesRouter } from './series';
import { creativeStudioRouter } from './studio';
import { creativeObservabilityRouter } from './observability';

/**
 * Raivstream 5.0 — Creative API surface.
 * Registers as `creative` on the root router.
 */
export const creativeRouter = router({
  project: creativeProjectRouter,
  intent: creativeIntentRouter,
  homer: creativeHomerRouter,
  production: creativeProductionRouter,
  review: creativeReviewRouter,
  director: creativeDirectorRouter,
  approval: creativeApprovalRouter,
  output: creativeOutputRouter,
  series: creativeSeriesRouter,
  studio: creativeStudioRouter,
  observability: creativeObservabilityRouter,
});