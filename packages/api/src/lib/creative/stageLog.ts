/**
 * Phase 3 measurement — one line per stage boundary.
 *
 * The shape matches [export.path] and [films.submit]: a run counts only if a line
 * names the stage it took. A stage that completes with no line is a false pass, which
 * is exactly what the first lighthouse run produced.
 */
export type CreativeStage =
  | 'intent' | 'bible' | 'plan' | 'preview' | 'produce'
  | 'review' | 'director' | 'approval' | 'output';

export function logStage(
  projectId: string,
  stage: CreativeStage,
  status: 'start' | 'ok' | 'fail',
  detail: Record<string, unknown> = {},
): void {
  const extra = Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  console.info(`[creative.stage] project=${projectId} stage=${stage} status=${status}${extra ? ' ' + extra : ''}`);
}
