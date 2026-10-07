/**
 * Homer — HomerService: Story Intelligence domain orchestration.
 *
 * Three methods:
 *   interpretStory()       — synchronous, blueprint-based (existing behavior, tests)
 *   interpretStoryWithAI() — async, AI interpretation → deterministic reconciliation
 *   interpretAndPersist()  — full pipeline including CreativeBible.story persistence
 *
 * Homer is NOT a chatbot UI, NOT the video generator, NOT MovieDirector.
 * Homer is the STORY INTELLIGENCE + STORY ORCHESTRATION layer.
 *
 * Invariants:
 *   1. User decisions outrank Homer inferences (DECISION_PRECEDENCE).
 *   2. Homer never generates MovieDirector CUT lists.
 *   3. Homer never calls video/image/audio providers directly.
 *   4. AI interpretation is PROPOSED — not automatically canonical.
 */

import type { PrismaClient } from '@raivstream/database';
import type { StoryBlueprint } from '../storyIntelligence/types';
import {
  assignStructuralArc,
  claim,
  extractBeatsFromBlueprint,
  extractCharactersFromBlueprint,
  extractLocationsFromText,
  extractObjectsFromText,
  extractThreadsFromText,
} from './extraction';
import {
  detectRelationships,
  linkBeatsToEntities,
  resolveCharacterReference,
  resolveLocationReference,
} from './resolution';
import { assessComplexity, identifyEpisodeBoundaries } from './complexity';
import { identifyCliffhangers } from './cliffhangers';
import {
  buildHomerInferenceCanon,
  mergeCanon,
  setCanonFact,
  userDecisionsToCanon,
} from './canon';
import { HomerInterpreter, type HomerInterpreterDeps } from './interpreter';
import { reconcile } from './reconciler';
import { loadHomerState, saveHomerState } from './repository';
import type {
  HomerBeat,
  HomerCanonFact,
  HomerCharacter,
  HomerCliffhanger,
  HomerComplexityAssessment,
  HomerDirectorInput,
  HomerEpisodeBoundary,
  HomerInterpretationRequest,
  HomerLocation,
  HomerStoryState,
  HomerThread,
  InterpretStoryInput,
} from './types';

// ─── Blueprint-based helpers (kept for sync path + tests) ─────────────────────

function detectGenre(text: string, blueprint: StoryBlueprint): string | undefined {
  return blueprint.genre ?? inferGenreFromText(text);
}

function inferGenreFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/\b(magic|spell|wizard|witch|dragon|elf|fairy|quest)\b/.test(lower)) return 'fantasy';
  if (/\b(space|planet|robot|alien|galaxy|spacecraft|future)\b/.test(lower)) return 'science fiction';
  if (/\b(murder|detective|clue|suspect|crime|mystery)\b/.test(lower)) return 'mystery';
  if (/\b(love|romance|heart|kiss|relationship)\b/.test(lower)) return 'romance';
  if (/\b(monster|ghost|haunted|fear|horror|creature|nightmare)\b/.test(lower)) return 'horror';
  if (/\b(adventure|journey|quest|explore|treasure|expedition)\b/.test(lower)) return 'adventure';
  return undefined;
}

function inferThemes(text: string, blueprint: StoryBlueprint): string[] {
  if (blueprint.theme) return [blueprint.theme];
  const lower = text.toLowerCase();
  const themes: string[] = [];
  if (/\b(family|friendship|trust|loyalty)\b/.test(lower)) themes.push('relationships');
  if (/\b(courage|bravery|fear|overcome)\b/.test(lower)) themes.push('courage');
  if (/\b(identity|belonging|purpose|who am i)\b/.test(lower)) themes.push('identity');
  if (/\b(power|control|freedom|justice)\b/.test(lower)) themes.push('power and justice');
  if (/\b(loss|grief|death|mourning)\b/.test(lower)) themes.push('loss and grief');
  if (/\b(growth|change|learning|transformation)\b/.test(lower)) themes.push('growth');
  return themes.length > 0 ? themes : ['unknown'];
}

function inferEmotionalDirection(blueprint: StoryBlueprint, text: string): string {
  if (blueprint.emotionalArc) return blueprint.emotionalArc;
  const lower = text.toLowerCase();
  if (/\b(hope|triumph|joy|succeed|happy)\b/.test(lower)) return 'tension → resolution → hope';
  if (/\b(tragedy|loss|failure|grief)\b/.test(lower)) return 'tension → loss → reflection';
  return 'neutral → tension → resolution';
}

