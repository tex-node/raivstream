import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * needsExtraction has a consumer (2026-11-12).
 *
 * The signal was returned by a read and consumed by nothing - the sixth instance of "built but not
 * wired", created by the session that consolidated five. These assertions pin the three guards that
 * make the deferred write safe, and the UI honesty rule that an unread story says so.
 */

const ROUTER = readFileSync(join(__dirname, '..', '..', '..', '..', 'packages', 'api', 'src', 'routers', 'story.ts'), 'utf8');
const SCREEN = readFileSync(join(__dirname, '..', 'components', 'mobile-handoff', 'StoryScreen.tsx'), 'utf8');

describe('the write is a client-triggered mutation, not a side effect of the read', () => {
  it('the mutation exists and is ownership-scoped', () => {
    expect(ROUTER).toContain('ensureStoryContract: protectedProcedure');
    const block = ROUTER.slice(ROUTER.indexOf('ensureStoryContract: protectedProcedure'));
    expect(block.slice(0, 700)).toContain('where: { id: input.projectId, userId: ctx.user.id }');
  });

  it('is idempotent - only chapters without a contract are considered', () => {
    const block = ROUTER.slice(ROUTER.indexOf('ensureStoryContract: protectedProcedure'));
    expect(block).toContain('chapter.storyContract === null || chapter.storyContract === undefined');
  });

  it('is bounded to one chapter per call', () => {
    const block = ROUTER.slice(ROUTER.indexOf('ensureStoryContract: protectedProcedure'));
    expect(block).toContain('const target = missing[0]');
    // One update, not a loop over every missing chapter.
    expect(block.slice(0, 2500)).not.toContain('for (');
  });

  it('the read itself still writes nothing', () => {
    const workspace = ROUTER.slice(ROUTER.indexOf('getWorkspace: protectedProcedure'), ROUTER.indexOf('ensureStoryContract: protectedProcedure'));
    expect(workspace).not.toContain('.update(');
    expect(workspace).not.toContain('.create(');
    expect(workspace).not.toContain('extractStoryContract(');
  });
});

describe('the client is the consumer of the signal', () => {
  it('triggers the mutation once when the read says extraction is needed', () => {
    expect(SCREEN).toContain('trpc.story.ensureStoryContract.useMutation');
    expect(SCREEN).toContain('contractTriggered.current = true');
    expect(SCREEN).toContain('ensureContract.mutate({ projectId })');
  });

  it('does not trigger when a contract is already stored', () => {
    expect(SCREEN).toContain('if (!contractEvaluation?.needsExtraction) return;');
  });

  it('an unread story says so rather than rendering as an absence', () => {
    expect(SCREEN).toContain('Completeness not checked yet');
  });
});
