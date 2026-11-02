import { beforeEach, describe, expect, it, vi } from 'vitest';
import { outputService } from '../service';

/**
 * Creative publish — operator decision 2026-11-02: **approved outputs only**, the
 * publishExport model applied to the creative pipeline.
 *
 * Three things must be true and each has its own test here:
 *  1. preconditions refuse (unapproved version, unrendered output) — a publish path
 *     that skips them is a second publishing path with weaker rules;
 *  2. a duplicate publish returns the existing video, not a second row;
 *  3. the provenance is written **at publish time** — sourceProjectId, sourceVersionId,
 *     and the single asset only when the version genuinely has one.
 */

function prismaStub(overrides: Record<string, unknown> = {}) {
  const created: Record<string, unknown>[] = [];
  const base = {
    creativeProject: { findFirst: vi.fn(async () => ({ id: 'proj_1' })) },
    creativeOutput: {
      findFirst: vi.fn(async () => ({
        id: 'out_1',
        projectId: 'proj_1',
        versionId: 'ver_1',
        format: 'PORTRAIT',
        status: 'READY',
        assetUrl: 'https://cdn/out.mp4',
        thumbnailUrl: null,
        durationSeconds: 12.5,
      })),
    },
    creativeVersion: { findFirst: vi.fn(async () => ({ id: 'ver_1' })) },
    creativeApproval: { findFirst: vi.fn(async () => ({ id: 'appr_1', status: 'APPROVED' })) },
    creativeProducedAsset: { findMany: vi.fn(async () => [{ id: 'ast_1' }, { id: 'ast_2' }]) },
    video: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'vid_1' };
      }),
    },
    ...overrides,
  };
  return { prisma: base as never, created, base };
}

// The 5.0 output flag gates the whole service, so the tests enable it explicitly
// rather than depending on ambient env.
beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_OUTPUT_ENABLED = 'true';
});

const input = { projectId: 'proj_1', userId: 'user_1', outputId: 'out_1', title: 'Lighthouse' };

describe('preconditions are the publishExport rule, not a weaker one', () => {
  it('refuses an unapproved version', async () => {
    const { prisma, base } = prismaStub();
    (base.creativeApproval.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a', status: 'PENDING' });
    await expect(outputService.publish(prisma, input)).rejects.toThrow(/Approve the version/i);
  });

  it('refuses a rejected version', async () => {
    const { prisma, base } = prismaStub();
    (base.creativeApproval.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a', status: 'REJECTED' });
    await expect(outputService.publish(prisma, input)).rejects.toThrow(/Approve the version/i);
  });

  it('refuses an output that has not rendered', async () => {
    const { prisma, base } = prismaStub();
    (base.creativeOutput.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'out_1', projectId: 'proj_1', versionId: 'ver_1', format: 'PORTRAIT', status: 'PENDING', assetUrl: null, thumbnailUrl: null, durationSeconds: null,
    });
    await expect(outputService.publish(prisma, input)).rejects.toThrow(/Render the output/i);
  });

  it('refuses a READY output with no media', async () => {
    const { prisma, base } = prismaStub();
    (base.creativeOutput.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'out_1', projectId: 'proj_1', versionId: 'ver_1', format: 'PORTRAIT', status: 'READY', assetUrl: null, thumbnailUrl: null, durationSeconds: 10,
    });
    await expect(outputService.publish(prisma, input)).rejects.toThrow(/Render the output/i);
  });
});

describe('idempotency', () => {
  it('a duplicate publish returns the existing video and creates nothing', async () => {
    const { prisma, base, created } = prismaStub();
    (base.video.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'vid_existing' });
    const result = await outputService.publish(prisma, input);
    expect(result).toEqual({ videoId: 'vid_existing', created: false });
    expect(created).toHaveLength(0);
  });
});

describe('provenance is written at publish time', () => {
  it('writes project and version, and no single asset when the film spans several', async () => {
    const { prisma, created } = prismaStub();
    const result = await outputService.publish(prisma, input);
    expect(result).toEqual({ videoId: 'vid_1', created: true });
    const data = created[0]!;
    expect(data.sourceProjectId).toBe('proj_1');
    expect(data.sourceVersionId).toBe('ver_1');
    // Two ready assets means there is no single source; guessing one would let a score
    // act on an asset that did not produce this film.
    expect(data.sourceProducedAssetId).toBeUndefined();
    expect(data.mp4Url).toBe('https://cdn/out.mp4');
    expect(data.moderationStatus).toBe('PENDING');
  });

  it('writes the single asset when the version genuinely has one', async () => {
    const { prisma, base, created } = prismaStub();
    (base.creativeProducedAsset.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'ast_only' }]);
    await outputService.publish(prisma, input);
    expect(created[0]!.sourceProducedAssetId).toBe('ast_only');
  });
});
