// Mirror of the server boundary: StoryVideoExport is R16/KIDS-only
// (storyVideoExportService.requestExport guards both `!isR16` and
//  `audienceMode !== 'KIDS'`). The UI must not offer what the platform refuses.

export function canExportStory(opts: {
  isR16Session: boolean;
  audienceMode: string | null | undefined;
}): boolean {
  // Same-surface only, mirroring resolveExportPolicy on the server.
  if (opts.isR16Session && opts.audienceMode === 'KIDS') return true;
  if (!opts.isR16Session && opts.audienceMode === 'GENERAL') return true;
  return false;
}

