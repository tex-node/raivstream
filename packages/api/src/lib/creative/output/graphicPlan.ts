/**
 * Graphic plan for text-based commercials (2026-11-20).
 *
 * The commercial contract already produces three beats - hook, benefit, CTA - and the copy panel already collects them. This module turns
 * those three strings into a DETERMINISTIC, versioned plan that the renderer can execute, and holds it to legibility rules BEFORE a render is
 * attempted. No model call, no per-character animation: `drawtext` animates a string, not glyphs, and a renderer that pretends otherwise is a
 * lie about what the pixels will do.
 *
 * Motion comes from three primitives, all expressible in ffmpeg expressions:
 *   - alpha  (fade in/out)
 *   - y      (rise)
 *   - x      (slide)
 * A "pop" (scale) is deliberately NOT offered: `drawtext` cannot animate font size, so asking for it would produce a plan the renderer cannot
 * honour. An unsupported option that silently degrades is worse than one that is absent.
 */

export type GraphicRole = 'hook' | 'benefit' | 'cta';
export type GraphicSlot = 'top' | 'middle' | 'lower-third';
export type GraphicMotion = 'fade' | 'fade-up' | 'slide-left';

export interface GraphicBeat {
  role: GraphicRole;
  text: string;
  /** Seconds. */
  in: number;
  /** Seconds. */
  out: number;
  motion: GraphicMotion;
  slot: GraphicSlot;
}

export interface GraphicStyle {
  box: boolean;
  /** Fraction of the frame kept clear on each side (0.08 = 8%). */
  safeArea: number;
  maxCharsPerLine: number;
}

export interface GraphicPlan {
  version: 1;
  beats: GraphicBeat[];
  style: GraphicStyle;
}

export type GraphicIssueCode = 'NO_BEATS' | 'EMPTY_TEXT' | 'TOO_BRIEF' | 'LINE_TOO_LONG' | 'OVERLAP' | 'OUT_OF_RANGE' | 'TOO_SMALL';

export interface GraphicIssue {
  code: GraphicIssueCode;
  message: string;
  beatIndex?: number;
}

export const GRAPHIC_MIN_READ_CHARS_PER_SECOND = 12;
export const GRAPHIC_MIN_DWELL_SECONDS = 1.2;

const DEFAULT_STYLE: GraphicStyle = { box: true, safeArea: 0.08, maxCharsPerLine: 32 };

/** Vertical anchor per slot, as a fraction of frame height. */
export const GRAPHIC_SLOT_Y: Record<GraphicSlot, number> = { top: 0.16, middle: 0.42, 'lower-third': 0.72 };

/**
 * Build the plan from the three commercial beats. Beats are distributed across the runtime with a minimum dwell, in contract order:
 * hook first, benefit second, CTA last - the funnel order the contract already enforces.
 */
export function buildGraphicPlan(input: {
  hook?: string | null;
  benefit?: string | null;
  cta?: string | null;
  durationSeconds: number;
  style?: Partial<GraphicStyle>;
}): GraphicPlan {
  const style = { ...DEFAULT_STYLE, ...(input.style ?? {}) };
  const duration = Math.max(0, input.durationSeconds);
  const order: Array<{ role: GraphicRole; text: string; slot: GraphicSlot }> = [
    { role: 'hook', text: (input.hook ?? '').trim(), slot: 'top' },
    { role: 'benefit', text: (input.benefit ?? '').trim(), slot: 'middle' },
    { role: 'cta', text: (input.cta ?? '').trim(), slot: 'lower-third' },
  ];
  const beats = order.filter((beat) => beat.text.length > 0);
  if (beats.length === 0) return { version: 1, beats: [], style };

  // Three equal windows with a 0.4s gap, clamped so every beat keeps the minimum dwell the gate enforces.
  const gap = 0.4;
  const rawWindow = (duration - gap * (beats.length - 1)) / beats.length;
  const window = Math.max(GRAPHIC_MIN_DWELL_SECONDS, rawWindow);
  const motions: GraphicMotion[] = ['fade-up', 'slide-left', 'fade'];

  return {
    version: 1,
    style,
    beats: beats.map((beat, index) => {
      const start = index * (window + gap);
      return {
        role: beat.role,
        text: beat.text,
        in: Number(start.toFixed(2)),
        out: Number((start + window).toFixed(2)),
        motion: motions[index % motions.length]!,
        slot: beat.slot,
      };
    }),
  };
}

/**
 * The legibility gate. Every rule is deterministic and every failure carries a sentence a creator can act on, because a rejected render with
 * "invalid plan" teaches nobody anything.
 */
export function graphicIssues(
  plan: GraphicPlan,
  frame: { width: number; height: number; durationSeconds?: number },
): GraphicIssue[] {
  const issues: GraphicIssue[] = [];
  if (plan.beats.length === 0) {
    issues.push({ code: 'NO_BEATS', message: 'This commercial has no on-screen text yet. Add a hook, a benefit or a call to action.' });
    return issues;
  }

  const fontFloor = Math.max(28, Math.round(frame.width / 22));
  const usableWidth = frame.width * (1 - plan.style.safeArea * 2);

  plan.beats.forEach((beat, index) => {
    const text = beat.text.trim();
    if (text.length === 0) {
      issues.push({ code: 'EMPTY_TEXT', message: `Line ${index + 1} is blank.`, beatIndex: index });
      return;
    }
    if (text.length > plan.style.maxCharsPerLine) {
      issues.push({
        code: 'LINE_TOO_LONG',
        message: `"${text.slice(0, 40)}…" is ${text.length} characters - it will wrap and clip on a phone. Keep it to ${plan.style.maxCharsPerLine}.`,
        beatIndex: index,
      });
    }
    const dwell = beat.out - beat.in;
    const needed = Math.max(GRAPHIC_MIN_DWELL_SECONDS, text.length / GRAPHIC_MIN_READ_CHARS_PER_SECOND);
    if (dwell < needed) {
      issues.push({
        code: 'TOO_BRIEF',
        message: `"${text.slice(0, 30)}…" is on screen for ${dwell.toFixed(2)}s; ${text.length} characters need at least ${needed.toFixed(2)}s to read.`,
        beatIndex: index,
      });
    }
    if (beat.in < 0 || (frame.durationSeconds !== undefined && beat.out > frame.durationSeconds + 0.001)) {
      issues.push({ code: 'OUT_OF_RANGE', message: `"${text.slice(0, 30)}…" runs past the end of the video.`, beatIndex: index });
    }
    // Approximate the rendered width: a bold sans glyph averages ~0.62 of the font size.
    const estimatedWidth = text.length * fontFloor * 0.62;
    if (estimatedWidth > usableWidth) {
      issues.push({ code: 'TOO_SMALL', message: `"${text.slice(0, 30)}…" cannot fit at a readable size; shorten it.`, beatIndex: index });
    }
  });

  for (let i = 0; i < plan.beats.length; i += 1) {
    for (let j = i + 1; j < plan.beats.length; j += 1) {
      const a = plan.beats[i]!;
      const b = plan.beats[j]!;
      if (a.slot === b.slot && a.in < b.out && b.in < a.out) {
        issues.push({
          code: 'OVERLAP',
          message: `Two lines share the ${a.slot} at the same moment - "${a.text.slice(0, 20)}…" and "${b.text.slice(0, 20)}…".`,
          beatIndex: j,
        });
      }
    }
  }

  return issues;
}
