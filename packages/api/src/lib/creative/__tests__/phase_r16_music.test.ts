/**
 * Phase B — story:background_music credit key and fail-closed gates.
 *
 * Tests:
 *   A. STORY_BACKGROUND_MUSIC_FEATURE_KEY constant exists and has correct value.
 *   B. resolveFeatureCreditRate returns RATE_MISSING when key not configured.
 *   C. resolveFeatureCreditRate returns configured=true when rate is active.
 *
 * The generateStoryMusic procedure is gated behind r16Procedure (router-layer
 * test), the Lyria feature flag, and the credit rate. This file tests the
 * infrastructure layer so that the gate chain is verifiable independently.
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Hoisted mock ─────────────────────────────────────────────────────────────
// Credits module used directly (no mock needed — pure functions with prisma dep)

import { STORY_BACKGROUND_MUSIC_FEATURE_KEY, resolveFeatureCreditRate } from '../../credits';

describe('Phase B — story:background_music credit infrastructure', () => {

  describe('A. STORY_BACKGROUND_MUSIC_FEATURE_KEY constant', () => {
    it('has the correct string value', () => {
      expect(STORY_BACKGROUND_MUSIC_FEATURE_KEY).toBe('story:background_music');
    });

    it('is distinct from speech and audio generation keys', () => {
      expect(STORY_BACKGROUND_MUSIC_FEATURE_KEY).not.toBe('story:speech_generation');
      expect(STORY_BACKGROUND_MUSIC_FEATURE_KEY).not.toBe('story:audio_generation');
    });
  });

  describe('B. resolveFeatureCreditRate — RATE_MISSING when not configured', () => {
    it('returns configured=false with RATE_MISSING when row does not exist', async () => {
      const prismaMock = {
        featureCreditRate: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      const result = await resolveFeatureCreditRate(
        prismaMock as never,
        STORY_BACKGROUND_MUSIC_FEATURE_KEY,
      );
      expect(result.configured).toBe(false);
      expect(result.errorCode).toBe('RATE_MISSING');
      expect(result.cost).toBe(0);
    });

    it('returns configured=false with RATE_INVALID when rate is inactive', async () => {
      const prismaMock = {
        featureCreditRate: {
          findUnique: vi.fn().mockResolvedValue({ creditsPerUnit: 50, isActive: false }),
        },
      };
      const result = await resolveFeatureCreditRate(prismaMock as never, STORY_BACKGROUND_MUSIC_FEATURE_KEY);
      expect(result.configured).toBe(false);
    });
  });

  describe('C. resolveFeatureCreditRate — configured=true when active', () => {
    it('returns configured=true with correct cost when rate is active', async () => {
      const prismaMock = {
        featureCreditRate: {
          findUnique: vi.fn().mockResolvedValue({ creditsPerUnit: 75, isActive: true }),
        },
      };
      const result = await resolveFeatureCreditRate(prismaMock as never, STORY_BACKGROUND_MUSIC_FEATURE_KEY);
      expect(result.configured).toBe(true);
      expect(result.cost).toBe(75);
      expect(result.errorCode).toBeNull();
    });
  });

});
