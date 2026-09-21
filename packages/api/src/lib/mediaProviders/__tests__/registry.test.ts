import { describe, it, expect } from 'vitest';
import { getProviderRegistry, summarizeProviderRegistry, resolveModelAvailability, type ProviderHealth } from '../registry';

function byId(env: NodeJS.ProcessEnv) {
  const providers = getProviderRegistry(env);
  return Object.fromEntries(providers.map((p) => [p.id, p])) as Record<string, ProviderHealth>;
}

function cap(provider: ProviderHealth, model: string) {
  return provider.capabilities.find((c) => c.model === model);
}

describe('provider registry (env-presence only, no network)', () => {
  it('reports every provider as unconfigured with an empty env', () => {
    const summary = summarizeProviderRegistry(getProviderRegistry({}));
    expect(summary.providers).toBe(5);
    expect(summary.configured).toBe(0);
    expect(summary.capabilitiesConfigured).toBe(0);
    expect(summary.capabilitiesEnabled).toBe(0);
  });

  it('keeps fal fail-closed unless every gate is open', () => {
    const onlyKey = byId({ FAL_KEY: 'k' }).fal;
    expect(onlyKey.configured).toBe(false); // master switch still off
    expect(cap(onlyKey, 'FLUX2')!.enabled).toBe(false);
    expect(cap(onlyKey, 'FLUX2')!.reason).toContain('FAL_MEDIA_PROVIDER_ENABLED');

    const full = byId({
      FAL_KEY: 'k',
      FAL_MEDIA_PROVIDER_ENABLED: 'true',
      FAL_REAL_PROVIDER_CALLS_ENABLED: 'true',
      FAL_IMAGE_ENABLED: 'true',
      FAL_MAX_REQUESTS: '5',
    }).fal;
    expect(full.configured).toBe(true);
    expect(cap(full, 'FLUX2')!.enabled).toBe(true);
    expect(cap(full, 'H3_MAX')!.enabled).toBe(false); // FAL_VIDEO_ENABLED off
    expect(cap(full, 'H3_MAX')!.reason).toContain('FAL_VIDEO_ENABLED');
  });

  it('gates RunPod custom endpoints on their endpoint IDs', () => {
    const rp = byId({ RUNPOD_API_KEY: 'k' }).runpod;
    expect(rp.configured).toBe(true);
    expect(cap(rp, 'FLUX')!.enabled).toBe(true);
    expect(cap(rp, 'WAN_25')!.enabled).toBe(true);
    expect(cap(rp, 'SEEDANCE')!.enabled).toBe(true);
    expect(cap(rp, 'HUNYUAN_VIDEO')!.enabled).toBe(false);
    expect(cap(rp, 'HUNYUAN_VIDEO')!.reason).toContain('RUNPOD_HUNYUAN_ENDPOINT_ID');
    expect(cap(rp, 'LTX2')!.configured).toBe(false);

    const withEndpoint = byId({ RUNPOD_API_KEY: 'k', RUNPOD_HUNYUAN_ENDPOINT_ID: 'id' }).runpod;
    expect(cap(withEndpoint, 'HUNYUAN_VIDEO')!.enabled).toBe(true);
  });

  it('treats xAI, Kling, and Gemini as single-credential providers', () => {
    expect(cap(byId({ XAI_API_KEY: 'k' }).xai, 'GROK_IMAGINE')!.enabled).toBe(true);
    expect(cap(byId({}).xai, 'GROK_IMAGINE')!.enabled).toBe(false);

    const klingHalf = byId({ KLING_ACCESS_KEY: 'a' }).kling;
    expect(klingHalf.configured).toBe(false);
    expect(cap(klingHalf, 'KLING_I2V')!.reason).toContain('KLING_SECRET_KEY');

    expect(cap(byId({ GEMINI_API_KEY: 'k' }).gemini, 'NANO_BANANA')!.enabled).toBe(true);
    expect(cap(byId({ GEMINI_API_KEY: 'k' }).gemini, 'VEO3')!.enabled).toBe(true);
  });

  it('summarizes counts across all providers', () => {
    const summary = summarizeProviderRegistry(
      getProviderRegistry({ RUNPOD_API_KEY: 'k', XAI_API_KEY: 'k' }),
    );
    expect(summary.configured).toBe(2); // runpod + xai
    expect(summary.capabilitiesEnabled).toBeGreaterThanOrEqual(4); // FLUX, WAN, SEEDANCE, GROK
  });

  it('resolves model availability, distinguishing unknown from unavailable', () => {
    const providers = getProviderRegistry({});
    expect(resolveModelAvailability(providers, 'FLUX')).toMatchObject({ available: false });
    expect(resolveModelAvailability(providers, 'FLUX2')).toMatchObject({ available: false });
    expect(resolveModelAvailability(providers, 'HIGGSFIELD')).toBeUndefined();
    expect(resolveModelAvailability(providers, 'KLING')).toBeUndefined();

    const live = getProviderRegistry({ RUNPOD_API_KEY: 'k' });
    expect(resolveModelAvailability(live, 'FLUX')).toMatchObject({ available: true });
    expect(resolveModelAvailability(live, 'HUNYUAN_VIDEO')).toMatchObject({ available: false });
  });
});
