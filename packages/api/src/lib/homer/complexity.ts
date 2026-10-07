/**
 * Homer — Story complexity scoring and series candidacy assessment.
 *
 * Pure functions — no AI, no DB.
 *
 * Score: 0–100
 *   0–35:  SIMPLE
 *   36–65: MODERATE
 *   66+:   COMPLEX
 */

import type {
  HomerBeat,
  HomerCharacter,
  HomerComplexityAssessment,
  HomerEpisodeBoundary,
  HomerLocation,
  HomerThread,
  StoryComplexity,
} from './types';

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface ScoringFactors {
  characterCount: number;
  locationCount: number;
  beatCount: number;
  threadCount: number;
  storyLength: number;
  relationshipCount: number;
  hasFlashback: boolean;
  hasNonLinear: boolean;
}

function scoreCharacters(count: number): number {
  if (count <= 2) return 5;
  if (count <= 4) return 12;
  if (count <= 6) return 20;
  return 28;
}

function scoreLocations(count: number): number {
  if (count <= 1) return 3;
  if (count <= 3) return 8;
  if (count <= 5) return 14;
  return 18;
}

function scoreBeats(count: number): number {
  if (count <= 3) return 5;
  if (count <= 5) return 10;
  if (count <= 7) return 15;
  return 20;
}

function scoreThreads(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 5;
  if (count <= 4) return 10;
  return 15;
}

function scoreLength(chars: number): number {
  if (chars < 300) return 0;
  if (chars < 600) return 3;
  if (chars < 1000) return 7;
  return 10;
}

function scoreTemporalComplexity(hasFlashback: boolean, hasNonLinear: boolean): number {
  if (hasFlashback) return 10;
  if (hasNonLinear) return 6;
  return 0;
}

function detectTemporalComplexity(storyText: string): { hasFlashback: boolean; hasNonLinear: boolean } {
  const lower = storyText.toLowerCase();
  const hasFlashback = /\b(flashback|remembered|recalled|in the past|years earlier|long ago|once upon)\b/.test(lower);
  const hasNonLinear = /\b(meanwhile|at the same time|simultaneously|earlier|later that day|the next morning|hours before)\b/.test(lower);
  return { hasFlashback, hasNonLinear };
}

function computeRelationshipComplexity(characters: HomerCharacter[]): number {
  let total = 0;
  for (const char of characters) {
    total += char.relationships.length;
  }
  return total;
}

function narrativeLengthLabel(chars: number): 'short' | 'medium' | 'long' {
  if (chars < 400) return 'short';
  if (chars < 900) return 'medium';
  return 'long';
}

function complexityLevel(score: number): StoryComplexity {
  if (score <= 35) return 'SIMPLE';
  if (score <= 65) return 'MODERATE';
  return 'COMPLEX';
}

export function assessComplexity(
  storyText: string,
  characters: HomerCharacter[],
  locations: HomerLocation[],
  beats: HomerBeat[],
  threads: HomerThread[],
): HomerComplexityAssessment {
  const { hasFlashback, hasNonLinear } = detectTemporalComplexity(storyText);
  const relationshipComplexity = computeRelationshipComplexity(characters);

  const raw: ScoringFactors = {
    characterCount: characters.length,
    locationCount: locations.length,
    beatCount: beats.length,
    threadCount: threads.length,
    storyLength: storyText.length,
    relationshipCount: relationshipComplexity,
    hasFlashback,
    hasNonLinear,
  };

  const score = Math.min(
    100,
    scoreCharacters(raw.characterCount) +
      scoreLocations(raw.locationCount) +
      scoreBeats(raw.beatCount) +
      scoreThreads(raw.threadCount) +
      scoreLength(raw.storyLength) +
      scoreTemporalComplexity(hasFlashback, hasNonLinear),
  );

  const level = complexityLevel(score);
  const { seriesCandidate, seriesCandidateReason } = detectSeriesCandidacy(level, raw, threads, storyText);

  const temporalComplexity = hasFlashback ? 'flashback' : hasNonLinear ? 'non-linear' : 'linear';

  return {
    score,
    level,
    factors: {
      characterCount: raw.characterCount,
      locationCount: raw.locationCount,
      beatCount: raw.beatCount,
      threadCount: raw.threadCount,
      temporalComplexity,
      relationshipComplexity,
      narrativeLength: narrativeLengthLabel(raw.storyLength),
    },
    seriesCandidate,
    seriesCandidateReason,
  };
}

// ─── Series candidacy ─────────────────────────────────────────────────────────

