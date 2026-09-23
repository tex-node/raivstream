/**
 * Raivstream 5.0 — Director entity resolution.
 *
 * Turns the interpreter's semantic intent into concrete EntityReferences from
 * the plan + bible (characters, worlds, scenes). Preserved = the complement
 * that must stay untouched.
 */

import type { CreativeBibleState } from '../shared/types';
import type { CreativeProductionPlanState } from '../production/plan';
import type { DirectiveScope } from './types';
import type { EntityReference } from '../review/types';

export interface ResolveInput {
  plan: CreativeProductionPlanState;
  bible?: CreativeBibleState | null;
  sceneIndices: number[];
  scope: DirectiveScope;
}

export function resolveEntities(input: ResolveInput): { affected: EntityReference[]; preserved: EntityReference[] } {
  const scenes = input.plan.scenes;
  const affectedScenes = input.sceneIndices
    .filter((index) => index >= 0 && index < scenes.length)
    .map((index) => ({ type: 'SCENE' as const, id: scenes[index].sceneId, name: scenes[index].title }));
  const allSceneRefs = scenes.map((scene) => ({ type: 'SCENE' as const, id: scene.sceneId, name: scene.title }));
  const characters = ((input.bible?.characters ?? []) as Array<{ name?: string }>).map((c) => c.name).filter(Boolean);
  const characterRefs: EntityReference[] = characters.slice(0, 4).map((name) => ({ type: 'CHARACTER', name }));
  const worlds = ((input.bible?.worlds ?? []) as Array<{ name?: string }>).map((w) => w.name).filter(Boolean);
  const worldRefs: EntityReference[] = worlds.slice(0, 4).map((name) => ({ type: 'WORLD', name }));

  switch (input.scope) {
    case 'CHARACTER':
      return {
        affected: [...characterRefs, ...affectedScenes],
        preserved: [...worldRefs, ...allSceneRefs.filter((scene) => !affectedScenes.some((a) => a.id === scene.id))],
      };
    case 'WORLD':
      return { affected: [...worldRefs, ...affectedScenes], preserved: [...characterRefs, ...allSceneRefs.filter((scene) => !affectedScenes.some((a) => a.id === scene.id))] };
    case 'SCENE':
    case 'SHOT':
      return { affected: affectedScenes, preserved: [...characterRefs, ...worldRefs, ...allSceneRefs.filter((scene) => !affectedScenes.some((a) => a.id === scene.id))] };
    case 'AUDIO':
      return { affected: affectedScenes, preserved: [...characterRefs, ...worldRefs, ...allSceneRefs.filter((scene) => !affectedScenes.some((a) => a.id === scene.id))] };
    case 'VISUAL':
      return { affected: [...characterRefs, ...allSceneRefs], preserved: [...worldRefs] };
    default:
      return { affected: [allSceneRefs[0] ?? { type: 'PROJECT' }, ...affectedScenes], preserved: [...characterRefs, ...worldRefs] };
  }
}