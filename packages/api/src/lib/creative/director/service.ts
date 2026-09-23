/**
 * Raivstream 5.0 — DirectorService (Slice 4B).
 *
 * DIRECT / EXPLORE / REVIEW. Central invariant: every meaningful directive
 * produces CHANGE + PRESERVE. The Director does NOT generate — it resolves
 * intent → change/preserve → impact → version → hands to ProductionService
 * (the existing runner), which is the only layer that touches generation.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeDirectorEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { CreativeBibleState } from '../shared/types';
import type { CreativeProductionPlanState } from '../production/plan';
import { interpretDirective } from './interpreter';
import { resolveEntities } from './resolver';
import { analyzeImpact, planSceneIds } from './impact';
import { approvalService } from '../approval/service';
import type { DirectorDecision, DirectiveInternal } from './types';
import type { EntityReference } from '../review/types';

type VersionRow = { id: string; projectId: string; versionNumber: number; label: string | null; snapshot: unknown; createdAt: Date };

function buildDecision(
  instruction: string,
  interpretation: DirectiveInternal,
  affected: EntityReference[],
  preserved: EntityReference[],
  impact: ReturnType<typeof analyzeImpact>,
  affectedSceneIds: string[],
  explanation?: string,
): DirectorDecision {
  return {
    interpretation: explanation ?? interpretation.intent,
    directive: { instruction, intent: interpretation.intent, scope: interpretation.scope },
    affectedEntities: affected,
    preservedEntities: preserved,
    preserves: interpretation.preserves,
    affectedSceneIds,
    creativeChanges: interpretation.changes,
    productionChanges: impact.downstream.map((description) => ({ target: 'scenes', description })),
    continuityImplications: impact.affectedSceneIndices.length > 1
      ? [{ type: 'continuity', description: 'Affected scenes must keep last-frame continuity with unaffected neighbors.' }]
      : [],
    approvalRequired: true,
    executionPlan: interpretation.executionPlan,
    impact: impact.impact,
  };
}

async function snapshotVersion(prisma: PrismaClient, projectId: string, state: Record<string, unknown>, label: string): Promise<VersionRow> {
  const latest = await prisma.creativeVersion.findFirst({ where: { projectId }, orderBy: { versionNumber: 'desc' } });
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const version = await prisma.creativeVersion.create({
    data: { projectId, versionNumber, label, snapshot: state as never },
  });
  await prisma.creativeProject.update({ where: { id: projectId }, data: { currentVersionId: version.id } });
  // Material creative change → invalidate any prior approvals (never leave a
  // previously approved version silently approved).
  await approvalService.invalidateProjectApprovals(prisma, projectId);
  return { id: version.id, projectId, versionNumber, label, snapshot: version.snapshot, createdAt: version.createdAt };
}

function currentState(plan: CreativeProductionPlanState, bible: CreativeBibleState | null, project: { projectType: string; title: string }): Record<string, unknown> {
  return { plan, bible, projectType: project.projectType, title: project.title, capturedAt: new Date().toISOString() };
}

/** Apply a directive's semantic change to the plan/bible (never generates). */
async function applyChangeToCreativeState(
  prisma: PrismaClient,
  input: { projectId: string; plan: CreativeProductionPlanState; bible: CreativeBibleState | null; changes: DirectiveInternal['changes']; affectedSceneIndices: number[] },
): Promise<void> {
  const { changes, affectedSceneIndices } = input;
  const plan = { ...input.plan, scenes: input.plan.scenes.map((scene) => ({ ...scene, shots: scene.shots.map((shot) => ({ ...shot })) })) };

  for (const change of changes) {
    if (change.field === 'ending') {
      const index = affectedSceneIndices[affectedSceneIndices.length - 1];
      if (plan.scenes[index]) {
        plan.scenes[index] = { ...plan.scenes[index], beat: `${String(change.to)} ending`, narration: `A ${String(change.to)} close to the story.` };
      }
    } else if (change.field === 'pacing.opening') {
      if (plan.scenes[0]) plan.scenes[0] = { ...plan.scenes[0], beat: 'fast opening', description: `${plan.scenes[0].description} Moves quickly.` };
    } else if (change.field === 'lighting') {
      for (const index of affectedSceneIndices) {
        if (plan.scenes[index]) {
          plan.scenes[index] = {
            ...plan.scenes[index],
            shots: plan.scenes[index].shots.map((shot) => ({ ...shot, visualDirection: 'warm, gentle lighting' })),
          };
        }
      }
    } else if (change.field.startsWith('state.') || change.field === 'wardrobe') {
      // Character-state changes live on the bible characters.
      const bibleCharacters: Array<Record<string, unknown>> = ((input.bible?.characters ?? []) as Array<Record<string, unknown>>).map((c) => ({ ...c }));
      for (const character of bibleCharacters) {
        const state = (character.state as Record<string, unknown>) ?? {};
        state[change.field.replace('state.', '')] = change.to;
        character.state = state;
      }
      await prisma.creativeBible.upsert({
        where: { projectId: input.projectId },
        update: { characters: bibleCharacters as never, version: { increment: 1 } },
        create: { projectId: input.projectId, characters: bibleCharacters as never },
      });
    }
  }

  // Persist the (possibly mutated) plan as a new plan version.
  await prisma.creativeProductionPlan.upsert({
    where: { projectId: input.projectId },
    update: { plan: plan as never, version: { increment: 1 } },
    create: { projectId: input.projectId, version: 1, plan: plan as never },
  });
}

