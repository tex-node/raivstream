import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  applyFfmpegSafety,
  ffmpegAbortSignal,
  classifyFfmpegFailure,
  FFMPEG_MAX_DURATION_SECONDS,
  FFMPEG_TIMEOUT_MS,
  FFMPEG_MAX_FILE_SIZE_SCENE,
  FFMPEG_MAX_FILE_SIZE_CONCAT,
  FFMPEG_THREADS,
  FFMPEG_PROBE_TIMEOUT_MS,
} from '../ffmpegSafety';

describe('applyFfmpegSafety', () => {
  it('1. adds -t, -fs, -threads when absent', () => {
    const out = applyFfmpegSafety(['-i', 'in.mp4', 'out.mp4']);
    expect(out).toContain('-t');
    expect(out).toContain(String(FFMPEG_MAX_DURATION_SECONDS));
    expect(out).toContain('-fs');
    expect(out).toContain(FFMPEG_MAX_FILE_SIZE_SCENE);
    expect(out).toContain('-threads');
    expect(out).toContain(String(FFMPEG_THREADS));
  });

  it('inserts the caps BEFORE the output path, never after it', () => {
    // Output options written after the output path belong to a second output
    // that never arrives, so ffmpeg rejects the command. The first cut of this
    // helper appended and therefore could not be used by any call site.
    const out = applyFfmpegSafety(['-y', '-i', 'in.mp4', 'out.mp4']);
    expect(out[out.length - 1]).toBe('out.mp4');
    expect(out.indexOf('-t')).toBeLessThan(out.indexOf('out.mp4'));
    expect(out.indexOf('-fs')).toBeLessThan(out.indexOf('out.mp4'));
    expect(out.indexOf('-threads')).toBeLessThan(out.indexOf('out.mp4'));
    // Inputs stay in order.
    expect(out.indexOf('-i')).toBeLessThan(out.indexOf('in.mp4'));
  });

  it('2. is idempotent (no duplicate flags)', () => {
    const once = applyFfmpegSafety(['-y', '-i', 'in.mp4', 'out.mp4']);
    const twice = applyFfmpegSafety(once);
    expect(twice.filter((a) => a === '-t')).toHaveLength(1);
    expect(twice.filter((a) => a === '-fs')).toHaveLength(1);
    expect(twice.filter((a) => a === '-threads')).toHaveLength(1);
    expect(twice[twice.length - 1]).toBe('out.mp4');
  });

  it('respects a caller-provided output -t (tighter bound wins)', () => {
    const out = applyFfmpegSafety(['-i', 'in.mp4', '-t', '12', 'out.mp4']);
    expect(out.filter((a) => a === '-t')).toHaveLength(1);
    expect(out).toContain('12');
    expect(out).not.toContain(String(FFMPEG_MAX_DURATION_SECONDS));
  });

  it('does not mistake an INPUT -t for an output bound', () => {
    // The end card sets `-t 2` on its lavfi inputs; that caps the input, not the
    // output. Counting it would leave the real output unbounded.
    const out = applyFfmpegSafety(['-f', 'lavfi', '-t', '2', '-i', 'color=black', 'out.mp4']);
    // One -t caps the input, the injected one caps the output.
    expect(out.filter((a) => a === '-t')).toHaveLength(2);
    // The injected cap sits in the output section, after the last input.
    const lastInputIndex = out.lastIndexOf('color=black');
    expect(out.indexOf(String(FFMPEG_MAX_DURATION_SECONDS))).toBeGreaterThan(lastInputIndex);
    expect(out[out.length - 1]).toBe('out.mp4');
  });

  it('supports a custom -fs (concat cap)', () => {
    const out = applyFfmpegSafety([], { maxFileSize: FFMPEG_MAX_FILE_SIZE_CONCAT });
    expect(out).toContain(FFMPEG_MAX_FILE_SIZE_CONCAT);
    expect(out).not.toContain(FFMPEG_MAX_FILE_SIZE_SCENE);
  });
});

describe('ffmpegAbortSignal', () => {
  afterEach(() => vi.useRealTimers());

  it('3. aborts after FFMPEG_TIMEOUT_MS', () => {
    vi.useFakeTimers();
    const { signal, cancel } = ffmpegAbortSignal();
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_MS + 1);
    expect(signal.aborted).toBe(true);
    cancel();
  });

  it('does not abort early and cancel prevents abort', () => {
    vi.useFakeTimers();
    const { signal, cancel } = ffmpegAbortSignal();
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    cancel();
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_MS * 2);
    expect(signal.aborted).toBe(false);
  });
});

describe('constants', () => {
  it('4. are positive and well-formed', () => {
    expect(Number.isInteger(FFMPEG_MAX_DURATION_SECONDS)).toBe(true);
    expect(FFMPEG_MAX_DURATION_SECONDS).toBeGreaterThan(0);
    expect(FFMPEG_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isInteger(FFMPEG_THREADS)).toBe(true);
    expect(FFMPEG_THREADS).toBeGreaterThan(0);
    expect(FFMPEG_MAX_FILE_SIZE_SCENE).toMatch(/^\d+[MG]$/);
    expect(FFMPEG_MAX_FILE_SIZE_CONCAT).toMatch(/^\d+[MG]$/);
    expect(FFMPEG_PROBE_TIMEOUT_MS).toBeGreaterThan(0);
    // A probe cap longer than a full export's -t would defeat its purpose.
    expect(FFMPEG_PROBE_TIMEOUT_MS).toBeLessThan(FFMPEG_TIMEOUT_MS);
  });
});

describe('classifyFfmpegFailure', () => {
  it('maps the -fs signature to EXPORT_SIZE_LIMIT', () => {
    expect(classifyFfmpegFailure('File size limit reached')).toBe('EXPORT_SIZE_LIMIT');
    expect(classifyFfmpegFailure('Output file is empty')).toBe('EXPORT_SIZE_LIMIT');
  });

  it('maps timeout signatures to EXPORT_TIMEOUT', () => {
    expect(classifyFfmpegFailure('ffmpeg timed out after 1500000ms')).toBe('EXPORT_TIMEOUT');
  });

  it('returns null for an unrelated failure', () => {
    expect(classifyFfmpegFailure('Invalid data found when processing input')).toBeNull();
  });
});
