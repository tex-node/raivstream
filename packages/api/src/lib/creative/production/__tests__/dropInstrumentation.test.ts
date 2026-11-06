import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dropReason } from '../moderationFallback';

/**
 * Instrumentation that survives (2026-11-06).
 *
 * The fourth auto run could not be interpreted: `dropped=0` proved nothing because the outer failure
 * handler overwrote `errorMessage` with the last error, erasing the SCENE_DROPPED marker written
 * earlier. A message string is a channel later code can clobber; a structured field is not.
 */

const RUNNER = readFileSync(join(__dirname, '..', 'runner.ts'), 'utf8');

describe('a drop is structured, not a message', () => {
  it('drops are pushed into a structured array with scene, kind and reason', () => {
    expect(RUNNER).toContain('const droppedAssets: Array<{ sceneId: string; kind: string; reason: string }> = [];');
    expect(RUNNER).toContain('droppedAssets.push({ sceneId: spec.sceneId, kind: spec.kind, reason: dropReason(spec.kind) })');
  });

  it('the structured field is persisted on the run row', () => {
    expect(RUNNER).toContain('...(droppedAssets.length > 0 ? { droppedAssets } : {})');
  });

  it('the failure handler no longer erases a drop reason', () => {
    expect(RUNNER).toContain('droppedScenes.has(spec.sceneId)');
    expect(RUNNER).toContain('? dropReason(spec.kind)');
  });
});

describe('a retry is observable without prompt text', () => {
  it('every retry increments a counter that is persisted', () => {
    expect(RUNNER).toContain('moderationRetries += 1');
    expect(RUNNER).toContain('moderationRetries,');
  });

  it('the retry log names the asset, kind, attempt, rewritten flag and length - and no text', () => {
    expect(RUNNER).toMatch(/\[creative\.moderation\] asset=\$\{asset\.id\} kind=\$\{spec\.kind\} attempt=\$\{attempt\} rewritten=true softenedChars=\$\{decision\.prompt\.length\}/);
    // no prompt content in the log line
    expect(RUNNER).not.toMatch(/creative\.moderation\][^`]*prompt=\$\{/);
  });
});

describe('the drop reason still distinguishes kinds', () => {
  it('names the kind', () => {
    expect(dropReason('VIDEO')).toContain('kind=VIDEO');
    expect(dropReason('IMAGE')).toContain('kind=IMAGE');
  });
});
