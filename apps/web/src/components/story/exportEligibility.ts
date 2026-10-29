// Mirror of the server boundary: StoryVideoExport is R16/KIDS-only
// (storyVideoExportService.requestExport guards both `!isR16` and
//  `audienceMode !== 'KIDS'`). The UI must not offer what the platform refuses.

export function canExportStory(opts: {
  isR16Session: boolean;
  audienceMode: string | null | undefined;
}): boolean {
  return opts.isR16Session === true && opts.audienceMode === 'KIDS';
}

/** Copy for the ineligible case, so the UI explains itself instead of vanishing. */
export function exportUnavailableReason(opts: {
  isR16Session: boolean;
  audienceMode: string | null | undefined;
}): string {
  if (opts.audienceMode !== 'KIDS') {
    return 'Full-movie export is available for kids (R16) stories only.';
  }
  return 'Full-movie export is available on the R16 site.';
}
