import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applySoftenedPrompt, dropReason } from '../moderationFallback';

/**
 * The fallback now covers video too (2026-11-06).
 *
 * It was gated on the IMAGE kind, so a rejected video got no softened retry and no drop record:
 * SCENE_01 and SCENE_02 videos were flagged for the phrase "finds an injured bird" AFTER their
 * stills had passed, and nothing tried to help.
 *
 * The root cause is here, not in the gate: the video prompt is built from the same scene text as
 * the still, so softening the still left the video carrying the rejected phrase.
 */

const ORIGINAL = 'A lighthouse keeper finds an injured bird and teaches it to fly again';
const SOFTENED = 'A lighthouse keeper finds a bird with a bandaged wing and teaches it to fly again';

describe('a softened still propagates to its video', () => {
  it('replaces the original phrase wherever it appears in the video prompt', () => {
    const videoPrompt = `${ORIGINAL}. The Setup. Motion sequence, cinematic. Camera: Slow dolly-in.`;
    const rewritten = applySoftenedPrompt(videoPrompt, { original: ORIGINAL, softened: SOFTENED });
    expect(rewritten).toContain('a bird with a bandaged wing');
    expect(rewritten).not.toContain('injured bird');
  });

  it('leaves the prompt untouched when there is no rewrite', () => {
    expect(applySoftenedPrompt('anything', undefined)).toBe('anything');
  });

  it('is a no-op when the rewrite equals the original - no accidental duplication', () => {
    expect(applySoftenedPrompt(ORIGINAL, { original: ORIGINAL, softened: ORIGINAL })).toBe(ORIGINAL);
  });

  it('leaves a prompt that does not contain the original alone', () => {
    const unrelated = 'A different scene entirely.';
    expect(applySoftenedPrompt(unrelated, { original: ORIGINAL, softened: SOFTENED })).toBe(unrelated);
  });
});

describe('a drop record names the asset kind', () => {
  it('says VIDEO for a video drop and IMAGE for a still drop', () => {
    expect(dropReason('VIDEO')).toBe('SCENE_DROPPED moderation_rejected kind=VIDEO');
    expect(dropReason('IMAGE')).toBe('SCENE_DROPPED moderation_rejected kind=IMAGE');
  });
});

describe('the runner wires the widened fallback', () => {
  const source = readFileSync(join(__dirname, '..', 'runner.ts'), 'utf8');

  it('the fallback gate is no longer IMAGE-only', () => {
    expect(source).not.toContain("rejected && spec.kind === 'IMAGE' && !moderationRetried");
    expect(source).toContain('rejected && !moderationRetried.has(asset.id)');
  });

  it('a still softening is stored for the scene', () => {
    expect(source).toContain('sceneSoftened.set(spec.sceneId');
  });

  it('a video prompt receives the scene rewrite', () => {
    expect(source).toContain('applySoftenedPrompt(');
  });

  it('the drop record uses dropReason with the kind', () => {
    expect(source).toContain('errorMessage: dropReason(spec.kind)');
  });
});
