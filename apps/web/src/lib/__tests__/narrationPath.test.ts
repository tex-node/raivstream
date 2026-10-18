import { describe, it, expect } from 'vitest';
import { resolveNarrationPath, narrationProcedureFor } from '../narrationPath';

/**
 * D-012 — the UI used to send every R16 project to
 * `generateEducationalNarration`, which the server rejects for story projects.
 * Content type now decides first; `isR16` only separates the two providers for
 * non-educational content.
 */

describe('resolveNarrationPath', () => {
  it('1. R16 + EDUCATIONAL → educational', () => {
    expect(resolveNarrationPath({ isR16: true, contentType: 'EDUCATIONAL' })).toBe('educational');
  });

  it('2. R16 + STORY → story', () => {
    expect(resolveNarrationPath({ isR16: true, contentType: 'STORY' })).toBe('story');
  });

  it('3. R16 + unknown content type → story (defensive: educational would be rejected)', () => {
    expect(resolveNarrationPath({ isR16: true, contentType: null })).toBe('story');
    expect(resolveNarrationPath({ isR16: true, contentType: undefined })).toBe('story');
  });

  it('4. non-R16 + EDUCATIONAL → educational (rare, but the server accepts it)', () => {
    expect(resolveNarrationPath({ isR16: false, contentType: 'EDUCATIONAL' })).toBe('educational');
  });

  it('5. non-R16 + unknown content type → scene', () => {
    expect(resolveNarrationPath({ isR16: false, contentType: null })).toBe('scene');
    expect(resolveNarrationPath({ isR16: false, contentType: 'STORY' })).toBe('scene');
  });
});

describe('narrationProcedureFor', () => {
  it('maps each path to the tRPC procedure the UI must call', () => {
    expect(narrationProcedureFor('educational')).toBe('generateEducationalNarration');
    expect(narrationProcedureFor('story')).toBe('generateStoryNarration');
    expect(narrationProcedureFor('scene')).toBe('generateSceneNarration');
  });
});
