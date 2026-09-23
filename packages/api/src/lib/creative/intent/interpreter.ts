/**
 * Raivstream 5.0 — Intent engine.
 *
 * RAW INPUT → Normalize → Detect project type → Extract explicit intent →
 * Infer reasonable intent → Identify uncertainty → Identify consequential
 * questions → Construct interpretation.
 *
 * Deterministic by design (fully unit-testable): it never fabricates certainty.
 * Explicit = what the creator said. Inferred = what Raivstream reasonably
 * concludes. Uncertain = what materially affects the result but cannot be
 * safely inferred. An optional LLM refinement pass can be layered on later; the
 * deterministic baseline must always remain the fallback.
 */

import { CreativeError } from '../shared/errors';
import {
  CREATIVE_PROJECT_TYPES,
  type CreativeInterpretation,
  type CreativeProjectType,
  type IntentQuestion,
} from '../shared/types';

// ─── Normalization ───────────────────────────────────────────────────────────

export function normalizeIntentText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

// ─── Project-type detection (keyword scoring) ────────────────────────────────

const TYPE_SIGNALS: Record<Exclude<CreativeProjectType, 'UNKNOWN'>, string[]> = {
  COMMERCIAL: [
    'commercial', 'advert', 'ad campaign', 'campaign', 'brand', 'product', 'promote',
    'promotional', 'promotion', 'launch', 'market', 'sell', 'boost', 'cta', 'offer',
    'skincare', 'makeup', 'fashion', 'premium', 'luxurious', 'modern brand',
  ],
  EDUCATION: [
    'teach', 'lesson', 'explain', 'learn', 'learner', 'students', 'tutorial',
    'curriculum', 'science', 'math', 'photosynthesis', 'physics', 'grammar',
    'eight-year-old', 'for kids', 'children learn', 'educational',
  ],
  TRANSFORMATION: [
    'transform', 'makeover', 'before and after', 'routine', 'glow up', 'change her look',
    'metamorphosis',
  ],
  STORY: [
    'story', 'tale', 'film', 'short film', 'movie', 'about a', 'character', 'hero',
    'journey', 'ending', 'narrative', 'scenes', 'plot',
  ],
};

function signalScore(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  return signals.reduce((score, signal) => (lower.includes(signal) ? score + 1 : score), 0);
}

export function detectProjectType(text: string): { type: CreativeProjectType; confidence: number; signals: Record<string, number> } {
  const scores = (Object.keys(TYPE_SIGNALS) as Exclude<CreativeProjectType, 'UNKNOWN'>[]).map((type) => ({
    type,
    score: signalScore(text, TYPE_SIGNALS[type]),
  }));
  const signals = Object.fromEntries(scores.map(({ type, score }) => [type, score]));
  const best = scores.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score === 0) return { type: 'UNKNOWN', confidence: 0, signals };
  const total = scores.reduce((sum, s) => sum + s.score, 0);
  const confidence = best.score / (total || 1);
  return { type: best.type, confidence: Math.round(confidence * 100) / 100, signals };
}

// ─── Explicit-signal extraction ───────────────────────────────────────────────

const FORMAT_SIGNALS: Array<[string, string[]]> = [
  ['Short Film', ['short film', 'short movie']],
  ['Film', ['film', 'movie']],
  ['Commercial', ['commercial', 'advert']],
  ['Lesson', ['lesson', 'tutorial']],
  ['Video', ['video']],
];

const TONE_SIGNALS: Array<[string, string[]]> = [
  ['luxurious', ['luxurious', 'premium']],
  ['confident', ['confident']],
  ['modern', ['modern']],
  ['hopeful', ['hopeful']],
  ['bittersweet', ['bittersweet']],
  ['dramatic', ['dramatic']],
  ['warm', ['warm']],
  ['funny', ['funn', 'humor', 'comedy']],
  ['cinematic', ['cinematic']],
];

export function extractDurationSeconds(text: string): number | undefined {
  const minute = text.match(/(\d+)[\s-]*(minute|min)\b/i);
  if (minute) return Number(minute[1]) * 60;
  const second = text.match(/(\d+)[\s-]*(second|sec)\b/i);
  if (second) return Number(second[1]);
  return undefined;
}

export function extractExplicitSignals(text: string): CreativeInterpretation['explicit'] {
  const explicit: CreativeInterpretation['explicit'] = {};
  const durationSeconds = extractDurationSeconds(text);
  if (durationSeconds !== undefined) explicit.durationSeconds = durationSeconds;
  for (const [label, signals] of FORMAT_SIGNALS) {
    if (signals.some((s) => text.toLowerCase().includes(s))) {
      explicit.format = label;
      break;
    }
  }
  for (const [label, signals] of TONE_SIGNALS) {
    if (signals.some((s) => text.toLowerCase().includes(s))) {
      explicit.tone = explicit.tone ? `${explicit.tone}, ${label}` : label;
    }
  }
  return explicit;
}

// ─── Interpretation assembly ──────────────────────────────────────────────────

