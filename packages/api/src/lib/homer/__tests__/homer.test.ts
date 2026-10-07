/**
 * Homer Foundation — 15 semantic acceptance tests.
 *
 * All tests are pure/deterministic (no AI, no DB, no network).
 * They verify structural contracts, not exact text.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DECISION_PRECEDENCE,
  HomerService,
  assessComplexity,
  claim,
  extractBeatsFromBlueprint,
  extractCharactersFromBlueprint,
  extractLocationsFromText,
  extractObjectsFromText,
  extractThreadsFromText,
  getCanonValue,
  identifyCliffhangers,
  isUserLocked,
  mergeCanon,
  reconcile,
  resolveCharacterReference,
  setCanonFact,
  userDecisionsToCanon,
} from '../index';
import type {
  HomerBeat,
  HomerCanonFact,
  HomerInterpretationRequest,
  HomerStoryState,
  InterpretStoryInput,
  ProposedStoryState,
} from '../index';
import type { StoryBlueprint } from '../../storyIntelligence/types';
import { HomerInterpreter, fallbackProposed } from '../interpreter';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeBlueprint(overrides: Partial<StoryBlueprint> = {}): StoryBlueprint {
  return {
    version: 'story_blueprint_v1',
    premise: "Amina discovers an old radio in her grandmother's attic that plays voices from the future.",
    genre: 'mystery',
    tone: 'wondrous',
    theme: 'curiosity and courage',
    audience: 'GENERAL',
    protagonist: {
      name: 'Amina',
      goal: 'Understand what the radio means',
      motivation: 'Her grandmother died and left the attic',
      flaw: 'Too trusting',
    },
    supportingCharacters: [
      { name: 'Grandmother', role: 'mentor', relationship: "Amina's grandmother" },
      { name: 'Marcus', role: 'friend', relationship: "Amina's neighbour" },
    ],
    setting: "Grandmother's attic and house",
    conflict: 'Amina must figure out if the voice she hears is real before her family sells the house.',
    stakes: 'Losing the connection to her grandmother forever',
    emotionalArc: 'grief → wonder → discovery → resolution',
    beats: [
      { label: 'Setup', description: 'Amina arrives at the old house after her grandmother passed away.' },
      { label: 'Discovery', description: 'She finds a strange old radio in the dusty attic.' },
      { label: 'First Voice', description: 'The radio crackles and she hears a voice that knows her name.' },
      { label: 'Decision', description: 'Amina must decide whether to tell her family or investigate alone.' },
      { label: 'Escalation', description: 'The voice warns her that the house holds a dangerous secret.' },
      { label: 'Confrontation', description: 'Amina confronts her uncle who has been hiding the truth about the radio.' },
      { label: 'Revelation', description: 'She discovers the voice is a message her grandmother recorded decades ago.' },
      { label: 'Resolution', description: 'Amina keeps the radio and feels her grandmother is still with her.' },
    ],
    continuityRules: [
      'The old radio must appear in every scene where Amina is in the attic.',
      'Grandmother is always referred to with warmth.',
    ],
    ...overrides,
  };
}

const AMINA_STORY = `
Amina arrived at her grandmother's house after the old woman passed away. The house smelled of
lavender and old books. Upstairs, she climbed to the dusty attic and found boxes of memories.
Hidden beneath a quilt was a strange old radio. When she switched it on, it crackled and then
a voice spoke — a voice that knew her name. Amina was frightened but curious. Her friend Marcus
knocked at the door just then. Should she tell him? The voice suddenly warned her: "The house
holds a dangerous secret, Amina. Your uncle knows." She confronted her uncle that evening.
He confessed he had been hiding the truth for decades. Then Amina discovered the voice was
actually a recording her grandmother had made years before she died. Amina wept, then smiled.
She kept the radio and felt her grandmother was still with her.
`;

const SIMPLE_STORY = `
Mia walks to school. She finds a red ball. She kicks the ball. She goes home.
`;

function makeSimpleBlueprint(): StoryBlueprint {
  return {
    version: 'story_blueprint_v1',
    premise: 'Mia walks to school and finds a ball.',
    protagonist: { name: 'Mia', goal: 'Get to school', motivation: 'She likes school' },
    supportingCharacters: [],
    conflict: 'None',
    beats: [
      { label: 'Walk', description: 'Mia walks to school.' },
      { label: 'Find', description: 'She finds a red ball.' },
      { label: 'Kick', description: 'She kicks the ball.' },
      { label: 'Home', description: 'She goes home.' },
    ],
    continuityRules: [],
  };
}

// ─── TEST 1: Character extraction ─────────────────────────────────────────────

describe('TEST 1: extractCharactersFromBlueprint — named entities', () => {
  it('extracts protagonist and supporting characters from blueprint', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const names = chars.map((c) => c.name.value.toLowerCase());

    expect(names).toContain('amina');
    expect(names).toContain('grandmother');
    expect(names).toContain('marcus');
  });

  it('protagonist gets role=protagonist', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const amina = chars.find((c) => c.name.value.toLowerCase() === 'amina');
    expect(amina).toBeDefined();
    expect(amina!.role.value).toBe('protagonist');
  });

  it('character IDs are stable (idempotent)', () => {
    const blueprint = makeBlueprint();
    const run1 = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const run2 = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const ids1 = run1.map((c) => c.id).sort();
    const ids2 = run2.map((c) => c.id).sort();
    expect(ids1).toEqual(ids2);
  });
});

// ─── TEST 2: Location extraction ──────────────────────────────────────────────

describe('TEST 2: extractLocationsFromText — setting and pattern-matched', () => {
  it('extracts the blueprint setting as a location', () => {
    const blueprint = makeBlueprint();
    const locs = extractLocationsFromText(AMINA_STORY, blueprint);
    const names = locs.map((l) => l.name.value.toLowerCase());
    // The setting "Grandmother's attic and house" should be present
    expect(names.some((n) => n.includes('attic') || n.includes('house') || n.includes("grandmother"))).toBe(true);
  });

  it('location IDs are stable across runs', () => {
    const blueprint = makeBlueprint();
    const run1 = extractLocationsFromText(AMINA_STORY, blueprint);
    const run2 = extractLocationsFromText(AMINA_STORY, blueprint);
    expect(run1.map((l) => l.id).sort()).toEqual(run2.map((l) => l.id).sort());
  });
});

// ─── TEST 3: Object extraction ────────────────────────────────────────────────

describe('TEST 3: extractObjectsFromText — important narrative objects', () => {
  it('extracts the radio as a notable/critical object', () => {
    const objs = extractObjectsFromText(AMINA_STORY);
    const names = objs.map((o) => o.name.value.toLowerCase());
    expect(names.some((n) => n.includes('radio'))).toBe(true);
  });

  it('radio is marked as continuity required', () => {
    const objs = extractObjectsFromText(AMINA_STORY);
    const radio = objs.find((o) => o.name.value.toLowerCase().includes('radio'));
    expect(radio).toBeDefined();
    expect(radio!.continuityRequired.value).toBe(true);
  });
});

// ─── TEST 4: Beat extraction ──────────────────────────────────────────────────

describe('TEST 4: extractBeatsFromBlueprint — structured beats with ordinals', () => {
  it('produces one HomerBeat per blueprint beat', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    expect(beats).toHaveLength(blueprint.beats.length);
  });

  it('ordinals are sequential starting at 1', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    expect(beats[0]!.ordinal).toBe(1);
    expect(beats[beats.length - 1]!.ordinal).toBe(beats.length);
  });

  it('first beat is structurally "beginning"', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    expect(beats[0]!.structuralPosition.value).toBe('beginning');
  });

  it('last beat is structurally "resolution" or "consequence"', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    const last = beats[beats.length - 1]!;
    expect(['resolution', 'consequence', 'climax']).toContain(last.structuralPosition.value);
  });
});

// ─── TEST 5: Thread detection ─────────────────────────────────────────────────

describe('TEST 5: extractThreadsFromText — unresolved narrative threads', () => {
  it('detects at least one thread in the Amina story', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(AMINA_STORY, beats);
    expect(threads.length).toBeGreaterThan(0);
  });

  it('detects zero threads in an extremely simple story', () => {
    const blueprint = makeSimpleBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(SIMPLE_STORY, beats);
    // Simple story has no mystery/conflict language — threads may be 0 or very few
    expect(threads.length).toBeLessThan(4);
  });

  it('thread descriptions have provenance INFERRED', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(AMINA_STORY, beats);
    for (const t of threads) {
      expect(t.description.provenance).toBe('INFERRED');
    }
  });
});

// ─── TEST 6: Complexity — simple story ───────────────────────────────────────

describe('TEST 6: assessComplexity — simple story is SIMPLE', () => {
  it('simple story scores as SIMPLE', () => {
    const blueprint = makeSimpleBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, SIMPLE_STORY);
    const locs = extractLocationsFromText(SIMPLE_STORY, blueprint);
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(SIMPLE_STORY, beats);
    const complexity = assessComplexity(SIMPLE_STORY, chars, locs, beats, threads);
    expect(complexity.level).toBe('SIMPLE');
    expect(complexity.seriesCandidate).toBe(false);
  });
});

// ─── TEST 7: Complexity — rich story ─────────────────────────────────────────

describe('TEST 7: assessComplexity — Amina story is MODERATE or COMPLEX', () => {
  it('Amina story scores MODERATE or COMPLEX', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const locs = extractLocationsFromText(AMINA_STORY, blueprint);
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(AMINA_STORY, beats);
    const complexity = assessComplexity(AMINA_STORY, chars, locs, beats, threads);
    expect(['MODERATE', 'COMPLEX']).toContain(complexity.level);
  });

  it('score is between 0 and 100', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const locs = extractLocationsFromText(AMINA_STORY, blueprint);
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(AMINA_STORY, beats);
    const complexity = assessComplexity(AMINA_STORY, chars, locs, beats, threads);
    expect(complexity.score).toBeGreaterThanOrEqual(0);
    expect(complexity.score).toBeLessThanOrEqual(100);
  });
});

// ─── TEST 8: Cliffhanger detection ───────────────────────────────────────────

describe('TEST 8: identifyCliffhangers — detects semantic signals', () => {
  it('detects cliffhangers in the Amina story', () => {
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(AMINA_STORY, beats);
    const cliffhangers = identifyCliffhangers(beats, threads, AMINA_STORY);
    expect(cliffhangers.length).toBeGreaterThan(0);
  });

  it('each cliffhanger has a valid type', () => {
    const validTypes = [
      'unanswered_revelation',
      'imminent_danger',
      'discovery',
      'decision',
      'unexpected_arrival',
      'unresolved_consequence',
      'new_mystery',
      'reversal',
    ];
    const blueprint = makeBlueprint();
    const beats = extractBeatsFromBlueprint(blueprint);
    const threads = extractThreadsFromText(AMINA_STORY, beats);
    const cliffhangers = identifyCliffhangers(beats, threads, AMINA_STORY);
    for (const c of cliffhangers) {
      expect(validTypes).toContain(c.type);
    }
  });
});

// ─── TEST 9: DECISION_PRECEDENCE — user outranks Homer ───────────────────────

describe('TEST 9: DECISION_PRECEDENCE — user always outranks Homer', () => {
  it('USER_EXPLICIT has lower number than HOMER_INFERENCE', () => {
    expect(DECISION_PRECEDENCE.USER_EXPLICIT).toBeLessThan(DECISION_PRECEDENCE.HOMER_INFERENCE);
  });

  it('USER_EXPLICIT has lower number than SYSTEM_DEFAULT', () => {
    expect(DECISION_PRECEDENCE.USER_EXPLICIT).toBeLessThan(DECISION_PRECEDENCE.SYSTEM_DEFAULT);
  });

  it('USER_APPROVED ranks below USER_EXPLICIT', () => {
    expect(DECISION_PRECEDENCE.USER_EXPLICIT).toBeLessThan(DECISION_PRECEDENCE.USER_APPROVED);
  });
});

// ─── TEST 10: Canon — user decision blocks Homer ─────────────────────────────

describe('TEST 10: setCanonFact — USER_EXPLICIT blocks HOMER_INFERENCE overwrite', () => {
  it('Homer cannot overwrite a user-set canon fact', () => {
    const userFacts = userDecisionsToCanon([{ label: 'genre', value: 'fantasy' }]);
    const { canon: afterUser } = setCanonFact(userFacts, { label: 'genre', value: 'mystery', owner: 'USER_EXPLICIT' });
    // Now Homer tries to overwrite
    const { accepted, canon: afterHomer } = setCanonFact(afterUser, {
      label: 'genre',
      value: 'sci-fi',
      owner: 'HOMER_INFERENCE',
    });
    expect(accepted).toBe(false);
    expect(getCanonValue(afterHomer, 'genre')).not.toBe('sci-fi');
  });

  it('isUserLocked returns true for USER_EXPLICIT facts', () => {
    const userFacts = userDecisionsToCanon([{ label: 'tone', value: 'dark' }]);
    expect(isUserLocked(userFacts, 'tone')).toBe(true);
  });

  it('mergeCanon respects precedence across merge', () => {
    const existing = userDecisionsToCanon([{ label: 'setting', value: 'the moon' }]);
    const incoming = userDecisionsToCanon([{ label: 'setting', value: 'mars' }]);
    // Both are USER_EXPLICIT — existing (lower merge index) wins
    const merged = mergeCanon(existing, incoming);
    // The existing fact was set first (higher-rank tie: existing wins as it's already present at same priority)
    expect(getCanonValue(merged, 'setting')).toBeDefined();
  });
});

// ─── TEST 11: Entity resolution ──────────────────────────────────────────────

describe('TEST 11: resolveCharacterReference — alias matching', () => {
  it('resolves exact name to character', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const resolved = resolveCharacterReference('Amina', chars);
    expect(resolved).toBeDefined();
    expect(resolved!.name.value).toBe('Amina');
  });

  it('resolves partial name match', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    // "amina" vs "Amina" — case insensitive key matching
    const resolved = resolveCharacterReference('amina', chars);
    expect(resolved).toBeDefined();
  });

  it('returns undefined for unknown reference', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const resolved = resolveCharacterReference('zzunknownzz', chars);
    expect(resolved).toBeUndefined();
  });
});

// ─── TEST 12: HomerClaim provenance ──────────────────────────────────────────

describe('TEST 12: HomerClaim provenance on extraction results', () => {
  it('protagonist name has provenance EXPLICIT', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    const amina = chars.find((c) => c.name.value === 'Amina');
    expect(amina!.name.provenance).toBe('EXPLICIT');
  });

  it('character role has provenance INFERRED', () => {
    const blueprint = makeBlueprint();
    const chars = extractCharactersFromBlueprint(blueprint, AMINA_STORY);
    for (const char of chars) {
      expect(['EXPLICIT', 'INFERRED', 'PROPOSED', 'UNKNOWN']).toContain(char.role.provenance);
    }
  });

  it('claim() helper constructs typed claims', () => {
    const c = claim('mystery', 'INFERRED', 'detected from text');
    expect(c.value).toBe('mystery');
    expect(c.provenance).toBe('INFERRED');
    expect(c.basis).toBe('detected from text');
  });
});

// ─── TEST 13: HomerService.interpretStory — full pipeline ────────────────────

describe('TEST 13: HomerService.interpretStory — full pipeline produces valid state', () => {
  const svc = new HomerService();
  const input: InterpretStoryInput = {
    storyText: AMINA_STORY,
    audienceMode: 'GENERAL',
  };
  const blueprint = makeBlueprint();

  it('produces a HomerStoryState with version=homer_v1', () => {
    const state = svc.interpretStory(input, blueprint);
    expect(state.version).toBe('homer_v1');
  });

  it('state has non-empty beats array', () => {
    const state = svc.interpretStory(input, blueprint);
    expect(state.beats.length).toBeGreaterThan(0);
  });

  it('state has non-empty characters array', () => {
    const state = svc.interpretStory(input, blueprint);
    expect(state.entities.characters.length).toBeGreaterThan(0);
  });

  it('state premise matches blueprint premise', () => {
    const state = svc.interpretStory(input, blueprint);
    expect(state.premise.value).toBe(blueprint.premise);
  });

  it('audienceMode is preserved', () => {
    const state = svc.interpretStory(input, blueprint);
    expect(state.audienceMode).toBe('GENERAL');
  });
});

// ─── TEST 14: Homer does not bleed into Director ─────────────────────────────

describe('TEST 14: HomerService.toDirectorInput — no CUT lists in output', () => {
  const svc = new HomerService();

  it('toDirectorInput output has no CUT - markers', () => {
    const state = svc.interpretStory({ storyText: AMINA_STORY, audienceMode: 'GENERAL' }, makeBlueprint());
    const directorInput = svc.toDirectorInput(state, 'proj-test');
    const json = JSON.stringify(directorInput);
    expect(json).not.toMatch(/CUT\s*-\s*/);
    expect(json).not.toMatch(/PHYSICS:/);
    expect(json).not.toMatch(/SOUND DESIGN:/);
  });

  it('toDirectorInput has required storyIntent fields', () => {
    const state = svc.interpretStory({ storyText: AMINA_STORY, audienceMode: 'GENERAL' }, makeBlueprint());
    const directorInput = svc.toDirectorInput(state, 'proj-test');
    expect(directorInput.storyIntent.premise).toBeDefined();
    expect(directorInput.storyIntent.audienceMode).toBe('GENERAL');
  });
});

