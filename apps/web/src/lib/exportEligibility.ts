/**
 * D-074 — R16 video export requires BOTH an R16 session and a KIDS-mode project.
 *
 * The server enforces this twice: the procedure is `r16Procedure` (needs
 * `ctx.isR16`) and `requestStoryVideoExport`'s service rejects any project whose
 * `audienceMode !== 'KIDS'` with FORBIDDEN. The UI used to gate on the R16 host
 * alone, so a GENERAL project opened on `r16.raivstream.com` showed an Export
 * button that was guaranteed to 403.
 *
 * Gate the UI on the same pair the server checks, so the button never renders
 * when the request cannot succeed.
 */

export type StoryAudienceMode = 'KIDS' | 'GENERAL' | null | undefined;

export function canExportStoryVideo(input: {
  isR16: boolean;
  audienceMode: StoryAudienceMode;
}): boolean {
  return input.isR16 === true && input.audienceMode === 'KIDS';
}
