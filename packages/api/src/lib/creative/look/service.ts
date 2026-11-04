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
