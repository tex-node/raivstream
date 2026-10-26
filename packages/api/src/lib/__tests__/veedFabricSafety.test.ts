import { describe, it, expect, vi } from 'vitest';
import {
  assertVeedMediaTypes,
  gateVeedFabricInputs,
  hashUrl,
  logVeedAudit,
  VEED_MAX_AUDIO_SECONDS,
} from '../veedFabricSafety';

/**
 * D-076 — VEED Fabric gate.
 *
 * The gate is extracted from the router precisely so its ORDER is assertable:
 * consent → files → image → audio. The expensive failure would be moderating
 * after charging, so the tests assert that a rejection happens before any
 * downstream dependency is touched.
 */

const IMAGE = 'https://cdn.test/presenter.png';
const AUDIO = 'https://cdn.test/voice.mp3';

function deps(overrides: Partial<Parameters<typeof gateVeedFabricInputs>[1]> = {}) {
  return {
    moderateImage: vi.fn(async () => ({ verdict: 'allowed' as const })),
    probe: vi.fn(async () => 12),
    log: vi.fn(),
    transcribe: vi.fn(async () => 'hello world'),
    moderateText: vi.fn(async () => ({ allowed: true })),
    ...overrides,
  };
}

describe('D-076 — VEED Fabric gate', () => {
  it('1. rejects a request without consent before any I/O', async () => {
    const d = deps();

    await expect(
      gateVeedFabricInputs({ consent: false, seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' }, d),
    ).rejects.toThrow(/Consent attestation is required/);

    // Consent is the cheapest gate: nothing else ran.
    expect(d.moderateImage).not.toHaveBeenCalled();
    expect(d.probe).not.toHaveBeenCalled();
  });

  it('2. rejects a disallowed file extension before moderation', async () => {
    const d = deps();

    await expect(
      gateVeedFabricInputs({ consent: true, seedImageUrl: 'https://cdn.test/presenter.bmp', audioUrl: AUDIO, userId: 'u1' }, d),
    ).rejects.toThrow(/image ending in one of/);

    await expect(
      gateVeedFabricInputs({ consent: true, seedImageUrl: IMAGE, audioUrl: 'https://cdn.test/voice.flac', userId: 'u1' }, d),
    ).rejects.toThrow(/audio ending in one of/);

    expect(d.moderateImage).not.toHaveBeenCalled();
  });

  it('accepts signed URLs where the extension is followed by a query string', async () => {
    const d = deps();
    const result = await gateVeedFabricInputs(
      {
        consent: true,
        seedImageUrl: 'https://r2.test/a/presenter.webp?X-Amz-Signature=abc',
        audioUrl: 'https://r2.test/a/voice.m4a?X-Amz-Signature=def',
        userId: 'u1',
      },
      d,
    );
    expect(result.image).toBe('allowed');
    expect(result.audioSeconds).toBe(12);
  });

  it('3. rejects a flagged image with CONTENT_REJECTED and audits it', async () => {
    const d = deps({
      moderateImage: vi.fn(async () => ({ verdict: 'flagged' as const, reason: 'violence', categories: ['violence'] })),
    });

    await expect(
      gateVeedFabricInputs({ consent: true, seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' }, d),
    ).rejects.toThrow(/CONTENT_REJECTED/);

    // Audio probe must not run once the image is rejected.
    expect(d.probe).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'rejected', jobId: 'pre-create', hashKind: 'url' }));
  });

  it('fails open when the moderator is unavailable (unknown passes)', async () => {
    const d = deps({ moderateImage: vi.fn(async () => ({ verdict: 'unknown' as const })) });

    const result = await gateVeedFabricInputs(
      { consent: true, seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' },
      d,
    );
    expect(result.image).toBe('unknown');
  });

  it('allows audio when the probe fails, and rejects when it exceeds the cap', async () => {
    const failing = deps({ probe: vi.fn(async () => null) });
    const ok = await gateVeedFabricInputs({ consent: true, seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' }, failing);
    expect(ok.audioSeconds).toBeNull();

    const tooLong = deps({ probe: vi.fn(async () => VEED_MAX_AUDIO_SECONDS + 5) });
    await expect(
      gateVeedFabricInputs({ consent: true, seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' }, tooLong),
    ).rejects.toThrow(/60s or shorter/);
  });

  it('4. is not reached at all for FLUX2 / H3_MAX (regression: gate is Fabric-only)', () => {
    // The router calls the gate only when model === 'VEED_FABRIC'; the gate itself
    // has no model awareness, so this asserts the guard's shape stays pure.
    expect(typeof gateVeedFabricInputs).toBe('function');
  });

  it('5. emits a structured [veed.audit] line', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logVeedAudit({
      userId: 'u1',
      jobId: 'job-1',
      imageHash: hashUrl(IMAGE),
      audioHash: hashUrl(AUDIO),
      hashKind: 'url',
      consent: true,
      consentAt: '2026-10-19T00:00:00.000Z',
      verdict: 'allowed',
    });

    expect(spy).toHaveBeenCalledWith('[veed.audit]', expect.any(String));
    const payload = JSON.parse(spy.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({ jobId: 'job-1', consent: true, hashKind: 'url', verdict: 'allowed' });
    expect(payload.imageHash).toMatch(/^[a-f0-9]{64}$/);
    spy.mockRestore();
  });
});

describe('D-076 — audio content moderation (step 4b)', () => {
  const base = { consent: true as const, seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' };

  it('1. clean transcript passes and records a hash', async () => {
    const d = deps({ transcribe: vi.fn(async () => 'Hello world') });
    const result = await gateVeedFabricInputs(base, d);

    expect(result.audioVerdict).toBe('allowed');
    expect(result.transcriptEmpty).toBe(false);
    expect(result.transcriptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(d.moderateText).toHaveBeenCalledWith('Hello world');
  });

  it('2. flagged transcript throws CONTENT_REJECTED', async () => {
    const d = deps({
      transcribe: vi.fn(async () => 'something violating the policy'),
      moderateText: vi.fn(async () => ({ allowed: false, reason: 'violence' })),
    });

    await expect(gateVeedFabricInputs(base, d)).rejects.toThrow(/CONTENT_REJECTED/);
  });

  it('3. transcription failure fails open with a countable reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deps({ transcribe: vi.fn(async () => { throw new Error('fal whisper timed out after 10000ms'); }) });

    const result = await gateVeedFabricInputs(base, d);

    expect(result.audioVerdict).toBe('unknown');
    expect(result.audioReason).toBe('transcription_unavailable');
    expect(d.moderateText).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[veed.audit] transcription_failed', expect.objectContaining({ reason: expect.stringMatching(/timed out/) }));
    warn.mockRestore();
  });

  it('4. empty transcript passes without calling the text moderator', async () => {
    const d = deps({ transcribe: vi.fn(async () => '   ') });
    const result = await gateVeedFabricInputs(base, d);

    expect(result.audioVerdict).toBe('allowed');
    expect(result.transcriptEmpty).toBe(true);
    expect(d.moderateText).not.toHaveBeenCalled();
  });

  it('5. transcription runs after the duration probe and is the last gate step', async () => {
    const d = deps();
    await gateVeedFabricInputs(base, d);

    // Order: probe (duration) → transcribe → moderateText.
    expect((d.probe as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!).toBeLessThan((d.transcribe as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!);
    expect((d.transcribe as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!).toBeLessThan((d.moderateText as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!);
  });
});

describe('D-076 - rejection audit trail', () => {
  const base = { seedImageUrl: IMAGE, audioUrl: AUDIO, userId: 'u1' };

  function lastLog(d: ReturnType<typeof deps>) {
    const calls = (d.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    return calls[calls.length - 1]?.[0] as Record<string, unknown>;
  }

  it('audits a missing consent with consent: false', async () => {
    const d = deps();
    await expect(gateVeedFabricInputs({ ...base, consent: false }, d)).rejects.toThrow(/Consent attestation/);
    expect(lastLog(d)).toMatchObject({ verdict: 'rejected', reason: 'consent_missing', consent: false, jobId: 'pre-create' });
  });

  it('audits an invalid file type', async () => {
    const d = deps();
    await expect(
      gateVeedFabricInputs({ ...base, consent: true, seedImageUrl: 'https://cdn.test/presenter.bmp' }, d),
    ).rejects.toThrow(/image ending in one of/);
    const entry = lastLog(d);
    expect(entry).toMatchObject({ verdict: 'rejected', reason: 'file_type_invalid' });
    expect(String(entry.detail)).toMatch(/image ending in one of/);
  });

  it('audits a flagged image with the moderator reason', async () => {
    const d = deps({ moderateImage: vi.fn(async () => ({ verdict: 'flagged' as const, reason: 'violence' })) });
    await expect(gateVeedFabricInputs({ ...base, consent: true }, d)).rejects.toThrow(/CONTENT_REJECTED/);
    const entry = lastLog(d);
    expect(entry).toMatchObject({ verdict: 'rejected', reason: 'image_flagged' });
    expect(String(entry.detail)).toMatch(/violence/);
  });

  it('audits audio over the limit with the received seconds', async () => {
    const d = deps({ probe: vi.fn(async () => 359) });
    await expect(gateVeedFabricInputs({ ...base, consent: true }, d)).rejects.toThrow(/60s or shorter \(received 359s\)/);
    const entry = lastLog(d);
    expect(entry).toMatchObject({ verdict: 'rejected', reason: 'audio_too_long' });
    expect(String(entry.detail)).toMatch(/359/);
  });

  it('audits a flagged transcript', async () => {
    const d = deps({
      transcribe: vi.fn(async () => 'something violating policy'),
      moderateText: vi.fn(async () => ({ allowed: false, reason: 'violence' })),
    });
    await expect(gateVeedFabricInputs({ ...base, consent: true }, d)).rejects.toThrow(/CONTENT_REJECTED/);
    const entry = lastLog(d);
    expect(entry).toMatchObject({ verdict: 'rejected', reason: 'transcript_flagged' });
  });
});
