import type { CreativeProductionPlanState } from '../production/plan';
import { interpretDirective } from './interpreter';
import type { DirectiveInternal } from './types';

/**
 * Shot-scoped directives (2026-11-08).
 *
 * `DIRECTIVE_SCOPES` already carried `'SHOT'` - the enum was extended before anything resolved it.
 * This is the resolution and the routing: a directive naming a shot becomes a call to
 * `createNewTake({ shotId })`, the capability Phase 4 proved. No model call, no provider path, no
 * parallel take machinery.
 *
 * ACCEPTED FORMS, decided rather than inferred from the plan's "shot 12C":
 *   1. a full shot id       - "shot SCENE_01_SHOT_02"   (exact, case-insensitive)
 *   2. a scene + letter     - "shot 1B", "scene 1 shot b" -> scene 1, second shot
 *   3. a scene + number     - "shot 1.2"                -> scene 1, second shot
 * A bare "shot 2" is treated as scene 2, shot A, because scene numbers are how the workspace labels
 * them. Anything that matches none of these is refused, typed.
 */

export class UnknownShotError extends Error {
  readonly code = 'UNKNOWN_SHOT';
  constructor(readonly instruction: string) {
    super(`No shot in this plan matches the directive: "${instruction}".`);
    this.name = 'UnknownShotError';
  }
}

export interface ShotReference {
  sceneId: string;
  shotId: string;
}

const SHOT_TOKEN = /\bshot[\s#-]*([a-z0-9_.]+)\b/i;

export function resolveShotReference(plan: CreativeProductionPlanState, instruction: string): ShotReference | null {
  const match = instruction.match(SHOT_TOKEN);
  if (!match) return null;
  const token = match[1].toLowerCase();

  const shots = plan.scenes.flatMap((scene) =>
    (scene.shots ?? []).map((shot) => ({ sceneId: scene.sceneId, shotId: shot.shotId })),
  );

  // 1. full shot id
  const byId = shots.find((shot) => shot.shotId.toLowerCase() === token);
  if (byId) return byId;

  // 2. scene + letter (1b) and 3. scene + number (1.2)
  const sceneShot = token.match(/^(\d+)[._-]?([a-z0-9])$/);
  if (sceneShot) {
    const sceneNumber = Number(sceneShot[1]);
    const scene = plan.scenes[sceneNumber - 1];
    if (!scene) return null;
    const selector = sceneShot[2];
    const letterIndex = selector.charCodeAt(0) - 96; // a -> 1
    const index = /\d/.test(selector) ? Number(selector) : letterIndex;
    const shot = (scene.shots ?? [])[index - 1];
    return shot ? { sceneId: scene.sceneId, shotId: shot.shotId } : null;
  }

  // a bare scene number: scene N, first shot
  if (/^\d+$/.test(token)) {
    const scene = plan.scenes[Number(token) - 1];
    const shot = scene?.shots?.[0];
    return scene && shot ? { sceneId: scene.sceneId, shotId: shot.shotId } : null;
  }

  return null;
}

export interface ShotDirectiveResult {
  directive: DirectiveInternal;
  shot: ShotReference;
}

/**
 * Interpret a directive and resolve its shot. Returns the directive with scope SHOT and the
 * resolved reference, or throws `UnknownShotError` when the sentence names a shot the plan lacks.
 */
export function interpretShotDirective(plan: CreativeProductionPlanState, instruction: string): ShotDirectiveResult {
  const directive = interpretDirective(instruction, plan);
  const shot = resolveShotReference(plan, instruction);
  if (!shot) {
    throw new UnknownShotError(instruction);
  }
  return {
    directive: {
      ...directive,
      scope: 'SHOT',
      intent: `regenerate one shot's take (${shot.shotId})`,
      changes: [{ scope: 'SHOT', field: 'shotId', to: shot.shotId } as never],
      affectedSceneIndices: [Math.max(0, plan.scenes.findIndex((scene) => scene.sceneId === shot.sceneId))],
    },
    shot,
  };
}

export interface ShotTakeDeps {
  createNewTake: (input: { shotId: string; sceneId: string }) => Promise<unknown>;
}

/**
 * Route a shot-scoped directive to the existing take capability. `createNewTake` is injected so the
 * routing can be asserted directly, and so the sibling-shot proof can run against a fixture.
 */
export async function applyShotDirective(
  deps: ShotTakeDeps,
  plan: CreativeProductionPlanState,
  instruction: string,
): Promise<ShotDirectiveResult & { result: unknown }> {
  const interpreted = interpretShotDirective(plan, instruction);
  const result = await deps.createNewTake({ shotId: interpreted.shot.shotId, sceneId: interpreted.shot.sceneId });
  return { ...interpreted, result };
}
