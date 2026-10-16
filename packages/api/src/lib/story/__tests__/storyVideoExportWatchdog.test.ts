import { describe, it, expect, vi } from 'vitest';
import { StoryVideoExportService } from '../storyVideoExportService';

function prismaWith(stuck: Array<{ id: string }>) {
  return {
    storyVideoExport: {
      findMany: vi.fn().mockResolvedValue(stuck),
      updateMany: vi.fn().mockResolvedValue({ count: stuck.length }),
    },
  };
}

describe('StoryVideoExportService.failStuckExports (D3 watchdog)', () => {
  it('is a no-op when there are no stale GENERATING rows', async () => {
    const svc = new StoryVideoExportService();
    const prisma = prismaWith([]);
    expect(await svc.failStuckExports(prisma as never)).toEqual({ scanned: 0, failed: 0 });
    expect(prisma.storyVideoExport.updateMany).not.toHaveBeenCalled();
  });

  it('marks stale GENERATING rows FAILED with an actionable message', async () => {
    const svc = new StoryVideoExportService();
    const prisma = prismaWith([{ id: 'e1' }, { id: 'e2' }]);
    expect(await svc.failStuckExports(prisma as never)).toEqual({ scanned: 2, failed: 2 });

    const arg = prisma.storyVideoExport.updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe('GENERATING');
    expect(arg.where.id.in).toEqual(['e1', 'e2']);
    expect(arg.data.status).toBe('FAILED');
    expect(arg.data.errorMessage).toMatch(/try again/i);
  });
});
