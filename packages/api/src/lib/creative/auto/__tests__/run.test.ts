import { describe, expect, it, vi } from 'vitest';
import { AUTO_DEFAULT_CEILING, runAutoProduction, type AutoProductionDeps } from '../run';

/**
 * The auto path, end to end (Phase 7).
 *
 * Drives the composition the two shipped pieces never had: interpret -> decide -> create -> plan ->
 * produce under a ceiling. Every dependency is a spy, so the tests assert ORDER and CONTRACT rather
 * than a database: in particular that a blocked question stops before a project exists and before
 * any charge.
 */

const interpretation = {
  projectType: 'STORY',
  explicit: { genre: 'thriller', durationSeconds: 30 },
  inferred: {},
  summary: 'A lighthouse keeper finds a lost bird',
  uncertain: [],
  questions: [
    { id: 'tone', prompt: 'What tone?', options: ['quiet', 'loud'], canAutoDecide: true },
    { id: 'ending', prompt: 'How should it end?', options: ['hopeful', 'bleak'], canAutoDecide: true },
  ],
} as never;

function deps(overrides: Partial<AutoProductionDeps> = {}): AutoProductionDeps & {
  interpret: ReturnType<typeof vi.fn>;
  createProject: ReturnType<typeof vi.fn>;
  buildPlan: ReturnType<typeof vi.fn>;
  runProduction: ReturnType<typeof vi.fn>;
} {
  return {
    interpret: vi.fn(async () => interpretation),
    createProject: vi.fn(async () => ({ projectId: 'proj_1' })),
    buildPlan: vi.fn(async () => ({ sceneCount: 6 })),
    runProduction: vi.fn(async () => ({ generated: 6, failed: 0, status: 'COMPLETED' })),
    ...overrides,
  } as never;
}

describe('a single sentence becomes a capped production', () => {
  it('auto-decides the questions, creates the project, plans it, and runs under the ceiling', async () => {
    const d = deps();
    const result = await runAutoProduction(d, { userId: 'u1', text: 'A lighthouse keeper finds a lost bird' });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(result.projectId).toBe('proj_1');
    expect(result.ceiling).toBe(AUTO_DEFAULT_CEILING);
    expect(result.sceneCount).toBe(6);
    expect(result.generated).toBe(6);
    expect(result.decisions.map((dec) => dec.id)).toEqual(['tone', 'ending']);
  });

  it('passes the ceiling explicitly to production - never null on the auto path', async () => {
    const d = deps();
    await runAutoProduction(d, { userId: 'u1', text: 'anything' });
    expect(d.runProduction).toHaveBeenCalledWith({ projectId: 'proj_1', creditCeiling: AUTO_DEFAULT_CEILING });
  });

  it('honours an explicit ceiling when the caller sets one', async () => {
    const d = deps();
    const result = await runAutoProduction(d, { userId: 'u1', text: 'anything', creditCeiling: 160 });
    expect(result.status === 'completed' && result.ceiling).toBe(160);
    expect(d.runProduction).toHaveBeenCalledWith({ projectId: 'proj_1', creditCeiling: 160 });
  });

  it('runs the steps in order: interpret, create, plan, produce', async () => {
    const order: string[] = [];
    const d = deps({
      interpret: vi.fn(async () => {
        order.push('interpret');
        return interpretation;
      }) as never,
      createProject: vi.fn(async () => {
        order.push('create');
        return { projectId: 'proj_1' };
      }) as never,
      buildPlan: vi.fn(async () => {
        order.push('plan');
        return { sceneCount: 6 };
      }) as never,
      runProduction: vi.fn(async () => {
        order.push('produce');
        return { generated: 6, failed: 0, status: 'COMPLETED' };
      }) as never,
    });
    await runAutoProduction(d, { userId: 'u1', text: 'anything' });
    expect(order).toEqual(['interpret', 'create', 'plan', 'produce']);
  });
});

describe('a blocked question stops the flow before anything is spent', () => {
  const blocked = {
    ...(interpretation as Record<string, unknown>),
    questions: [
      { id: 'tone', prompt: 'What tone?', options: ['quiet'], canAutoDecide: true },
      { id: 'rights', prompt: 'Do you own these likenesses?', options: ['yes', 'no'], canAutoDecide: false },
    ],
  } as never;

  it('returns blocked with the question named, and creates nothing', async () => {
    const d = deps({ interpret: vi.fn(async () => blocked) as never });
    const result = await runAutoProduction(d, { userId: 'u1', text: 'anything' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.blockedBy).toEqual(['rights']);
    expect(result.questions).toEqual([{ id: 'rights', prompt: 'Do you own these likenesses?' }]);
    expect(d.createProject).not.toHaveBeenCalled();
    expect(d.buildPlan).not.toHaveBeenCalled();
    expect(d.runProduction).not.toHaveBeenCalled();
  });

  it('still reports the decisions it could make, so the creator is not asked twice', async () => {
    const d = deps({ interpret: vi.fn(async () => blocked) as never });
    const result = await runAutoProduction(d, { userId: 'u1', text: 'anything' });
    expect(result.status === 'blocked' && result.decisions.map((dec) => dec.id)).toEqual(['tone']);
  });
});
