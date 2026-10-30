/**
 * Which control the R16 workspace should show for a published export.
 *
 * Pure so the states are testable without a React harness, and so the mapping
 * from state to server guard is readable in one place:
 *
 *   hidden    - crossed combo (KIDS only on R16) or no READY export
 *   loading   - lookup in flight
 *   publish   - no Video row yet            -> publishExport
 *   submitted - submittedForPublicationAt   -> submitForPublication would CONFLICT
 *   live      - moderationStatus APPROVED  -> submitForPublication would CONFLICT
 *   processing- status !== READY            -> submitForPublication would PRECONDITION_FAILED
 *   submit    - READY, PENDING, not submitted -> submitForPublication
 */
export type ExportPublishState =
  | 'hidden'
  | 'loading'
  | 'publish'
  | 'submitted'
  | 'live'
  | 'processing'
  | 'submit';

export function exportPublishState(input: {
  isR16Session: boolean;
  audienceMode: string | null | undefined;
  exportStatus: string | null;
  video: {
    status: string;
    moderationStatus: string;
    submittedForPublicationAt: Date | null;
  } | null;
  loading: boolean;
}): ExportPublishState {
  // Crossed combos are forbidden by resolveExportPolicy; the UI mirrors it.
  if (!(input.isR16Session && input.audienceMode === 'KIDS')) return 'hidden';
  if (input.exportStatus !== 'READY') return 'hidden';
  if (input.loading) return 'loading';
  if (!input.video) return 'publish';
  if (input.video.submittedForPublicationAt) return 'submitted';
  if (input.video.moderationStatus === 'APPROVED') return 'live';
  if (input.video.status !== 'READY') return 'processing';
  return 'submit';
}