function detectSeriesCandidacy(
  level: StoryComplexity,
  factors: ScoringFactors,
  threads: HomerThread[],
  storyText: string,
): { seriesCandidate: boolean; seriesCandidateReason?: string } {
  // Strong signal: explicit open threads
  const openThreads = threads.filter((t) => t.status === 'open');
  if (openThreads.length >= 2) {
    return {
      seriesCandidate: true,
      seriesCandidateReason: `${openThreads.length} unresolved narrative threads could sustain multiple episodes`,
    };
  }

  // Strong signal: many characters with complex relationships
  if (factors.characterCount >= 4 && factors.relationshipCount >= 3) {
    return {
      seriesCandidate: true,
      seriesCandidateReason: `${factors.characterCount} characters with ${factors.relationshipCount} established relationships support a recurring cast`,
    };
  }

  // Signal: long story with multiple locations
  if (factors.storyLength >= 800 && factors.locationCount >= 3) {
    return {
      seriesCandidate: true,
      seriesCandidateReason: `Rich world with ${factors.locationCount} locations and extended narrative depth`,
    };
  }

  // Signal: explicit series/sequel language in text
  const lower = storyText.toLowerCase();
  if (/\b(next time|to be continued|in the next|will return|journey continues|another day|not over)\b/.test(lower)) {
    return {
      seriesCandidate: true,
      seriesCandidateReason: 'Story text explicitly signals continuation',
    };
  }

  // Moderate complexity without strong thread count — borderline
  if (level === 'COMPLEX' || (level === 'MODERATE' && openThreads.length >= 1)) {
    return {
      seriesCandidate: true,
      seriesCandidateReason: `${level} story complexity with open narrative threads`,
    };
  }

  return { seriesCandidate: false };
}

// ─── Episode boundary detection ───────────────────────────────────────────────

type EpisodeFunction = 'setup' | 'escalation' | 'revelation' | 'climax';

const EPISODE_FUNCTION_MAP: Array<[EpisodeFunction, RegExp]> = [
  ['revelation', /\b(reveal|secret|truth|discovers?|realizes?|suddenly knows)\b/i],
  ['climax', /\b(climax|peak|final|confronts?|defeating|crisis)\b/i],
  ['escalation', /\b(escalat|intensif|worsens?|danger|threat|crisis)\b/i],
  ['setup', /\b(begin|start|introduce|establish|open)\b/i],
];

export function identifyEpisodeBoundaries(
  beats: HomerBeat[],
  threads: HomerThread[],
  seriesCandidate: boolean,
): HomerEpisodeBoundary[] {
  if (!seriesCandidate || beats.length < 3) return [];

  const boundaries: HomerEpisodeBoundary[] = [];
  const total = beats.length;

  // Natural break points: after ~1/3 and ~2/3 of beats
  const candidateIndices = new Set<number>();
  candidateIndices.add(Math.floor(total * 0.33) - 1);
  candidateIndices.add(Math.floor(total * 0.66) - 1);

  // Also check for beats with escalation/revelation function as natural breaks
  beats.forEach((beat, i) => {
    const fn = beat.function.value;
    if (fn === 'escalation' || fn === 'reveal' || fn === 'cliffhanger') {
      candidateIndices.add(i);
    }
  });

  for (const idx of [...candidateIndices].filter((i) => i >= 0 && i < total - 1).sort((a, b) => a - b)) {
    const beat = beats[idx];
    if (!beat) continue;

    const desc = beat.description.value ?? '';
    const episodeFunction = detectEpisodeFunction(desc, beat.function.value);
    const openThreadsAfter = threads
      .filter((t) => t.status === 'open' && t.openedAtBeatId !== undefined)
      .map((t) => t.id);

    boundaries.push({
      afterBeatId: beat.id,
      afterBeatLabel: beat.label,
      episodeFunction,
      narrativePurpose: `Natural story break after "${beat.label}" — carries ${openThreadsAfter.length} unresolved thread(s)`,
      cliffhangerOpportunity: episodeFunction === 'escalation' || episodeFunction === 'revelation' || beat.function.value === 'cliffhanger',
      unresolvedThreadsCarried: openThreadsAfter,
    });
  }

  return boundaries;
}

function detectEpisodeFunction(desc: string, beatFn: string): EpisodeFunction {
  for (const [fn, re] of EPISODE_FUNCTION_MAP) {
    if (re.test(desc)) return fn;
  }
  // Map beat function to episode function
  const beatToEpisode: Record<string, EpisodeFunction> = {
    setup: 'setup',
    introduction: 'setup',
    discovery: 'revelation',
    reveal: 'revelation',
    escalation: 'escalation',
    confrontation: 'climax',
    cliffhanger: 'escalation',
  };
  return beatToEpisode[beatFn] ?? 'setup';
}