// ─── HomerService ─────────────────────────────────────────────────────────────

export class HomerService {
  private readonly interpreter: HomerInterpreter;

  constructor(deps: HomerInterpreterDeps = {}) {
    this.interpreter = new HomerInterpreter(deps);
  }

  // ─── Synchronous blueprint path (original, tests use this) ─────────────────

  /**
   * Blueprint-based interpretation: synchronous, deterministic, no AI call.
   * Used by the existing test suite and as a fallback when AI is unavailable.
   */
  interpretStory(input: InterpretStoryInput, blueprint: StoryBlueprint): HomerStoryState {
    const { storyText, audienceMode, existingCanon = [], userDecisions = [] } = input;

    const userCanon = userDecisionsToCanon(userDecisions);
    let canon = mergeCanon(existingCanon, userCanon);

    const characters = extractCharactersFromBlueprint(blueprint, storyText);
    const locations = extractLocationsFromText(storyText, blueprint);
    const objects = extractObjectsFromText(storyText);
    let beats = extractBeatsFromBlueprint(blueprint);
    beats = linkBeatsToEntities(beats, characters, locations);
    const threads = extractThreadsFromText(storyText, beats);

    const detectedRelationships = detectRelationships(storyText, characters, locations);
    const relationships = detectedRelationships.map((r) => ({
      fromId: r.fromId,
      toId: r.toId,
      kind: r.kind,
      label: claim(r.label, 'INFERRED' as const, r.basis),
    }));

    const arc = assignStructuralArc(beats);
    const complexity = assessComplexity(storyText, characters, locations, beats, threads);
    const episodeBoundaries = identifyEpisodeBoundaries(beats, threads, complexity.seriesCandidate);
    const cliffhangers = identifyCliffhangers(beats, threads, storyText);

    const inferenceFacts = buildHomerInferenceCanon([
      { label: 'genre', value: detectGenre(storyText, blueprint) },
      { label: 'protagonist', value: blueprint.protagonist.name },
      { label: 'setting', value: blueprint.setting },
      { label: 'complexity', value: complexity.level },
      { label: 'seriesCandidate', value: complexity.seriesCandidate },
    ]);
    canon = mergeCanon(canon, inferenceFacts);

    return {
      version: 'homer_v1',
      interpretedAt: new Date().toISOString(),
      storyText,
      premise: claim(blueprint.premise, 'EXPLICIT', 'from story blueprint'),
      genre: claim(detectGenre(storyText, blueprint), 'INFERRED', 'inferred from story text and blueprint'),
      tone: claim(blueprint.tone, 'INFERRED', 'from blueprint tone field'),
      themes: claim(inferThemes(storyText, blueprint), 'INFERRED', 'theme keywords in story text'),
      emotionalDirection: claim(inferEmotionalDirection(blueprint, storyText), 'INFERRED', 'from blueprint emotionalArc or text signals'),
      audienceMode,
      entities: { characters, locations, objects },
      relationships,
      beats,
      structuralArc: claim(arc, 'INFERRED', 'proportional beat placement'),
      threads,
      canon,
      complexity,
      episodeBoundaries,
      cliffhangers,
    };
  }

  // ─── AI interpretation path ────────────────────────────────────────────────

  /**
   * AI-powered interpretation: async, uses Claude to understand raw story text.
   * Produces PROPOSED claims → deterministic reconciler → canonical HomerStoryState.
   * Does NOT persist. Call interpretAndPersist() for the full pipeline.
   */
  async interpretStoryWithAI(request: HomerInterpretationRequest): Promise<HomerStoryState> {
    // Step 1: AI interprets → ProposedStoryState (all PROPOSED)
    const proposed = await this.interpreter.interpret(request);

    // Step 2: Deterministic reconciler merges proposal with existing state + canon
    return reconcile({
      proposed,
      existingState: request.existingState ?? null,
      existingCanon: request.existingCanon ?? [],
      userDecisions: request.userDecisions ?? [],
      storyText: request.storyText,
      audienceMode: request.audienceMode,
    });
  }

