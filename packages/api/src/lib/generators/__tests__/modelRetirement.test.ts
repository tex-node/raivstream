import { describe, it, expect } from 'vitest';
import { MODEL_META, type SupportedModel } from '../index';
import { SUPPORTED_MODELS } from '../../../routers/generation';

/**
 * D-001 — model retirement.
 *
 * Three families remain: FLUX2 (images), MiniMax H3 (video), VEED (avatar).
 * Everything else is retired but NOT removed from the `GenerationModel` enum
 * (Postgres cannot drop values in place), so the guard has to live here: the
 * API allowlist gates creation and `hidden` keeps them out of `listModels`.
 *
 * This test exists because the failure mode is silent — re-adding a model to
 * `SUPPORTED_MODELS` would make a retired provider chargeable again with no
 * error anywhere.
 */

const RETIRED: SupportedModel[] = [
  'NANO_BANANA',
  'GROK_IMAGINE',
  'LTX2',
  'WAN_25',
  'KLING_I2V',
  'KLING_R2V',
  'HIGGSFIELD',
  'VEO3',
  'FLUX',
  'HUNYUAN_VIDEO',
  'COG_VIDEO_X',
  'SEEDANCE',
];

describe('D-001 — model retirement', () => {
  it('allows only the three retained families to create jobs', () => {
    expect([...SUPPORTED_MODELS].sort()).toEqual(['FLUX2', 'H3_MAX', 'VEED_FABRIC']);
  });

  it('hides every retired model from listModels', () => {
    for (const model of RETIRED) {
      expect(MODEL_META[model].hidden, `${model} must stay hidden`).toBe(true);
    }
  });

  it('never hides a creatable model', () => {
    for (const model of SUPPORTED_MODELS) {
      expect(MODEL_META[model].hidden, `${model} is creatable, so it must be visible`).not.toBe(true);
    }
  });

  it('keeps retired ids in MODEL_META so historical jobs still render', () => {
    for (const model of RETIRED) {
      expect(MODEL_META[model]?.label, `${model} meta missing`).toBeTruthy();
    }
  });
});
