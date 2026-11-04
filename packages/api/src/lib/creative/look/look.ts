/**
 * Cinematic look (Phase 5, first slice — 2026-11-04).
 *
 * "Look" as a first-class object rather than a prompt fragment: lens, sensor, movement,
 * lighting, grade. This slice is deliberately pure — a typed value, a builder that normalises
 * it, and a projection into prompt text — so the object's shape is settled and tested before
 * anything persists it.
 *
 * Not here yet: saving, naming and reuse. Those need a table and a service, and the phase's
 * exit criterion ("a look is saved, named, and reusable") is met when they land. Shipping
 * persistence in the same slice as the shape would mean migrating a schema for a type that had
 * not been exercised.
 */

export type LensFocalLength = 18 | 24 | 35 | 50 | 85 | 135;
export type MovementKind = 'static' | 'push-in' | 'pull-out' | 'pan' | 'tilt' | 'handheld' | 'orbit';
export type LightingKind = 'natural' | 'golden-hour' | 'blue-hour' | 'practical' | 'high-key' | 'low-key' | 'neon';
export type GradeKind = 'neutral' | 'warm' | 'cool' | 'bleach-bypass' | 'teal-orange' | 'monochrome';

export interface CinematicLook {
  name: string;
  lens: LensFocalLength;
  movement: MovementKind;
  lighting: LightingKind;
  grade: GradeKind;
  /** Output height ladder. 1080 is the delivery default; 720 is the cheap iteration tier. */
  resolution: 720 | 1080 | 1440;
}

export const DEFAULT_LOOK: CinematicLook = {
  name: 'default',
  lens: 35,
  movement: 'static',
  lighting: 'natural',
  grade: 'neutral',
  resolution: 1080,
};

const LENSES: readonly LensFocalLength[] = [18, 24, 35, 50, 85, 135];
const MOVEMENTS: readonly MovementKind[] = ['static', 'push-in', 'pull-out', 'pan', 'tilt', 'handheld', 'orbit'];
const LIGHTING: readonly LightingKind[] = ['natural', 'golden-hour', 'blue-hour', 'practical', 'high-key', 'low-key', 'neon'];
const GRADES: readonly GradeKind[] = ['neutral', 'warm', 'cool', 'bleach-bypass', 'teal-orange', 'monochrome'];
const RESOLUTIONS: readonly (720 | 1080 | 1440)[] = [720, 1080, 1440];

export const LOOK_FIELDS = {
  lens: LENSES,
  movement: MOVEMENTS,
  lighting: LIGHTING,
  grade: GRADES,
  resolution: RESOLUTIONS,
} as const;

/**
 * Build a look from partial input. Values outside a field's ladder fall back to the default
 * rather than being written through: a look applies to every shot in a production, so one typo
 * should not become a prompt fragment no model understands.
 */
export function buildLook(input: Partial<CinematicLook> = {}): CinematicLook {
  return {
    name: normaliseName(input.name) ?? DEFAULT_LOOK.name,
    lens: LENSES.includes(input.lens as LensFocalLength) ? (input.lens as LensFocalLength) : DEFAULT_LOOK.lens,
    movement: MOVEMENTS.includes(input.movement as MovementKind) ? (input.movement as MovementKind) : DEFAULT_LOOK.movement,
    lighting: LIGHTING.includes(input.lighting as LightingKind) ? (input.lighting as LightingKind) : DEFAULT_LOOK.lighting,
    grade: GRADES.includes(input.grade as GradeKind) ? (input.grade as GradeKind) : DEFAULT_LOOK.grade,
    resolution: RESOLUTIONS.includes(input.resolution as 720 | 1080 | 1440)
      ? (input.resolution as 720 | 1080 | 1440)
      : DEFAULT_LOOK.resolution,
  };
}

function normaliseName(name: string | undefined): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.length > 0 ? trimmed.slice(0, 60) : null;
}

/** The prompt fragment a look projects to. Deterministic, so a look's output is testable. */
export function lookToPrompt(look: CinematicLook): string {
  const lensDescription =
    look.lens <= 24
      ? 'wide, deep focus'
      : look.lens >= 85
        ? 'long lens, compressed background, shallow depth of field'
        : 'normal lens, natural perspective';
  return [
    `${look.lens}mm ${lensDescription}`,
    `camera ${look.movement}`,
    `${look.lighting} lighting`,
    `${look.grade} grade`,
  ].join(', ');
}

/** Output size for a look, on the 9:16 delivery ladder. */
export function lookResolution(look: CinematicLook): { width: number; height: number } {
  return { width: Math.round((look.resolution * 9) / 16), height: look.resolution };
}