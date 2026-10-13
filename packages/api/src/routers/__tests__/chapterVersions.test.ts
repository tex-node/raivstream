/**
 * Phase 2 (R16-05) — chapter version history procedures + snapshot wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: vi.fn(async () => ({ allowed: true, flagged: false, categories: [], scores: {} })),
  moderationRejectMessage: vi.fn(() => 'rejected'),
  suggestSafeRewrite: vi.fn(async () => null),
}));
vi.mock('../../lib/analytics', () => ({ analytics: { track: vi.fn(async () => undefined) } }));
vi.mock('../../lib/storyTextService', () => ({
  MAX_STORY_BODY_CHARS: 20000,
  storyTextService: {
    rewriteParagraph: vi.fn(async () => 'Rewritten paragraph.'),
    generateStory: vi.fn(async () => ({ body: 'Generated body that is comfortably long enough.', title: 'T', summary: 'S' })),
  },
}));

const { snapshotSpy } = vi.hoisted(() => ({
  snapshotSpy: vi.fn(async (..._args: unknown[]) => ({ id: 'ver-new', versionNumber: 9 })),
}));
vi.mock('../../lib/story/chapterVersioning', () => ({
  snapshotChapterVersion: snapshotSpy,
  affectedSceneIdsForChapterEdit: vi.fn(() => []),
}));

import { storyRouter } from '../story';

function makePrisma(chapterBody = 'Prior body text.') {
  const chapter = { id: 'c1', projectId: 'p1', chapterNumber: 1, title: 'Old title', summary: 'Old summary', body: chapterBody };
  const versions: Array<Record<string, unknown>> = [
    { id: 'v1', chapterId: 'c1', versionNumber: 1, title: 'A', source: 'EDIT', createdAt: new Date(), body: 'one' },
    { id: 'v2', chapterId: 'c1', versionNumber: 2, title: 'B', source: 'MANUAL', createdAt: new Date(), body: 'two' },
  ];
  return {
    storyProject: { findFirst: vi.fn(async () => ({ id: 'p1', userId: 'u1', title: 'P', audienceMode: 'KIDS', questions: [], chapters: [] })) },
    storyChapter: {
      findFirst: vi.fn(async () => chapter),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...chapter, ...data })),
    },
    storyChapterVersion: {
      findMany: vi.fn(async () => versions),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => versions.find((v) => v.id === where.id) ?? null),
    },
    analyticsEvent: { create: vi.fn(async () => ({})) },
    __chapter: chapter,
  };
}

const ctx = (prisma: unknown, userId = 'u1') => ({ user: { id: userId, role: 'USER' }, isR16: true, prisma }) as never;

beforeEach(() => snapshotSpy.mockClear());

describe('write paths snapshot the PRIOR state', () => {
  it('updateChapter → source EDIT', async () => {
    const prisma = makePrisma('Prior body text.');
    await storyRouter.createCaller(ctx(prisma)).updateChapter({ projectId: 'p1', chapterId: 'c1', body: 'A new body that is definitely long enough to pass.' });
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy.mock.calls[0]![1]).toMatchObject({ chapterId: 'c1', source: 'EDIT', body: 'Prior body text.', createdByUserId: 'u1' });
  });

  it('rewriteParagraph → source REWRITE_PARAGRAPH with paragraphIndex in metadata', async () => {
    const prisma = makePrisma('Para one.\n\nPara two.');
    await storyRouter.createCaller(ctx(prisma)).rewriteParagraph({ projectId: 'p1', chapterId: 'c1', paragraphIndex: 1, directive: 'Develop this' });
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy.mock.calls[0]![1]).toMatchObject({ source: 'REWRITE_PARAGRAPH', sourceMetadata: { paragraphIndex: 1, directive: 'Develop this' } });
  });

  it('regenerateStoryText → source REGENERATE (only when a chapter already exists)', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma)).regenerateStoryText({ projectId: 'p1' });
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy.mock.calls[0]![1]).toMatchObject({ chapterId: 'c1', source: 'REGENERATE' });
  });
});

describe('read procedures + ownership', () => {
  it('listChapterVersions returns summaries (no body)', async () => {
    const prisma = makePrisma();
    const res = await storyRouter.createCaller(ctx(prisma)).listChapterVersions({ projectId: 'p1', chapterId: 'c1' });
    expect(res.versions).toHaveLength(2);
    expect((prisma.storyChapterVersion.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      select: expect.objectContaining({ versionNumber: true, source: true }),
    });
    expect((prisma.storyChapterVersion.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].select.body).toBeUndefined();
  });

  it('getChapterVersion returns the full record', async () => {
    const prisma = makePrisma();
    const v = await storyRouter.createCaller(ctx(prisma)).getChapterVersion({ versionId: 'v1' });
    expect(v).toMatchObject({ id: 'v1', body: 'one' });
  });

  it('restoreChapterVersion snapshots the current state (MANUAL) then applies the target', async () => {
    const prisma = makePrisma('Current body.');
    await storyRouter.createCaller(ctx(prisma)).restoreChapterVersion({ versionId: 'v1' });
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy.mock.calls[0]![1]).toMatchObject({ source: 'MANUAL', body: 'Current body.', sourceMetadata: { restoredFromVersion: 1 } });
    const data = (prisma.storyChapter.update as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.body).toBe('one'); // target version's body
  });

  it('restore never deletes history (snapshots before applying)', async () => {
    const prisma = makePrisma();
    await storyRouter.createCaller(ctx(prisma)).restoreChapterVersion({ versionId: 'v1' });
    expect(snapshotSpy).toHaveBeenCalled();
  });

  it('another user cannot read or restore a version (NOT_FOUND)', async () => {
    const prisma = makePrisma();
    prisma.storyChapterVersion.findFirst = vi.fn(async () => null) as never;
    const caller = storyRouter.createCaller(ctx(prisma, 'intruder'));
    await expect(caller.getChapterVersion({ versionId: 'v1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller.restoreChapterVersion({ versionId: 'v1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
