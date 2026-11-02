/**
 * Raivstream 5.0 — Creative Intelligence.
 *
 * Routes an interpretation into domain knowledge (STORY / EDUCATION /
 * COMMERCIAL). The three domains share the same CreativeProject/Bible
 * architecture — one layer, three lenses. Deterministic baseline here; the
 * existing story-intelligence provider is bridged via storyAdapter.
 */

import type { CreativeInterpretation, CreativeProjectType } from '../shared/types';

export interface DomainKnowledge {
  type: CreativeProjectType;
  /** Semantic understanding the domain adds to the Bible. */
  story?: Record<string, unknown>;
  characters?: Record<string, unknown>[];
  worlds?: Record<string, unknown>[];
  visualLanguage?: Record<string, unknown>;
  audience?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  objective?: string;
}

/**
 * Derive a bounded cast from the idea text.
 *
 * `STORY` used to return `characters: []` unconditionally, which meant no creative
 * project could ever have a cast - so no identity block composed, no reference resolved,
 * and every still fell through to text-to-image. Three sessions traced 0-50 identity
 * scores back to this one empty array.
 *
 * Bounded at MAX_CAST (4): an unbounded extraction from free text invents people, and a
 * 30-second short cannot show more than a handful. Descriptions are marked as proposals -
 * the bible already states that AI assumptions are proposed, not canon, and the creator
 * approves them at the cast stage.
 */
export const MAX_CAST = 4;

export interface DerivedCharacter {
  name: string;
  visualDescription: string;
  source: 'explicit-subject' | 'idea-text';
}

function titleCase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((word) => (word.length ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Collect noun phrases that name a person/creature in the text. */
function characterPhrases(text: string): string[] {
  const phrases: string[] = [];
  const cleaned = text.replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();

  // "about a lighthouse keeper and a lost bird" - the dominant shape for short ideas.
  const about = cleaned.match(/\babout\s+(?:a|an|the)\s+([^.;]+)/i);
  if (about) {
    for (const part of about[1]!.split(/\s+and\s+|,\s*/i)) {
      const phrase = part.replace(/^(?:a|an|the)\s+/i, '').trim();
      if (phrase) phrases.push(phrase);
    }
  }

  // The subject arrives already stripped of "about", so it reads "a lighthouse keeper and
  // a lost bird". Handle that shape directly - it is the one extractSubject produces.
  const leading = cleaned.match(/^(?:a|an|the)\s+([^.;]{1,80})$/i);
  if (leading && !about) {
    for (const part of leading[1]!.split(/\s+and\s+|,\s*/i)) {
      const phrase = part.replace(/^(?:a|an|the)\s+/i, '').trim();
      if (phrase) phrases.push(phrase);
    }
  }

  // "a lighthouse keeper who ..." / "an old fisherman named Elias"
  for (const match of cleaned.matchAll(/\b(?:a|an)\s+([a-z]+(?:\s+[a-z]+){0,3}?)\s+(?:who|that|named|called)\b/gi)) {
    phrases.push(match[1]!.trim());
  }

  return phrases;
}

/**
 * Turn phrases into characters. Deterministic, and deliberately shallow: a name derived
 * from the noun phrase plus a description that says what it is and admits it is a
 * proposal. Anything richer would be invention dressed as extraction.
 */
export function deriveCast(interpretation: CreativeInterpretation, limit = MAX_CAST): DerivedCharacter[] {
  const text = [interpretation.explicit?.subject, interpretation.summary, (interpretation as { ideaText?: string }).ideaText]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  if (!text.trim()) return [];

  const style = interpretation.inferred?.style ?? 'cinematic';
  const seen = new Set<string>();
  const cast: DerivedCharacter[] = [];

  // The subject FIRST and on its own: it is the creator's own words. Concatenating it
  // with the summary let a leading-article pattern swallow the summary too, producing a
  // character named "a lost bird I understand this as a story targeting 30s".
  const subjectPhrases = interpretation.explicit?.subject ? characterPhrases(interpretation.explicit.subject) : [];
  const phrases = subjectPhrases.length > 0 ? subjectPhrases : characterPhrases(text);

  for (const phrase of phrases) {
    const name = titleCase(phrase);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cast.push({
      name,
      // Says what it is, ties it to the established style, and admits the gap.
      visualDescription: `A ${phrase} (${style} style); appearance proposed and pending creator approval.`,
      source: interpretation.explicit?.subject ? 'explicit-subject' : 'idea-text',
    });
    if (cast.length >= limit) break;
  }

  return cast;
}

export function domainKnowledgeFor(interpretation: CreativeInterpretation): DomainKnowledge {
  const text = [interpretation.summary, interpretation.explicit.subject ?? ''].filter(Boolean).join(' ');
  switch (interpretation.projectType) {
    case 'COMMERCIAL':
      return {
        type: 'COMMERCIAL',
        objective: interpretation.inferred.objective ?? 'premium brand film',
        brand: {
          message: interpretation.inferred.message ?? undefined,
          benefit: undefined,
          tone: interpretation.explicit.tone,
        },
        audience: interpretation.explicit.audience ? { audience: interpretation.explicit.audience } : undefined,
        visualLanguage: { style: interpretation.inferred.style ?? 'cinematic', premium: interpretation.explicit.tone?.includes('luxurious') || undefined },
      };
    case 'EDUCATION':
      return {
        type: 'EDUCATION',
        objective: 'explain a concept clearly',
        story: { topic: text.slice(0, 240), structure: 'hook, explain, example, recap' },
        audience: { learner: 'to be confirmed' },
      };
    case 'STORY':
      return {
        type: 'STORY',
        objective: 'tell a story',
        story: { premise: text.slice(0, 240) },
        // Derived, not hardcoded: an empty array here meant no creative project could
        // ever have a cast, and therefore no still could be reference-conditioned.
        characters: deriveCast(interpretation) as unknown as Record<string, unknown>[],
        worlds: [],
        visualLanguage: { style: interpretation.inferred.style ?? 'cinematic' },
      };
    case 'TRANSFORMATION':
      return {
        type: 'TRANSFORMATION',
        objective: 'show a transformation',
        story: { structure: 'before → during → after' },
      };
    default:
      return { type: 'UNKNOWN', objective: 'to be clarified' };
  }
}