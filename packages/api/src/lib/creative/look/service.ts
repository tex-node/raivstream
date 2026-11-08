import type { PrismaClient } from '@raivstream/database';
import { buildLook, lookToPrompt, type CinematicLook } from './look';

/**
 * Cinematic look persistence (Phase 5).
 *
 * A look is saved under a name, scoped to its project. The two operations that can collide -
 * save and rename - return a typed conflict rather than letting a unique-violation stack escape:
 * a duplicate name is a decision the caller has to make (overwrite? pick another name?), not a
 * database error that reads like a bug.
 */

export class LookNameConflictError extends Error {
  readonly code = 'LOOK_NAME_CONFLICT';
  constructor(
    readonly projectId: string,
    readonly name: string,
    readonly operation: 'save' | 'rename',
  ) {
    super(`A look named "${name}" already exists in project ${projectId}.`);
    this.name = 'LookNameConflictError';
  }
}

export interface StoredLook extends CinematicLook {
  id: string;
  projectId: string;
}

type LookRow = {
  id: string;
  projectId: string;
  name: string;
  lens: number;
  movement: string;
  lighting: string;
  grade: string;
  resolution: number;
};

function toLook(row: LookRow): StoredLook {
  return {
    id: row.id,
    projectId: row.projectId,
    ...buildLook({
      name: row.name,
      lens: row.lens as CinematicLook['lens'],
      movement: row.movement as CinematicLook['movement'],
      lighting: row.lighting as CinematicLook['lighting'],
      grade: row.grade as CinematicLook['grade'],
      resolution: row.resolution as CinematicLook['resolution'],
    }),
  };
}

/** Save a look under a name. A duplicate name in the same project is a typed conflict. */
export async function saveLook(
  prisma: PrismaClient,
  input: { projectId: string; look: Partial<CinematicLook>; overwrite?: boolean },
): Promise<StoredLook> {
  const look = buildLook(input.look);
  const existing = await prisma.cinematicLook.findFirst({
    where: { projectId: input.projectId, name: look.name },
    select: { id: true },
  });
  if (existing && !input.overwrite) {
    throw new LookNameConflictError(input.projectId, look.name, 'save');
  }
  const row = existing
    ? await prisma.cinematicLook.update({
        where: { id: existing.id },
        data: { lens: look.lens, movement: look.movement, lighting: look.lighting, grade: look.grade, resolution: look.resolution },
        select: { id: true, projectId: true, name: true, lens: true, movement: true, lighting: true, grade: true, resolution: true },
      })
    : await prisma.cinematicLook.create({
        data: { projectId: input.projectId, name: look.name, lens: look.lens, movement: look.movement, lighting: look.lighting, grade: look.grade, resolution: look.resolution },
        select: { id: true, projectId: true, name: true, lens: true, movement: true, lighting: true, grade: true, resolution: true },
      });
  return toLook(row as LookRow);
}

/** Rename an existing look. Renaming onto a name that already exists is the same conflict. */
export async function renameLook(
  prisma: PrismaClient,
  input: { projectId: string; id: string; name: string },
): Promise<StoredLook> {
  const nextName = buildLook({ name: input.name }).name;
  const clash = await prisma.cinematicLook.findFirst({
    where: { projectId: input.projectId, name: nextName, NOT: { id: input.id } },
    select: { id: true },
  });
  if (clash) {
    throw new LookNameConflictError(input.projectId, nextName, 'rename');
  }
  const row = await prisma.cinematicLook.update({
    where: { id: input.id },
    data: { name: nextName },
    select: { id: true, projectId: true, name: true, lens: true, movement: true, lighting: true, grade: true, resolution: true },
  });
  return toLook(row as LookRow);
}

/** Every look in a project, oldest first. */
export async function listLooks(prisma: PrismaClient, projectId: string): Promise<StoredLook[]> {
  const rows = (await prisma.cinematicLook.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, projectId: true, name: true, lens: true, movement: true, lighting: true, grade: true, resolution: true },
  })) as LookRow[];
  return rows.map(toLook);
}

