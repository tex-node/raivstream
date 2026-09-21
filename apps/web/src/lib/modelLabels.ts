export const MODEL_KEYS = [
  'NANO_BANANA',
  'GROK_IMAGINE',
  'LTX2',
  'WAN_25',
  'KLING',
  'KLING_I2V',
  'KLING_R2V',
  'HIGGSFIELD',
  'VEO3',
  'FLUX',
  'HUNYUAN_VIDEO',
  'COG_VIDEO_X',
  'SEEDANCE',
  'FLUX2',
  'H3_MAX',
  'VEED_FABRIC',
] as const;

export type ModelKey = (typeof MODEL_KEYS)[number];

export const MODEL_LABELS: Record<string, string> = {
  NANO_BANANA:   'Nano Banana',
  GROK_IMAGINE:  'Grok Imagine',
  LTX2:          'LTX-2',
  WAN_25:        'Wan 2.6',
  KLING:         'Kling',
  KLING_I2V:     'Kling I2V',
  KLING_R2V:     'Kling R2V',
  HIGGSFIELD:    'Higgsfield',
  VEO3:          'Veo 3',
  FLUX:          'Flux.1 Dev',
  HUNYUAN_VIDEO: 'HunyuanVideo',
  COG_VIDEO_X:   'CogVideoX',
  SEEDANCE:      'Seedance 1.5 Pro',
  FLUX2:         'Flux 2',
  H3_MAX:        'MiniMax H3-Max',
  VEED_FABRIC:   'VEED Fabric',
};

export const MODEL_OPTIONS: { value: ModelKey; label: string }[] = MODEL_KEYS.map((value) => ({
  value,
  label: MODEL_LABELS[value],
}));