  // ─── Full pipeline: AI → reconcile → persist ───────────────────────────────

  /**
   * Full pipeline: load existing state → AI interpret → reconcile → save.
   * This is the production-path method.
   *
   * Fail-safe: if anything goes wrong, the original state is preserved in DB.
   * Returns the resulting canonical HomerStoryState.
   */
  async interpretAndPersist(
    prisma: PrismaClient,
    projectId: string,
    request: Omit<HomerInterpretationRequest, 'existingState'>,
  ): Promise<HomerStoryState> {
    // Step 1: Load existing state (if any)
    const existingState = await loadHomerState(prisma, projectId);

    // Step 2: AI interpretation → deterministic reconciliation
    const newState = await this.interpretStoryWithAI({
      ...request,
      existingState,
    });

    // Step 3: Persist only on success
    await saveHomerState(prisma, projectId, newState);

    return newState;
  }

  // ─── Utility delegates ─────────────────────────────────────────────────────

  extractEntities(blueprint: StoryBlueprint, storyText: string) {
    return {
      characters: extractCharactersFromBlueprint(blueprint, storyText),
      locations: extractLocationsFromText(storyText, blueprint),
      objects: extractObjectsFromText(storyText),
    };
  }

  extractBeats(blueprint: StoryBlueprint): HomerBeat[] {
    return extractBeatsFromBlueprint(blueprint);
  }

  resolveEntityReferences(
    reference: string,
    characters: HomerCharacter[],
    locations: HomerLocation[],
  ) {
    return {
      character: resolveCharacterReference(reference, characters),
      location: resolveLocationReference(reference, locations),
    };
  }

  assessComplexity(
    storyText: string,
    characters: HomerCharacter[],
    locations: HomerLocation[],
    beats: HomerBeat[],
    threads: HomerThread[],
  ): HomerComplexityAssessment {
    return assessComplexity(storyText, characters, locations, beats, threads);
  }

  identifyThreads(storyText: string, beats: HomerBeat[]): HomerThread[] {
    return extractThreadsFromText(storyText, beats);
  }

  identifyCliffhangers(
    beats: HomerBeat[],
    threads: HomerThread[],
    storyText: string,
  ): HomerCliffhanger[] {
    return identifyCliffhangers(beats, threads, storyText);
  }

  updateCanon(
    canon: HomerCanonFact[],
    incoming: Omit<HomerCanonFact, 'id' | 'establishedAt'>,
  ) {
    return setCanonFact(canon, incoming);
  }

  getStoryState(state: HomerStoryState): HomerStoryState {
    return state;
  }

  /**
   * Convert HomerStoryState to the structured contract Homer hands downstream to Director.
   * Director uses this to determine visual treatment — Homer never constructs CUT lists.
   */
  toDirectorInput(state: HomerStoryState, projectId: string): HomerDirectorInput {
    return {
      projectId,
      storyIntent: {
        premise: state.premise.value,
        genre: state.genre.value,
        tone: state.tone.value,
        themes: state.themes.value,
        emotionalDirection: state.emotionalDirection.value,
        audienceMode: state.audienceMode,
      },
      characters: state.entities.characters.map((c) => ({
        id: c.id,
        name: c.name.value,
        role: c.role.value,
        description: c.description.value,
        narrativeImportance: c.narrativeImportance.value,
        relationships: c.relationships.map((r) => ({
          targetName: r.targetId,
          label: r.label.value,
        })),
      })),
      locations: state.entities.locations.map((l) => ({
        id: l.id,
        name: l.name.value,
        description: l.description.value,
        role: l.role.value,
      })),
      beats: state.beats.map((b) => ({
        id: b.id,
        ordinal: b.ordinal,
        label: b.label,
        description: b.description.value,
        function: b.function.value,
        emotionalDirection: b.emotionalDirection.value,
        charactersInvolved: b.charactersInvolved,
        locationsInvolved: b.locationsInvolved,
      })),
      continuityRequirements: state.entities.objects
        .filter((o) => o.continuityRequired.value)
        .map((o) => `${o.name.value} must appear consistently across scenes`),
      visualOpportunities: state.cliffhangers.map((c) =>
        `${c.type}: ${c.description.slice(0, 100)}`,
      ),
    };
  }
}

export const homerService = new HomerService();
