/**
 * D-033 — ffmpeg child-process registry.
 *
 * The export worker spawns ffmpeg; on SIGTERM it must not leave orphaned
 * encoders burning CPU on the shared VPS. Every spawn is tracked here so
 * `killAllChildren()` can reap them during shutdown.
 */

import type { ChildProcess } from 'node:child_process';

const tracked = new Set<ChildProcess>();

/** Track a spawned child until it closes. */
export function trackChild(child: ChildProcess): void {
  tracked.add(child);
  child.once('close', () => tracked.delete(child));
  child.once('error', () => tracked.delete(child));
}

/** Kill every tracked child (SIGKILL by default). Returns how many were signalled. */
export function killAllChildren(signal: NodeJS.Signals = 'SIGKILL'): number {
  let signalled = 0;
  for (const child of tracked) {
    try {
      child.kill(signal);
      signalled += 1;
    } catch {
      // Already gone.
    }
  }
  tracked.clear();
  return signalled;
}

export function trackedChildCount(): number {
  return tracked.size;
}