export function buildInterpretation(
  text: string,
  options?: {
    projectType?: CreativeProjectType;
    questions?: IntentQuestion[];
    inferred?: CreativeInterpretation['inferred'];
    summary?: string;
  },
): CreativeInterpretation {
  const { type, confidence, signals } = detectProjectType(text);
  const projectType = options?.projectType ?? type;
  const explicit = extractExplicitSignals(text);
  const inferred: CreativeInterpretation['inferred'] = options?.inferred ?? inferIntent(projectType, text);
  const uncertain = identifyUncertainty(projectType, explicit, inferred);
  const questions = options?.questions ?? buildQuestions(projectType, uncertain);
  const summary = options?.summary ?? buildSummary(text, projectType, explicit, inferred);
  void signals;
  return {
    projectType,
    explicit,
    inferred,
    uncertain,
    questions,
    summary,
    typeConfidence: options?.projectType ? 1 : confidence,
  };
}

function inferIntent(type: CreativeProjectType, text: string): CreativeInterpretation['inferred'] {
  const lower = text.toLowerCase();
  switch (type) {
    case 'COMMERCIAL':
      return {
        objective: lower.includes('cinematic') || lower.includes('premium') ? 'premium brand film' : 'promotional video',
        style: 'cinematic',
      };
    case 'EDUCATION':
      return {
        objective: 'explain a concept clearly',
        style: 'clear and engaging',
      };
    case 'STORY':
      return {
        objective: 'tell a story',
        style: 'cinematic',
      };
    case 'TRANSFORMATION':
      return {
        objective: 'show a transformation',
        style: 'before and after',
      };
    default:
      return {};
  }
}

function identifyUncertainty(
  type: CreativeProjectType,
  explicit: CreativeInterpretation['explicit'],
  inferred: CreativeInterpretation['inferred'],
): string[] {
  const uncertain: string[] = [];
  if (!explicit.durationSeconds && type !== 'STORY') uncertain.push('duration');
  if (!explicit.tone) uncertain.push('tone');
  if (!inferred.objective) uncertain.push('objective');
  if (!explicit.audience) uncertain.push('audience');
  return uncertain;
}

export function buildSummary(
  text: string,
  type: CreativeProjectType,
  explicit: CreativeInterpretation['explicit'],
  inferred: CreativeInterpretation['inferred'],
): string {
  const typeLabel = type.toLowerCase();
  const duration = explicit.durationSeconds ? `${explicit.durationSeconds}s ` : '';
  const parts = [
    `I understand this as a ${typeLabel}${explicit.format ? ` in ${explicit.format}` : ''}`,
    explicit.genre ? ` (${explicit.genre})` : '',
    duration ? ` targeting ${duration}` : '',
    explicit.tone ? ` with a ${explicit.tone} feel` : '',
    inferred.objective ? `. Goal: ${inferred.objective}` : '',
  ].filter(Boolean);
  return `${parts.join('')}. I'll preserve your original words: “${text.slice(0, 140)}${text.length > 140 ? '…' : ''}”`;
}

// ─── Consequential questions ──────────────────────────────────────────────────

export function buildQuestions(type: CreativeProjectType, uncertain: string[]): IntentQuestion[] {
  const questions: IntentQuestion[] = [];
  const needs = new Set(uncertain);

  if (type === 'STORY') {
    if (needs.has('tone')) {
      questions.push({
        id: 'story_ending',
        prompt: 'Should the ending feel hopeful, bittersweet, or should I decide?',
        options: ['Hopeful', 'Bittersweet', 'Dramatic'],
        canAutoDecide: true,
      });
    }
    if (needs.has('audience')) {
      questions.push({
        id: 'story_audience',
        prompt: 'Who is this story for?',
        options: ['Everyone', 'Children', 'Teens', 'Adults'],
        canAutoDecide: true,
      });
    }
  } else if (type === 'COMMERCIAL') {
    questions.push({
      id: 'commercial_cta',
      prompt: 'What should the viewer do at the end?',
      options: ['Visit the product', 'Buy now', 'Follow the brand', 'Feel the brand'],
      canAutoDecide: true,
    });
    if (needs.has('audience')) {
      questions.push({
        id: 'commercial_audience',
        prompt: 'Who is this for?',
        options: ['Young professionals', 'Everyone', 'Luxury buyers', 'General'],
        canAutoDecide: true,
      });
    }
  } else if (type === 'EDUCATION') {
    questions.push({
      id: 'education_age',
      prompt: 'What age group are we teaching?',
      options: ['Young children', 'Older children', 'Teens', 'Adults'],
      canAutoDecide: true,
    });
    if (needs.has('duration')) {
      questions.push({
        id: 'education_duration',
        prompt: 'How long should the lesson be?',
        options: ['2–3 minutes', '5 minutes', 'Let me choose'],
        canAutoDecide: true,
      });
    }
  } else {
    questions.push({
      id: 'type_confirm',
      prompt: 'What kind of thing are you creating?',
      options: ['A story', 'A lesson', 'A commercial / promotion', 'A transformation'],
      canAutoDecide: true,
    });
  }
  return questions.slice(0, 3);
}

// ─── Public service ───────────────────────────────────────────────────────────

export function interpret(text: string, projectType?: CreativeProjectType): CreativeInterpretation {
  const normalized = normalizeIntentText(text);
  if (!normalized) throw new CreativeError('INTENT_EMPTY', 'Please describe what you want to create.');
  return buildInterpretation(normalized, projectType ? { projectType } : undefined);
}

export { CREATIVE_PROJECT_TYPES };
export type { CreativeProjectType };