/**
 * Homer — Story Intelligence Foundation types.
 *
 * These types define the structured contract Homer produces from a creator's
 * story. Three invariants never break:
 *   1. Provenance is always explicit — EXPLICIT | INFERRED | PROPOSED | UNKNOWN.
 *   2. User decisions always outrank Homer inferences (DECISION_PRECEDENCE).
 *   3. Homer never generates MovieDirector CUT lists — it produces story intent.
 */

// ─── Decision Provenance ──────────────────────────────────────────────────────

/** Where a piece of information came from. */
export type DecisionProvenance =
  | 'EXPLICIT'   // user directly stated it
  | 'INFERRED'   // Homer reasonably inferred from the story
  | 'PROPOSED'   // Homer suggests as creative treatment
  | 'UNKNOWN';   // information is not known

/**
 * Priority order — lower number wins.
 * A higher-priority source must never be silently overwritten by a lower one.
 */
export const DECISION_PRECEDENCE = {
  USER_EXPLICIT: 0,
  USER_APPROVED: 1,
  EXISTING_CANON: 2,
  HOMER_INFERENCE: 3,
  HOMER_PROPOSAL: 4,
  SYSTEM_DEFAULT: 5,
} as const;
export type DecisionOwner = keyof typeof DECISION_PRECEDENCE;

