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
        characters: [],
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