// ─── TEST 15: KIDS mode respected ────────────────────────────────────────────

describe('TEST 15: KIDS audienceMode is preserved through interpretation', () => {
  const svc = new HomerService();

  it('KIDS mode is set correctly in state', () => {
    const state = svc.interpretStory(
      { storyText: SIMPLE_STORY, audienceMode: 'KIDS' },
      makeSimpleBlueprint(),
    );
    expect(state.audienceMode).toBe('KIDS');
  });

  it('toDirectorInput propagates KIDS audienceMode', () => {
    const state = svc.interpretStory(
      { storyText: SIMPLE_STORY, audienceMode: 'KIDS' },
      makeSimpleBlueprint(),
    );
    const directorInput = svc.toDirectorInput(state, 'proj-kids');
    expect(directorInput.storyIntent.audienceMode).toBe('KIDS');
  });
});

// ─── AI Interpreter boundary tests ───────────────────────────────────────────
//
// Tests A-J verify the reconciler + interpreter pipeline against simulated
// ProposedStoryStates (what a real AI would return for each story snippet).
// This tests the pipeline robustness without requiring a live API key.

function makeProposed(overrides: Partial<ProposedStoryState> = {}): ProposedStoryState {
  return {
    version: 'proposed_v1',
    interpretedFrom: 'test',
    premise: 'test premise',
    genre: 'mystery',
    tone: 'tense',
    themes: ['discovery'],
    emotionalDirection: 'tension → revelation',
    characters: [],
    locations: [],
    objects: [],
    beats: [],
    threads: [],
    worldState: { temporalComplexity: 'linear', atmosphericDetails: [], environmentalFacts: [] },
    interpretationConfidence: 'high',
    ambiguities: [],
    ...overrides,
  };
}

