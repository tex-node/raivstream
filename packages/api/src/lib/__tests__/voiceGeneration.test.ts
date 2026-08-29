import { describe, expect, it } from 'vitest';
import {
  assertCueSpeechEligible,
  buildVoiceGenerationRequestSnapshot,
  fingerprintVoiceGenerationRequest,
  validateSourceText,
  SOURCE_TEXT_MAX_LENGTH,
  type VoiceEligibleCue,
  type VoiceEligibleProfile,
} from '../voiceGeneration';

const baseCue: VoiceEligibleCue = {
  id: 'cue-1', text: 'Good morning, everyone.', performancePreset: null, performanceDirection: 'calm',
  durationSeconds: 3, voiceProfileId: null, trackType: 'DIALOGUE',
};
const baseProfile: VoiceEligibleProfile = {
  id: 'voice-1', voiceRef: 'stable-voice-handle', voiceType: 'NARRATOR', accentStyle: null, pitch: null, rate: null, styleNotes: null, language: 'en',
};

function snap(overrides: Partial<Parameters<typeof buildVoiceGenerationRequestSnapshot>[0]> = {}) {
  return buildVoiceGenerationRequestSnapshot({
    projectId: 'project-a', cue: baseCue, voiceProfile: baseProfile, providerKey: 'test-fixture-dev', requestedFormat: 'wav',
    ...overrides,
  });
}

describe('validateSourceText (Section 11)', () => {
  it('accepts trimmed non-empty text', () => {
    expect(validateSourceText('  Hello there  ')).toBe('Hello there');
  });
  it('rejects empty text', () => {
    expect(() => validateSourceText('')).toThrow(/VOICE_GENERATION_INVALID_TEXT/);
  });
  it('rejects whitespace-only text', () => {
    expect(() => validateSourceText('   \n\t  ')).toThrow(/VOICE_GENERATION_INVALID_TEXT/);
  });
  it('rejects null/undefined text', () => {
    expect(() => validateSourceText(null)).toThrow(/VOICE_GENERATION_INVALID_TEXT/);
    expect(() => validateSourceText(undefined)).toThrow(/VOICE_GENERATION_INVALID_TEXT/);
  });
  it('rejects text over the platform maximum', () => {
    expect(() => validateSourceText('x'.repeat(SOURCE_TEXT_MAX_LENGTH + 1))).toThrow(/VOICE_GENERATION_INVALID_TEXT/);
  });
  it('accepts text exactly at the platform maximum', () => {
    expect(validateSourceText('x'.repeat(SOURCE_TEXT_MAX_LENGTH))).toHaveLength(SOURCE_TEXT_MAX_LENGTH);
  });
  it('never rewrites content — no punctuation added, no casing changed, no summarization', () => {
    expect(validateSourceText('hello world no punctuation')).toBe('hello world no punctuation');
  });
});

describe('assertCueSpeechEligible (Section 27.D)', () => {
  it('allows NARRATION', () => { expect(() => assertCueSpeechEligible('NARRATION')).not.toThrow(); });
  it('allows DIALOGUE', () => { expect(() => assertCueSpeechEligible('DIALOGUE')).not.toThrow(); });
  it('rejects MUSIC', () => { expect(() => assertCueSpeechEligible('MUSIC')).toThrow(/VOICE_GENERATION_UNSUPPORTED_CUE_TYPE/); });
  it('rejects SFX', () => { expect(() => assertCueSpeechEligible('SFX')).toThrow(/VOICE_GENERATION_UNSUPPORTED_CUE_TYPE/); });
  it('rejects AMBIENCE', () => { expect(() => assertCueSpeechEligible('AMBIENCE')).toThrow(/VOICE_GENERATION_UNSUPPORTED_CUE_TYPE/); });
});

describe('buildVoiceGenerationRequestSnapshot (Section 3)', () => {
  it('never includes signed URLs, temp paths, worker IDs, or provider secrets', () => {
    const s = snap();
    const serialized = JSON.stringify(s);
    for (const forbidden of ['signedUrl', 'tempPath', 'workerId', 'apiKey', 'secret', 'Authorization']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
  it('records the cue canonical duration for diagnostics only — the snapshot never carries a "new" duration', () => {
    const s = snap();
    expect(s.cueCanonicalDurationSeconds).toBe(3);
  });
  it('carries only fields the existing VoiceProfile/AudioCue schema actually supports', () => {
    const s = snap();
    expect(s.voice.stableVoiceIdentity).toBe('stable-voice-handle');
    expect(s.performance.direction).toBe('calm');
  });
  it('omits provider timestamps — nothing in the snapshot shape has a createdAt/requestedAt field at all', () => {
    const s = snap();
    expect(s).not.toHaveProperty('createdAt');
    expect(s).not.toHaveProperty('requestedAt');
    expect(s).not.toHaveProperty('timestamp');
  });
});

describe('fingerprintVoiceGenerationRequest (Section 4 — determinism)', () => {
  it('same request -> same fingerprint', () => {
    expect(fingerprintVoiceGenerationRequest(snap())).toBe(fingerprintVoiceGenerationRequest(snap()));
  });
  it('changed text -> different fingerprint', () => {
    const a = fingerprintVoiceGenerationRequest(snap());
    const b = fingerprintVoiceGenerationRequest(snap({ cue: { ...baseCue, text: 'A completely different line.' } }));
    expect(a).not.toBe(b);
  });
  it('changed voice identity -> different fingerprint', () => {
    const a = fingerprintVoiceGenerationRequest(snap());
    const b = fingerprintVoiceGenerationRequest(snap({ voiceProfile: { ...baseProfile, voiceRef: 'a-different-voice-handle' } }));
    expect(a).not.toBe(b);
  });
  it('changed performance intent -> different fingerprint', () => {
    const a = fingerprintVoiceGenerationRequest(snap());
    const b = fingerprintVoiceGenerationRequest(snap({ cue: { ...baseCue, performanceDirection: 'excited' } }));
    expect(a).not.toBe(b);
  });
  it('changed provider -> different fingerprint', () => {
    const a = fingerprintVoiceGenerationRequest(snap());
    const b = fingerprintVoiceGenerationRequest(snap({ providerKey: 'a-different-provider' }));
    expect(a).not.toBe(b);
  });
  it('changed output format -> different fingerprint', () => {
    const a = fingerprintVoiceGenerationRequest(snap());
    const b = fingerprintVoiceGenerationRequest(snap({ requestedSampleRateHz: 48000 }));
    expect(a).not.toBe(b);
  });
  it('whitespace-only text differences do not change the fingerprint (normalization, not content change)', () => {
    const a = fingerprintVoiceGenerationRequest(snap({ cue: { ...baseCue, text: 'Good   morning,  everyone.' } }));
    const b = fingerprintVoiceGenerationRequest(snap({ cue: { ...baseCue, text: 'Good morning, everyone.' } }));
    expect(a).toBe(b);
  });
  it('cue duration (a purely diagnostic field) does not affect the fingerprint', () => {
    const a = fingerprintVoiceGenerationRequest(snap({ cue: { ...baseCue, durationSeconds: 3 } }));
    const b = fingerprintVoiceGenerationRequest(snap({ cue: { ...baseCue, durationSeconds: 99 } }));
    expect(a).toBe(b);
  });
  it('is a plain sha256 hex digest — 64 lowercase hex characters', () => {
    expect(fingerprintVoiceGenerationRequest(snap())).toMatch(/^[0-9a-f]{64}$/);
  });
});