/**
 * The consumer: a production asks for a look by name and gets the prompt fragment.
 *
 * This is the replacement point. Before it, a look could only exist as an argument someone
 * retyped per production; now the production reads it back from the project and applies it
 * without re-entering a field.
 */
export async function lookPromptForProduction(
  prisma: PrismaClient,
  input: { projectId: string; name: string },
): Promise<{ look: StoredLook; fragment: string } | null> {
  const row = (await prisma.cinematicLook.findFirst({
    where: { projectId: input.projectId, name: input.name },
    select: { id: true, projectId: true, name: true, lens: true, movement: true, lighting: true, grade: true, resolution: true },
  })) as LookRow | null;
  if (!row) return null;
  const look = toLook(row);
  return { look, fragment: lookToPrompt(look) };
}

/** Compose a look onto a prompt. Kept pure so the projection is testable without a database. */
export function composeWithLook(prompt: string, fragment: string): string {
  const trimmed = prompt.trim().replace(/\.$/, '');
  return `${trimmed}. ${fragment}.`;
}

/**
 * A permission failure reads like a decision, not a crash - the same reasoning as
 * LookNameConflictError. `side` names which end failed: the read (`source`) or the write (`target`).
 */
export class LookShareForbiddenError extends Error {
  readonly code = 'LOOK_SHARE_FORBIDDEN';
  constructor(
    readonly side: 'source' | 'target',
    readonly projectId: string,
  ) {
    super(`Sharing a look requires owning the ${side} project (${projectId}).`);
    this.name = 'LookShareForbiddenError';
  }
}

/**
 * Share a look between two projects (Phase 6).
 *
 * THE BOUNDARY LIVES HERE, not at a router: a guard that lives at the caller is a guard every
 * future caller can skip, and no caller exists today - which is exactly when the boundary is cheap
 * to place. Both directions are checked (reading a look out of a project is exfiltration; writing
 * one into a project is injection, and `overwrite` makes it destruction).
 *
 * POLICY, decided rather than assumed: **no cross-owner sharing, and no admin bypass at this
 * layer.** A look is a creative asset, and a boolean override in a service is a bypass any caller
 * can pass. If the platform ever needs a moderator to share across owners, that belongs in a router
 * with a role check and an audit record, and this function should then receive the resolved
 * decision rather than a flag it cannot verify.
 *
 * The refusal precedes the source read: a boundary that refuses after reading has already leaked.
 */
export async function shareLook(
  prisma: PrismaClient,
  input: { callerId: string; fromProjectId: string; name: string; toProjectId: string; overwrite?: boolean },
): Promise<StoredLook> {
  const projects = (await prisma.creativeProject.findMany({
    where: { id: { in: [input.fromProjectId, input.toProjectId] } },
    select: { id: true, userId: true },
  })) as Array<{ id: string; userId: string }>;

  const sourceProject = projects.find((project) => project.id === input.fromProjectId);
  if (!sourceProject || sourceProject.userId !== input.callerId) {
    throw new LookShareForbiddenError('source', input.fromProjectId);
  }
  const targetProject = projects.find((project) => project.id === input.toProjectId);
  if (!targetProject || targetProject.userId !== input.callerId) {
    throw new LookShareForbiddenError('target', input.toProjectId);
  }

  const source = await lookPromptForProduction(prisma, { projectId: input.fromProjectId, name: input.name });
  if (!source) {
    throw new Error(`No look named "${input.name}" in project ${input.fromProjectId}.`);
  }
  const { name, lens, movement, lighting, grade, resolution } = source.look;
  return saveLook(prisma, {
    projectId: input.toProjectId,
    look: { name, lens, movement, lighting, grade, resolution },
    ...(input.overwrite ? { overwrite: true } : {}),
  });
}
