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
  /** The contract field this scene came from - the traceability the tests assert on. */
  source: string;
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
