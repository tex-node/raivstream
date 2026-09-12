import { describe, it, expect } from 'vitest';
import {
  assertIsolatedStorage,
  buildIsolatedR2Key,
  extensionForContentType,
  fetchAndValidateArtifact,
} from '../outputValidation';

function fakeResponse(body: Buffer, init: { ok?: boolean; status?: number; contentType?: string | null; contentLength?: number | null } = {}) {
  const headers = new Headers();
  if (init.contentType) headers.set('content-type', init.contentType);
  if (init.contentLength !== undefined && init.contentLength !== null) headers.set('content-length', String(init.contentLength));
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers,
    arrayBuffer: async () => body,
  } as unknown as Response;
}

const fetchReturning = (res: Response): typeof fetch => (async () => res) as unknown as typeof fetch;

describe('fetchAndValidateArtifact', () => {
  it('returns the validated buffer for a supported image', async () => {
    const out = await fetchAndValidateArtifact('https://fal.media/a.png', {
      fetchImpl: fetchReturning(fakeResponse(Buffer.from('png-bytes'), { contentType: 'image/png', contentLength: 9 })),
    });
    expect(out.contentType).toBe('image/png');
    expect(out.byteLength).toBe(9);
    expect(out.buffer.toString()).toBe('png-bytes');
  });

  it('rejects a non-image content type', async () => {
    await expect(
      fetchAndValidateArtifact('https://fal.media/a.json', {
        fetchImpl: fetchReturning(fakeResponse(Buffer.from('{}'), { contentType: 'application/json' })),
      }),
    ).rejects.toMatchObject({ code: 'RESULT_INVALID' });
  });

  it('rejects when the declared size exceeds the limit', async () => {
    await expect(
      fetchAndValidateArtifact('https://fal.media/big.png', {
        maxBytes: 10,
        fetchImpl: fetchReturning(fakeResponse(Buffer.from('x'), { contentType: 'image/png', contentLength: 999999 })),
      }),
    ).rejects.toMatchObject({ code: 'RESULT_INVALID' });
  });

  it('rejects when the actual body exceeds the limit', async () => {
    await expect(
      fetchAndValidateArtifact('https://fal.media/big.png', {
        maxBytes: 4,
        fetchImpl: fetchReturning(fakeResponse(Buffer.from('12345678'), { contentType: 'image/png' })),
      }),
    ).rejects.toMatchObject({ code: 'RESULT_INVALID' });
  });

  it('rejects a failed download', async () => {
    await expect(
      fetchAndValidateArtifact('https://fal.media/a.png', {
        fetchImpl: fetchReturning(fakeResponse(Buffer.from('x'), { ok: false, status: 404, contentType: 'image/png' })),
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR', providerStatus: 404 });
  });

  it('rejects a malformed/empty body', async () => {
    await expect(
      fetchAndValidateArtifact('https://fal.media/a.png', {
        fetchImpl: fetchReturning(fakeResponse(Buffer.alloc(0), { contentType: 'image/png' })),
      }),
    ).rejects.toMatchObject({ code: 'RESULT_INVALID' });
  });

  it('rejects a non-acceptable URL', async () => {
    await expect(fetchAndValidateArtifact('not-a-url', { fetchImpl: fetchReturning(fakeResponse(Buffer.from('x'))) })).rejects.toMatchObject({
      code: 'RESULT_INVALID',
    });
  });
});

describe('isolated storage planning', () => {
  it('builds a deterministic isolated R2 key', () => {
    expect(buildIsolatedR2Key('vpc2-benchmark/', 'fal', 'req/1', 'image/png')).toBe('vpc2-benchmark/fal/req-1.png');
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('video/mp4')).toBe('mp4');
    expect(extensionForContentType('application/octet-stream')).toBe('bin');
  });

  it('fail-closes when production storage is enabled or staging R2 is missing', () => {
    expect(() => assertIsolatedStorage({ FAL_USE_PRODUCTION_STORAGE: 'true', R2_BUCKET_NAME: 'b', R2_PUBLIC_URL: 'u' })).toThrowError(/PRODUCTION_STORAGE|must remain false/);
    expect(() => assertIsolatedStorage({ FAL_USE_PRODUCTION_STORAGE: 'false' })).toThrowError(/not configured/);
    expect(() => assertIsolatedStorage({ FAL_USE_PRODUCTION_STORAGE: 'false', R2_BUCKET_NAME: 'staging', R2_PUBLIC_URL: 'https://staging' })).not.toThrow();
  });
});
