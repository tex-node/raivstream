import type { CameraAngle, CameraMovement, CameraSpec, ShotSize, VpcMedium } from './types';

// Map V1 enum values → V2 constrained vocabulary
const SHOT_SIZE_MAP: Record<string, ShotSize> = {
  CLOSE_UP: 'close_up',
  MEDIUM_SHOT: 'medium',
  WIDE_SHOT: 'wide',
  OVER_THE_SHOULDER: 'medium_close',
  BIRDS_EYE_VIEW: 'extreme_wide',
  EYE_LEVEL: 'medium',
};

const ANGLE_MAP: Record<string, CameraAngle> = {
  BIRDS_EYE_VIEW: 'overhead',
  EYE_LEVEL: 'eye_level',
};

// Parse free-form camera intent string (from DirectedScene.cameraIntent)
function parseShotSizeFromHint(hint: string): ShotSize | undefined {
  const lower = hint.toLowerCase();
  if (/\bextreme\s+close\b|ecu\b/.test(lower)) return 'extreme_close_up';
  if (/\bclose[- ]up\b|\bcloseup\b/.test(lower)) return 'close_up';
  if (/\bmedium\s+close\b/.test(lower)) return 'medium_close';
  if (/\bmedium\s+wide\b/.test(lower)) return 'medium_wide';
  if (/\bmedium\b|\bmid[- ]shot\b/.test(lower)) return 'medium';
  if (/\bextreme\s+wide\b|establishing\b/.test(lower)) return 'extreme_wide';
  if (/\bwide\b/.test(lower)) return 'wide';
  return undefined;
}

function parseAngleFromHint(hint: string): CameraAngle | undefined {
  const lower = hint.toLowerCase();
  if (/\boverhead\b|\btop[- ]down\b/.test(lower)) return 'overhead';
  if (/\bhigh[- ]angle\b/.test(lower)) return 'high_angle';
  if (/\blow[- ]angle\b/.test(lower)) return 'low_angle';
  if (/\bdutch\b/.test(lower)) return 'dutch';
  if (/\beye[- ]level\b/.test(lower)) return 'eye_level';
  return undefined;
}

function parseMovementFromHint(hint: string): CameraMovement | undefined {
  const lower = hint.toLowerCase();
  if (/\bdolly\s+in\b|\bzoom\s+in\b/.test(lower)) return 'slow_dolly_in';
  if (/\bdolly\s+out\b|\bzoom\s+out\b/.test(lower)) return 'slow_dolly_out';
  if (/\bpan\b/.test(lower)) return 'slow_pan';
  if (/\btilt\b/.test(lower)) return 'gentle_tilt';
  if (/\bstatic\b|\blocked\b/.test(lower)) return 'static';
  return undefined;
}

export function parseCameraSpec(
  enumValue: string | null | undefined,
  freeformHint: string | null | undefined,
  medium: VpcMedium,
  characterCount: number,
): CameraSpec {
  // Start from enum (V1 director setting)
  let shotSize: ShotSize = characterCount > 2 ? 'medium_wide' : 'medium';
  let angle: CameraAngle = 'eye_level';
  let movement: CameraMovement | undefined;
  let freeformPassthrough: string | undefined;

  if (enumValue) {
    shotSize = SHOT_SIZE_MAP[enumValue] ?? shotSize;
    angle = ANGLE_MAP[enumValue] ?? angle;
  }

  // Override/refine with free-form hint from DirectedScene.cameraIntent
  if (freeformHint) {
    const parsedShot = parseShotSizeFromHint(freeformHint);
    const parsedAngle = parseAngleFromHint(freeformHint);
    const parsedMove = parseMovementFromHint(freeformHint);
    if (parsedShot) shotSize = parsedShot;
    if (parsedAngle) angle = parsedAngle;
    if (parsedMove && medium === 'VIDEO') movement = parsedMove;
    // Preserve original for passthrough only when it contains unrecognized terms
    const hasUnrecognized = !parsedShot && !parsedAngle && !parsedMove;
    if (hasUnrecognized) freeformPassthrough = freeformHint;
  }

  return { shotSize, angle, movement, freeformHint: freeformPassthrough };
}

export function cameraSpecToString(spec: CameraSpec, medium: VpcMedium): string {
  const parts: string[] = [];

  const shotLabels: Record<ShotSize, string> = {
    extreme_close_up: 'extreme close-up',
    close_up: 'close-up',
    medium_close: 'medium-close shot',
    medium: 'medium shot',
    medium_wide: 'medium-wide shot',
    wide: 'wide shot',
    extreme_wide: 'establishing wide shot',
  };
  parts.push(shotLabels[spec.shotSize]);

  const angleLabels: Record<CameraAngle, string> = {
    eye_level: 'eye-level',
    low_angle: 'low-angle',
    high_angle: 'high-angle',
    overhead: 'overhead/top-down',
    dutch: 'dutch-angle',
  };
  if (spec.angle !== 'eye_level') parts.push(angleLabels[spec.angle]);

  if (medium === 'VIDEO' && spec.movement) {
    const moveLabels: Record<CameraMovement, string> = {
      static: 'static camera',
      slow_pan: 'gentle pan',
      slow_dolly_in: 'slow dolly in',
      slow_dolly_out: 'slow dolly out',
      gentle_tilt: 'gentle tilt',
    };
    parts.push(moveLabels[spec.movement]);
  }

  if (spec.freeformHint) parts.push(spec.freeformHint);

  return parts.join(', ');
}

// Detect camera contradictions: returns list of conflict descriptions
export function detectCameraConflicts(spec: CameraSpec): string[] {
  const conflicts: string[] = [];
  if (spec.shotSize === 'extreme_close_up' && spec.movement === 'slow_pan') {
    conflicts.push('extreme close-up conflicts with pan movement (pan implies wide field)');
  }
  // Note: extreme_wide and extreme_close_up cannot be set simultaneously (one overwrites the other).
  // Conflict check above (close_up + pan) covers the practical contradictions.
  if (spec.angle === 'overhead' && spec.movement === 'slow_pan') {
    conflicts.push('overhead angle with pan is rarely coherent');
  }
  return conflicts;
}
