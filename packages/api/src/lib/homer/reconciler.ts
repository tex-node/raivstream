/**
 * Homer — Deterministic Reconciler.
 *
 * Merges a ProposedStoryState (AI output) with existing canon and user decisions
 * to produce a canonical HomerStoryState.
 *
 * Invariants:
 *   1. AI interpretation never automatically becomes canon.
 *   2. User decisions always outrank AI proposals.
 *   3. Existing canon entities survive re-interpretation (no duplicate creation).
 *   4. Ambiguous pronoun references are preserved, not silently resolved.
 *   5. All AI-generated values carry provenance=PROPOSED or INFERRED, never EXPLICIT.
 */

import {
  claim,
  extractBeatsFromBlueprint,
  extractThreadsFromText,
  normalizeKey,
  stableId,
} from './extraction';
import {
  assessComplexity,
  identifyEpisodeBoundaries,
} from './complexity';
import { identifyCliffhangers } from './cliffhangers';
import { buildHomerInferenceCanon, mergeCanon, userDecisionsToCanon } from './canon';
import type {
  BeatFunction,
  CharacterRole,
  HomerBeat,
  HomerCanonFact,
  HomerCharacter,
  HomerCliffhanger,
  HomerLocation,
  HomerObject,
  HomerStoryState,
  HomerThread,
  NarrativeImportance,
  ProposedStoryBeat,
  ProposedStoryCharacter,
  ProposedStoryLocation,
  ProposedStoryObject,
  ProposedStoryState,
  ProposedStoryThread,
  StructuralPosition,
  ThreadKind,
} from './types';

// ─── Character reconciliation ─────────────────────────────────────────────────

function reconcileCharacter(
  proposed: ProposedStoryCharacter,
  existing: HomerCharacter[],
): HomerCharacter {
  const key = normalizeKey(proposed.name);

  // Check if a canonical character already matches by name or alias
  const canon = existing.find(
    (c) =>
      normalizeKey(c.name.value) === key ||
      c.aliases.some((a) => normalizeKey(a) === key),
  );

  if (canon) {
    // Merge: preserve canon values, add proposed info only where canon is UNKNOWN
    return {
      ...canon,
      // Only update description if canon has none
      description:
        canon.description.value
          ? canon.description
          : claim(proposed.description, 'PROPOSED', 'AI proposed from story text'),
      // Merge aliases: add proposed aliases that aren't already known
      aliases: [
        ...new Set([
          ...canon.aliases,
          ...proposed.aliases.map((a) => a.toLowerCase()),
        ]),
      ],
      // Merge traits: add new proposed traits
      traits: [
        ...canon.traits,
        ...proposed.traits
          .filter((t) => !canon.traits.some((ct) => ct.value === t))
          .map((t) => claim(t, 'PROPOSED', 'AI proposed trait')),
      ],
    };
  }

  // New character — everything is PROPOSED
  return {
    id: stableId('char', proposed.name),
    name: claim(proposed.name, 'PROPOSED', 'AI extracted from story text'),
    role: claim(proposed.role as CharacterRole, 'PROPOSED', 'AI proposed role'),
    description: claim(proposed.description, 'PROPOSED', 'AI proposed description'),
    relationships: proposed.relationships.map((r) => ({
      targetId: stableId('char', r.targetName),
      label: claim(r.label, 'PROPOSED', 'AI proposed relationship'),
    })),
    traits: proposed.traits.map((t) => claim(t, 'PROPOSED', 'AI proposed trait')),
    narrativeImportance: claim(
      proposed.narrativeImportance as NarrativeImportance,
      'PROPOSED',
      'AI proposed importance',
    ),
    aliases: proposed.aliases.map((a) => a.toLowerCase()),
    userOwned: false,
  };
}

// ─── Location reconciliation ──────────────────────────────────────────────────

function reconcileLocation(
  proposed: ProposedStoryLocation,
  existing: HomerLocation[],
): HomerLocation {
  const key = normalizeKey(proposed.name);

  const canon = existing.find(
    (l) =>
      normalizeKey(l.name.value) === key ||
      l.aliases.some((a) => normalizeKey(a) === key) ||
      // Suffix match: "the observatory" matches "the abandoned observatory"
      normalizeKey(l.name.value).endsWith(key) ||
      key.endsWith(normalizeKey(l.name.value)),
  );

  if (canon) {
    return {
      ...canon,
      description: canon.description.value
        ? canon.description
        : claim(proposed.description, 'PROPOSED', 'AI proposed description'),
      environmentalCharacteristics: canon.environmentalCharacteristics.value.length > 0
        ? canon.environmentalCharacteristics
        : claim(proposed.environmentalCharacteristics, 'PROPOSED', 'AI proposed characteristics'),
    };
  }

  return {
    id: stableId('loc', proposed.name),
    name: claim(proposed.name, 'PROPOSED', 'AI extracted from story text'),
    description: claim(proposed.description, 'PROPOSED', 'AI proposed description'),
    role: claim(proposed.role, 'PROPOSED', 'AI proposed role'),
    environmentalCharacteristics: claim(
      proposed.environmentalCharacteristics,
      'PROPOSED',
      'AI proposed characteristics',
    ),
    aliases: [],
    userOwned: false,
  };
}