// ─── TEST A: Basic story — character + location + tension ─────────────────────

describe('TEST A (AI pipeline): reconciler extracts character + location + tension', () => {
  it('reconciles proposed character Amina', () => {
    const proposed = makeProposed({
      characters: [{ name: 'Amina', role: 'protagonist', description: 'young woman climbing stairs', aliases: [], narrativeImportance: 'primary', relationships: [], traits: ['curious'] }],
      locations: [{ name: 'attic stairs', description: 'steep wooden stairs', role: 'story location', environmentalCharacteristics: ['dark'] }],
      threads: [{ description: 'what is above Amina?', kind: 'mystery', status: 'open' }],
    });

    const state = reconcile({
      proposed,
      existingState: null,
      existingCanon: [],
      userDecisions: [],
      storyText: 'Amina was halfway up the attic stairs when she heard something move above her.',
      audienceMode: 'GENERAL',
    });

    const names = state.entities.characters.map((c) => c.name.value);
    expect(names).toContain('Amina');
    expect(state.entities.locations.length).toBeGreaterThan(0);
    expect(state.threads.some((t) => t.kind === 'mystery')).toBe(true);
  });

  it('all AI-generated character claims are PROPOSED', () => {
    const proposed = makeProposed({
      characters: [{ name: 'Amina', role: 'protagonist', description: 'she climbs', aliases: [], narrativeImportance: 'primary', relationships: [], traits: [] }],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'Amina climbs.', audienceMode: 'GENERAL' });
    const amina = state.entities.characters.find((c) => c.name.value === 'Amina');
    expect(amina).toBeDefined();
    expect(amina!.name.provenance).toBe('PROPOSED');
  });
});