/** A value with its provenance and optional textual source justification. */
export interface HomerClaim<T> {
  value: T;
  provenance: DecisionProvenance;
  /** Brief explanation of why Homer believes this (for INFERRED/PROPOSED). */
  basis?: string;
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting' | 'minor' | 'unknown';
export type NarrativeImportance = 'primary' | 'supporting' | 'minor';

export interface HomerCharacter {
  id: string;
  name: HomerClaim<string>;
  role: HomerClaim<CharacterRole>;
  description: HomerClaim<string>;
  /** Known relationships to other entity ids. */
  relationships: Array<{ targetId: string; label: HomerClaim<string> }>;
  traits: Array<HomerClaim<string>>;
  narrativeImportance: HomerClaim<NarrativeImportance>;
  /** Alternative names/references that resolve to this character. */
  aliases: string[];
  /** True when the entity was supplied by the user (source-ownership guard). */
  userOwned: boolean;
}

export interface HomerLocation {
  id: string;
  name: HomerClaim<string>;
  description: HomerClaim<string>;
  role: HomerClaim<string>;
  environmentalCharacteristics: HomerClaim<string[]>;
  aliases: string[];
  userOwned: boolean;
}

export interface HomerObject {
  id: string;
  name: HomerClaim<string>;
  description: HomerClaim<string>;
  narrativeImportance: HomerClaim<'critical' | 'notable' | 'minor'>;
  continuityRequired: HomerClaim<boolean>;
}

// ─── Story Beats ──────────────────────────────────────────────────────────────

/**
 * Narrative beat functions — semantic, not mere keywords.
 * A "discovery" is an event that changes what a character knows.
 * A "consequence" follows directly from a prior action.
 */
export type BeatFunction =
  | 'setup'
  | 'introduction'
  | 'discovery'
  | 'decision'
  | 'confrontation'
  | 'escalation'
  | 'reveal'
  | 'consequence'
  | 'resolution'
  | 'cliffhanger';

export type StructuralPosition =
  | 'beginning'
  | 'development'
  | 'escalation'
  | 'climax'
  | 'consequence'
  | 'resolution';

export interface HomerBeat {
  id: string;
  ordinal: number;
  label: string;
  description: HomerClaim<string>;
  function: HomerClaim<BeatFunction>;
  emotionalDirection: HomerClaim<string>;
  charactersInvolved: string[];
  locationsInvolved: string[];
  objectsInvolved: string[];
  structuralPosition: HomerClaim<StructuralPosition>;
}

// ─── Unresolved Threads ───────────────────────────────────────────────────────

export type ThreadKind =
  | 'mystery'
  | 'conflict'
  | 'promise'
  | 'question'
  | 'unresolved_consequence';

export interface HomerThread {
  id: string;
  description: HomerClaim<string>;
  kind: ThreadKind;
  openedAtBeatId?: string;
  status: 'open' | 'resolved' | 'deferred';
}

// ─── Canon ────────────────────────────────────────────────────────────────────

export interface HomerCanonFact {
  id: string;
  label: string;
  value: unknown;
  owner: DecisionOwner;
  establishedAt: string;
}

// ─── Complexity & Series ──────────────────────────────────────────────────────

export type StoryComplexity = 'SIMPLE' | 'MODERATE' | 'COMPLEX';

export interface HomerComplexityAssessment {
  score: number;
  level: StoryComplexity;
  factors: {
    characterCount: number;
    locationCount: number;
    beatCount: number;
    threadCount: number;
    temporalComplexity: 'linear' | 'non-linear' | 'flashback';
    relationshipComplexity: number;
    narrativeLength: 'short' | 'medium' | 'long';
  };
  seriesCandidate: boolean;
  seriesCandidateReason?: string;
}

export interface HomerEpisodeBoundary {
  afterBeatId: string;
  afterBeatLabel: string;
  episodeFunction: 'setup' | 'escalation' | 'revelation' | 'climax';
  narrativePurpose: string;
  cliffhangerOpportunity: boolean;
  unresolvedThreadsCarried: string[];
}

// ─── Cliffhangers ─────────────────────────────────────────────────────────────

export type CliffhangerType =
  | 'unanswered_revelation'
  | 'imminent_danger'
  | 'discovery'
  | 'decision'
  | 'unexpected_arrival'
  | 'unresolved_consequence'
  | 'new_mystery'
  | 'reversal';

export interface HomerCliffhanger {
  beatId: string;
  type: CliffhangerType;
  description: string;
  semanticJustification: string;
  relatedThreadIds: string[];
}

// ─── Full Homer Story State ───────────────────────────────────────────────────

export interface HomerStoryState {
  version: 'homer_v1';
  interpretedAt: string;
  storyText: string;
  premise: HomerClaim<string>;
  genre: HomerClaim<string | undefined>;
  tone: HomerClaim<string | undefined>;
  themes: HomerClaim<string[]>;
  emotionalDirection: HomerClaim<string>;
  audienceMode: 'GENERAL' | 'KIDS';
  entities: {
    characters: HomerCharacter[];
    locations: HomerLocation[];
    objects: HomerObject[];
  };
  relationships: Array<{
    fromId: string;
    toId: string;
    kind: 'character-character' | 'character-location' | 'character-object';
    label: HomerClaim<string>;
  }>;
  beats: HomerBeat[];
  structuralArc: HomerClaim<{
    beginning: string[];
    development: string[];
    escalation: string[];
    climax: string[];
    consequence: string[];
    resolution: string[];
  }>;
  threads: HomerThread[];
  canon: HomerCanonFact[];
  complexity: HomerComplexityAssessment;
  episodeBoundaries: HomerEpisodeBoundary[];
  cliffhangers: HomerCliffhanger[];
}

// ─── Homer → Director contract ────────────────────────────────────────────────

/**
 * The structured state Homer hands downstream to Director.
 * Director uses this to determine visual treatment, camera language, and CUT
 * structure. Homer never constructs MovieDirector CUT lists directly.
 */
export interface HomerDirectorInput {
  projectId: string;
  storyIntent: {
    premise: string;
    genre?: string;
    tone?: string;
    themes: string[];
    emotionalDirection: string;
    audienceMode: 'GENERAL' | 'KIDS';
  };
  characters: Array<{
    id: string;
    name: string;
    role: string;
    description: string;
    narrativeImportance: string;
    relationships: Array<{ targetName: string; label: string }>;
  }>;
  locations: Array<{
    id: string;
    name: string;
    description: string;
    role: string;
  }>;
  beats: Array<{
    id: string;
    ordinal: number;
    label: string;
    description: string;
    function: string;
    emotionalDirection: string;
    charactersInvolved: string[];
    locationsInvolved: string[];
  }>;
  continuityRequirements: string[];
  visualOpportunities: string[];
}

// ─── Service input types ──────────────────────────────────────────────────────

export interface InterpretStoryInput {
  storyText: string;
  audienceMode: 'GENERAL' | 'KIDS';
  existingCanon?: HomerCanonFact[];
  userDecisions?: Array<{ label: string; value: unknown }>;
  projectType?: 'STORY' | 'EDUCATION' | 'COMMERCIAL' | 'UNKNOWN';
}

// ─── Proposed Story State (AI interpreter output) ─────────────────────────────
//
// Everything here carries provenance=PROPOSED (or EXPLICIT where the user
// directly provided it). The deterministic reconciler decides what becomes canon.

export interface ProposedStoryCharacter {
  name: string;
  role: CharacterRole;
  description: string;
  /** Contextual references the AI is CONFIDENT about (e.g. "the old traveler" → John). NOT he/she/they. */
  aliases: string[];
  narrativeImportance: NarrativeImportance;
  relationships: Array<{ targetName: string; label: string }>;
  traits: string[];
}

export interface ProposedStoryLocation {
  name: string;
  description: string;
  role: string;
  environmentalCharacteristics: string[];
}

export interface ProposedStoryObject {
  name: string;
  description: string;
  narrativeImportance: 'critical' | 'notable' | 'minor';
  continuityRequired: boolean;
}

export interface ProposedStoryBeat {
  ordinal: number;
  label: string;
  description: string;
  function: BeatFunction;
  emotionalDirection: string;
  /** Character names from this beat — resolved by name, not by pronoun. */
  charactersInvolved: string[];
  locationsInvolved: string[];
  objectsInvolved: string[];
}

export interface ProposedStoryThread {
  description: string;
  kind: ThreadKind;
  status: 'open' | 'resolved' | 'deferred';
}

export interface ProposedWorldState {
  temporalComplexity: 'linear' | 'non-linear' | 'flashback';
  atmosphericDetails: string[];
  environmentalFacts: string[];
}

export interface ProposedStoryState {
  version: 'proposed_v1';
  interpretedFrom: string;
  premise: string;
  genre?: string;
  tone?: string;
  themes: string[];
  emotionalDirection: string;
  characters: ProposedStoryCharacter[];
  locations: ProposedStoryLocation[];
  objects: ProposedStoryObject[];
  beats: ProposedStoryBeat[];
  threads: ProposedStoryThread[];
  worldState: ProposedWorldState;
  /** How confident the AI is in this interpretation. */
  interpretationConfidence: 'high' | 'medium' | 'low';
  /** Potential unresolved ambiguities the AI flagged but did not resolve. */
  ambiguities: string[];
}

export interface HomerInterpretationRequest {
  storyText: string;
  audienceMode: 'GENERAL' | 'KIDS';
  /** If provided, the interpreter uses existing entity names to avoid re-invention. */
  existingState?: HomerStoryState | null;
  existingCanon?: HomerCanonFact[];
  userDecisions?: Array<{ label: string; value: unknown }>;
}
