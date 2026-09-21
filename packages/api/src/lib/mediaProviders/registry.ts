/**
 * Provider capability registry + health snapshot (Phase 6).
 *
 * A single, provider-neutral view of every media provider Raivstream can route
 * to — fal.ai, RunPod, xAI, Kling, and Google Gemini — reporting, for each
 * capability (image / video / UGC video), whether the provider is *configured*
 * (required credential/endpoint present) and *enabled* (all gates open and a
 * live call is permitted).
 *
 * Safety invariants:
 *   - Reads env presence only. No credential VALUE is ever returned or logged.
 *   - No network. This is a pure, synchronous snapshot for health dashboards,
 *     not a liveness probe.
 *   - fal.enabled honours the full fail-closed gate chain (master switch +
 *     real-calls switch + per-capability switch + maxRequests + credential).
 *
 * This registry is the observability counterpart to the `mediaProviders`
 * adapter boundary. It intentionally does NOT re-export provider SDK types.
 */

import {
  falDisabledReason,
  isFalCapabilityLive,
  readFalMediaConfig,
  type FalMediaConfig,
} from './config';

export type ProviderId = 'fal' | 'runpod' | 'xai' | 'kling' | 'gemini';
export type ProviderCapabilityKind = 'image' | 'video' | 'ugc_video';

export interface ProviderCapabilityHealth {
  kind: ProviderCapabilityKind;
  /** Model key as stored on GenerationJob.model / MODEL_META. */
  model: string;
  /** Provider endpoint slug/id (may be a default, not a secret). */
  endpoint?: string;
  /** Required credential/endpoint is present. */
  configured: boolean;
  /** Configured AND all gates open (a live submission is permitted). */
  enabled: boolean;
  /** Human-readable reason a capability is not enabled (no secrets). */
  reason?: string;
}

export interface ProviderHealth {
  id: ProviderId;
  name: string;
  configured: boolean;
  capabilities: ProviderCapabilityHealth[];
}

function has(env: NodeJS.ProcessEnv, key: string): boolean {
  const value = env[key];
  return typeof value === 'string' && value.length > 0;
}

type CapabilityDef = Omit<ProviderCapabilityHealth, 'configured' | 'enabled' | 'reason'>;

function capability(def: CapabilityDef, configured: boolean, enabled: boolean, reason?: string): ProviderCapabilityHealth {
  return { ...def, configured, enabled, ...(enabled ? {} : { reason }) };
}

// ─── fal.ai ────────────────────────────────────────────────────────────────────

function falHealth(env: NodeJS.ProcessEnv): ProviderHealth {
  const cfg: FalMediaConfig = readFalMediaConfig(env);
  // fal's internal gate uses 'ugc'; the registry's public kind is 'ugc_video'.
  const falKind = (kind: ProviderCapabilityKind): 'image' | 'video' | 'ugc' => (kind === 'ugc_video' ? 'ugc' : kind);
  const cap = (kind: ProviderCapabilityKind, model: string, endpoint: string): ProviderCapabilityHealth => {
    const gate = falKind(kind);
    const enabled = isFalCapabilityLive(cfg, gate);
    return capability({ kind, model, endpoint }, cfg.credentialPresent, enabled, enabled ? undefined : falDisabledReason(cfg, gate));
  };
  return {
    id: 'fal',
    name: 'fal.ai',
    configured: cfg.credentialPresent && cfg.mediaProviderEnabled,
    capabilities: [
      cap('image', 'FLUX2', cfg.endpoints.image),
      cap('video', 'H3_MAX', cfg.endpoints.video),
      cap('ugc_video', 'VEED_FABRIC', cfg.endpoints.ugc),
    ],
  };
}

// ─── RunPod ────────────────────────────────────────────────────────────────────

function runpodHealth(env: NodeJS.ProcessEnv): ProviderHealth {
  const apiKey = has(env, 'RUNPOD_API_KEY');

  const custom = (model: string, envKey: string, fallback?: string): ProviderCapabilityHealth => {
    const endpoint = env[envKey] ?? fallback;
    const configured = apiKey && has(env, envKey);
    return capability(
      { kind: 'video' as const, model, ...(endpoint ? { endpoint } : {}) },
      configured,
      configured,
      configured ? undefined : has(env, envKey) ? 'RUNPOD_API_KEY is not set' : `${envKey} is not set`,
    );
  };

  return {
    id: 'runpod',
    name: 'RunPod',
    configured: apiKey,
    capabilities: [
      capability(
        { kind: 'image', model: 'FLUX', endpoint: env.RUNPOD_FLUX_PUBLIC_ENDPOINT ?? 'black-forest-labs-flux-1-dev' },
        apiKey,
        apiKey,
        apiKey ? undefined : 'RUNPOD_API_KEY is not set',
      ),
      capability(
        { kind: 'video', model: 'WAN_25', endpoint: env.RUNPOD_WAN26_T2V_ENDPOINT ?? 'wan-2-6-t2v' },
        apiKey,
        apiKey,
        apiKey ? undefined : 'RUNPOD_API_KEY is not set',
      ),
      capability(
        { kind: 'video', model: 'SEEDANCE', endpoint: env.RUNPOD_SEEDANCE_PUBLIC_ENDPOINT ?? 'seedance-v1-5-pro-i2v' },
        apiKey,
        apiKey,
        apiKey ? undefined : 'RUNPOD_API_KEY is not set',
      ),
      custom('HUNYUAN_VIDEO', 'RUNPOD_HUNYUAN_ENDPOINT_ID'),
      custom('COG_VIDEO_X', 'RUNPOD_COGVIDEOX_ENDPOINT_ID'),
      custom('LTX2', 'RUNPOD_LTX2_ENDPOINT_ID'),
    ],
  };
}