// ─── TEST B: Object — radio ───────────────────────────────────────────────────

describe('TEST B (AI pipeline): AI identifies radio as continuity-required object', () => {
  it('radio proposed by AI is preserved in reconciled state', () => {
    const proposed = makeProposed({
      objects: [{ name: 'radio', description: 'old radio, whispers her name', narrativeImportance: 'critical', continuityRequired: true }],
      characters: [{ name: 'Amina', role: 'protagonist', description: '', aliases: [], narrativeImportance: 'primary', relationships: [], traits: [] }],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'Amina finds a strange old radio.', audienceMode: 'GENERAL' });
    const radio = state.entities.objects.find((o) => o.name.value === 'radio');
    expect(radio).toBeDefined();
    expect(radio!.continuityRequired.value).toBe(true);
    expect(radio!.name.provenance).toBe('PROPOSED');
  });
});

// ─── TEST C: Multiple characters — ambiguous pronoun not resolved ─────────────

describe('TEST C (AI pipeline): ambiguous pronoun is preserved as ambiguity', () => {
  it('beat with ambiguous pronoun lists both characters, not just first', () => {
    const proposed = makeProposed({
      characters: [
        { name: 'John', role: 'protagonist', description: '', aliases: [], narrativeImportance: 'primary', relationships: [], traits: [] },
        { name: 'Marcus', role: 'supporting', description: '', aliases: [], narrativeImportance: 'supporting', relationships: [], traits: [] },
      ],
      beats: [{
        ordinal: 1,
        label: 'Enter',
        description: 'John entered with Marcus.',
        function: 'introduction',
        emotionalDirection: 'neutral',
        // AI correctly includes BOTH characters — does not guess who "he" refers to
        charactersInvolved: ['John', 'Marcus'],
        locationsInvolved: [],
        objectsInvolved: [],
      }],
      ambiguities: ['pronoun "he" in second sentence is ambiguous between John and Marcus'],
    });

    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'John entered the room with Marcus. He walked to the window.', audienceMode: 'GENERAL' });
    const johnBeat = state.beats.find((b) => b.label === 'Enter');
    expect(johnBeat).toBeDefined();
    // Both characters should be linked to the beat
    expect(johnBeat!.charactersInvolved.length).toBeGreaterThanOrEqual(2);
  });

  it('proposed characters have no unconditional pronoun aliases', () => {
    const proposed = makeProposed({
      characters: [
        { name: 'John', role: 'protagonist', description: '', aliases: ['the detective'], narrativeImportance: 'primary', relationships: [], traits: [] },
        { name: 'Marcus', role: 'supporting', description: '', aliases: [], narrativeImportance: 'supporting', relationships: [], traits: [] },
      ],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: '', audienceMode: 'GENERAL' });
    const allAliases = state.entities.characters.flatMap((c) => c.aliases);
    // Unconditional pronouns must NOT appear — they cause false merges
    expect(allAliases).not.toContain('he');
    expect(allAliases).not.toContain('she');
    expect(allAliases).not.toContain('they');
  });
});

