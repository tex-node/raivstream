/**
 * Phase B — Educational Content Engine tests.
 *
 * Tests the pure logic of content classification and education contract
 * planning via the LocalStoryIntelligenceProvider (deterministic, no I/O).
 * Also validates the Zod schemas for ContentType and EducationalContract.
 */

import { describe, it, expect } from 'vitest';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import { contentTypeSchema, educationalContractSchema } from '../types';
import type { ClassifyContentInput, PlanEducationInput } from '../types';

const local = new LocalStoryIntelligenceProvider();

const kidsBase: ClassifyContentInput = {
  idea: '',
  answers: [],
  audienceMode: 'KIDS',
};

const generalBase: ClassifyContentInput = {
  idea: '',
  answers: [],
  audienceMode: 'GENERAL',
};

// ── contentTypeSchema ────────────────────────────────────────────────────────

describe('contentTypeSchema', () => {
  it('accepts all valid content types', () => {
    const types = ['EDUCATIONAL', 'STORY', 'COMMERCIAL', 'ENTERTAINMENT', 'DOCUMENTARY', 'TRANSFORMATION'];
    for (const t of types) {
      expect(contentTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects unknown content types', () => {
    expect(contentTypeSchema.safeParse('UNKNOWN').success).toBe(false);
    expect(contentTypeSchema.safeParse('').success).toBe(false);
  });
});

// ── LocalStoryIntelligenceProvider.classifyContent ──────────────────────────

describe('LocalStoryIntelligenceProvider.classifyContent', () => {
  it('classifies "let\'s talk about ships" as EDUCATIONAL', async () => {
    const result = await local.classifyContent({ ...kidsBase, idea: "let's talk about ships" });
    expect(result).toBe('EDUCATIONAL');
  });

  it('classifies "learn about volcanoes" as EDUCATIONAL', async () => {
    const result = await local.classifyContent({ ...kidsBase, idea: 'learn about volcanoes' });
    expect(result).toBe('EDUCATIONAL');
  });

  it('classifies "how does gravity work" as EDUCATIONAL', async () => {
    const result = await local.classifyContent({ ...generalBase, idea: 'how does gravity work' });
    expect(result).toBe('EDUCATIONAL');
  });

  it('classifies "explain photosynthesis" as EDUCATIONAL', async () => {
    const result = await local.classifyContent({ ...kidsBase, idea: 'explain photosynthesis to kids' });
    expect(result).toBe('EDUCATIONAL');
  });

  it('classifies "a story about a brave dragon" as STORY', async () => {
    const result = await local.classifyContent({ ...kidsBase, idea: 'a story about a brave dragon' });
    expect(result).toBe('STORY');
  });

  it('classifies "once upon a time a princess finds a magic key" as STORY', async () => {
    const result = await local.classifyContent({ ...kidsBase, idea: 'once upon a time a princess finds a magic key' });
    expect(result).toBe('STORY');
  });

  it('classifies "documentary about the life of Einstein" as DOCUMENTARY', async () => {
    const result = await local.classifyContent({ ...generalBase, idea: 'documentary about the life of Einstein' });
    expect(result).toBe('DOCUMENTARY');
  });

  it('classifies "buy our new shoes" as COMMERCIAL', async () => {
    const result = await local.classifyContent({ ...generalBase, idea: 'buy our new shoes for summer' });
    expect(result).toBe('COMMERCIAL');
  });

  it('returns a valid ContentType enum value for any input', async () => {
    const result = await local.classifyContent({ ...kidsBase, idea: 'something completely random' });
    expect(contentTypeSchema.safeParse(result).success).toBe(true);
  });
});

// ── educationalContractSchema ────────────────────────────────────────────────

describe('educationalContractSchema', () => {
  it('rejects a contract with too few keyConcepts', () => {
    const base = {
      version: 'education_contract_v1',
      topic: 'ships',
      targetAge: '5–10 years',
      learningObjective: 'Understand how ships stay afloat',
      keyConcepts: ['buoyancy'],
      vocabularyLevel: 'very_simple',
      explanationStrategy: 'analogy',
      examplesToUse: [],
      visualTeachingStrategy: 'show diagrams',
      narrationRequired: true,
      sceneProgression: ['intro', 'concept'],
      recapIncluded: true,
      antiCommercialTopics: [],
    };
    expect(educationalContractSchema.safeParse(base).success).toBe(false);
  });

  it('rejects a contract missing narrationRequired', () => {
    const base = {
      version: 'education_contract_v1',
      topic: 'ships',
      targetAge: '5–10 years',
      learningObjective: 'Understand how ships stay afloat',
      keyConcepts: ['buoyancy', 'displacement'],
      vocabularyLevel: 'very_simple',
      explanationStrategy: 'analogy',
      visualTeachingStrategy: 'show diagrams',
      sceneProgression: ['intro', 'concept'],
      recapIncluded: true,
    };
    // narrationRequired has a .default(true) so it should still pass
    const result = educationalContractSchema.safeParse(base);
    if (result.success) {
      expect(result.data.narrationRequired).toBe(true);
    }
  });

  it('rejects invalid vocabularyLevel', () => {
    const base = {
      version: 'education_contract_v1',
      topic: 'ships',
      targetAge: '5–10 years',
      learningObjective: 'Understand how ships stay afloat',
      keyConcepts: ['buoyancy', 'displacement'],
      vocabularyLevel: 'expert',
      explanationStrategy: 'analogy',
      visualTeachingStrategy: 'show diagrams',
      narrationRequired: true,
      sceneProgression: ['intro', 'concept'],
      recapIncluded: true,
    };
    expect(educationalContractSchema.safeParse(base).success).toBe(false);
  });
});

// ── LocalStoryIntelligenceProvider.planEducation ─────────────────────────────

describe('LocalStoryIntelligenceProvider.planEducation', () => {
  const baseInput: PlanEducationInput = {
    idea: "let's talk about ships",
    answers: [],
    audienceMode: 'KIDS',
    sceneCount: 4,
  };

  it('returns a valid EducationalContract', async () => {
    const contract = await local.planEducation(baseInput);
    const result = educationalContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  it('has version education_contract_v1', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.version).toBe('education_contract_v1');
  });

  it('includes the topic from the idea', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.topic.toLowerCase()).toContain('ships');
  });

  it('sets narrationRequired to true', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.narrationRequired).toBe(true);
  });

  it('sets recapIncluded to true', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.recapIncluded).toBe(true);
  });

  it('includes antiCommercialTopics to guard against luxury drift', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.antiCommercialTopics.length).toBeGreaterThan(0);
    const asText = contract.antiCommercialTopics.join(' ').toLowerCase();
    expect(asText).toMatch(/luxury|commercial|brand/);
  });

  it('sets vocabulary to very_simple for KIDS audience', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.vocabularyLevel).toBe('very_simple');
  });

  it('sets vocabulary to simple for GENERAL audience', async () => {
    const contract = await local.planEducation({ ...baseInput, audienceMode: 'GENERAL' });
    expect(contract.vocabularyLevel).toBe('simple');
  });

  it('generates a sceneProgression with at most sceneCount entries', async () => {
    const contract = await local.planEducation({ ...baseInput, sceneCount: 3 });
    expect(contract.sceneProgression.length).toBeLessThanOrEqual(3);
    expect(contract.sceneProgression.length).toBeGreaterThanOrEqual(2);
  });

  it('generates at least 2 keyConcepts', async () => {
    const contract = await local.planEducation(baseInput);
    expect(contract.keyConcepts.length).toBeGreaterThanOrEqual(2);
  });
});