export class DirectorService {
  async direct(prisma: PrismaClient, input: { projectId: string; userId: string; instruction: string }): Promise<{ decision: DirectorDecision; version: VersionRow; directiveId: string }> {
    if (!isCreativeDirectorEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 director is not enabled.');
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, bible: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    if (!project.productionPlan) throw new CreativeError('PLAN_NOT_APPROVED', 'Build and approve a plan before directing.');
    const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
    const bible = project.bible as unknown as CreativeBibleState | null;

    const interpretation = interpretDirective(input.instruction, plan);
    const resolved = resolveEntities({ plan, bible, sceneIndices: interpretation.affectedSceneIndices, scope: interpretation.scope });
    const impact = analyzeImpact({ declared: interpretation.impact, sceneIndices: interpretation.affectedSceneIndices, totalScenes: plan.scenes.length });
    const decision = buildDecision(input.instruction, interpretation, resolved.affected, resolved.preserved, impact, planSceneIds(plan, interpretation.affectedSceneIndices));

    const version = await snapshotVersion(prisma, project.id, currentState(plan, bible, project), `Direct: ${interpretation.intent}`);
    const directive = await prisma.creativeDirective.create({
      data: {
        projectId: project.id,
        versionId: version.id,
        mode: interpretation.mode,
        instruction: input.instruction,
        interpretation: interpretation.intent,
        change: interpretation.changes as never,
        preserve: interpretation.preserves as never,
        impact: interpretation.impact as never,
        scopes: [interpretation.scope] as never,
        approvalRequired: true,
        executionPlan: interpretation.executionPlan as never,
      },
    });

    return { decision, version, directiveId: directive.id };
  }

  /**
   * PROPOSE — the "mind-reader moment". Interpret a directive and return the
   * change/preserve/impact WITHOUT persisting anything or creating a version.
   * This is what powers the closed Review → Director loop: the creator sees what
   * Raivstream understood before committing.
   */
  async propose(prisma: PrismaClient, input: { projectId: string; userId: string; instruction: string }): Promise<{ decision: DirectorDecision }> {
    if (!isCreativeDirectorEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 director is not enabled.');
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, bible: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    if (!project.productionPlan) throw new CreativeError('PLAN_NOT_APPROVED', 'Build a plan before directing.');
    const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
    const bible = project.bible as unknown as CreativeBibleState | null;
    const interpretation = interpretDirective(input.instruction, plan);
    const resolved = resolveEntities({ plan, bible, sceneIndices: interpretation.affectedSceneIndices, scope: interpretation.scope });
    const impact = analyzeImpact({ declared: interpretation.impact, sceneIndices: interpretation.affectedSceneIndices, totalScenes: plan.scenes.length });
    return { decision: buildDecision(input.instruction, interpretation, resolved.affected, resolved.preserved, impact, planSceneIds(plan, interpretation.affectedSceneIndices)) };
  }

  /**
   * APPLY INSTRUCTION — one call for the "Fix it" moment: propose → snapshot a
   * version → apply → mark only the affected scenes for regeneration. Returns
   * the decision so the UI can show change/preserve/impact and what it will
   * regenerate.
   */
  async applyInstruction(
    prisma: PrismaClient,
    input: { projectId: string; userId: string; instruction: string },
  ): Promise<{ applied: boolean; affectedSceneIds: string[]; impact: DirectorDecision['impact']; directiveId: string; versionId: string; decision: DirectorDecision }> {
    const directed = await this.direct(prisma, input);
    const applied = await this.apply(prisma, { projectId: input.projectId, userId: input.userId, directiveId: directed.directiveId });
    return {
      applied: applied.applied,
      affectedSceneIds: applied.affectedSceneIds,
      impact: applied.impact,
      directiveId: directed.directiveId,
      versionId: directed.version.id,
      decision: directed.decision,
    };
  }

  async explore(prisma: PrismaClient, input: { projectId: string; userId: string; instruction: string }): Promise<{ decision: DirectorDecision; versions: VersionRow[] }> {
    if (!isCreativeDirectorEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 director is not enabled.');
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, bible: true },
    });
    if (!project || !project.productionPlan) throw new CreativeError('PLAN_NOT_APPROVED', 'Build and approve a plan before exploring.');
    const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
    const bible = project.bible as unknown as CreativeBibleState | null;
    const interpretation = interpretDirective(input.instruction, plan);
    const resolved = resolveEntities({ plan, bible, sceneIndices: interpretation.affectedSceneIndices, scope: interpretation.scope });
    const impact = analyzeImpact({ declared: interpretation.impact, sceneIndices: interpretation.affectedSceneIndices, totalScenes: plan.scenes.length });
    const decision = buildDecision(input.instruction, interpretation, resolved.affected, resolved.preserved, impact, planSceneIds(plan, interpretation.affectedSceneIndices));

    const count = interpretation.exploreCount ?? 3;
    const versions: VersionRow[] = [];
    for (let index = 0; index < count; index += 1) {
      const variationPlan: CreativeProductionPlanState = {
        ...plan,
        scenes: plan.scenes.map((scene, sceneIndex) =>
          sceneIndex === interpretation.affectedSceneIndices[0]
            ? { ...scene, beat: `${index === 0 ? 'Hopeful' : index === 1 ? 'Bittersweet' : 'Open'} ending`, narration: `Ending variation ${String.fromCharCode(65 + index)} — a distinct close.` }
            : scene),
      };
      versions.push(await snapshotVersion(prisma, project.id, currentState(variationPlan, bible, project), `Ending ${String.fromCharCode(65 + index)}`));
    }
    await prisma.creativeDirective.create({
      data: {
        projectId: project.id,
        mode: 'EXPLORE',
        instruction: input.instruction,
        interpretation: interpretation.intent,
        change: interpretation.changes as never,
        preserve: interpretation.preserves as never,
        impact: interpretation.impact as never,
        scopes: [interpretation.scope] as never,
        approvalRequired: true,
        executionPlan: interpretation.executionPlan as never,
      },
    });
    return { decision, versions };
  }

