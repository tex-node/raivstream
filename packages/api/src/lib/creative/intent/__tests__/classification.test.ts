import { describe, expect, it } from 'vitest';
import { buildInterpretation, detectProjectType } from '../interpreter';

/**
 * Narrative vs pedagogy (2026-11-06).
 *
 * The classifier was a keyword count and EDUCATION listed a bare 'teach', so a story that mentioned
 * teaching was read as a lesson - producing the wrong questions ("what age group are we teaching?")
 * and the wrong plan shape.
 *
 * The fix is about FORM: a protagonist performing a story action is a narrative whatever else it
 * mentions; education needs intent ("let's talk about", "explain", "lesson"). The educational path
 * must still work - a classifier that never returns EDUCATION is a different bug.
 */

const LIGHTHOUSE = 'A lighthouse keeper finds an injured bird and teaches it to fly again';

describe('a story that mentions teaching is still a story', () => {
  it('classifies the lighthouse sentence as STORY', () => {
    expect(detectProjectType(LIGHTHOUSE).type).toBe('STORY');
  });

  it('does not ask an education question for it', () => {
    const questions = buildInterpretation(LIGHTHOUSE).questions ?? [];
    const texts = questions.map((question) => `${question.id} ${question.prompt}`.toLowerCase());
    expect(texts.some((text) => /age group|teach|lesson|student/.test(text))).toBe(false);
  });

  it('a story with no teaching language is still a story', () => {
    expect(detectProjectType('A lonely astronaut drifts home across the dark').type).toBe('STORY');
    expect(detectProjectType('A fox befriends a scarecrow in late summer').type).toBe('STORY');
  });
});

describe('a genuine lesson still classifies as EDUCATION', () => {
  it('a lesson framing wins', () => {
    expect(detectProjectType("Let's talk about how volcanoes work").type).toBe('EDUCATION');
  });

  it('an explicit explanation wins', () => {
    expect(detectProjectType('Explain photosynthesis to eight-year-olds').type).toBe('EDUCATION');
  });

  it('a classroom lesson wins over incidental narrative words', () => {
    expect(detectProjectType('A lesson about the water cycle for students').type).toBe('EDUCATION');
  });

  it('the education path still asks its own questions', () => {
    const questions = buildInterpretation("Let's talk about how volcanoes work").questions ?? [];
    expect(questions.length).toBeGreaterThan(0);
    const texts = questions.map((question) => `${question.id} ${question.prompt}`.toLowerCase());
    expect(texts.some((text) => /age group|lesson|student/.test(text))).toBe(true);
  });
});
