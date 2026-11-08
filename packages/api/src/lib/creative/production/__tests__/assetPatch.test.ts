import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { failurePatch, generatingPatch, readyPatch } from '../assetPatch';

/**
 * Three states on a produced asset (2026-11-08).
 *
 * SCENE_04's rows were READY with URLs and still carried the previous run's error text, because the
 * success update wrote status, url and provider but never cleared `errorMessage`. A row that
 * succeeded must not also say why it failed.
 *
 * 97 places read `errorMessage` (diagnostics among them), so this is a reporting defect rather
 * than a cosmetic one.
 */

describe('success clears the failure it replaced', () => {
  it('a READY patch carries a null error', () => {
    const patch = readyPatch({ assetUrl: 'https://cdn.example/a.png', provider: 'internal' });
    expect(patch.status).toBe('READY');
    expect(patch.errorMessage).toBeNull();
    expect(patch.assetUrl).toBe('https://cdn.example/a.png');
  });

  it('the null is explicit, so an update cannot leave the old message in place', () => {
    const patch = readyPatch({ assetUrl: 'https://cdn.example/a.png' });
    expect('errorMessage' in patch).toBe(true);
    expect(patch.errorMessage).toBeNull();
  });
});

describe('failure writes its own reason', () => {
  it('a failure patch carries the new reason', () => {
    const patch = failurePatch('Forbidden');
    expect(patch.status).toBe('FAILED');
    expect(patch.errorMessage).toBe('Forbidden');
  });

  it('a very long reason is trimmed rather than rejected', () => {
    expect(failurePatch('x'.repeat(900)).errorMessage.length).toBe(500);
  });
});

describe('mid-run keeps the prior error', () => {
  it('a GENERATING patch does not touch errorMessage', () => {
    const patch = generatingPatch();
    expect(patch).toEqual({ status: 'GENERATING' });
    expect('errorMessage' in patch).toBe(false);
  });
});

describe('the runner uses the ready patch on success', () => {
  const source = readFileSync(join(__dirname, '..', 'runner.ts'), 'utf8');

  it('the success update goes through readyPatch', () => {
    expect(source).toContain('data: readyPatch({ assetUrl: media.assetUrl');
  });

  it('no success update sets READY without the patch', () => {
    expect(source).not.toMatch(/data: \{ status: 'READY'/);
  });
});