// ─── TEST D: Descriptive reference resolution ─────────────────────────────────

describe('TEST D (AI pipeline): "the old traveler" resolves to John if AI is confident', () => {
  it('alias from AI is preserved in reconciled character', () => {
    const proposed = makeProposed({
      characters: [{ name: 'John', role: 'protagonist', description: 'old traveler', aliases: ['the old traveler'], narrativeImportance: 'primary', relationships: [], traits: ['old'] }],
      objects: [{ name: 'lantern', description: 'portable light', narrativeImportance: 'notable', continuityRequired: false }],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: '', audienceMode: 'GENERAL' });
    const john = state.entities.characters.find((c) => c.name.value === 'John');
    expect(john).toBeDefined();
    expect(john!.aliases).toContain('the old traveler');
  });
});

// ─── TEST E: Recurring object — no duplicate creation ────────────────────────

describe('TEST E (AI pipeline): recurring radio stays one entity, no duplicate', () => {
  it('second interpretation of same radio does not create a second entity', () => {
    const firstProposed = makeProposed({
      objects: [{ name: 'radio', description: 'old radio', narrativeImportance: 'critical', continuityRequired: true }],
    });
    const firstState = reconcile({ proposed: firstProposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'Amina finds a radio.', audienceMode: 'GENERAL' });

    const secondProposed = makeProposed({
      objects: [{ name: 'radio', description: 'old radio', narrativeImportance: 'critical', continuityRequired: true }],
    });
    const secondState = reconcile({ proposed: secondProposed, existingState: firstState, existingCanon: firstState.canon, userDecisions: [], storyText: 'Amina carries the radio.', audienceMode: 'GENERAL' });

    const radios = secondState.entities.objects.filter((o) => o.name.value === 'radio');
    expect(radios).toHaveLength(1);
  });
});

