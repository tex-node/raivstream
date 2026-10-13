/**
 * Phase A — planSceneNarration tests.
 *
 * Tests:
 *   A. LocalStoryIntelligenceProvider.planSceneNarration returns a non-empty string.
 *   B. Local provider uses sceneTitle + sceneDescription in output.
 *   C. Local provider includes mood/tone/genre when provided.
 *   D. Local provider truncates to 600 chars max.
 *   E. Local provider distinguishes KIDS vs non-KIDS audience prefix.
 *   F. OpenAI provider planSceneNarration is part of the interface (type-check).
 */

import { describe, it, expect } from 'vitest';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import type { StoryIntelligenceProvider } from '../types';

const LOCAL = new LocalStoryIntelligenceProvider();

// Type assertion: verify LocalStoryIntelligenceProvider satisfies the interface
const _provider: StoryIntelligenceProvider = LOCAL;
void _provider;

const BASE_INPUT = {
  sceneTitle: 'The Forest Awakens',
  sceneDescription: 'The forest creatures emerge into the golden morning light.',
  audienceMode: 'KIDS' as const,
};

describe('LocalStoryIntelligenceProvider.planSceneNarration', () => {

  describe('A. Returns non-empty string', () => {
    it('returns a non-empty narration string', async () => {
      const result = await LOCAL.planSceneNarration(BASE_INPUT);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(5);
    });
  });

  describe('B. Includes scene context in output', () => {
    it('includes sceneTitle (lowercased) in narration', async () => {
      const result = await LOCAL.planSceneNarration(BASE_INPUT);
      expect(result.toLowerCase()).toContain('forest awakens');
    });

    it('includes part of sceneDescription in narration', async () => {
      const result = await LOCAL.planSceneNarration(BASE_INPUT);
      // description is the first sentence of sceneDescription
      expect(result).toContain('forest creatures');
    });
  });

  describe('C. Includes mood, tone, genre when provided', () => {
    it('appends mood to narration', async () => {
      const result = await LOCAL.planSceneNarration({ ...BASE_INPUT, mood: 'whimsical' });
      expect(result).toContain('whimsical');
    });

    it('appends tone to narration', async () => {
      const result = await LOCAL.planSceneNarration({ ...BASE_INPUT, tone: 'adventurous' });
      expect(result).toContain('adventurous');
    });

    it('appends genre to narration', async () => {
      const result = await LOCAL.planSceneNarration({ ...BASE_INPUT, genre: 'fantasy' });
      expect(result).toContain('fantasy');
    });
  });

  describe('D. Truncates to 600 chars', () => {
    it('output is no longer than 600 characters', async () => {
      const long = 'A'.repeat(200);
      const result = await LOCAL.planSceneNarration({
        ...BASE_INPUT,
        sceneDescription: long,
        chapterBody: long,
        mood: long,
        tone: long,
      });
      expect(result.length).toBeLessThanOrEqual(600);
    });
  });

  describe('E. Audience mode prefix', () => {
    it('uses KIDS prefix "In this scene" for KIDS audience', async () => {
      const result = await LOCAL.planSceneNarration({ ...BASE_INPUT, audienceMode: 'KIDS' });
      expect(result).toMatch(/^In this scene/i);
    });

    it('uses general prefix "The scene unfolds" for non-KIDS audience', async () => {
      const result = await LOCAL.planSceneNarration({ ...BASE_INPUT, audienceMode: 'GENERAL' as 'KIDS' });
      expect(result).toMatch(/^The scene unfolds/i);
    });
  });

  describe('F. ChapterBody provides richer context', () => {
    it('uses first sentence of chapterBody when provided', async () => {
      const result = await LOCAL.planSceneNarration({
        ...BASE_INPUT,
        chapterBody: 'The ancient oak stood at the edge of the clearing. Other sentences.',
      });
      expect(result).toContain('ancient oak');
    });
  });
});
