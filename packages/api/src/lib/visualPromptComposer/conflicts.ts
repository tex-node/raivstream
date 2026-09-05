// Deterministic conflict detection — no LLM involved.
// Returns human-readable conflict descriptions (warnings, non-fatal).

export function detectEnvironmentConflicts(
  indoorOutdoor: string | null | undefined,
  locationType: string | null | undefined,
): string[] {
  if (!indoorOutdoor || !locationType) return [];
  const isIndoor = /indoor|inside|interior/i.test(indoorOutdoor);
  const isOutdoor = /outdoor|outside|exterior/i.test(indoorOutdoor);
  const locationImpliesOutdoor = /\b(forest|park|beach|street|road|sky|field|mountain|jungle|garden|marketplace|market|lake|river|ocean)\b/i.test(locationType);
  const locationImpliesIndoor = /\b(room|house|home|classroom|school|shop|store|office|kitchen|bedroom|hall|building|library|hospital)\b/i.test(locationType);

  const conflicts: string[] = [];
  if (isIndoor && locationImpliesOutdoor) {
    conflicts.push(`indoor setting conflicts with outdoor location "${locationType}"`);
  }
  if (isOutdoor && locationImpliesIndoor) {
    conflicts.push(`outdoor setting conflicts with indoor location "${locationType}"`);
  }
  return conflicts;
}

export function detectTimeOfDayConflicts(
  timeOfDay: string | null | undefined,
  lighting: string | null | undefined,
): string[] {
  if (!timeOfDay || !lighting) return [];
  const isDay = /morning|afternoon|sunrise|sunset|day/i.test(timeOfDay);
  const isNight = /night|midnight|evening|dusk/i.test(timeOfDay);
  const lightingIsDaylike = /bright|sunlight|daylight|natural/i.test(lighting);
  const lightingIsNightlike = /moonlight|dim|candle|lamp|artificial/i.test(lighting);

  const conflicts: string[] = [];
  if (isDay && lightingIsNightlike) {
    conflicts.push(`daytime setting conflicts with nighttime lighting "${lighting}"`);
  }
  if (isNight && lightingIsDaylike) {
    conflicts.push(`nighttime setting conflicts with daytime lighting "${lighting}"`);
  }
  return conflicts;
}

export function detectCharacterCountConflicts(
  focalSubjectHint: string | null | undefined,
  characterCount: number,
): string[] {
  if (!focalSubjectHint) return [];
  const impliesSingle = /\balone\b|\bsolo\b|\bby (her|him|them)self\b/i.test(focalSubjectHint);
  if (impliesSingle && characterCount > 1) {
    return [`scene action implies a solo subject but ${characterCount} characters are present`];
  }
  return [];
}

export function detectWardrobeConflicts(
  action: string,
  characterDescriptions: string[],
): string[] {
  const conflicts: string[] = [];
  // Check if action implies nudity/swimming while wardrobe mentions formal clothing
  const isFormal = characterDescriptions.some((d) =>
    /\b(suit|tie|dress|formal|uniform|gown)\b/i.test(d));
  const actionImpliesSwimming = /\b(swim|swimming|pool|beach|ocean)\b/i.test(action);
  if (isFormal && actionImpliesSwimming) {
    conflicts.push('action implies swimming but character is described in formal attire');
  }
  return conflicts;
}

export function collectAllConflicts(args: {
  indoorOutdoor?: string | null;
  locationType?: string | null;
  timeOfDay?: string | null;
  lighting?: string | null;
  action?: string | null;
  focalSubjectHint?: string | null;
  characterCount: number;
  characterDescriptions: string[];
  cameraConflicts: string[];
}): string[] {
  return [
    ...detectEnvironmentConflicts(args.indoorOutdoor, args.locationType),
    ...detectTimeOfDayConflicts(args.timeOfDay, args.lighting),
    ...detectCharacterCountConflicts(args.focalSubjectHint, args.characterCount),
    ...detectWardrobeConflicts(args.action ?? '', args.characterDescriptions),
    ...args.cameraConflicts,
  ];
}
