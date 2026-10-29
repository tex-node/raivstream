import { TRPCError } from '@trpc/server';

export type StoryExportTier = 'R16' | 'GENERAL';

export type StoryExportPolicy = {
  tier: StoryExportTier;
  isKidsSafe: boolean;
};

/**
 * Single boundary for Story Video Export.
 *
 * Replaces the two hard guards previously in requestExport:
 *   if (!input.isR16) throw FORBIDDEN
 *   if (project.audienceMode !== 'KIDS') throw FORBIDDEN
 *
 * Same two crossed combos remain forbidden; both same-surface combos are allowed.
 * Content moderation is per-asset upstream (moderatePrompt at generation,
 * image scan at asset READY); there is no export-level moderation pass.
 */
export function resolveExportPolicy(input: {
  isR16: boolean;
  audienceMode: string | null | undefined;
}): StoryExportPolicy {
  if (input.isR16 && input.audienceMode === 'KIDS') {
    return { tier: 'R16', isKidsSafe: true };
  }
  if (!input.isR16 && input.audienceMode === 'GENERAL') {
    return { tier: 'GENERAL', isKidsSafe: false };
  }
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'This story cannot be exported on this surface.',
  });
}
