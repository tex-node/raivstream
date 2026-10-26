import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * D-002 - `analytics.track` is the generic product-event sink. Beyond "it writes
 * a row", two properties matter:
 *   1. namespaced events only (no arbitrary writes into analytics_events);
 *   2. properties are filtered server-side, so a client cannot smuggle prompts
 *      or media URLs into analytics.
 *
 * The assertions read the row the real `trackAnalyticsEvent` hands to Prisma,
 * so the filter under test is the production one.
 */

function makePrisma() {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    analyticsEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'evt-1', ...data };
      }),
    },
  };
}

function makeCtx(prisma: ReturnType<typeof makePrisma>) {
  return {
    prisma: prisma as never,
    userId: 'u1',
    user: { id: 'u1', email: 'a@b.test', username: 'tester', displayName: 'T', role: 'CREATOR' as const },
  } as never;
}

describe('analytics.track', () => {
  it('rejects events outside the allowed namespaces', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await expect(
      caller.analytics.track({ event: 'arbitrary_event', properties: {} }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('drops unsafe properties before they reach analytics_events', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await caller.analytics.track({
      event: 'avatar_job_submitted',
      properties: {
        jobId: 'job-1',
        model: 'VEED_FABRIC',
        resolution: '720p',
        durationSeconds: 5,
        // The dangerous ones - must never be persisted.
        prompt: 'secret prompt',
        imageUrl: 'https://cdn/x.png',
        audioUrl: 'https://cdn/a.mp3',
        transcript: 'what was said',
      },
    });

    expect(prisma.analyticsEvent.create).toHaveBeenCalledTimes(1);
    const row = prisma.created[0]!;
    expect(row.eventName).toBe('avatar_job_submitted');
    expect(row.properties).toEqual({
      jobId: 'job-1',
      model: 'VEED_FABRIC',
      resolution: '720p',
      durationSeconds: 5,
    });
    expect(JSON.stringify(row.properties)).not.toMatch(/secret prompt|cdn\//);
  });

  it('accepts avatar_page_view', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await caller.analytics.track({ event: 'avatar_page_view', properties: {} });

    expect(prisma.analyticsEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.created[0]!.eventName).toBe('avatar_page_view');
  });
});

describe('analytics.trackPublicEvent', () => {
  const anonCtx = (prisma: ReturnType<typeof makePrisma>) =>
    ({ prisma: prisma as never, userId: null, user: null }) as never;

  it('records avatar_page_view without authentication and with no properties', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(anonCtx(prisma));

    await caller.analytics.trackPublicEvent({ event: 'avatar_page_view' });

    expect(prisma.analyticsEvent.create).toHaveBeenCalledTimes(1);
    const row = prisma.created[0]!;
    expect(row.eventName).toBe('avatar_page_view');
    expect(row.userId).toBeNull();
    expect(row.properties).toEqual({});
  });

  it('rejects any event outside the single-entry allowlist', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(anonCtx(prisma));

    await expect(
      // @ts-expect-error - deliberately outside the enum
      caller.analytics.trackPublicEvent({ event: 'avatar_job_submitted' }),
    ).rejects.toBeTruthy();

    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });
});