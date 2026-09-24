import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash, createHmac, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import {
  createFalMediaProvider,
  createMockMediaProvider,
  FAL_ALLOWED_ENDPOINTS,
  FAL_ENDPOINTS,
  falDisabledReason,
  getMediaProvider,
  isFalCapabilityLive,
  isFalEndpointAllowed,
  MediaProviderError,
  readFalMediaConfig,
  verifyHmacSha256Signature,
  WebhookIdempotencyStore,
  normalizeFalQueueStatus,
  toFlux2Input,
  parseFlux2Output,
  toH3MaxInput,
  parseH3MaxOutput,
  toVeedFabricInput,
  parseVeedFabricOutput,
  verifyFalWebhookSignature,
  fetchFalJwks,
  __resetFalJwksCacheForTests,
  type FalMediaConfig,
  type FalQueueTransport,
} from '../index';

function cfg(overrides: Partial<FalMediaConfig> = {}): FalMediaConfig {
  return { ...readFalMediaConfig({}), ...overrides };
}

function fakeTransport(): FalQueueTransport & { submit: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; result: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
  return {
    submit: vi.fn(async () => 'req_1'),
    status: vi.fn(async () => ({ status: 'COMPLETED' as const })),
    result: vi.fn(async () => ({ images: [{ url: 'https://fal.media/out.png', width: 1024, height: 1024 }] })),
    cancel: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('media provider config (default-off)', () => {
  it('defaults every switch to disabled with an empty env', () => {
    const c = readFalMediaConfig({});
    expect(c.mediaProviderEnabled).toBe(false);
    expect(c.realProviderCallsEnabled).toBe(false);
    expect(c.imageEnabled).toBe(false);
    expect(c.videoEnabled).toBe(false);
    expect(c.ugcEnabled).toBe(false);
    expect(c.maxRequests).toBe(0);
    expect(c.useProductionStorage).toBe(false);
    expect(c.credentialPresent).toBe(false);
  });

  it('keeps the master switch off unless explicitly enabled', () => {
    const c = readFalMediaConfig({ FAL_MAX_REQUESTS: '10', FAL_IMAGE_ENABLED: 'true' });
    expect(c.mediaProviderEnabled).toBe(false);
    expect(isFalCapabilityLive(c, 'image')).toBe(false);
  });

  it('requires every gate before a capability is live', () => {
    const partial = cfg({ mediaProviderEnabled: true, realProviderCallsEnabled: true, imageEnabled: true, maxRequests: 5, credentialPresent: false });
    expect(isFalCapabilityLive(partial, 'image')).toBe(false);
    const full = cfg({ mediaProviderEnabled: true, realProviderCallsEnabled: true, imageEnabled: true, maxRequests: 5, credentialPresent: true });
    expect(isFalCapabilityLive(full, 'image')).toBe(true);
    expect(falDisabledReason(full, 'image')).toBe('enabled');
  });

  it('restricts endpoints to the explicit allowlist', () => {
    expect(isFalEndpointAllowed(FAL_ENDPOINTS.image)).toBe(true);
    expect(FAL_ALLOWED_ENDPOINTS).toEqual([FAL_ENDPOINTS.image, FAL_ENDPOINTS.video, FAL_ENDPOINTS.ugc]);
    expect(isFalEndpointAllowed('evil/model')).toBe(false);
  });
});

describe('fal adapter scaffolding (calls disabled)', () => {
  it('throws PROVIDER_DISABLED and never calls the transport by default', async () => {
    const transport = fakeTransport();
    const provider = createFalMediaProvider({ config: cfg(), transport });
    await expect(provider.image!.submitImage({ prompt: 'x' }, { idempotencyKey: 'k1' })).rejects.toMatchObject({
      code: 'PROVIDER_DISABLED',
    });
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('submits and normalizes a completed status only when all gates are open', async () => {
    const transport = fakeTransport();
    const provider = createFalMediaProvider({
      config: cfg({ mediaProviderEnabled: true, realProviderCallsEnabled: true, imageEnabled: true, maxRequests: 5, credentialPresent: true }),
      transport,
    });
    const ref = await provider.image!.submitImage({ prompt: 'a cat', aspectRatio: '9:16' }, { idempotencyKey: 'k2' });
    expect(ref).toMatchObject({ provider: 'fal', kind: 'image', requestId: 'req_1', model: FAL_ENDPOINTS.image });
    expect(transport.submit).toHaveBeenCalledWith(FAL_ENDPOINTS.image, expect.objectContaining({ prompt: 'a cat', image_size: 'portrait_16_9' }), { webhookUrl: undefined });

    const status = await provider.image!.getStatus(ref);
    expect(status.status).toBe('completed');
    expect(status.outputUrls).toEqual(['https://fal.media/out.png']);
    expect(status.usage?.provider).toBe('fal');
  });

  it('enforces the request cap (fail-closed)', async () => {
    const transport = fakeTransport();
    const provider = createFalMediaProvider({
      config: cfg({ mediaProviderEnabled: true, realProviderCallsEnabled: true, imageEnabled: true, maxRequests: 1, credentialPresent: true }),
      transport,
    });
    await provider.image!.submitImage({ prompt: 'x' }, { idempotencyKey: 'k3' });
    await expect(provider.image!.submitImage({ prompt: 'y' }, { idempotencyKey: 'k4' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('rejects endpoints that are not on the allowlist', async () => {
    const transport = fakeTransport();
    const provider = createFalMediaProvider({
      config: cfg({
        mediaProviderEnabled: true,
        realProviderCallsEnabled: true,
        imageEnabled: true,
        maxRequests: 5,
        credentialPresent: true,
        endpoints: { ...FAL_ENDPOINTS, image: 'evil/model' },
      }),
      transport,
    });
    await expect(provider.image!.submitImage({ prompt: 'x' }, { idempotencyKey: 'k5' })).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('normalizes fal queue statuses', () => {
    expect(normalizeFalQueueStatus('IN_QUEUE')).toBe('queued');
    expect(normalizeFalQueueStatus('IN_PROGRESS')).toBe('generating');
    expect(normalizeFalQueueStatus('COMPLETED')).toBe('completed');
    expect(normalizeFalQueueStatus('FAILED')).toBe('failed');
    expect(normalizeFalQueueStatus('CANCELLED')).toBe('cancelled');
  });
});

describe('mock provider', () => {
  it('is deterministic and never touches the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled'));
    const provider = createMockMediaProvider();
    const ref1 = await provider.image!.submitImage({ prompt: 'same' }, { idempotencyKey: 'stable' });
    const ref2 = await provider.image!.submitImage({ prompt: 'same' }, { idempotencyKey: 'stable' });
    expect(ref1.requestId).toBe(ref2.requestId);
    const status = await provider.image!.getStatus(ref1);
    expect(status.status).toBe('completed');
    expect(status.outputUrls[0]).toContain('mock.raivstream.invalid');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves to mock when the master switch is off', () => {
    const provider = getMediaProvider({ config: cfg() });
    expect(provider.name).toBe('mock');
    expect(provider.capabilities.every((c) => c.enabled)).toBe(true);
  });
});

describe('webhook verification + idempotency', () => {
  const secret = 'test-webhook-secret';
  const payload = JSON.stringify({ request_id: 'abc', status: 'OK' });

  it('accepts a valid HMAC-SHA256 signature (hex and prefixed)', () => {
    const hex = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSha256Signature({ payload, signature: hex, secret })).toBe(true);
    expect(verifyHmacSha256Signature({ payload, signature: `sha256=${hex}`, secret })).toBe(true);
    const b64 = createHmac('sha256', secret).update(payload).digest('base64');
    expect(verifyHmacSha256Signature({ payload, signature: b64, secret })).toBe(true);
  });

  it('rejects tampered, missing, or wrong-secret signatures', () => {
    const hex = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSha256Signature({ payload: payload + 'x', signature: hex, secret })).toBe(false);
    expect(verifyHmacSha256Signature({ payload, signature: undefined, secret })).toBe(false);
    expect(verifyHmacSha256Signature({ payload, signature: hex, secret: 'other' })).toBe(false);
  });

  it('deduplicates duplicate webhook deliveries', () => {
    const store = new WebhookIdempotencyStore({ ttlMs: 60_000 });
    expect(store.begin('fal:COMPLETED:req_1')).toBe(true);
    expect(store.begin('fal:COMPLETED:req_1')).toBe(false);
    expect(store.size()).toBe(1);
  });
});

describe('fal ED25519 webhook verification', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = { x: (publicKey.export({ format: 'jwk' }) as { x: string }).x };
  const baseHeaders = { requestId: 'req_1', userId: 'user_1', timestamp: '1700000000' };
  const rawBody = JSON.stringify({ request_id: 'req_1', status: 'OK' });
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const message = Buffer.from([baseHeaders.requestId, baseHeaders.userId, baseHeaders.timestamp, bodyHash].join('\n'), 'utf8');
  const signature = cryptoSign(null, message, privateKey).toString('hex');

  it('accepts a valid ED25519 signature', () => {
    expect(
      verifyFalWebhookSignature({ headers: { ...baseHeaders, signature }, rawBody, jwks: [jwk], nowSeconds: 1700000000 }),
    ).toBe(true);
  });

  it('rejects tampered body, wrong key, stale timestamp, and missing header', () => {
    expect(
      verifyFalWebhookSignature({ headers: { ...baseHeaders, signature }, rawBody: rawBody + 'x', jwks: [jwk], nowSeconds: 1700000000 }),
    ).toBe(false);
    expect(
      verifyFalWebhookSignature({ headers: { ...baseHeaders, signature }, rawBody, jwks: [{ x: 'AAAA' }], nowSeconds: 1700000000 }),
    ).toBe(false);
    expect(
      verifyFalWebhookSignature({ headers: { ...baseHeaders, signature }, rawBody, jwks: [jwk], nowSeconds: 1700000999 }),
    ).toBe(false);
    expect(
      verifyFalWebhookSignature({ headers: { ...baseHeaders, signature: undefined }, rawBody, jwks: [jwk], nowSeconds: 1700000000 }),
    ).toBe(false);
  });

  it('fetches and caches JWKS without real network (injected fetch)', async () => {
    __resetFalJwksCacheForTests();
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }) as unknown as Response);
    const first = await fetchFalJwks({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 1000, maxAgeMs: 10_000 });
    const second = await fetchFalJwks({ fetchImpl: fetchImpl as unknown as typeof fetch, now: 2000, maxAgeMs: 10_000 });
    expect(first).toEqual([jwk]);
    expect(second).toEqual([jwk]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    __resetFalJwksCacheForTests();
  });
});

describe('fal model contract mapping', () => {
  it('maps reconciled FLUX.2 text-to-image input and rejects image inputs', () => {
    expect(toFlux2Input({ prompt: 'p', aspectRatio: '9:16' })).toMatchObject({
      prompt: 'p',
      image_size: 'portrait_16_9',
    });
    expect(toFlux2Input({ prompt: 'p', width: 1024, height: 1024 })).toMatchObject({
      image_size: { width: 1024, height: 1024 },
    });
    expect(() => toFlux2Input({ prompt: 'p', imageUrls: ['https://in/1.png'] })).toThrowError(/text-to-image/);
  });

  it('parses FLUX.2 output images, metadata and nsfw flag', () => {
    const parsed = parseFlux2Output({
      images: [{ url: 'https://fal/x.png', content_type: 'image/png', width: 1024, height: 1024, file_size: 123 }],
      seed: 7,
      has_nsfw_concepts: [false],
    });
    expect(parsed.urls).toEqual(['https://fal/x.png']);
    expect(parsed.media[0]).toMatchObject({
      url: 'https://fal/x.png',
      contentType: 'image/png',
      width: 1024,
      height: 1024,
      fileSize: 123,
    });
    expect(parsed.usage?.metrics).toMatchObject({ seed: 7, nsfwFlagged: 'false' });
    expect(parseFlux2Output({ images: [{ url: 'not-a-url' }] }).urls).toEqual([]);
  });

  it('maps H3-Max i2v input and parses video output', () => {
    expect(toH3MaxInput({ prompt: 'p', imageUrl: 'https://in/a.png', durationSeconds: 8, seed: 42 })).toMatchObject({
      prompt: 'p',
      image_url: 'https://in/a.png',
      duration: 8,
      seed: 42,
    });
    expect(parseH3MaxOutput({ video: { url: 'https://fal/v.mp4' } }).urls).toEqual(['https://fal/v.mp4']);
  });

  it('normalises H3-Max resolution to the provider enum and drops invalid values', () => {
    expect(toH3MaxInput({ prompt: 'p', imageUrl: 'https://in/a.png', resolution: '1080p' }).resolution).toBe('1080P');
    expect(toH3MaxInput({ prompt: 'p', imageUrl: 'https://in/a.png', resolution: '768P' }).resolution).toBe('768P');
    expect(toH3MaxInput({ prompt: 'p', imageUrl: 'https://in/a.png', resolution: '720p' }).resolution).toBeUndefined();
  });

  it('maps VEED Fabric input and parses video output', () => {
    expect(toVeedFabricInput({ imageUrl: 'https://in/a.png', audioUrl: 'https://in/a.mp3', resolution: '720p' })).toMatchObject({
      image_url: 'https://in/a.png',
      audio_url: 'https://in/a.mp3',
      resolution: '720p',
    });
    // resolution is required by the endpoint — defaulted and sanitized, never omitted
    expect(toVeedFabricInput({ imageUrl: 'https://in/a.png', audioUrl: 'https://in/a.mp3' })).toMatchObject({
      resolution: '720p',
    });
    expect(toVeedFabricInput({ imageUrl: 'https://in/a.png', audioUrl: 'https://in/a.mp3', resolution: '1080p' })).toMatchObject({
      resolution: '720p',
    });
    expect(toVeedFabricInput({ imageUrl: 'https://in/a.png', audioUrl: 'https://in/a.mp3', resolution: '480p' })).toMatchObject({
      resolution: '480p',
    });
    expect(parseVeedFabricOutput({ video: { url: 'https://fal/ugc.mp4' } }).urls).toEqual(['https://fal/ugc.mp4']);
  });

  it('normalized error is serializable without secrets', () => {
    const err = new MediaProviderError('PROVIDER_DISABLED', 'fal image disabled', { retryable: false });
    expect(err.toNormalized()).toEqual({ code: 'PROVIDER_DISABLED', message: 'fal image disabled', retryable: false });
  });
});

describe('fal transport 403 → PROVIDER_DISABLED', () => {
  function liveImageCfg(): FalMediaConfig {
    return cfg({
      credentialPresent: true,
      mediaProviderEnabled: true,
      realProviderCallsEnabled: true,
      imageEnabled: true,
      videoEnabled: true,
      maxRequests: 10,
    });
  }

  it('translates HTTP 403 from transport.submit to non-retryable PROVIDER_DISABLED (image)', async () => {
    const transport = fakeTransport();
    const err403 = Object.assign(new Error('Forbidden'), { status: 403 });
    transport.submit.mockRejectedValue(err403);
    const provider = createFalMediaProvider({ config: liveImageCfg(), transport });
    const thrown = await provider.image!.submitImage({ prompt: 'x' }, { idempotencyKey: 'k-403-img' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(MediaProviderError);
    const mpe = thrown as MediaProviderError;
    expect(mpe.code).toBe('PROVIDER_DISABLED');
    expect(mpe.retryable).toBe(false);
    expect(mpe.providerStatus).toBe(403);
  });

  it('translates HTTP 403 from transport.submit to non-retryable PROVIDER_DISABLED (video)', async () => {
    const transport = fakeTransport();
    const err403 = Object.assign(new Error('Forbidden'), { status: 403 });
    transport.submit.mockRejectedValue(err403);
    const provider = createFalMediaProvider({ config: liveImageCfg(), transport });
    const thrown = await provider.video!.submitVideo(
      { prompt: 'x', imageUrl: 'https://cdn.example.com/img.jpg', durationSeconds: 5, resolution: '720p' },
      { idempotencyKey: 'k-403-vid' },
    ).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(MediaProviderError);
    const mpe = thrown as MediaProviderError;
    expect(mpe.code).toBe('PROVIDER_DISABLED');
    expect(mpe.retryable).toBe(false);
    expect(mpe.providerStatus).toBe(403);
  });

  it('does not swallow non-403 transport errors', async () => {
    const transport = fakeTransport();
    transport.submit.mockRejectedValue(new Error('Network error'));
    const provider = createFalMediaProvider({ config: liveImageCfg(), transport });
    const thrown = await provider.image!.submitImage({ prompt: 'x' }, { idempotencyKey: 'k-net' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Network error');
    expect(thrown).not.toBeInstanceOf(MediaProviderError);
  });
});
