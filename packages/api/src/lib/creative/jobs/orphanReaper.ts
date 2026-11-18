/**
 * Orphaned-render reaper (2026-11-18).
 *
 * The SIGKILL test found the gap: killing the worker leaves its FFmpeg children rendering into `/tmp/raivstream-output-*`
 * with no parent — two generations were still encoding when the next check ran, bounded only by `-t 1800` and `-fs 500M`.
 * A graceful stop is now handled (`killAllChildren` on SIGTERM/SIGINT), but SIGKILL and the OOM killer cannot be caught,
 * so the process that comes back must clean up after the one that died.
 *
 * "Orphan" is precise here: the process still carries our render temp prefix, and its parent is init (the reparented
 * case) or a pid that no longer exists (the race). A live render's parent is the worker, so it is never selected — which
 * is also why this cannot touch the export worker's renders: they always have a live parent.
 *
 * Known limit, stated rather than hidden: if a supervisor were configured as a child subreaper, an orphan would be
 * reparented to that supervisor instead of init and this would not see it. PM2 is not one on this host, which is why the
 * orphans survived to be observed.
 */

import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The prefix `render.ts` uses for `mkdtemp`; shared so the reaper and the renderer cannot drift. */
export const RENDER_TEMP_PREFIX = 'raivstream-output-';

export interface ProcessEntry {
  pid: number;
  ppid: number;
  cmdline: string;
}

export interface ReapOutcome {
  killed: number[];
  dirs: string[];
}

/**
 * Pure selector: which of these processes are leftovers from a dead worker?
 *
 * `livePids` is every pid currently visible. A parent of 1 is init, which is the normal reparented state; a parent that is
 * missing means the tree is mid-collapse. Both are orphaned; a live parent means somebody still owns the render.
 */
export function selectOrphanedRenders(
  entries: ProcessEntry[],
  livePids: Set<number>,
  prefix: string = RENDER_TEMP_PREFIX,
): ProcessEntry[] {
  return entries.filter((entry) => {
    if (!entry.cmdline.includes(prefix)) return false;
    return entry.ppid === 1 || !livePids.has(entry.ppid);
  });
}

/** `/proc` reader. Non-Linux returns nothing: the worker is Linux-only, but tests and dev machines are not. */
async function readProcesses(): Promise<ProcessEntry[]> {
  if (process.platform !== 'linux') return [];
  const entries = await readdir('/proc', { withFileTypes: true }).catch(() => []);
  const processes: ProcessEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    const status = await readFile(`/proc/${pid}/status`, 'utf8').catch(() => null);
    if (!status) continue;
    const parent = status.match(/^PPid:\s+(\d+)/m);
    if (!parent) continue;
    const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
    processes.push({ pid, ppid: Number(parent[1]), cmdline: cmdline.replace(/\0/g, ' ').trim() });
  }
  return processes;
}

/**
 * Kill leftover renders and remove their temp directories.
 *
 * Directory removal only happens when NO process still references the prefix, so a render that is running right now —
 * in this worker or in the export worker — keeps its working directory.
 */
export async function reapOrphanedRenders(
  options: { prefix?: string; log?: (message: string) => void } = {},
): Promise<ReapOutcome> {
  const prefix = options.prefix ?? RENDER_TEMP_PREFIX;
  const log = options.log ?? ((message: string) => console.info(message));
  if (process.platform !== 'linux') return { killed: [], dirs: [] };

  const before = await readProcesses();
  const livePids = new Set(before.map((entry) => entry.pid));
  const orphans = selectOrphanedRenders(before, livePids, prefix);
  const killed: number[] = [];
  for (const orphan of orphans) {
    try {
      process.kill(orphan.pid, 'SIGKILL');
      killed.push(orphan.pid);
    } catch {
      // Already gone between the scan and the signal.
    }
  }
  if (killed.length > 0) {
    log(`[creative.reaper] killed=${killed.length} pids=${killed.join(',')} — they outlived the worker that spawned them`);
    // Let the kernel finish reaping before deciding which directories are unused.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const after = await readProcesses();
  if (after.some((entry) => entry.cmdline.includes(prefix))) return { killed, dirs: [] };

  const root = tmpdir();
  const dirs: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const dir = path.join(root, entry.name);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    dirs.push(dir);
  }
  if (dirs.length > 0) log(`[creative.reaper] removed=${dirs.length} stale render directories`);
  return { killed, dirs };
}
