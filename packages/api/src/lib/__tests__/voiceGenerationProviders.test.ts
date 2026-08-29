import { afterEach, describe, expect, it, vi } from 'vitest';

describe('voiceGenerationProviders registry (Section 27.C)', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('lists no providers when the dev flag is unset — the default, production-safe state', async () => {
    delete process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED;
    const mod = await import('../voiceGenerationProviders');
    expect(mod.listConfiguredVoiceGenerationProviders()).toEqual([]);
    expect(mod.providerIsConfigured(mod.DEV_FIXTURE_PROVIDER_KEY)).toBe(false);
  });

  it('resolving an unconfigured provider fails typed, not silently', async () => {
    delete process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED;
    const mod = await import('../voiceGenerationProviders');
    expect(() => mod.resolveVoiceGenerationProvider(mod.DEV_FIXTURE_PROVIDER_KEY)).toThrow(/VOICE_PROVIDER_NOT_CONFIGURED/);
  });

  it('resolving an unknown provider key fails typed', async () => {
    process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED = 'true';
    const mod = await import('../voiceGenerationProviders');
    expect(() => mod.resolveVoiceGenerationProvider('totally-unknown-vendor')).toThrow(/VOICE_PROVIDER_NOT_CONFIGURED/);
  });

  it('the development provider resolves once explicitly enabled', async () => {
    process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED = 'true';
    const mod = await import('../voiceGenerationProviders');
    expect(mod.listConfiguredVoiceGenerationProviders()).toEqual([mod.DEV_FIXTURE_PROVIDER_KEY]);
    const provider = mod.resolveVoiceGenerationProvider(mod.DEV_FIXTURE_PROVIDER_KEY);
    expect(provider.key).toBe(mod.DEV_FIXTURE_PROVIDER_KEY);
    expect(provider.capabilities().providerKey).toBe(mod.DEV_FIXTURE_PROVIDER_KEY);
  });

  it('a merely-truthy-looking value that is not exactly "true" does not enable the dev provider', async () => {
    process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED = '1';
    const mod = await import('../voiceGenerationProviders');
    expect(mod.listConfiguredVoiceGenerationProviders()).toEqual([]);
  });

  it('diagnostics summary never includes secrets and reports "not configured" honestly by default', async () => {
    delete process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED;
    const mod = await import('../voiceGenerationProviders');
    const summary = mod.voiceGenerationDiagnosticsSummary();
    expect(summary.voiceGenerationConfigured).toBe(false);
    expect(summary.developmentProviderEnabled).toBe(false);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/apiKey|secret|token|bearer/i);
  });
});
