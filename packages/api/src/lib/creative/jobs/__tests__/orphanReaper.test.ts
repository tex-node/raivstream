import { describe, expect, it } from 'vitest';
import { RENDER_TEMP_PREFIX, selectOrphanedRenders, type ProcessEntry } from '../orphanReaper';

/**
 * The reaper's selector (2026-11-18).
 *
 * Measured first: after a SIGKILL of the worker, two generations of `ffmpeg … -t 1800 -fs 500M` were still encoding into
 * `/tmp/raivstream-output-*` with no parent. The selector must catch exactly those and nothing else — in particular it must
 * never touch a live render, including the export worker's, which uses the same temp prefix.
 */

const LIVE = new Set([1, 100, 200]);

function proc(overrides: Partial<ProcessEntry> & { pid: number }): ProcessEntry {
  return { ppid: 100, cmdline: '', ...overrides };
}

function render(dir = `${RENDER_TEMP_PREFIX}abc123`): string {
  return `ffmpeg -y -i ${dir}/src-0.bin -t 1800 ${dir}/seg-0.mp4`;
}

describe('an orphan is a render whose parent is gone', () => {
  it('selects the reparented case: parent is init', () => {
    const orphan = proc({ pid: 400, ppid: 1, cmdline: render() });
    expect(selectOrphanedRenders([orphan], LIVE).map((entry) => entry.pid)).toEqual([400]);
  });

  it('selects the collapsing case: the parent pid no longer exists', () => {
    const orphan = proc({ pid: 401, ppid: 999, cmdline: render() });
    expect(selectOrphanedRenders([orphan], LIVE).map((entry) => entry.pid)).toEqual([401]);
  });

  it('never selects a live render — its parent still exists', () => {
    const live = proc({ pid: 402, ppid: 100, cmdline: render() });
    expect(selectOrphanedRenders([live], LIVE)).toEqual([]);
  });

  it('never selects an unrelated orphan: the prefix is what marks our render', () => {
    const unrelated = proc({ pid: 403, ppid: 1, cmdline: 'postgres -D /var/lib/postgresql' });
    expect(selectOrphanedRenders([unrelated], LIVE)).toEqual([]);
  });

  it('leaves the export worker renders alone: same prefix, live parent', () => {
    const exportRender = proc({ pid: 404, ppid: 200, cmdline: render(`${RENDER_TEMP_PREFIX}export-xyz`) });
    expect(selectOrphanedRenders([exportRender], LIVE)).toEqual([]);
  });

  it('an empty table is an empty selection', () => {
    expect(selectOrphanedRenders([], LIVE)).toEqual([]);
  });
});
