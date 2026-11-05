import type { CreativeInterpretation, IntentQuestion } from '../shared/types';

/**
 * Auto mode: the policy layer Phase 7 asks for (2026-11-05).
 *
 * The read found `canAutoDecide` rendered by the UI and consumed by **nothing on the server** — a
 * flag that says "the creator may defer this" with no code that ever defers it. This is the
 * server half: given an interpretation, decide every question the creator is allowed to defer, and
 * REFUSE when one is not deferrable.
 *
 * Refusing is the point. "No follow-up questions" must not mean "invent answers": a question that
 * is not auto-decidable becomes a blocker the caller has to resolve, not a silent default.
 */

export type AutoDecisionSource = 'explicit' | 'default';

export interface AutoDecision {
  id: string;
  prompt: string;
  choice: string;
  decidedBy: AutoDecisionSource;
}

export type AutoResolveResult =
  | { ok: true; decisions: AutoDecision[]; blockedBy: [] }
  | { ok: false; decisions: AutoDecision[]; blockedBy: string[] };

/**
 * Default policy: when the creator's own words already name one of the options, use that option;
 * otherwise take the FIRST option, because the question builder orders options from the least
 * surprising to the most specific. Never a random pick, never an empty answer.
 */
function chooseDefault(question: IntentQuestion, interpretation: CreativeInterpretation): AutoDecision {
  const haystack = [
    interpretation.explicit.genre,
    interpretation.explicit.tone,
    interpretation.explicit.format,
    interpretation.explicit.audience,
    interpretation.summary,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  const matched = question.options.find((option) => option.length > 0 && haystack.includes(option.toLowerCase()));
  const choice = matched ?? question.options[0];

  return {
    id: question.id,
    prompt: question.prompt,
    choice,
    decidedBy: matched ? 'explicit' : 'default',
  };
}

export function autoResolveIntent(interpretation: CreativeInterpretation): AutoResolveResult {
  const questions = interpretation.questions ?? [];
  const decisions: AutoDecision[] = [];
  const blockedBy: string[] = [];

  for (const question of questions) {
    if (!question.canAutoDecide) {
      blockedBy.push(question.id);
      continue;
    }
    decisions.push(chooseDefault(question, interpretation));
  }

  if (blockedBy.length > 0) {
    return { ok: false, decisions, blockedBy };
  }
  return { ok: true, decisions, blockedBy: [] };
}
