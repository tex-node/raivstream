import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREATIVE_FLAGS } from '../featureFlags';

/**
 * The mechanism that stops the next flag from dying on a deploy.
 *
 * pm2 does **not** read `env_file`, so a flag that only lives in `.env` or
 * `.env.local` is invisible to the process pm2 launches. That is how `FILMS_ENABLED`
 * was silently lost after a deploy while the pages kept returning 200 over empty API
 * responses, and how the 5.0 chain would have been lost for the worker.
 *
 * Rule: **every flag the code reads is either declared in `ecosystem.config.cjs` or
 * listed here as intentionally absent.** Adding a flag to `CREATIVE_FLAGS` without
 * wiring it up fails this test.
 */

/** Off by design — absence from the config IS the state. */
const INTENTIONALLY_ABSENT = new Set([
  'RAIVSTREAM_5_STUDIO_ENABLED',
  'RAIVSTREAM_5_SERIES_ENABLED',
  'RAIVSTREAM_5_AUDIO_ENABLED',
]);

/** Read by services but gated separately from CREATIVE_FLAGS. */
const OTHER_RUNTIME_FLAGS = ['FILMS_ENABLED'];

const CONFIG_PATH = resolve(__dirname, '../../../../../../ecosystem.config.cjs');

function configSource(): string {
  return readFileSync(CONFIG_PATH, 'utf8');
}

describe('runtime flags survive a deploy', () => {
  const source = configSource();
  const declared = [
    ...Object.values(CREATIVE_FLAGS),
    ...OTHER_RUNTIME_FLAGS,
  ];

  it('every flag the code reads is declared in the pm2 config or explicitly absent', () => {
    const missing = declared.filter(
      (name) => !INTENTIONALLY_ABSENT.has(name) && !source.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it('the disabled flags really are absent from the config', () => {
    for (const name of INTENTIONALLY_ABSENT) {
      expect(source.includes(name)).toBe(false);
    }
  });

  it('both apps declare the flags, not just one', () => {
    // A flag declared on web only is the worker gap in miniature.
    const appBlocks = source.split('name:').length - 1;
    expect(appBlocks).toBeGreaterThanOrEqual(2);
    const occurrences = declared.filter((name) => !INTENTIONALLY_ABSENT.has(name)).map(
      (name) => source.split(name).length - 1,
    );
    // FILMS_ENABLED is in both blocks; every declared flag should appear at least twice.
    expect(occurrences.every((count) => count >= 2)).toBe(true);
  });
});
