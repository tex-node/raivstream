/**
 * Fix — string-typed scene characters must resolve against character memory so
 * Track D Layer 2's lockedIdentityBlock is not bypassed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: vi.fn(async () => ({ allowed: true, flagged: false, categories: [], scores: {} })),
  moderationRejectMessage: vi.fn(() => 'rejected'),
  suggestSafeRewrite: vi.fn(async () => null),
}));
vi.mock('../../lib/analytics', () => ({ analytics: { track: vi.fn(async () => undefined) } }));
vi.mock('../../lib/credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/credits')>();
  return { ...actual, deductCredits: vi.fn(async () => 0), refundCredits: vi.fn(async () => undefined) };
});
vi.mock('../../lib/r2', () => ({
  mirrorUrlToR2: vi.fn(async () => 'https://cdn.test/ref.png'),
  uploadBufferToR2: vi.fn(async () => 'https://cdn.test/ref.png'),
  getPublicUrlForKey: vi.fn(() => 'https://cdn.test/x'),
}));

import { characterReferencesFromScene } from '../story';
import { renderPlaceholders } from '../../lib/story/characterIdentity';

const memory = (over: Record<string, unknown> = {}) => ({
  name: 'Sneaky Hopper',
  visualDescription: 'gray rabbit with bright chestnut-colored eyes',
  favoriteExpression: 'curious tilt',
  walkingStyle: 'bouncy',
  lockedIdentityBlock: null as string | null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('characterReferencesFromScene — string-character resolution', () => {
  it('1. string character with a locked memory → lockedBlock populated from memory', () => {
    const refs = characterReferencesFromScene({ characters: ['Sneaky Hopper'] }, [memory({ lockedIdentityBlock: 'LOCKED BLOCK' })]);
    expect(refs[0]).toMatchObject({ name: 'Sneaky Hopper', lockedBlock: 'LOCKED BLOCK' });
    expect(refs[0]!.promptIngredient).toContain('same look every scene');
  });

  it('2. string character with an unlocked memory → memory promptIngredient, lockedBlock null', () => {
    const refs = characterReferencesFromScene({ characters: ['Sneaky Hopper'] }, [memory()]);
    expect(refs[0]!.lockedBlock).toBeNull();
    expect(refs[0]!.promptIngredient).toContain('same look every scene: gray rabbit with bright chestnut-colored eyes');
  });

  it('3. string character with no memory row → name as ingredient, lockedBlock null, warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refs = characterReferencesFromScene({ characters: ['Unknown Fox'] }, [memory()]);
    expect(refs[0]).toMatchObject({ name: 'Unknown Fox', promptIngredient: 'Unknown Fox', lockedBlock: null });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[identity] no memory for character Unknown Fox'));
    warn.mockRestore();
  });

  it('4. object character (regression) → unchanged resolution', () => {
    const refs = characterReferencesFromScene({ characters: [{ name: 'Sneaky Hopper' }] }, [memory({ lockedIdentityBlock: 'LOCKED BLOCK' })]);
    expect(refs[0]).toMatchObject({ name: 'Sneaky Hopper', lockedBlock: 'LOCKED BLOCK' });
    expect(refs[0]!.promptIngredient).toContain('same look every scene');
  });

  it('5. end-to-end (unit): string characters + a locked character → renderPlaceholders map has the block', () => {
    const refs = characterReferencesFromScene({ characters: ['Sneaky Hopper', 'Pip'] }, [memory({ lockedIdentityBlock: 'LOCKED BLOCK' })]);
    const { map } = renderPlaceholders(refs);
    expect(map['{{CHARACTER_SNEAKY_HOPPER_IDENTITY}}']).toBe('LOCKED BLOCK');
    expect(map['{{CHARACTER_PIP_IDENTITY}}']).toBe('Pip');
  });
});
