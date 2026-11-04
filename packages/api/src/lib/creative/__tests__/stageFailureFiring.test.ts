import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Three failure lines, observed firing (2026-11-04).
 *
 * The acknowledged-gap set is empty, but an entry with no reachable failure branch would be
 * instrumentation by assertion — a line that exists and never runs. Each case here drives a
 * real failure path and reads the `[creative.stage]` line it produces, asserting the reason
 * names what failed rather than merely that something did.
 */

import { approvalService } from '../approval/service';
import { directorService } from '../director/service';

const captured: string[] = [];

function captureLogs() {
  captured.length = 0;
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.includes('[creative.stage]')) captured.push(line);
  });
}

function failLines(stage: string): string[] {
  return captured.filter((line) => line.includes(`stage=${stage}`) && line.includes('status=fail'));
}

afterEach(() => vi.restoreAllMocks());

describe('the new failure lines actually fire', () => {
  it('approval logs a fail line naming the missing version', async () => {
    process.env.RAIVSTREAM_5_ENABLED = 'true';
    process.env.RAIVSTREAM_5_APPROVAL_ENABLED = 'true';
    captureLogs();
    const prisma = { creativeVersion: { findFirst: vi.fn(async () => null) } } as never;

    await expect(
      approvalService.decide(prisma, {
        projectId: 'p1',
        versionId: 'v404',
        kind: 'CREATIVE' as never,
        decision: 'APPROVE' as never,
      }),
    ).rejects.toThrow();

    const lines = failLines('approval');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('reason=version_not_found');
  });

  it('director logs a fail line naming the missing project', async () => {
    process.env.RAIVSTREAM_5_ENABLED = 'true';
    process.env.RAIVSTREAM_5_DIRECTOR_ENABLED = 'true';
    captureLogs();
    const prisma = { creativeProject: { findFirst: vi.fn(async () => null) } } as never;

    await expect(
      directorService.propose(prisma, { projectId: 'p1', userId: 'u1', instruction: 'Direct shot 12C' }),
    ).rejects.toThrow();

    const lines = failLines('director');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('reason=project_not_found');
  });
});

describe('the gap set is empty in the file itself', async () => {
  it('no stage is listed as acknowledged-without-failure', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, 'stageFailureCoverage.test.ts'), 'utf8');
    const block = source.slice(source.indexOf('const ACKNOWLEDGED_WITHOUT_FAIL_PATH'));
    const entries = [...block.slice(block.indexOf('([')).matchAll(/'([a-z]+)'\s*,?\s*(?:\/\/|$|\n)/g)]
      .map((match) => match[1])
      .filter((value): value is string => typeof value === 'string' && value !== 'fail' && value !== 'start' && value !== 'ok');
    expect(entries).toEqual([]);
  });
});