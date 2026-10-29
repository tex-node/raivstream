import { describe, it, expect } from 'vitest';
import { resolveExportPolicy } from '../storyExportPolicy';

/**
 * The single export boundary. Two same-surface combos allowed, the two crossed
 * combos refused. This replaced two hard guards; if it drifts, either kid content
 * reaches the main feed or general stories become unexportable again.
 */
describe('resolveExportPolicy', () => {
  it('R16 + KIDS → R16 tier, kids-safe', () => {
    expect(resolveExportPolicy({ isR16: true, audienceMode: 'KIDS' })).toEqual({
      tier: 'R16',
      isKidsSafe: true,
    });
  });

  it('main app + GENERAL → GENERAL tier, not kids-safe', () => {
    expect(resolveExportPolicy({ isR16: false, audienceMode: 'GENERAL' })).toEqual({
      tier: 'GENERAL',
      isKidsSafe: false,
    });
  });

  it('R16 + GENERAL → refused (crossed)', () => {
    expect(() => resolveExportPolicy({ isR16: true, audienceMode: 'GENERAL' })).toThrow(/cannot be exported/i);
  });

  it('main app + KIDS → refused (crossed)', () => {
    expect(() => resolveExportPolicy({ isR16: false, audienceMode: 'KIDS' })).toThrow(/cannot be exported/i);
  });

  it('missing audienceMode → refused (fail-closed)', () => {
    expect(() => resolveExportPolicy({ isR16: true, audienceMode: null })).toThrow();
    expect(() => resolveExportPolicy({ isR16: false, audienceMode: undefined })).toThrow();
    expect(() => resolveExportPolicy({ isR16: false, audienceMode: 'UNKNOWN' })).toThrow();
  });
});
