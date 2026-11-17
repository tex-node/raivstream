/**
 * Story critique — the dimensions the contract does NOT cover (2026-11-17).
 *
 * WHY THESE THREE. `scoreStoryContract` already judges **structure**: protagonist, want, obstacle, turn, resolution.
 * A critique that re-measures structure is two scorers that can disagree, which is the defect this arc keeps
 * finding. The rewrite chips already cover conflict, tension, humour and ending; the narrative prompt already
 * *asks* for sensory anchors and scene headings but **nothing checks whether they arrived**.
 *
 * So: **sensory grounding**, **pacing**, **voice** — each with a deterministic measure, because a deterministic
 * measure can be calibrated against a known-bad input for free, and the constant-90 critic is the cautionary tale:
 * a model prompted for a score will echo the score back.
 *
 * NO THRESHOLD, NO GATE. This is informational and suggestion-feeding only. A number that blocks publication is a
 * product decision, and it needs a calibrated measurement first — the creative critic set its threshold at 90
 * before the scorer could discriminate, and 802 runs passed by construction.
 */

export interface CritiqueDimension {
  /** 0-100. Higher is better. */
  score: number;
  /** What a low score MEANS, in a sentence a creator can act on. */
  lowScoreMeaning: string;
  /** Which measure produced the score, so a creator is not asked to trust a number with no provenance. */
  measuredBy: string;
}

export interface StoryCritique {
  sensory: CritiqueDimension;
  pacing: CritiqueDimension;
  voice: CritiqueDimension;
  /** True when the body is too short for the measures to mean anything; scores are then withheld rather than guessed. */
  tooShort: boolean;
}

const SENSORY_LEXEMES = [
  'light', 'shadow', 'dark', 'glow', 'smell', 'scent', 'salt', 'wind', 'cold', 'warm', 'heat', 'rain', 'dust',
  'grit', 'damp', 'sound', 'echo', 'clatter', 'hum', 'creak', 'silence', 'taste', 'bitter', 'sweet', 'sour',
  'rough', 'smooth', 'sharp', 'soft', 'wet', 'dry', 'smoke', 'saltwater', 'thunder', 'whistle', 'rust', 'oil',
];

const ABSTRACT_MARKERS = [
  'felt', 'realised', 'realized', 'understood', 'decided', 'thought about', 'in many ways', 'somehow',
  'it was clear', 'overall', 'in the end', 'throughout', 'everything changed', 'things would',
];

const FIRST_PERSON = [' i ', ' i\'', ' i,', ' i.', 'me ', 'my ', 'mine ', 'we ', 'our '];
const THIRD_PERSON = [' he ', ' she ', 'they ', 'his ', 'her ', 'their ', 'them '];

const PAST_MARKERS = [' was ', ' were ', ' had ', ' said ', ' went ', ' took ', ' saw ', ' came ', ' knew ', ' found '];
const PRESENT_MARKERS = [' is ', ' are ', ' says ', ' goes ', ' takes ', ' sees ', ' comes ', ' knows ', ' finds '];

function words(body: string): string[] {
  return body.trim().split(/\s+/).filter(Boolean);
}

function sentences(body: string): string[] {
  return body
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function occurrences(haystack: string, needles: string[]): number {
  const lower = ` ${haystack.toLowerCase()} `;
  return needles.reduce((total, needle) => total + (lower.split(needle).length - 1), 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Concrete images per 100 words, with abstraction markers subtracted: summary is the low score. */
export function scoreSensory(body: string): number {
  const count = words(body).length;
  if (count === 0) return 0;
  const concrete = occurrences(body, SENSORY_LEXEMES);
  const abstract = occurrences(body, ABSTRACT_MARKERS);
  const per100 = ((concrete - abstract * 0.5) / count) * 100;
  // 6 concrete images per 100 words is a well-grounded scene; 0 is summary. The slope is deliberate: at 4/100 the
  // calibration sample pinned at 100, which measures a floor but cannot rank two good chapters (2026-11-17).
  return clamp((per100 / 6) * 85);
}

/**
 * Pacing: sentence-length VARIANCE and scene-count sanity. A chapter of uniform sentences reads flat; the low score
 * is a story that is one rhythm from start to finish.
 */
export function scorePacing(body: string): number {
  const list = sentences(body);
  if (list.length < 4) return 0;
  const lengths = list.map((sentence) => words(sentence).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const variance = lengths.reduce((total, length) => total + (length - mean) ** 2, 0) / lengths.length;
  const stdev = Math.sqrt(variance);
  const coefficient = stdev / mean;
  // A coefficient of variation around 0.7 is varied prose; 0 is machine-uniform. Same slope reasoning as sensory:
  // a measure that saturates on the first decent paragraph cannot compare two good ones.
  return clamp((coefficient / 0.7) * 85);
}

/** Voice: person and tense should not drift inside a chapter. */
export function scoreVoice(body: string): number {
  const first = occurrences(body, FIRST_PERSON);
  const third = occurrences(body, THIRD_PERSON);
  const personTotal = first + third;
  if (personTotal === 0) return 0;
  const personMargin = Math.abs(first - third) / personTotal;
  const past = occurrences(body, PAST_MARKERS);
  const present = occurrences(body, PRESENT_MARKERS);
  const tenseTotal = past + present;
  const tenseMargin = tenseTotal === 0 ? 0 : Math.abs(past - present) / tenseTotal;
  // Consistency in both axes: 100 when one person and one tense clearly dominate.
  return clamp(((personMargin + tenseMargin) / 2) * 100);
}

export function critiqueStory(body: string): StoryCritique {
  const count = words(body).length;
  const tooShort = count < 60;
  return {
    sensory: {
      score: tooShort ? 0 : scoreSensory(body),
      lowScoreMeaning: 'the story is told in summary rather than images — add light, sound, texture and physical action.',
      measuredBy: 'concrete sensory words per 100 words, minus abstraction markers',
    },
    pacing: {
      score: tooShort ? 0 : scorePacing(body),
      lowScoreMeaning: 'every sentence moves at the same speed — vary sentence length and let the important beat breathe.',
      measuredBy: 'sentence-length coefficient of variation',
    },
    voice: {
      score: tooShort ? 0 : scoreVoice(body),
      lowScoreMeaning: 'the narration drifts between first and third person, or between past and present tense.',
      measuredBy: 'dominance margin of person and tense markers',
    },
    tooShort,
  };
}