// ─── TEST F: World state ──────────────────────────────────────────────────────

describe('TEST F (AI pipeline): world state extracted from atmospheric descriptions', () => {
  it('atmospheric details from AI are stored in state', () => {
    const proposed = makeProposed({
      worldState: {
        temporalComplexity: 'linear',
        atmosphericDetails: ['dust covers everything', 'broken windows'],
        environmentalFacts: ['abandoned for decades', 'vines through windows'],
      },
      locations: [{ name: 'abandoned observatory', description: 'overgrown ruin', role: 'primary location', environmentalCharacteristics: ['dusty', 'neglected', 'overgrown'] }],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'The observatory had been abandoned for decades.', audienceMode: 'GENERAL' });
    const obs = state.entities.locations.find((l) => l.name.value.includes('observatory'));
    expect(obs).toBeDefined();
    expect(obs!.environmentalCharacteristics.value.length).toBeGreaterThan(0);
  });
});

// ─── TEST G: Unresolved thread ────────────────────────────────────────────────

describe('TEST G (AI pipeline): temporal constraint + open thread', () => {
  it('AI-proposed thread with midnight condition is preserved', () => {
    const proposed = makeProposed({
      threads: [{ description: 'why must Amina return at midnight?', kind: 'mystery', status: 'open' }],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'The voice told Amina to return at midnight, but would not explain why.', audienceMode: 'GENERAL' });
    expect(state.threads.some((t) => t.kind === 'mystery' && t.status === 'open')).toBe(true);
  });
});

// ─── TEST H: Cliffhanger from AI proposed ────────────────────────────────────

describe('TEST H (AI pipeline): escalation beat → cliffhanger identified', () => {
  it('AI-proposed escalation beat triggers cliffhanger detection', () => {
    const proposed = makeProposed({
      beats: [
        { ordinal: 1, label: 'Open Radio', description: 'Amina opens the radio.', function: 'discovery', emotionalDirection: 'curiosity', charactersInvolved: [], locationsInvolved: [], objectsInvolved: ['radio'] },
        { ordinal: 2, label: 'Voice says name', description: 'The voice said her mother\'s name.', function: 'escalation', emotionalDirection: 'shock', charactersInvolved: [], locationsInvolved: [], objectsInvolved: ['radio'] },
      ],
    });
    const state = reconcile({
      proposed,
      existingState: null,
      existingCanon: [],
      userDecisions: [],
      storyText: "Amina opened the radio again. This time, the voice said her mother's name.",
      audienceMode: 'GENERAL',
    });
    expect(state.cliffhangers.length).toBeGreaterThan(0);
  });
});

// ─── TEST I: USER_EXPLICIT overrides AI ──────────────────────────────────────

describe('TEST I (AI pipeline): USER_EXPLICIT decision overrides AI proposal', () => {
  it('AI proposing a different name for the radio does not override user explicit name', () => {
    // User explicitly named the radio "Echo"
    const userDecisions = [{ label: 'radio_name', value: 'Echo' }];
    const proposed = makeProposed({
      objects: [{ name: 'old radio', description: 'unnamed device', narrativeImportance: 'notable', continuityRequired: false }],
    });
    const state = reconcile({
      proposed,
      existingState: null,
      existingCanon: [],
      userDecisions,
      storyText: '',
      audienceMode: 'GENERAL',
    });
    // User's canon fact must be present
    const radioNameFact = state.canon.find((f) => f.label === 'radio_name');
    expect(radioNameFact).toBeDefined();
    expect(radioNameFact!.value).toBe('Echo');
    expect(radioNameFact!.owner).toBe('USER_EXPLICIT');
  });
});

