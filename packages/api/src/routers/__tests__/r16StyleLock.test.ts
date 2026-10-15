/**
 * R16-STYLE-LOCK — generation-time enforcement tests.
 *
 * Distinct from r16VisualStyle.test.ts (write-path: assertR16VisualStyle).
 * This file covers enforceR16Style: the prompt-side remap that lets legacy
 * stored values render safely without touching the database.
 */
import { describe, it, expect } from 'vitest';
import {
  enforceR16Style,
  R16_ALLOWED_STYLES,
  R16_VISUAL_STYLE_KEYS,
} from '../../lib/storyVisualStyles';

const LEGACY_STYLES = [
  'STORYBOOK_ILLUSTRATION',
  'COMIC_BOOK',
  'WATERCOLOR',
  'CLAYMATION',
  'CINEMATIC_FANTASY',
  'AFRICAN_FOLKTALE_ILLUSTRATION',
  'PHOTOREALISTIC',
];

// ─── KIDS mode: legacy values remap to CARTOON ───────────────────────────────

describe('enforceR16Style — KIDS mode remaps legacy styles', () => {
  it.each(LEGACY_STYLES)('maps %s → CARTOON', (style) => {
    expect(enforceR16Style(style, 'KIDS')).toBe('CARTOON');
  });

  it('keeps CARTOON for KIDS', () => {
    expect(enforceR16Style('CARTOON', 'KIDS')).toBe('CARTOON');
  });

  it('keeps THREE_D_ANIMATED for KIDS', () => {
    expect(enforceR16Style('THREE_D_ANIMATED', 'KIDS')).toBe('THREE_D_ANIMATED');
  });

  it('keeps ANIME for KIDS', () => {
    expect(enforceR16Style('ANIME', 'KIDS')).toBe('ANIME');
  });

  it('maps null → CARTOON for KIDS (default normalises to STORYBOOK_ILLUSTRATION which is legacy)', () => {
    expect(enforceR16Style(null, 'KIDS')).toBe('CARTOON');
  });
});

// ─── GENERAL mode: no remapping ──────────────────────────────────────────────

describe('enforceR16Style — GENERAL mode is unaffected', () => {
  it.each(LEGACY_STYLES)('preserves %s for GENERAL', (style) => {
    expect(enforceR16Style(style, 'GENERAL')).toBe(style);
  });

  it('null audienceMode treated as non-KIDS (no remap)', () => {
    expect(enforceR16Style('WATERCOLOR', null)).toBe('WATERCOLOR');
  });

  it('undefined audienceMode treated as non-KIDS (no remap)', () => {
    expect(enforceR16Style('COMIC_BOOK', undefined)).toBe('COMIC_BOOK');
  });
});

// ─── R16 approved-style set ───────────────────────────────────────────────────

describe('R16_ALLOWED_STYLES — picker set', () => {
  it('contains exactly {CARTOON, THREE_D_ANIMATED, ANIME}', () => {
    expect(R16_VISUAL_STYLE_KEYS).toHaveLength(3);
    expect(R16_ALLOWED_STYLES.has('CARTOON')).toBe(true);
    expect(R16_ALLOWED_STYLES.has('THREE_D_ANIMATED')).toBe(true);
    expect(R16_ALLOWED_STYLES.has('ANIME')).toBe(true);
  });

  it('excludes all legacy styles', () => {
    for (const style of LEGACY_STYLES) {
      expect(R16_ALLOWED_STYLES.has(style)).toBe(false);
    }
  });
});
