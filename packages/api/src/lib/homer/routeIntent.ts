/**
 * Homer's front door: what did the creator just ask for? (2026-11-21)
 *
 * The home surface is one question - "What are you thinking?" - and the answer decides which of four paths opens. This is deliberately a
 * DETERMINISTIC classifier, not a model call: the routing must be instant, explainable, and testable, and every path it picks is a proposal
 * (`HOMER_INFERENCE`) the creator can override with one tap. A wrong route that costs a second is cheap; a wrong route that costs a model
 * call and a wait is not.
 *
 * The four paths are the four objects the backend already models. AD and COMMERCIAL are both `projectType === 'COMMERCIAL'` - an ad is one
 * beat set with no scenes, a commercial is that plus scenes - so this returns the PROJECT SHAPE, not a new type.
 */

export type HomerPath = 'AD' | 'COMMERCIAL' | 'FILM' | 'WRITING';

export interface HomerRouteSignal {
  /** Words that voted for this path, for the "why" line the creator sees. */
  because: string[];
}

export interface HomerRoute {
  path: HomerPath;
  /** Always HOMER_INFERENCE: the creator has not confirmed anything yet. */
  provenance: 'HOMER_INFERENCE';
  /** One sentence the creator reads, in Homer's voice. */
  question: string;
  /** The other plausible paths, strongest first - the buttons. */
  alternatives: HomerPath[];
  /** The creator's own words, carried forward as the premise. */
  premise: string;
  /** Which words voted, per path - shown as the "why" line. */
  signals: Record<HomerPath, string[]>;
}

const WORDS: Record<HomerPath, string[]> = {
  AD: ['ad', 'advert', 'advertisement', 'spot', 'jingle', 'slogan', 'promo', 'commercial break', 'hook', 'cta', 'call to action', 'product'],
  COMMERCIAL: ['commercial', 'brand film', 'campaign', 'product video', 'launch video', 'testimonial'],
  FILM: ['film', 'short', 'movie', 'scene', 'scenes', 'cinematic', 'trailer', 'episode', 'series', 'shot', 'storyboard'],
  WRITING: ['story', 'write', 'writing', 'book', 'chapter', 'chapters', 'script', 'prose', 'novel', 'fable', 'poem'],
};

const LABEL: Record<HomerPath, string> = {
  AD: 'an ad',
  COMMERCIAL: 'a commercial',
  FILM: 'a film',
  WRITING: 'a written story',
};

function votes(text: string): Record<HomerPath, string[]> {
  const found: Record<HomerPath, string[]> = { AD: [], COMMERCIAL: [], FILM: [], WRITING: [] };
  for (const path of Object.keys(WORDS) as HomerPath[]) {
    for (const word of WORDS[path]) {
      if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) found[path].push(word);
    }
  }
  return found;
}

/**
 * Route one sentence. Ties resolve toward the cheapest path that can carry the idea: an ad before a commercial, a film before writing - because
 * a creator who typed "30 second spot" should not be handed a chapter editor.
 */
export function routeIntent(input: string): HomerRoute {
  const premise = String(input ?? '').trim().replace(/\s+/g, ' ');
  const signals = votes(premise);
  const scored = (Object.keys(signals) as HomerPath[])
    .map((path) => ({ path, score: signals[path].length }))
    .sort((a, b) => (b.score - a.score) || tieBreak(a.path, b.path));

  const best = scored[0]!;
  const path: HomerPath = best.score === 0 ? 'FILM' : best.path;
  const alternatives = scored
    .filter((entry) => entry.path !== path && entry.score > 0)
    .map((entry) => entry.path)
    .slice(0, 3);

  return {
    path,
    provenance: 'HOMER_INFERENCE',
    question:
      best.score === 0
        ? 'I could take this as a film or as a written story. Which one are you thinking?'
        : `This sounds like ${LABEL[path]} to me - ${signals[path].slice(0, 2).map((word) => `you said "${word}"`).join(' and ')}. Shall I open that?`,
    alternatives,
    premise,
    signals,
  };
}

const ORDER: HomerPath[] = ['AD', 'COMMERCIAL', 'FILM', 'WRITING'];

function tieBreak(a: HomerPath, b: HomerPath): number {
  return ORDER.indexOf(a) - ORDER.indexOf(b);
}

/** The buttons: Homer's pick first, then the plausible alternatives, never more than four. */
export function routeChoices(route: HomerRoute): Array<{ path: HomerPath; label: string; chosen: boolean }> {
  const picks = [route.path, ...route.alternatives].slice(0, 4);
  return picks.map((path) => ({ path, label: LABEL[path], chosen: path === route.path }));
}
