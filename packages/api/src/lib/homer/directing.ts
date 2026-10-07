/**
 * Homer Directing — Question Engine.
 *
 * Deterministic creative question selection: inspects HomerStoryState,
 * infers what Homer can safely determine, and returns the single most
 * consequential remaining question. No AI calls; AI-powered proposals
 * are handled in the router layer.
 *
 * Invariants:
 *  1. Homer never asks about categories it can strongly infer.
 *  2. Inferred decisions carry provenance=HOMER_INFERENCE, not HOMER_PROPOSAL.
 *  3. Existing decisions (any provenance) are never overridden.
 *  4. CATEGORY_ORDER defines consequence rank — VISUAL_TREATMENT first.
 */

import type { HomerStoryState } from './types';
import type {
  CreativeDecisionCategory,
  DirectingChoice,
  HomerCreativeDecision,
  HomerDirectingNextResult,
  HomerDirectingQuestion,
} from './directingTypes';

// ─── Category definitions ──────────────────────────────────────────────────────

const CATEGORY_DEFS: Record<
  CreativeDecisionCategory,
  { label: string; question: string; explanation?: string; choices: DirectingChoice[] }
> = {
  VISUAL_TREATMENT: {
    label: 'Visual treatment',
    question: 'How should your story look?',
    explanation: 'This shapes the visual language everything else builds on.',
    choices: [
      { value: 'dreamlike_realism', label: 'Dreamlike realism' },
      { value: 'heightened_contrast', label: 'Heightened contrast' },
      { value: 'naturalistic', label: 'Naturalistic' },
      { value: 'surreal', label: 'Surreal / painterly' },
    ],
  },
  MOOD: {
    label: 'Mood',
    question: 'What should the audience feel watching this?',
    choices: [
      { value: 'quietly_unsettling', label: 'Quietly unsettling' },
      { value: 'warm_intimate', label: 'Warm and intimate' },
      { value: 'tense_kinetic', label: 'Tense and kinetic' },
      { value: 'melancholic', label: 'Melancholic and reflective' },
    ],
  },
  WORLD_TREATMENT: {
    label: 'World',
    question: 'What kind of world does your story live in?',
    choices: [
      { value: 'grounded', label: 'Grounded reality' },
      { value: 'heightened', label: 'Heightened reality' },
      { value: 'surreal', label: 'Surreal / dream logic' },
      { value: 'fantastical', label: 'Fantastical' },
    ],
  },
  CAMERA_PERSPECTIVE: {
    label: 'Camera',
    question: 'How close should we be to the story?',
    explanation: 'This determines how intimate or observational your film feels.',
    choices: [
      { value: 'close_intimate', label: 'Close and intimate' },
      { value: 'observational', label: 'Observational' },
      { value: 'character_subjective', label: "From the character's view" },
      { value: 'fluid', label: 'Fluid — follows the scene' },
    ],
  },
  CHARACTER_PRESENTATION: {
    label: 'Characters',
    question: 'How are your characters revealed?',
    choices: [
      { value: 'revealed_slowly', label: 'Revealed slowly' },
      { value: 'immediately_present', label: 'Immediately present' },
      { value: 'enigmatic', label: 'Enigmatic — we figure them out' },
      { value: 'grounded', label: 'Grounded and real' },
    ],
  },
  TIME_OF_DAY: {
    label: 'Time',
    question: 'When does this story take place?',
    choices: [
      { value: 'night_dusk', label: 'Night or dusk' },
      { value: 'day_morning', label: 'Day or morning light' },
      { value: 'mixed', label: 'Mixed — shifts with the story' },
      { value: 'timeless', label: 'Timeless — ambiguous' },
    ],
  },
  PACING: {
    label: 'Pacing',
    question: 'How should the story move?',
    choices: [
      { value: 'slow_deliberate', label: 'Slow and deliberate' },
      { value: 'measured', label: 'Measured — story-led' },
      { value: 'urgent', label: 'Urgent and propulsive' },
      { value: 'varied', label: 'Varied — quiet then explosive' },
    ],
  },
};

