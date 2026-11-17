import { describe, expect, it } from 'vitest';
import { gateIncludesCharacterIdentity, NARRATIVE_PROJECT_TYPES } from '../castExtractor';

/**
 * The castExtractor constraint, as a test rather than a note (2026-11-17).
 *
 * A commercials build that starts extracting casts reintroduces the defect that closed #312: an ad has no characters, so scoring it on character
 * consistency is a category error, and an LLM happy to invent a cast makes it worse. Phase 13 touches the commercial path, so the behaviour is asserted
 * here to catch a regression before it ships.
 */
describe('commercials have no cast, and that is correct', () => {
  it('character identity is out of scope for a COMMERCIAL', () => {
    expect(gateIncludesCharacterIdentity('COMMERCIAL')).toBe(false);
  });

  it('it stays in scope for narrative formats', () => {
    for (const type of NARRATIVE_PROJECT_TYPES) {
      expect(gateIncludesCharacterIdentity(type)).toBe(true);
    }
  });

  it('a missing type stays IN scope, because skipping a gate is worse than running it', () => {
    // The deliberate fail-closed choice: `!projectType` returns true so an unclassified project never silently loses
    // the dimension. Only an explicit non-narrative type narrows it.
    expect(gateIncludesCharacterIdentity(null)).toBe(true);
    expect(gateIncludesCharacterIdentity(undefined)).toBe(true);
    expect(gateIncludesCharacterIdentity('SOMETHING_NEW')).toBe(false);
  });
});
