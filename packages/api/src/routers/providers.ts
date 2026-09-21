/**
 * Provider health router (Phase 6 — capability registry observability).
 *
 * Read-only, admin-only snapshot of every configured media provider and its
 * capabilities. No secrets are exposed: only presence/enabled booleans, model
 * keys, endpoint slugs, and human-readable disable reasons.
 */

import { moderatorProcedure, router } from '../trpc';
import { getProviderRegistry, summarizeProviderRegistry } from '../lib/mediaProviders/registry';

export const providersRouter = router({
  /** Full provider health snapshot (admin dashboard / runbooks). */
  health: moderatorProcedure.query(() => {
    const providers = getProviderRegistry();
    return { providers, summary: summarizeProviderRegistry(providers) };
  }),
});
