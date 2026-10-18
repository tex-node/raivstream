import { describe, it, expect } from 'vitest';
import { buildMixedAudioTrack, muxAudioWithVideo, type CommandRunner, type ResolvedCueSource } from '../audioMixing';
import { FFMPEG_MAX_FILE_SIZE_CONCAT, FFMPEG_MAX_FILE_SIZE_SCENE, FFMPEG_THREADS } from '../ffmpegSafety';

/**
 * D-031 — the audio mux used to carry `-shortest`, which trims the finished
 * movie to whichever stream ends first. A cue that started late therefore
 * shortened a movie whose blueprint promised the full runtime. These tests pin
 * the replacement: an explicit `-t` at the canonical runtime, no `-shortest`,
 * and the same -threads / -fs caps the video path gets.
 */

function captureArgs() {
  const calls: Array<{ command: string; args: string[] }> = [];
  const run: CommandRunner = async (command, args) => {
    calls.push({ command, args });
  };
  return { calls, run };
}

function cueSource(): ResolvedCueSource {
  return {
    cue: {
      id: 'cue-1',
      trackType: 'NARRATION',
      startTimeSeconds: 0,
      endTimeSeconds: 5,
      volume: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
      duckingEnabled: false,
      duckingAmountDb: null,
    },
    trackType: 'NARRATION',
    trackVolume: 1,
    filePath: '/tmp/cue.wav',
  } as unknown as ResolvedCueSource;
}

describe('D-031 bounds on the audio path', () => {
  it('muxes with an explicit -t at the canonical runtime and never -shortest', async () => {
    const { calls, run } = captureArgs();
    await muxAudioWithVideo({
      videoPath: '/tmp/v.mp4',
      audioPath: '/tmp/a.m4a',
      outputPath: '/tmp/muxed.mp4',
      durationSeconds: 12.5,
      run,
    });

    const { args } = calls[0]!;
    expect(args).not.toContain('-shortest');
    expect(args[args.indexOf('-t') + 1]).toBe('12.500');
    expect(args[args.indexOf('-threads') + 1]).toBe(String(FFMPEG_THREADS));
    // The mux writes the whole movie, so it carries the concat cap.
    expect(args[args.indexOf('-fs') + 1]).toBe(FFMPEG_MAX_FILE_SIZE_CONCAT);
    // Caps are output options, so they must precede the output path.
    expect(args[args.length - 1]).toBe('/tmp/muxed.mp4');
    expect(args.indexOf('-t')).toBeLessThan(args.length - 1);
  });

  it('bounds the mix graph at the canonical runtime with the same caps', async () => {
    const { calls, run } = captureArgs();
    await buildMixedAudioTrack({
      sources: [cueSource()],
      duckingWindows: [],
      canonicalRuntimeSeconds: 30,
      outputPath: '/tmp/mix.m4a',
      run,
    });

    const { args } = calls[0]!;
    expect(args).not.toContain('-shortest');
    expect(args[args.indexOf('-t') + 1]).toBe('30.000');
    expect(args[args.indexOf('-threads') + 1]).toBe(String(FFMPEG_THREADS));
    expect(args[args.indexOf('-fs') + 1]).toBe(FFMPEG_MAX_FILE_SIZE_SCENE);
    expect(args[args.length - 1]).toBe('/tmp/mix.m4a');
  });
});