// ─── Object reconciliation ────────────────────────────────────────────────────

function reconcileObject(
  proposed: ProposedStoryObject,
  existing: HomerObject[],
): HomerObject {
  const key = normalizeKey(proposed.name);

  // Match: "the old radio" → "radio", "Echo" → "radio" if canon says so
  const canon = existing.find(
    (o) =>
      normalizeKey(o.name.value) === key ||
      key.endsWith(normalizeKey(o.name.value)) ||
      normalizeKey(o.name.value).endsWith(key),
  );

  if (canon) return canon;

  return {
    id: stableId('obj', proposed.name),
    name: claim(proposed.name, 'PROPOSED', 'AI extracted from story text'),
    description: claim(proposed.description, 'PROPOSED', 'AI proposed description'),
    narrativeImportance: claim(
      proposed.narrativeImportance,
      'PROPOSED',
      'AI proposed importance',
    ),
    continuityRequired: claim(proposed.continuityRequired, 'PROPOSED', 'AI proposed'),
  };
}

// ─── Beat reconciliation ──────────────────────────────────────────────────────

function reconcileBeat(
  proposed: ProposedStoryBeat,
  characters: HomerCharacter[],
  locations: HomerLocation[],
): HomerBeat {
  // Resolve character names to IDs
  const charIds = proposed.charactersInvolved
    .map((name) => {
      const charKey = normalizeKey(name);
      return characters.find((c) => normalizeKey(c.name.value) === charKey || c.aliases.includes(charKey))?.id;
    })
    .filter((id): id is string => Boolean(id));

  const locIds = proposed.locationsInvolved
    .map((name) => {
      const locKey = normalizeKey(name);
      return locations.find(
        (l) =>
          normalizeKey(l.name.value) === locKey ||
          locKey.endsWith(normalizeKey(l.name.value)) ||
          normalizeKey(l.name.value).endsWith(locKey),
      )?.id;
    })
    .filter((id): id is string => Boolean(id));

  const total = 8; // structural position estimation basis
  const relPos = total <= 1 ? 0 : (proposed.ordinal - 1) / (total - 1);
  const structPos: StructuralPosition =
    relPos < 0.15 ? 'beginning' :
    relPos < 0.40 ? 'development' :
    relPos < 0.60 ? 'escalation' :
    relPos < 0.75 ? 'climax' :
    relPos < 0.90 ? 'consequence' : 'resolution';

  return {
    id: stableId('beat', `${proposed.ordinal}_${proposed.label}`),
    ordinal: proposed.ordinal,
    label: proposed.label,
    description: claim(proposed.description, 'PROPOSED', 'AI extracted beat'),
    function: claim(proposed.function as BeatFunction, 'PROPOSED', 'AI classified beat function'),
    emotionalDirection: claim(proposed.emotionalDirection, 'PROPOSED', 'AI proposed emotional direction'),
    charactersInvolved: charIds,
    locationsInvolved: locIds,
    objectsInvolved: proposed.objectsInvolved
      .map((name) => stableId('obj', name)),
    structuralPosition: claim(structPos, 'INFERRED', 'proportional position in beat sequence'),
  };
}

// ─── Thread reconciliation ────────────────────────────────────────────────────

function reconcileThread(
  proposed: ProposedStoryThread,
  existing: HomerThread[],
  beats: HomerBeat[],
): HomerThread {
  const key = normalizeKey(proposed.description.slice(0, 40));

  const canon = existing.find((t) => normalizeKey(t.description.value.slice(0, 40)) === key);
  if (canon) return { ...canon, status: proposed.status };

  return {
    id: stableId('thread', key),
    description: claim(proposed.description, 'PROPOSED', 'AI extracted thread'),
    kind: proposed.kind as ThreadKind,
    openedAtBeatId: beats[Math.floor(beats.length / 3)]?.id,
    status: proposed.status,
  };
}

// ─── Main reconciler ──────────────────────────────────────────────────────────

export interface ReconcileInput {
  proposed: ProposedStoryState;
  existingState: HomerStoryState | null;
  existingCanon: HomerCanonFact[];
  userDecisions: Array<{ label: string; value: unknown }>;
  storyText: string;
  audienceMode: 'GENERAL' | 'KIDS';
}

