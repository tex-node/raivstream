/**
 * Raivstream 5.0 — Output derivation (Slice 5B).
 *
 * Outputs are DERIVATIVES of an approved creative version, not independent
 * creations. Raivstream decides the mechanics: a 9:16 master becomes 16:9 /
 * 1:1 via a center-crop re-encode; duration variants are trims of the same
 * source. No per-scene cropping UI — the creator just asks for a format.
 */

export type OutputFormat = 'MASTER' | 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE';

export interface OutputDerivation {
  format: OutputFormat;
  aspectRatio: string;
  targetWidth: number;
  targetHeight: number;
  /** fill = center-crop source to the target aspect (the mechanic, decided here). */
  cropMode: 'fill';
  effectiveDurationSeconds: number;
}

const SOURCE_WIDTH = 1080;
const SOURCE_HEIGHT = 1920; // production master is 9:16 vertical

const TARGETS: Record<OutputFormat, { width: number; height: number; label: string }> = {
  MASTER: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, label: '9:16' },
  PORTRAIT: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, label: '9:16' },
  LANDSCAPE: { width: 1920, height: 1080, label: '16:9' },
  SQUARE: { width: 1080, height: 1080, label: '1:1' },
};

export function deriveOutput(
  format: OutputFormat,
  durationSeconds: number | null | undefined,
  totalRuntimeSeconds: number,
): OutputDerivation {
  const target = TARGETS[format] ?? TARGETS.MASTER;
  const effective = durationSeconds && durationSeconds > 0 ? Math.min(Math.round(durationSeconds), Math.max(1, Math.round(totalRuntimeSeconds))) : Math.max(1, Math.round(totalRuntimeSeconds));
  return {
    format,
    aspectRatio: target.label,
    targetWidth: target.width,
    targetHeight: target.height,
    cropMode: 'fill',
    effectiveDurationSeconds: effective,
  };
}

export function formatLabel(format: OutputFormat): string {
  const target = TARGETS[format];
  return `${target.label}${format === 'MASTER' ? ' (master)' : ''}`;
}