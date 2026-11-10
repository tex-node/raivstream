import type { EducationalContract } from '../storyIntelligence/types';
import { isFragment, titleFrom } from './sceneDerivation';

/**
 * Educational scenes derived from the lesson, not a template (2026-11-08).
 *
 * THE DEFECT. `educationalSceneProgression` returned a fixed seven-entry list - Hook, Introduction,
 * Core concept, Example, Second concept, Application, Recap - truncated by `slice(0, count)`. A
 * lesson's scenes were picked from that list, exactly as a story's scenes used to be picked from a
 * six-card one. It looked fine because the scenes had titles, purposes and a progression; none of
 * them were this lesson's.
 *
 * THE SOURCE OF TRUTH. The `EducationalContract` already carries the beats the template was throwing
 * away: `keyConcepts` (2-8), `examplesToUse` (max 6), `learningObjective`, `visualTeachingStrategy`
 * and `recapIncluded`. So the derivation reads the contract, not a body - an educational lesson has
 * no chapter body, and the contract is where its teaching units live.
 *
 * SHAPE. One scene per concept, in the contract's order, titled in the concept's own words. An
 * example, when the contract supplies one for that concept, becomes part of the scene's description
 * rather than a separate Hook/Example/Application slot. A recap scene appears only when
 * `recapIncluded` says the lesson has one - never by template.
 */

export interface EducationalScene {
  title: string;
  description: string;
  /** A property of the first scene, not a scene of its own (2026-11-10). */
  hookLine?: string | null;
  /** The contract field this scene came from - the traceability the tests assert on. */
  source: string;
}


/**
 * A hook derived from the lesson's first concept (2026-11-10).
 *
 * A hook is a PROPERTY of the first scene, not a scene of its own: in thirty seconds you cannot
 * afford a scene that only teases. So the first scene opens with a hook line and then teaches its
 * concept.
 *
 * It is derived from `keyConcepts[0]`, because the contract has no field naming an opening question
 * or a stake - the twelve fields carry topic, concepts, examples, strategy and recap, and nothing
 * that means "hook". Turning the first concept into the question it answers is derivation; writing
 * "you won't believe what happens next" would be a hook slot wearing a hook's clothes.
 *
 * Returns null when no question can be derived rather than emitting a generic tease: a lesson that
 * opens on its concept is honest, and a manufactured hook is not.
 */
export function deriveHookLine(contract: EducationalContract): string | null {
  const first = (contract.keyConcepts ?? [])[0]?.trim();
  if (!first) return null;

  // Already a question: the lesson supplied its own hook.
  if (first.endsWith('?')) return first;

  const match = first.match(/^(.+?)\s+(?:is|are|was|were)\s+(.+)$/i);
  if (!match) return null;
  const subject = match[1]!.trim();
  const rest = match[2]!.trim().replace(/[.!?]+$/, '');
  const lowerSubject = /^[A-Z][a-z]/.test(subject) && !/^[A-Z]{2,}/.test(subject)
    ? subject.charAt(0).toLowerCase() + subject.slice(1)
    : subject;

  // "X is melted rock that reaches the surface" -> "Why does X reach the surface?"
  const thatClause = rest.match(/\bthat\s+(.+)$/i);
  if (thatClause) {
    const [, predicate] = thatClause;
    const words = predicate!.split(' ');
    const verb = words[0]!;
    const base = verb.endsWith('es') ? verb.slice(0, -2) : verb.endsWith('s') ? verb.slice(0, -1) : verb;
    return `Why does ${lowerSubject} ${[base, ...words.slice(1)].join(' ')}?`;
  }

  // "X is hot enough to flow" -> "What makes X hot enough to flow?"
  if (/\sto\s/.test(rest)) return `What makes ${lowerSubject} ${rest}?`;

  // No question can be derived from this concept without inventing content.
  return null;
}

export function deriveEducationalScenes(contract: EducationalContract): EducationalScene[] {
  const concepts = contract.keyConcepts ?? [];
  const examples = contract.examplesToUse ?? [];

  const scenes: EducationalScene[] = concepts.map((concept, index) => {
    const example = examples[index];
    // A concept arrives as a phrase, not a sentence. Closing it is what makes the scene whole by
    // `isFragment` without inventing content - and a concept that genuinely stops mid-thought still
    // fails the check.
    const sentence = /[.!?]$/.test(concept.trim()) ? concept.trim() : `${concept.trim()}.`;
    const exampleText = example ? (/[.!?]$/.test(example.trim()) ? example.trim() : `${example.trim()}.`) : null;
    const description = exampleText ? `${sentence} For example: ${exampleText}` : sentence;
    return {
      title: titleFrom(concept, index),
      description,
      source: concept,
    };
  });

  const hookLine = deriveHookLine(contract);
  if (hookLine && scenes[0]) {
    // The hook rides on the first scene; it does not add one.
    scenes[0] = { ...scenes[0], hookLine };
  }

  if (contract.recapIncluded && scenes.length > 0) {
    // A recap is a beat of the lesson, not a template slot: it names what the lesson taught.
    const recapTitle = titleFrom(`Recap of ${contract.topic}`, scenes.length);
    scenes.push({
      title: recapTitle,
      description: `Recap of ${contract.topic}: ${concepts.join(', ')}.`,
      source: contract.topic,
    });
  }

  return scenes;
}

/** The purposes the scene director consumes - derived, in the lesson's own terms. */
export function deriveEducationalSceneProgression(contract: EducationalContract): string[] {
  return deriveEducationalScenes(contract).map((scene) => scene.description);
}

/** A scene whose text opens or closes mid-thought is a gap, exactly as in a story. */
export function educationalSceneIsFragment(scene: EducationalScene): boolean {
  return isFragment(scene.description);
}

/**
 * The opening sentence (2026-11-10).
 *
 * The operator's ruling: the QUESTION is the opener, and the child address is a **vocative inside
 * the same sentence** - "Hey explorers - why does lava reach the surface?" Neither requirement is
 * dropped and it costs no time, which was the objection to two opening sentences.
 *
 * When no hook derives, the opening is the address alone: the address is honest, a manufactured
 * question is not.
 */
export function composeLessonOpening(input: { hookLine?: string | null; address?: string | null }): string | null {
  const hook = input.hookLine?.trim() ?? '';
  const address = input.address?.trim() ?? '';
  if (hook && address) {
    // One sentence, so the question continues in lower case after the vocative:
    // "Hey explorers - why does lava reach the surface?" not "... - Why does ...".
    const continued = /^[A-Z][a-z]/.test(hook) ? hook.charAt(0).toLowerCase() + hook.slice(1) : hook;
    return `${address.replace(/[.!?]+$/, '')} \u2014 ${continued}`;
  }
  if (hook) return hook;
  if (address) return address;
  return null;
}
