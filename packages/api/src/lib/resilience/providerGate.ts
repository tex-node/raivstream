/**
 * D-084 - pre-charge provider gate.
 *
 * `deductCredits` sits above the provider call, so before this gate a request
 * for a provider whose breaker was already open still charged and refunded on
 * every attempt. The user paid a round trip (and saw a scary error) to learn
 * something the breaker already knew.
 *
 * The gate reads the same breaker `submitGenerationJob` uses, so there is one
 * source of truth. It runs *before* the job row and before any charge: a
 * refused request creates nothing and costs nothing.
 *
 * `half-open` is deliberately allowed through - it is the recovery probe, and
 * blocking it would keep a recovered provider offline forever.
 */

import { TRPCError } from '@trpc/server';
import { breakerFor } from './circuitBreaker';
import { getProviderRegistry } from '../mediaProviders/registry';

/**
 * Resolve which breaker governs a model, using the provider registry rather
 * than `MODEL_META.provider` (a display string like 'fal.ai - VEED Fabric 1.0'
 * that must not be parsed for routing).
 */
export function providerIdForModel(model: string): string | null {
  for (const provider of getProviderRegistry()) {
    if (provider.capabilities.some((capability) => capability.model === model)) {
      return provider.id;
    }
  }
  return null;
}

export interface ProviderGateDecision {
  providerId: string | null;
  state: 'closed' | 'open' | 'half-open' | null;
  lastFailureAt: string | null;
  /** True only for an open circuit - the one state that blocks. */
  blocked: boolean;
}

/** Pure decision, so the routing/state rules are testable without throwing. */
export function evaluateProviderGate(model: string): ProviderGateDecision {
  const providerId = providerIdForModel(model);
  if (!providerId) {
    return { providerId: null, state: null, lastFailureAt: null, blocked: false };
  }

  const snapshot = breakerFor(providerId).snapshot();
  return {
    providerId,
    state: snapshot.state,
    lastFailureAt: snapshot.lastFailureAt,
    blocked: snapshot.state === 'open',
  };
}

/**
 * Throws PRECONDITION_FAILED when the model's provider circuit is open.
 * An unknown model is allowed through: `submitGenerationJob` will produce its
 * own, more accurate error.
 */
export function assertProviderAvailable(model: string): void {
  const decision = evaluateProviderGate(model);
  if (!decision.blocked) return;

  const since = decision.lastFailureAt
    ? ` Last failure at ${decision.lastFailureAt}.`
    : '';

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message:
      `Provider "${decision.providerId}" is temporarily unavailable, so this ` +
      `request was not submitted and no credits were charged.${since} Try again later.`,
  });
}
