import { describe, it, expect } from 'vitest';
import { countScenesWithNarration, partialNarrationWarning } from '../exportNarrationWarning';

/**
 * D-030 — the partial-narration warning is shared by `story-playground/new`
 * and the project layout bar. These tests pin the rule and the copy.
 */

const withAudio = { narrationAudioUrl: 'https://r2.raivstream.com/n/1.mp3' };
const noAudio = { narrationAudioUrl: null };

describe('partialNarrationWarning', () => {
  it('warns when only some scenes have narration', () => {
    expect(partialNarrationWarning([withAudio, noAudio, noAudio])).toBe(
      '1 of 3 scenes have narration. Export will use clip audio only.',
    );
  });

  it('does not warn when no scene has narration (ordinary clip-audio export)', () => {
    expect(partialNarrationWarning([noAudio, noAudio])).toBeNull();
  });

  it('does not warn when every scene has narration', () => {
    expect(partialNarrationWarning([withAudio, withAudio])).toBeNull();
  });

  it('does not warn for an empty scene list', () => {
    expect(partialNarrationWarning([])).toBeNull();
  });

  it('treats a missing field like absent narration', () => {
    expect(partialNarrationWarning([withAudio, {}])).toBe(
      '1 of 2 scenes have narration. Export will use clip audio only.',
    );
  });
});

describe('countScenesWithNarration', () => {
  it('counts only scenes carrying a narration URL', () => {
    expect(countScenesWithNarration([withAudio, noAudio, withAudio, {}])).toBe(2);
  });
});