  /** Apply a directive: mutate the semantic plan/bible and mark affected scenes for targeted regeneration. */
  async apply(prisma: PrismaClient, input: { projectId: string; userId: string; directiveId: string }): Promise<{ applied: boolean; affectedSceneIds: string[]; impact: DirectorDecision['impact'] }> {
    const directive = await prisma.creativeDirective.findFirst({ where: { id: input.directiveId, projectId: input.projectId } });
    if (!directive) throw new CreativeError('PROJECT_NOT_FOUND', 'Directive not found.');
    const project = await prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: input.userId }, include: { productionPlan: true, bible: true } });
    if (!project || !project.productionPlan) throw new CreativeError('PLAN_NOT_APPROVED', 'No plan to apply to.');
    const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
    const bible = project.bible as unknown as CreativeBibleState | null;
    // Re-interpret the directive against the CURRENT plan so affected scenes are
    // deterministic and reflect the latest creative state.
    const interpretation = interpretDirective(directive.instruction, plan);
    const impact = analyzeImpact({ declared: interpretation.impact, sceneIndices: interpretation.affectedSceneIndices, totalScenes: plan.scenes.length });
    const sceneIds = planSceneIds(plan, impact.affectedSceneIndices);

    // Targeted production: drop produced assets for affected scenes so the
    // resumable runner regenerates ONLY them (unaffected stay).
    if (sceneIds.length > 0) {
      await prisma.creativeProducedAsset.deleteMany({ where: { projectId: project.id, sceneId: { in: sceneIds } } });
    }
    await applyChangeToCreativeState(prisma, { projectId: project.id, plan, bible, changes: interpretation.changes, affectedSceneIndices: impact.affectedSceneIndices });
    await prisma.creativeMemory.create({
      data: { projectId: project.id, kind: 'DIRECTION', content: { instruction: directive.instruction, changes: interpretation.changes, affectedSceneIds: sceneIds } as never },
    });
    return { applied: true, affectedSceneIds: sceneIds, impact: impact.impact };
  }

  async versions(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<VersionRow[]> {
    const project = await prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: input.userId } });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const rows = await prisma.creativeVersion.findMany({ where: { projectId: project.id }, orderBy: { versionNumber: 'desc' }, take: 20 });
    return rows.map((row) => ({ id: row.id, projectId: row.projectId, versionNumber: row.versionNumber, label: row.label, snapshot: row.snapshot, createdAt: row.createdAt }));
  }
}

export const directorService = new DirectorService();