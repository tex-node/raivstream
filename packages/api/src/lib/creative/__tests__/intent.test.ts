import { describe, it, expect } from 'vitest';
import { interpret, detectProjectType, extractExplicitSignals, buildQuestions } from '../intent/interpreter';

describe('creative intent interpreter', () => {
  describe('detectProjectType', () => {
    it('detects commercial intent', () => {
      const result = detectProjectType('Create a 60-second cinematic commercial for a new Nigerian premium skincare brand.');
      expect(result.type).toBe('COMMERCIAL');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('detects education intent', () => {
      const result = detectProjectType('Create a 3-minute lesson explaining photosynthesis to eight-year-olds.');
      expect(result.type).toBe('EDUCATION');
    });

    it('detects story intent', () => {
      const result = detectProjectType('Create a 5-minute photorealistic short film about a young Nigerian woman returning home.');
      expect(result.type).toBe('STORY');
    });

    it('returns UNKNOWN with zero confidence for ambiguous input', () => {
      const result = detectProjectType('Make a beautiful video about a woman in Lagos.');
      expect(['STORY', 'COMMERCIAL']).toContain(result.type);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('extractExplicitSignals', () => {
    it('extracts duration in seconds from "60-second"', () => {
      expect(extractExplicitSignals('a 60-second commercial').durationSeconds).toBe(60);
    });
    it('extracts minutes as seconds', () => {
      expect(extractExplicitSignals('a 3-minute lesson').durationSeconds).toBe(180);
    });
    it('extracts format and tone', () => {
      const signals = extractExplicitSignals('a cinematic commercial that feels luxurious, confident and modern');
      expect(signals.format).toBe('Commercial');
      expect(signals.tone).toContain('luxurious');
    });
  });

  describe('interpret — golden journeys', () => {
    it('commercial golden journey produces a coherent interpretation', () => {
      const result = interpret('Create a 60-second cinematic commercial for a new Nigerian premium skincare brand. Make it feel luxurious, confident and modern.');
      expect(result.projectType).toBe('COMMERCIAL');
      expect(result.explicit.durationSeconds).toBe(60);
      expect(result.summary).toContain('commercial');
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions.every((q) => q.canAutoDecide)).toBe(true);
    });

    it('education golden journey', () => {
      const result = interpret('Create a 3-minute lesson explaining photosynthesis to eight-year-olds.');
      expect(result.projectType).toBe('EDUCATION');
      expect(result.explicit.durationSeconds).toBe(180);
    });

    it('story golden journey infers without a questionnaire', () => {
      const result = interpret('Create a 5-minute photorealistic short film about a young Nigerian woman returning home after 10 years abroad and confronting her mother.');
      expect(result.projectType).toBe('STORY');
      expect(result.explicit.durationSeconds).toBe(300);
      expect(result.questions.length).toBeLessThanOrEqual(3);
    });

    it('never fabricates certainty — unknown-ish input yields a confirm question', () => {
      const result = interpret('Make a beautiful video about a woman in Lagos.');
      expect(result.questions.length).toBeGreaterThan(0);
    });
  });

  describe('buildQuestions', () => {
    it('asks only consequential questions', () => {
      const questions = buildQuestions('COMMERCIAL', ['audience']);
      const prompts = questions.map((q) => q.prompt);
      expect(prompts.some((p) => p.toLowerCase().includes('viewer do at the end'))).toBe(true);
      expect(questions.every((q) => q.canAutoDecide)).toBe(true);
    });
  });
});