// Most consequential first
const CATEGORY_ORDER: CreativeDecisionCategory[] = [
  'VISUAL_TREATMENT',
  'MOOD',
  'WORLD_TREATMENT',
  'CAMERA_PERSPECTIVE',
  'CHARACTER_PRESENTATION',
  'TIME_OF_DAY',
  'PACING',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function genreOf(state: HomerStoryState): string {
  return (state.genre?.value ?? '').toLowerCase();
}

function toneOf(state: HomerStoryState): string {
  return (state.tone?.value ?? '').toLowerCase();
}

function premiseOf(state: HomerStoryState): string {
  return (state.premise?.value ?? '').toLowerCase();
}

function makeDid(
  category: CreativeDecisionCategory,
  value: string,
  rationale: string,
  provenance: 'HOMER_INFERENCE' | 'HOMER_PROPOSAL',
): HomerCreativeDecision {
  return {
    id: `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    category,
    label: CATEGORY_DEFS[category].label,
    value,
    rationale,
    provenance,
    createdAt: new Date().toISOString(),
  };
}

// ─── Inference ─────────────────────────────────────────────────────────────────

function tryInfer(
  category: CreativeDecisionCategory,
  state: HomerStoryState,
  audienceMode: 'GENERAL' | 'KIDS',
): HomerCreativeDecision | null {
  const genre = genreOf(state);
  const tone = toneOf(state);

  switch (category) {
    case 'MOOD': {
      if (/horror|terror/.test(genre) || /horror|dread/.test(tone))
        return makeDid(category, 'quietly_unsettling', 'Horror genre implies an unsettling mood.', 'HOMER_INFERENCE');
      if (/romance|love/.test(genre) || /romantic|tender/.test(tone))
        return makeDid(category, 'warm_intimate', 'Romance genre implies a warm, intimate mood.', 'HOMER_INFERENCE');
      if (/action|thriller|war/.test(genre) || /tense|urgent/.test(tone))
        return makeDid(category, 'tense_kinetic', 'Action/thriller genre implies a kinetic mood.', 'HOMER_INFERENCE');
      if (/elegy|tragedy|grief/.test(genre) || /melanchol|sad|grief/.test(tone))
        return makeDid(category, 'melancholic', 'Tone implies a melancholic, reflective mood.', 'HOMER_INFERENCE');
      return null;
    }
    case 'WORLD_TREATMENT': {
      if (/fantasy|fairy|myth|supernatural/.test(genre))
        return makeDid(category, 'fantastical', 'Fantasy genre implies a fantastical world.', 'HOMER_INFERENCE');
      if (/sci.?fi|space|cyberpunk|dystopia/.test(genre))
        return makeDid(category, 'heightened', 'Sci-fi implies a heightened reality.', 'HOMER_INFERENCE');
      if (/surreal|absurd|kafkaesque/.test(genre))
        return makeDid(category, 'surreal', 'Surreal genre implies dream logic.', 'HOMER_INFERENCE');
      if (/slice.of.life|biography|docudrama/.test(genre))
        return makeDid(category, 'grounded', 'Documentary/realism implies a grounded world.', 'HOMER_INFERENCE');
      return null;
    }
    case 'CHARACTER_PRESENTATION': {
      const charCount = (state.entities?.characters ?? []).length;
      if (charCount === 0)
        return makeDid(category, 'not_applicable', 'No characters identified in this story.', 'HOMER_INFERENCE');
      if (audienceMode === 'KIDS')
        return makeDid(category, 'immediately_present', 'Audience mode is KIDS — clear, immediate characters.', 'HOMER_INFERENCE');
      return null;
    }
    case 'PACING': {
      const level = state.complexity?.level ?? 'SIMPLE';
      if (level === 'SIMPLE')
        return makeDid(category, 'measured', 'Simple story structure suits a measured pace.', 'HOMER_INFERENCE');
      if (/action|thriller|chase/.test(genre))
        return makeDid(category, 'urgent', `${genre} genre implies urgent pacing.`, 'HOMER_INFERENCE');
      return null;
    }
    case 'TIME_OF_DAY': {
      const premise = premiseOf(state);
      if (/\b(night|midnight|nocturnal|dusk|darkness)\b/.test(premise) || /horror|mystery/.test(genre))
        return makeDid(category, 'night_dusk', 'Story imagery and genre suggest night.', 'HOMER_INFERENCE');
      if (/\b(morning|dawn|sunrise|daylight|afternoon)\b/.test(premise))
        return makeDid(category, 'day_morning', 'Story imagery suggests daytime.', 'HOMER_INFERENCE');
      return null;
    }
    default:
      return null;
  }
}

// ─── Proposal ──────────────────────────────────────────────────────────────────

function pickProposal(
  category: CreativeDecisionCategory,
  state: HomerStoryState,
  existingDecisions: HomerCreativeDecision[],
  audienceMode: 'GENERAL' | 'KIDS',
): { value: string; rationale: string } {
  const genre = genreOf(state);
  const tone = toneOf(state);
  const premise = premiseOf(state);
  const get = (cat: CreativeDecisionCategory) => existingDecisions.find((d) => d.category === cat)?.value;

  switch (category) {
    case 'VISUAL_TREATMENT': {
      if (audienceMode === 'KIDS') return { value: 'naturalistic', rationale: 'Naturalistic look works best for younger audiences.' };
      if (/horror|dark|gothic/.test(genre)) return { value: 'heightened_contrast', rationale: 'High contrast suits the dark genre.' };
      if (/fantasy|magic/.test(genre)) return { value: 'surreal', rationale: 'Surreal, painterly treatment fits this fantastical story.' };
      if (/documentary|realist|slice/.test(genre)) return { value: 'naturalistic', rationale: 'Naturalistic treatment suits this story.' };
      return { value: 'dreamlike_realism', rationale: 'Dreamlike realism is the most versatile choice for this story.' };
    }
    case 'MOOD': {
      if (/horror|terror/.test(genre)) return { value: 'quietly_unsettling', rationale: 'Horror genre calls for an unsettling mood.' };
      if (/romance/.test(genre)) return { value: 'warm_intimate', rationale: 'Romance calls for warmth and intimacy.' };
      if (/action|thriller/.test(genre)) return { value: 'tense_kinetic', rationale: 'Action/thriller calls for kinetic tension.' };
      if (/melanchol|grief/.test(tone)) return { value: 'melancholic', rationale: 'The tone suggests a melancholic mood.' };
      return { value: 'warm_intimate', rationale: 'A warm, intimate mood keeps the audience close to your story.' };
    }
    case 'WORLD_TREATMENT': {
      if (/fantasy|magic/.test(genre)) return { value: 'fantastical', rationale: 'Fantasy genre lives in a fantastical world.' };
      if (/sci.?fi|space/.test(genre)) return { value: 'heightened', rationale: 'Sci-fi implies a heightened reality.' };
      const mood = get('MOOD');
      if (mood === 'quietly_unsettling') return { value: 'heightened', rationale: 'Slight heightening intensifies the unsettling atmosphere.' };
      return { value: 'grounded', rationale: 'A grounded world anchors the emotional truth of your story.' };
    }
    case 'CAMERA_PERSPECTIVE': {
      if (/horror|thriller/.test(genre)) return { value: 'character_subjective', rationale: 'Subjective camera maximizes dread in this genre.' };
      const visual = get('VISUAL_TREATMENT');
      if (visual === 'naturalistic') return { value: 'observational', rationale: 'Observational camera suits naturalistic filmmaking.' };
      return { value: 'close_intimate', rationale: 'Close, intimate camera keeps the audience connected to your story.' };
    }
    case 'TIME_OF_DAY': {
      if (/horror|mystery/.test(genre) || /\b(night|dark|midnight)\b/.test(premise))
        return { value: 'night_dusk', rationale: 'The story calls for darkness and shadow.' };
      if (/\b(morning|dawn|sunrise)\b/.test(premise))
        return { value: 'day_morning', rationale: 'Story imagery suggests morning light.' };
      return { value: 'mixed', rationale: 'Letting time shift with the story gives Homer the most flexibility.' };
    }
    case 'PACING': {
      if (/action|thriller|chase/.test(genre)) return { value: 'urgent', rationale: 'The genre calls for urgency.' };
      const level = state.complexity?.level ?? 'SIMPLE';
      if (level === 'COMPLEX') return { value: 'varied', rationale: 'A complex story needs varied pacing to breathe.' };
      return { value: 'measured', rationale: 'A measured, story-led pace serves this story well.' };
    }
    case 'CHARACTER_PRESENTATION': {
      if (/mystery|thriller/.test(genre)) return { value: 'enigmatic', rationale: 'Mystery works best with elusive characters.' };
      if (audienceMode === 'KIDS') return { value: 'immediately_present', rationale: 'Younger audiences connect best with clear characters.' };
      return { value: 'revealed_slowly', rationale: 'Gradual character revelation creates engagement.' };
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Select the next most consequential creative question.
 * Runs the full inference pass, returns the first category Homer cannot resolve.
 */
export function selectNextDirectingQuestion(
  state: HomerStoryState,
  existingDecisions: HomerCreativeDecision[],
  audienceMode: 'GENERAL' | 'KIDS' = 'GENERAL',
): HomerDirectingNextResult {
  const decided = new Set(existingDecisions.map((d) => d.category));
  const newInferred: HomerCreativeDecision[] = [];

  for (const category of CATEGORY_ORDER) {
    if (decided.has(category)) continue;

    const inferred = tryInfer(category, state, audienceMode);
    if (inferred) {
      newInferred.push(inferred);
      decided.add(category);
      continue;
    }

    const def = CATEGORY_DEFS[category];
    const question: HomerDirectingQuestion = {
      category,
      label: def.label,
      question: def.question,
      explanation: def.explanation,
      choices: def.choices,
    };
    return {
      question,
      inferred: newInferred,
      totalDecisions: existingDecisions.length + newInferred.length,
      isComplete: false,
    };
  }

  return {
    question: null,
    inferred: newInferred,
    totalDecisions: existingDecisions.length + newInferred.length,
    isComplete: true,
  };
}

/**
 * Propose a single creative decision for "Let Homer decide."
 * Rule-based; AI-powered proposals are handled in the router layer.
 */
export function proposeDirectingDecision(
  category: CreativeDecisionCategory,
  state: HomerStoryState,
  existingDecisions: HomerCreativeDecision[],
  audienceMode: 'GENERAL' | 'KIDS' = 'GENERAL',
): HomerCreativeDecision {
  const { value, rationale } = pickProposal(category, state, existingDecisions, audienceMode);
  return makeDid(category, value, rationale, 'HOMER_PROPOSAL');
}

/**
 * Return the label, question text and choices for a given category.
 * Used by the router to build AI prompt context.
 */
export function getCategoryInfo(category: CreativeDecisionCategory): {
  label: string;
  question: string;
  choices: DirectingChoice[];
} {
  const def = CATEGORY_DEFS[category];
  return { label: def.label, question: def.question, choices: def.choices };
}