// ─── Other direct providers ───────────────────────────────────────────────────

function xaiHealth(env: NodeJS.ProcessEnv): ProviderHealth {
  const key = has(env, 'XAI_API_KEY');
  return {
    id: 'xai',
    name: 'xAI',
    configured: key,
    capabilities: [
      capability({ kind: 'image', model: 'GROK_IMAGINE', endpoint: 'grok-imagine-image' }, key, key, key ? undefined : 'XAI_API_KEY is not set'),
    ],
  };
}

function klingHealth(env: NodeJS.ProcessEnv): ProviderHealth {
  const configured = has(env, 'KLING_ACCESS_KEY') && has(env, 'KLING_SECRET_KEY');
  const reason = configured ? undefined : 'KLING_ACCESS_KEY and KLING_SECRET_KEY are required';
  return {
    id: 'kling',
    name: 'Kling (Kuaishou)',
    configured,
    capabilities: [
      capability({ kind: 'video', model: 'KLING_I2V', endpoint: 'kling-v1-6' }, configured, configured, reason),
      capability({ kind: 'video', model: 'KLING_R2V', endpoint: 'kling-v1-6' }, configured, configured, reason),
    ],
  };
}

function geminiHealth(env: NodeJS.ProcessEnv): ProviderHealth {
  const key = has(env, 'GEMINI_API_KEY');
  const reason = key ? undefined : 'GEMINI_API_KEY is not set';
  return {
    id: 'gemini',
    name: 'Google Gemini',
    configured: key,
    capabilities: [
      capability({ kind: 'image', model: 'NANO_BANANA' }, key, key, reason),
      capability({ kind: 'video', model: 'VEO3' }, key, key, reason),
    ],
  };
}

// ─── Registry ──────────────────────────────────────────────────────────────────

const PROVIDER_BUILDERS: Record<ProviderId, (env: NodeJS.ProcessEnv) => ProviderHealth> = {
  fal: falHealth,
  runpod: runpodHealth,
  xai: xaiHealth,
  kling: klingHealth,
  gemini: geminiHealth,
};

/** Build the full provider health snapshot. Pure; reads env presence only. */
export function getProviderRegistry(env: NodeJS.ProcessEnv = process.env): ProviderHealth[] {
  return (Object.keys(PROVIDER_BUILDERS) as ProviderId[]).map((id) => PROVIDER_BUILDERS[id](env));
}

/**
 * Resolve availability for a single model key (as used on `GenerationJob.model`
 * and `MODEL_META`) against the registry. Returns `undefined` for model keys
 * that are not tracked by the registry (e.g. `HIGGSFIELD`, legacy `KLING`),
 * so callers can distinguish "unknown" from "unavailable".
 */
export function resolveModelAvailability(
  providers: ProviderHealth[],
  model: string,
): { available: boolean; reason?: string } | undefined {
  for (const provider of providers) {
    const capability = provider.capabilities.find((c) => c.model === model);
    if (capability) {
      return { available: capability.enabled, ...(capability.reason ? { reason: capability.reason } : {}) };
    }
  }
  return undefined;
}

/** Convenience summary counts for dashboards. */
export function summarizeProviderRegistry(providers: ProviderHealth[]): {
  providers: number;
  configured: number;
  capabilitiesConfigured: number;
  capabilitiesEnabled: number;
} {
  let capabilitiesConfigured = 0;
  let capabilitiesEnabled = 0;
  for (const provider of providers) {
    for (const capability of provider.capabilities) {
      if (capability.configured) capabilitiesConfigured += 1;
      if (capability.enabled) capabilitiesEnabled += 1;
    }
  }
  return {
    providers: providers.length,
    configured: providers.filter((p) => p.configured).length,
    capabilitiesConfigured,
    capabilitiesEnabled,
  };
}
