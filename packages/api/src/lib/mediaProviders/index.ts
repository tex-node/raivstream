/**
 * Provider-neutral media layer — public entry point.
 *
 * Application code should depend on these interfaces, never on a provider SDK.
 * Default resolution is the deterministic mock; the fal adapter is only
 * selected when `FAL_MEDIA_PROVIDER_ENABLED=true`, and still performs no live
 * call unless every gate is open (see `config.ts`).
 */

export * from './types';
export * from './config';
export * from './webhook';
export { createMockMediaProvider } from './mockProvider';
export { createFalMediaProvider, createDefaultFalQueueTransport, normalizeFalQueueStatus } from './fal/falMediaProvider';
export type { FalQueueTransport } from './fal/falMediaProvider';
export * from './fal/contracts';
export { verifyFalWebhookSignature, fetchFalJwks, __resetFalJwksCacheForTests } from './fal/falWebhook';
export type { FalJwk, FalWebhookHeaders, VerifyFalWebhookOptions } from './fal/falWebhook';
export * from './webhookProcessing';
export * from './outputValidation';
export * from './refundOperationsMonitor';

import type { MediaProvider } from './types';
import { readFalMediaConfig, type FalMediaConfig } from './config';
import { createMockMediaProvider } from './mockProvider';
import { createFalMediaProvider, type FalQueueTransport } from './fal/falMediaProvider';

export interface ResolveMediaProviderDeps {
  config?: FalMediaConfig;
  transport?: FalQueueTransport;
}

/**
 * Resolve the active media provider. Defaults to the mock (safe, offline).
 * The fal adapter is selected only when the master switch is on; it remains
 * call-gated internally.
 */
export function getMediaProvider(deps: ResolveMediaProviderDeps = {}): MediaProvider {
  const config = deps.config ?? readFalMediaConfig();
  if (config.mediaProviderEnabled) {
    return createFalMediaProvider({ config, transport: deps.transport });
  }
  return createMockMediaProvider();
}

export interface MediaProviderStatus {
  provider: 'fal' | 'mock';
  realCallsEnabled: boolean;
  capabilities: MediaProvider['capabilities'];
}

export function getMediaProviderStatus(deps: ResolveMediaProviderDeps = {}): MediaProviderStatus {
  const config = deps.config ?? readFalMediaConfig();
  const provider = getMediaProvider(deps);
  return {
    provider: provider.name === 'fal' ? 'fal' : 'mock',
    realCallsEnabled: config.mediaProviderEnabled && config.realProviderCallsEnabled && config.maxRequests > 0,
    capabilities: provider.capabilities,
  };
}