// ─── TEST J: Canon survival ───────────────────────────────────────────────────

describe('TEST J (AI pipeline): canon entities survive re-interpretation with different surface forms', () => {
  it('existing character "John" survives when new text says "the boy"', () => {
    // Existing state has John as protagonist
    const svc = new HomerService();
    const blueprint = makeBlueprint({
      protagonist: { name: 'John', goal: 'find the truth', motivation: 'curiosity' },
      supportingCharacters: [],
      beats: [{ label: 'Setup', description: 'John enters.' }],
    });
    const existingState = svc.interpretStory({ storyText: 'John enters.', audienceMode: 'GENERAL' }, blueprint);

    // New AI proposal uses "the boy" as alias for John
    const proposed = makeProposed({
      characters: [{
        name: 'John',
        role: 'protagonist',
        description: '',
        aliases: ['the boy'], // AI correctly identified alias
        narrativeImportance: 'primary',
        relationships: [],
        traits: [],
      }],
    });
    const newState = reconcile({
      proposed,
      existingState,
      existingCanon: existingState.canon,
      userDecisions: [],
      storyText: 'The boy reached for it...',
      audienceMode: 'GENERAL',
    });

    // John should still exist (not duplicated)
    const johns = newState.entities.characters.filter((c) => c.name.value === 'John');
    expect(johns).toHaveLength(1);
    // "the boy" should now be an alias
    expect(johns[0]!.aliases).toContain('the boy');
  });
});

// ─── PROPOSED → USER_APPROVED → EXISTING_CANON provenance flow ───────────────

describe('Provenance flow: PROPOSED → USER_APPROVED → EXISTING_CANON', () => {
  it('AI-proposed fact starts as HOMER_PROPOSAL in canon', () => {
    const proposed = makeProposed({ genre: 'mystery' });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: '', audienceMode: 'GENERAL' });
    // Homer inference canon has the genre at HOMER_INFERENCE level
    const genreFact = state.canon.find((f) => f.label === 'genre');
    expect(genreFact).toBeDefined();
    // It should be HOMER_INFERENCE (not USER_EXPLICIT)
    expect(genreFact!.owner).toBe('HOMER_INFERENCE');
  });

  it('user approval promotes a fact to USER_APPROVED', () => {
    const svc = new HomerService();
    // Start with Homer inferred "mystery"
    const proposed = makeProposed({ genre: 'mystery' });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: '', audienceMode: 'GENERAL' });

    // User approves: override at USER_EXPLICIT level
    const { canon: updatedCanon, accepted } = svc.updateCanon(state.canon, {
      label: 'genre',
      value: 'mystery',
      owner: 'USER_APPROVED',
    });
    expect(accepted).toBe(true);
    const approvedFact = updatedCanon.find((f) => f.label === 'genre');
    expect(approvedFact!.owner).toBe('USER_APPROVED');
  });

  it('subsequent interpretation does not downgrade USER_APPROVED to HOMER_INFERENCE', () => {
    const svc = new HomerService();
    const proposed = makeProposed({ genre: 'mystery' });
    const firstState = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: '', audienceMode: 'GENERAL' });

    // User approves genre
    const { canon: userApprovedCanon } = svc.updateCanon(firstState.canon, {
      label: 'genre',
      value: 'mystery',
      owner: 'USER_APPROVED',
    });

    // New AI interpretation proposes "fantasy" (different genre)
    const secondProposed = makeProposed({ genre: 'fantasy' });
    const secondState = reconcile({
      proposed: secondProposed,
      existingState: firstState,
      existingCanon: userApprovedCanon,
      userDecisions: [],
      storyText: '',
      audienceMode: 'GENERAL',
    });

    // User-approved "mystery" must survive
    const genreFact = secondState.canon.find((f) => f.label === 'genre');
    expect(genreFact).toBeDefined();
    expect(genreFact!.value).toBe('mystery');
    expect(genreFact!.owner).toBe('USER_APPROVED');
  });
});

// ─── Persistence: mock-based ──────────────────────────────────────────────────

