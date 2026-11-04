import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A unique constraint must carry its scope (2026-11-04).
 *
 * The take model shipped `@@unique([sceneId, kind, takeNumber])` and the migration could not
 * apply: `sceneId` is only unique WITHIN a project, so two projects that both have `SCENE_04`
 * collided - `Key ("sceneId", kind, "takeNumber")=(SCENE_04, IMAGE, 1) is duplicated`. It cost a
 * migration retry to find, and the shape would silently re-inherit onto the next table.
 *
 * This test pins the corrected constraint and closes the class for every project-scoped model.
 */

const CANDIDATES = [
  join(__dirname, '../../../../../../packages/database/schema.prisma'),
  join(process.cwd(), '../../packages/database/schema.prisma'),
  join(process.cwd(), 'packages/database/schema.prisma'),
];

function readSchema(): string {
  const found = CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error(`schema.prisma not found; tried:\n${CANDIDATES.join('\n')}`);
  return readFileSync(found, 'utf8');
}

interface ModelBlock {
  name: string;
  body: string;
}

function models(schema: string): ModelBlock[] {
  return [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map((match) => ({
    name: match[1] as string,
    body: match[2] as string,
  }));
}

describe('unique constraints carry their scope', () => {
  const schema = readSchema();
  const blocks = models(schema);

  it('CreativeProducedAsset takes are unique per project, not per scene alone', () => {
    const model = blocks.find((block) => block.name === 'CreativeProducedAsset');
    expect(model, 'CreativeProducedAsset not found in schema').toBeDefined();
    expect(model!.body).toContain('@@unique([projectId, sceneId, kind, takeNumber])');
    expect(model!.body).not.toContain('@@unique([sceneId, kind, takeNumber])');
  });

  it('a unique constraint keyed on sceneId carries projectId — or is a recorded exception', () => {
    // `sceneId` is only unique WITHIN a project, so a unique key that contains it without
    // `projectId` cannot hold: that is the exact shape that made the take migration
    // unappliable (`SCENE_04` exists in more than one project).
    //
    // The two StorySceneAsset rows below are the same class of defect, pre-existing, in the
    // story take model. They are recorded rather than fixed here so this list stays
    // shrink-only: a NEW violation fails the test, and removing one of these fails it too.
    // EMPTY as of 2026-11-04: StorySceneAsset's two keys were scoped to projectId in both the
    // schema and the database (migration 20261104020000_story_scene_asset_scope). The list
    // stays because it is the mechanism: a new violation must be added deliberately, and the
    // fix of an existing one shows up as a failing test until the entry is removed.
    const RECORDED_EXCEPTIONS: string[] = [];

    const violations: string[] = [];
    for (const block of blocks) {
      const hasProjectId = /^\s*projectId\s+String/m.test(block.body);
      if (!hasProjectId) continue;
      for (const unique of block.body.matchAll(/@@unique\(\[([^\]]+)\]\)/g)) {
        const fields = (unique[1] as string).split(',').map((field) => field.trim());
        if (fields.includes('sceneId') && !fields.includes('projectId')) {
          violations.push(`${block.name}: @@unique([${fields.join(', ')}])`);
        }
      }
    }

    expect(violations.sort()).toEqual([...RECORDED_EXCEPTIONS].sort());
  });
});