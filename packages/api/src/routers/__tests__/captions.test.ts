import { describe, it, expect } from 'vitest';
import { buildWebVtt } from '../story';

describe('WebVTT captions (Phase 11)', () => {
  it('builds a valid VTT track with timestamps and durations', () => {
    const vtt = buildWebVtt([
      { start: 0, duration: 2, text: 'Hello there.' },
      { start: 65.5, duration: null, text: 'Second line.' },
    ]);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.000');
    expect(vtt).toContain('Hello there.');
    expect(vtt).toContain('00:01:05.500 --> 00:01:08.000'); // null duration → 2.5s default
    expect(vtt).toContain('Second line.');
  });

  it('returns a header-only track for no cues', () => {
    expect(buildWebVtt([])).toBe('WEBVTT\n');
  });
});
