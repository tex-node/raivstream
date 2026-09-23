import { protectedProcedure, router } from '../../trpc';
import { creativeMetricsSnapshot, getCreativeTimings, resetCreativeTimings } from '../../lib/creative/observability/metrics';

/**
 * Raivstream 5.0 — creative observability surface (Phase 9).
 * Exposes measured latency for the creator-facing pipeline. Read-only, no
 * provider/job detail; reset is available for operators/tests.
 */
export const creativeObservabilityRouter = router({
  metrics: protectedProcedure.query(() => creativeMetricsSnapshot()),
  timings: protectedProcedure.query(() => getCreativeTimings().slice(-50)),
  reset: protectedProcedure.mutation(() => {
    resetCreativeTimings();
    return { ok: true };
  }),
});
