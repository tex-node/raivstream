/**
 * Stated style defaults (2026-11-17).
 *
 * The profile is deferred until signal history justifies it (#431); this is what ships instead: the genre-matched
 * defaults #407 designed, expressed in **look fields** so the composer consumes them directly rather than parsing
 * prose, and **named for the technique, never for a person** — a director's name on a preset invites a rights
 * conversation nobody needs, while "suspense — slow reveal, hard shadows" says what it does.
 *
 * The neutral default is **`DEFAULT_LOOK` itself**, not a hand-written set of empty-ish values: a "neutral" that
 * quietly implies a house style is the template defect wearing a plain label, and the test asserts identity with
 * the composer's own neutral.
 */
import { DEFAULT_LOOK, type CinematicLook } from './look/look';

export type StyleDefaultKey = 'suspense' | 'drama' | 'comedy' | 'educational' | 'commercial' | 'transformation';

export interface StyleDefault {
  key: StyleDefaultKey;
  /** Technique-named, creator-facing. */
  label: string;
  /** Why this default exists — shown beside it, per the engine-record rule applied to taste. */
  basis: string;
  /** Overrides applied over DEFAULT_LOOK; an empty object IS the neutral default. */
  look: Partial<CinematicLook>;
  /** True when no film-craft tradition applies and the neutral default is the honest answer. */
  neutral: boolean;
}

export const STYLE_DEFAULTS: Record<StyleDefaultKey, StyleDefault> = {
  suspense: {
    key: 'suspense',
    label: 'Suspense — slow reveal, hard shadows, tight framing',
    basis: 'classical suspense technique',
    look: { lens: 50, movement: 'push-in', lighting: 'low-key', grade: 'cool' },
    neutral: false,
  },
  drama: {
    key: 'drama',
    label: 'Drama — deep focus, long takes, low angles',
    basis: 'classical prestige-drama technique',
    look: { lens: 35, movement: 'static', lighting: 'natural', grade: 'bleach-bypass' },
    neutral: false,
  },
  comedy: {
    key: 'comedy',
    label: 'Physical comedy — wide framing, held shots, visual gags',
    basis: 'silent-comedy staging',
    look: { lens: 24, movement: 'static', lighting: 'high-key', grade: 'warm' },
    neutral: false,
  },
  educational: {
    key: 'educational',
    label: 'Neutral — no stylistic bias',
    basis: 'no film-craft tradition applies to a lesson',
    look: {},
    neutral: true,
  },
  commercial: {
    key: 'commercial',
    label: 'Neutral — no stylistic bias',
    basis: 'no film-craft tradition applies to a product demo',
    look: {},
    neutral: true,
  },
  transformation: {
    key: 'transformation',
    label: 'Neutral — no stylistic bias',
    basis: 'no film-craft tradition applies to a before/after',
    look: {},
    neutral: true,
  },
};

export const NEUTRAL_DEFAULT_KEY: StyleDefaultKey = 'educational';

/** The concrete look a default resolves to: DEFAULT_LOOK with the default's overrides applied. */
export function lookForDefault(key: StyleDefaultKey): CinematicLook {
  return { ...DEFAULT_LOOK, ...STYLE_DEFAULTS[key].look };
}

/** Is this default truly neutral - i.e. exactly the composer's neutral, with no implied house style? */
export function isNeutralDefault(key: StyleDefaultKey): boolean {
  return STYLE_DEFAULTS[key].neutral && Object.keys(STYLE_DEFAULTS[key].look).length === 0;
}

export type StyleDefaultSource = 'creator' | 'stated' | 'neutral' | 'r16-neutral';

export interface ResolvedStyleDefault {
  key: StyleDefaultKey;
  label: string;
  basis: string;
  look: CinematicLook;
  /** Where the value came from, so the surface can say it rather than imply it. */
  source: StyleDefaultSource;
}

/**
 * The fallback chain: a creator's stored choice, else the stated default for the project type, else neutral.
 *
 * Each level is reported (`source`), because a chain that silently returns neutral for everything is the
 * `canAutoDecide` defect in a new place - a fallback you cannot see is indistinguishable from a broken lookup.
 * **R16 gets neutral only**, per #407: an adult genre default is never applied to kids content.
 */
export function resolveStyleDefault(input: {
  creatorKey?: string | null;
  projectType?: string | null;
  isR16?: boolean;
}): ResolvedStyleDefault {
  const neutral = (source: StyleDefaultSource): ResolvedStyleDefault => ({
    key: NEUTRAL_DEFAULT_KEY,
    label: STYLE_DEFAULTS[NEUTRAL_DEFAULT_KEY].label,
    basis: STYLE_DEFAULTS[NEUTRAL_DEFAULT_KEY].basis,
    look: lookForDefault(NEUTRAL_DEFAULT_KEY),
    source,
  });

  if (input.isR16) return neutral('r16-neutral');

  const explicit = (input.creatorKey ?? '').toLowerCase();
  if (explicit && explicit in STYLE_DEFAULTS) {
    const key = explicit as StyleDefaultKey;
    return { key, label: STYLE_DEFAULTS[key].label, basis: STYLE_DEFAULTS[key].basis, look: lookForDefault(key), source: 'creator' };
  }

  const stated = (input.projectType ?? '').toLowerCase();
  const mapped: Record<string, StyleDefaultKey> = {
    story: 'drama',
    drama: 'drama',
    suspense: 'suspense',
    thriller: 'suspense',
    comedy: 'comedy',
    education: 'educational',
    educational: 'educational',
    commercial: 'commercial',
    transformation: 'transformation',
  };
  const key = mapped[stated];
  if (key) {
    return { key, label: STYLE_DEFAULTS[key].label, basis: STYLE_DEFAULTS[key].basis, look: lookForDefault(key), source: 'stated' };
  }

  return neutral('neutral');
}
