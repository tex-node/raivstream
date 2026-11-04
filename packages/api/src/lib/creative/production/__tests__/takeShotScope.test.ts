import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Take addressing, shot-aware (2026-11-04).
 *
 * Phase 4 needs "direct shot 12C regenerates only that shot's take". The take key was
 * (projectId, sceneId, kind, takeNumber) with no shotId, so two shots in one scene collided.
 *
 * The nullable case is the subtle half: every existing row has shotId = NULL, and Postgres
 * treats NULL as distinct in a unique index — so a plain five-column unique would have ALLOWED
 * two scene-level takes to share a takeNumber, silently weakening the old guarantee. The
 * constraint is therefore two PARTIAL indexes, and these tests pin both halves.
 */

const MIGRATION_CANDIDATES = [
  join(__dirname, '../../../../../../../packages/database/migrations/20261104090000_creative_take_shot_scope/migration.sql'),
  join(process.cwd(), '../../packages/database/migrations/20261104090000_creative_take_shot_scope/migration.sql'),
  join(process.cwd(), 'packages/database/migrations/20261104090000_creative_take_shot_scope/migration.sql'),
];
const MIGRATION = MIGRATION_CANDIDATES.find((path) => existsSync(path));
if (!MIGRATION) throw new Error(`migration not found; tried:\n${MIGRATION_CANDIDATES.join('\n')}`);

/** The slot a take occupies. NULL shotId means a scene-level take. */
export function takeSlot(input: {
  projectId: string;
  sceneId: string;
  shotId?: string | null;
  kind: string;
  takeNumber: number;
}): string {
  return [input.projectId, input.sceneId, input.shotId ?? '(scene)', input.kind, String(input.takeNumber)].join('|');
}

describe('two shots in one scene can each hold take 1', () => {
  it('different shots at the same take number occupy different slots', () => {
    const a = takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', shotId: 'shot-a', kind: 'IMAGE', takeNumber: 1 });
    const b = takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', shotId: 'shot-b', kind: 'IMAGE', takeNumber: 1 });
    expect(a).not.toBe(b);
  });

  it('the same shot at the same take number collides', () => {
    const a = takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', shotId: 'shot-a', kind: 'IMAGE', takeNumber: 1 });
    const b = takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', shotId: 'shot-a', kind: 'IMAGE', takeNumber: 1 });
    expect(a).toBe(b);
  });

  it('scene-level takes ignore the shot dimension but still split by take number', () => {
    const first = takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', kind: 'IMAGE', takeNumber: 1 });
    const second = takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', kind: 'IMAGE', takeNumber: 2 });
    expect(first).toBe(takeSlot({ projectId: 'p1', sceneId: 'SCENE_01', shotId: null, kind: 'IMAGE', takeNumber: 1 }));
    expect(first).not.toBe(second);
  });
});

describe('the migration carries both partial indexes, not a single five-column unique', () => {
  const sql = readFileSync(MIGRATION!, 'utf8');

  it('drops the old constraint and creates the scene-level partial index', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "creative_produced_assets_projectId_sceneId_kind_takeNumber_key"');
    expect(sql).toContain('creative_produced_assets_scene_take_key');
    expect(sql).toMatch(/creative_produced_assets_scene_take_key"[\s\S]*?WHERE "shotId" IS NULL/);
  });

  it('creates the shot-level partial index including shotId', () => {
    expect(sql).toContain('creative_produced_assets_shot_take_key');
    expect(sql).toMatch(/creative_produced_assets_shot_take_key"[\s\S]*?\("projectId", "sceneId", "shotId", kind, "takeNumber"\)/);
    expect(sql).toMatch(/creative_produced_assets_shot_take_key"[\s\S]*?WHERE "shotId" IS NOT NULL/);
  });
});