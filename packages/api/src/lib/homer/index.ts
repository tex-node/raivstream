/**
 * Homer — Story Intelligence + Story Orchestration layer.
 *
 * Public API. Import from here, not from sub-modules directly.
 */

export { HomerService, homerService } from './service';
export { DECISION_PRECEDENCE } from './types';
export type {
  BeatFunction,
  CharacterRole,
  CliffhangerType,
  DecisionOwner,
  DecisionProvenance,
  HomerBeat,
  HomerCanonFact,
  HomerCharacter,
  HomerCliffhanger,
  HomerComplexityAssessment,
  HomerDirectorInput,
  HomerEpisodeBoundary,
  HomerInterpretationRequest,
  HomerLocation,
  HomerObject,
  HomerStoryState,
  HomerThread,
  InterpretStoryInput,
  NarrativeImportance,
  ProposedStoryBeat,
  ProposedStoryCharacter,
  ProposedStoryLocation,
  ProposedStoryObject,
  ProposedStoryState,
  ProposedStoryThread,
  ProposedWorldState,
  StoryComplexity,
  StructuralPosition,
  ThreadKind,
} from './types';

// Interpreter
export { HomerInterpreter, HOMER_INTERPRETER_FLAG, fallbackProposed, isHomerInterpreterEnabled } from './interpreter';
export type { HomerInterpreterDeps } from './interpreter';

// Reconciler
export { reconcile } from './reconciler';
export type { ReconcileInput } from './reconciler';

// Repository
export { loadHomerState, saveCanonFacts, saveHomerState } from './repository';

// Extraction helpers (useful for testing and for callers that need partial extraction)
export {
  assignStructuralArc,
  claim,
  extractBeatsFromBlueprint,
  extractCharactersFromBlueprint,
  extractLocationsFromText,
  extractObjectsFromText,
  extractThreadsFromText,
  normalizeKey,
  stableId,
} from './extraction';

// Resolution helpers
export {
  detectRelationships,
  linkBeatsToEntities,
  resolveCharacterReference,
  resolveLocationReference,
} from './resolution';

// Complexity
export { assessComplexity, identifyEpisodeBoundaries } from './complexity';

// Cliffhangers
export { identifyCliffhangers } from './cliffhangers';

// Canon
export {
  buildHomerInferenceCanon,
  getCanonValue,
  isUserLocked,
  mergeCanon,
  setCanonFact,
  userDecisionsToCanon,
} from './canon';