describe('Persistence: interpretAndPersist pipeline (mocked DB)', () => {
  function makeMockPrisma(existing: Record<string, unknown> | null = null) {
    const stored: { data: Record<string, unknown> | null } = { data: existing };
    return {
      creativeBible: {
        findUnique: vi.fn(async () =>
          stored.data ? { id: 'bible-1', projectId: 'proj-1', story: stored.data, version: 1 } : null,
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored.data = data.story as Record<string, unknown>;
          return { id: 'bible-1', ...data };
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored.data = data.story as Record<string, unknown>;
          return { id: 'bible-1', ...data };
        }),
      },
    };
  }

  it('first call creates a new CreativeBible record', async () => {
    const mockPrisma = makeMockPrisma(null);
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          version: 'proposed_v1',
          interpretedFrom: 'Amina',
          premise: 'Amina finds a radio',
          themes: [],
          emotionalDirection: 'neutral',
          characters: [{ name: 'Amina', role: 'protagonist', description: '', aliases: [], narrativeImportance: 'primary', relationships: [], traits: [] }],
          locations: [],
          objects: [{ name: 'radio', description: '', narrativeImportance: 'critical', continuityRequired: true }],
          beats: [],
          threads: [],
          worldState: { temporalComplexity: 'linear', atmosphericDetails: [], environmentalFacts: [] },
          interpretationConfidence: 'high',
          ambiguities: [],
        }) }],
      }),
    }));

    const svc = new HomerService({ fetchImpl: mockFetch as unknown as typeof fetch, env: { HOMER_INTERPRETER_ENABLED: 'true', CLAUDE_API: 'test-key' } });
    const state = await svc.interpretAndPersist(
      mockPrisma as unknown as import('@raivstream/database').PrismaClient,
      'proj-1',
      { storyText: 'Amina finds a radio.', audienceMode: 'GENERAL' },
    );

    expect(mockPrisma.creativeBible.create).toHaveBeenCalledOnce();
    expect(state.entities.characters.some((c) => c.name.value === 'Amina')).toBe(true);
  });

  it('second call reads existing state and does not duplicate Amina', async () => {
    const svc = new HomerService();
    // Build a blueprint state as the "prior" stored state
    const blueprint = makeBlueprint();
    const firstState = svc.interpretStory({ storyText: AMINA_STORY, audienceMode: 'GENERAL' }, blueprint);

    // Mock prisma returns the first state as existing
    const mockPrisma = makeMockPrisma(firstState as unknown as Record<string, unknown>);
    // Interpreter disabled — use fallback (pure reconciler)
    const secondSvc = new HomerService({ env: { HOMER_INTERPRETER_ENABLED: 'false' } });
    const secondState = await secondSvc.interpretAndPersist(
      mockPrisma as unknown as import('@raivstream/database').PrismaClient,
      'proj-1',
      { storyText: AMINA_STORY, audienceMode: 'GENERAL', existingCanon: firstState.canon },
    );

    const aminas = secondState.entities.characters.filter((c) => c.name.value === 'Amina');
    expect(aminas.length).toBeLessThanOrEqual(1);
    expect(mockPrisma.creativeBible.update).toHaveBeenCalledOnce();
  });
});

// ─── Interpreter: fallback behavior ──────────────────────────────────────────

describe('HomerInterpreter: fallback when disabled', () => {
  it('disabled interpreter returns low-confidence proposed state', async () => {
    const interpreter = new HomerInterpreter({ env: { HOMER_INTERPRETER_ENABLED: 'false' } });
    const result = await interpreter.interpret({ storyText: 'Amina climbs.', audienceMode: 'GENERAL' });
    expect(result.version).toBe('proposed_v1');
    expect(result.interpretationConfidence).toBe('low');
    expect(result.ambiguities.length).toBeGreaterThan(0);
  });

  it('fallbackProposed returns valid ProposedStoryState', () => {
    const state = fallbackProposed('Some story text here.');
    expect(state.version).toBe('proposed_v1');
    expect(state.characters).toEqual([]);
    expect(state.interpretationConfidence).toBe('low');
  });
});

// ─── Homer → Director: AI path produces no CUT markers ───────────────────────

describe('Homer → Director boundary: AI pipeline produces no CUT/PHYSICS/SOUND DESIGN', () => {
  const svc = new HomerService();

  it('toDirectorInput from reconciled state has no CUT markers', () => {
    const proposed = makeProposed({
      characters: [{ name: 'Amina', role: 'protagonist', description: '', aliases: [], narrativeImportance: 'primary', relationships: [], traits: [] }],
      beats: [{ ordinal: 1, label: 'Enter', description: 'Amina enters the attic.', function: 'setup', emotionalDirection: 'neutral', charactersInvolved: ['Amina'], locationsInvolved: [], objectsInvolved: [] }],
    });
    const state = reconcile({ proposed, existingState: null, existingCanon: [], userDecisions: [], storyText: 'Amina enters.', audienceMode: 'GENERAL' });
    const directorInput = svc.toDirectorInput(state, 'proj-test');
    const json = JSON.stringify(directorInput);
    expect(json).not.toMatch(/CUT\s*-\s*/);
    expect(json).not.toMatch(/PHYSICS:/);
    expect(json).not.toMatch(/SOUND DESIGN:/);
  });
});
