import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logPreProjectStage, logStage } from '../stageLog';

/**
 * The gate is the line, so the line's shape is the contract.
 *
 * Uses a spy rather than grepping stdout: an assertion about what a run *should*
 * print, checked against what the code actually emits.
 */
describe('creative stage lines', () => {
  // The spy is created per test: this repo's vitest config restores mocks between
  // tests, so a describe-scope spy stops recording after the first one.
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it('names the project, stage and status', () => {
    logStage('proj-1', 'plan', 'start');
    expect(spy).toHaveBeenCalledWith('[creative.stage] project=proj-1 stage=plan status=start');
  });

  it('carries stage-specific detail as key=value pairs', () => {
    logStage('proj-1', 'director', 'ok', { affectedSceneIds: ['SCENE_02'], impact: 'LOCAL' });
    expect(spy).toHaveBeenCalledWith(
      '[creative.stage] project=proj-1 stage=director status=ok affectedSceneIds=["SCENE_02"] impact=LOCAL',
    );
  });

  it('identifies pre-project stages by request id, never by a fabricated project id', () => {
    logPreProjectStage('req-123', 'intent', 'ok', { projectType: 'STORY' });
    const line = spy.mock.calls.at(-1)?.[0] as string;
    expect(line).toContain('request=req-123');
    expect(line).toContain('stage=intent');
    expect(line).not.toContain('project=');
  });

  it('bible lines join to the created project through the same request id', () => {
    logPreProjectStage('req-123', 'bible', 'ok', { projectId: 'proj-1' });
    const line = spy.mock.calls.at(-1)?.[0] as string;
    expect(line).toContain('request=req-123');
    expect(line).toContain('stage=bible');
    // The project id appears as DETAIL, not as the identity of the line.
    expect(line).toContain('projectId=proj-1');
  });
});
