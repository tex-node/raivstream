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

/** Off by design — and declared 'false' EXPLICITLY, never left absent.
 *
 * Absence was the original rule and it was wrong: the deploy workflow does
 * `source apps/web/.env.local` before `pm2 start`, so a flag absent from this config
 * still reaches the process from that file. Studio and series were live `true` for
 * exactly that reason while this test passed - it checked the config, not the runtime.
 */
const DECLARED_OFF = new Set([
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

  it('every flag the code reads is declared in the pm2 config', () => {
    const missing = declared.filter((name) => !source.includes(name));
    expect(missing).toEqual([]);
  });

  it("the off flags are declared 'false', never absent", () => {
    for (const name of DECLARED_OFF) {
      expect(source.includes(`${name}: 'false'`)).toBe(true);
    }
  });

  it('both apps declare the flags, not just one', () => {
    // A flag declared on web only is the worker gap in miniature.
    const appBlocks = source.split('name:').length - 1;
    expect(appBlocks).toBeGreaterThanOrEqual(2);
    const occurrences = declared.filter((name) => !DECLARED_OFF.has(name)).map(
      (name) => source.split(name).length - 1,
    );
    // FILMS_ENABLED is in both blocks; every declared flag should appear at least twice.
    expect(occurrences.every((count) => count >= 2)).toBe(true);
  });
});