export function reconcile(input: ReconcileInput): HomerStoryState {
  const { proposed, existingState, existingCanon, userDecisions, storyText, audienceMode } = input;

  // User decisions are always highest priority
  const userCanon = userDecisionsToCanon(userDecisions);
  let canon = mergeCanon(existingCanon, userCanon);

  // Existing entities from prior interpretation
  const existingChars = existingState?.entities.characters ?? [];
  const existingLocs = existingState?.entities.locations ?? [];
  const existingObjs = existingState?.entities.objects ?? [];

  // Reconcile entities — existing canon survives, AI proposals fill gaps
  const characters = proposed.characters.length > 0
    ? proposed.characters.map((c) => reconcileCharacter(c, existingChars))
    : existingChars;

  const locations = proposed.locations.length > 0
    ? proposed.locations.map((l) => reconcileLocation(l, existingLocs))
    : existingLocs;

  const objects = proposed.objects.length > 0
    ? proposed.objects.map((o) => reconcileObject(o, existingObjs))
    : existingObjs;

  // Deduplicate: if a new entity was actually an existing one (different name surface), keep existing id
  const deduplicatedChars = deduplicateById(characters, existingChars);
  const deduplicatedLocs = deduplicateById(locations, existingLocs);
  const deduplicatedObjs = deduplicateById(objects, existingObjs);

  // Beats — always from proposed (represents current interpretation)
  const beats: HomerBeat[] = proposed.beats.length > 0
    ? proposed.beats.map((b) => reconcileBeat(b, deduplicatedChars, deduplicatedLocs))
    : (existingState?.beats ?? []);

  // Threads — merge with existing open threads
  const existingThreads = existingState?.threads ?? [];
  const threads: HomerThread[] = [
    ...existingThreads.filter((t) => t.status !== 'resolved'),
    ...proposed.threads
      .filter((pt) => !existingThreads.some((et) => normalizeKey(et.description.value.slice(0, 40)) === normalizeKey(pt.description.slice(0, 40))))
      .map((pt) => reconcileThread(pt, existingThreads, beats)),
  ];

  // Structural arc
  const arc = buildArc(beats);

  // Relationships from proposed
  const relationships = proposed.characters.flatMap((pc) =>
    pc.relationships.map((r) => ({
      fromId: stableId('char', pc.name),
      toId: stableId('char', r.targetName),
      kind: 'character-character' as const,
      label: claim(r.label, 'PROPOSED', 'AI proposed relationship'),
    })),
  );

  // Complexity
  const complexity = assessComplexity(storyText, deduplicatedChars, deduplicatedLocs, beats, threads);

  // Episode boundaries
  const episodeBoundaries = identifyEpisodeBoundaries(beats, threads, complexity.seriesCandidate);

  // Cliffhangers
  const cliffhangers = identifyCliffhangers(beats, threads, storyText);

  // Homer inference canon — low precedence, doesn't override user decisions
  const inferenceFacts = buildHomerInferenceCanon([
    { label: 'genre', value: proposed.genre },
    { label: 'tone', value: proposed.tone },
    { label: 'themes', value: proposed.themes },
    { label: 'interpretationConfidence', value: proposed.interpretationConfidence },
    { label: 'temporalComplexity', value: proposed.worldState.temporalComplexity },
    { label: 'complexity', value: complexity.level },
    { label: 'seriesCandidate', value: complexity.seriesCandidate },
  ]);
  canon = mergeCanon(canon, inferenceFacts);

  const state: HomerStoryState = {
    version: 'homer_v1',
    interpretedAt: new Date().toISOString(),
    storyText,
    premise: claim(
      proposed.premise || (existingState?.premise.value ?? storyText.slice(0, 160)),
      proposed.premise ? 'PROPOSED' : 'INFERRED',
      'from AI interpretation',
    ),
    genre: claim(proposed.genre, 'PROPOSED', 'AI proposed genre'),
    tone: claim(proposed.tone, 'PROPOSED', 'AI proposed tone'),
    themes: claim(proposed.themes, 'PROPOSED', 'AI proposed themes'),
    emotionalDirection: claim(proposed.emotionalDirection, 'PROPOSED', 'AI proposed arc'),
    audienceMode,
    entities: {
      characters: deduplicatedChars,
      locations: deduplicatedLocs,
      objects: deduplicatedObjs,
    },
    relationships,
    beats,
    structuralArc: claim(arc, 'INFERRED', 'proportional beat placement'),
    threads,
    canon,
    complexity,
    episodeBoundaries,
    cliffhangers,
  };

  return state;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deduplicateById<T extends { id: string }>(
  proposed: T[],
  existing: T[],
): T[] {
  const existingIds = new Set(existing.map((e) => e.id));
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of proposed) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }

  // Add back any existing items whose IDs don't appear in the proposed list
  for (const item of existing) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}

function buildArc(beats: HomerBeat[]) {
  const arc: Record<string, string[]> = {
    beginning: [],
    development: [],
    escalation: [],
    climax: [],
    consequence: [],
    resolution: [],
  };
  for (const beat of beats) {
    arc[beat.structuralPosition.value]?.push(beat.id);
  }
  return arc as {
    beginning: string[];
    development: string[];
    escalation: string[];
    climax: string[];
    consequence: string[];
    resolution: string[];
  };
}
