/**
 * Deterministic mock media provider — pipeline/tests only.
 *
 * Makes ZERO network calls and returns deterministic, non-routable
 * `https://mock.raivstream.invalid/...` URLs. Output is NOT a real asset and
 * MUST NOT be persisted as a production Raivstream asset.
 */

import { createHash } from 'node:crypto';
import type {
  ImageGenerationInput,
  ImageGenerationProvider,
  MediaJobRef,
  MediaJobStatusResult,
  MediaProvider,
  SubmitMediaOptions,
  UGCVideoInput,
  UGCVideoProvider,
  VideoGenerationInput,
  VideoGenerationProvider,
} from './types';

const MOCK_HOST = 'https://mock.raivstream.invalid';

type MockKind = 'image' | 'video' | 'ugc_video';

function fingerprint(kind: MockKind, input: unknown, options: SubmitMediaOptions): string {
  return createHash('sha256')
    .update(kind)
    .update(JSON.stringify(input ?? null))
    .update(options.idempotencyKey)
    .digest('hex')
    .slice(0, 32);
}

function mockResult(kind: MockKind, ref: MediaJobRef): MediaJobStatusResult {
  const ext = kind === 'image' ? 'png' : 'mp4';
  return {
    status: 'completed',
    outputUrls: [`${MOCK_HOST}/${kind}/${ref.requestId}.${ext}`],
    usage: { provider: 'mock', model: `mock-${kind}`, costUsd: 0, billableUnits: 0 },
    raw: { mock: true, kind, idempotencyKey: ref.idempotencyKey },
  };
}

function mockSubmit(kind: MockKind, model: string | undefined, input: unknown, options: SubmitMediaOptions): MediaJobRef {
  const requestId = `mock_${fingerprint(kind, input, options)}`;
  return { provider: 'mock', kind, requestId, idempotencyKey: options.idempotencyKey, model: model ?? `mock-${kind}` };
}

class MockImageProvider implements ImageGenerationProvider {
  readonly name = 'mock';
  readonly kind = 'image' as const;
  async submitImage(input: ImageGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
    return mockSubmit('image', input.model, input, options);
  }
  async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
    return mockResult('image', ref);
  }
  async cancel(): Promise<void> {
    /* no-op for a synchronous mock */
  }
}

class MockVideoProvider implements VideoGenerationProvider {
  readonly name = 'mock';
  readonly kind = 'video' as const;
  async submitVideo(input: VideoGenerationInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
    return mockSubmit('video', input.model, input, options);
  }
  async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
    return mockResult('video', ref);
  }
  async cancel(): Promise<void> {
    /* no-op */
  }
}

class MockUGCProvider implements UGCVideoProvider {
  readonly name = 'mock';
  readonly kind = 'ugc_video' as const;
  async submitUGC(input: UGCVideoInput, options: SubmitMediaOptions): Promise<MediaJobRef> {
    return mockSubmit('ugc_video', input.model, input, options);
  }
  async getStatus(ref: MediaJobRef): Promise<MediaJobStatusResult> {
    return mockResult('ugc_video', ref);
  }
  async cancel(): Promise<void> {
    /* no-op */
  }
}

export function createMockMediaProvider(): MediaProvider {
  return {
    name: 'mock',
    capabilities: [
      { kind: 'image', enabled: true },
      { kind: 'video', enabled: true },
      { kind: 'ugc_video', enabled: true },
    ],
    image: new MockImageProvider(),
    video: new MockVideoProvider(),
    ugc: new MockUGCProvider(),
  };
}
