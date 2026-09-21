export type SceneImageModel = 'FLUX' | 'FLUX2';

export const SCENE_IMAGE_MODEL_OPTIONS: { value: SceneImageModel; label: string }[] = [
  { value: 'FLUX', label: 'Flux.1 Dev (RunPod)' },
  { value: 'FLUX2', label: 'Flux 2 (fal.ai)' },
];

export const DEFAULT_SCENE_IMAGE_MODEL: SceneImageModel = 'FLUX';
