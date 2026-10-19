/**
 * D-076 — AI Studio form shape per model.
 *
 * VEED Fabric is media-driven: it takes a presenter image plus an audio track,
 * derives duration from the audio, and inherits the aspect ratio from the image.
 * Prompt, Format and Duration are therefore meaningless for it — and requiring a
 * prompt (the pre-fix behaviour) made Fabric unsubmittable at all.
 *
 * Extracted as a pure function so the per-model shape is testable without
 * mounting the page, and so the other models' form cannot drift: everything not
 * Fabric keeps exactly the fields it has today.
 */

export interface GenerateFormShape {
  isFabric: boolean;
  /** Prompt / Format / Duration are hidden for Fabric only. */
  showPrompt: boolean;
  showFormat: boolean;
  showDuration: boolean;
  /** Audio input is shown for Fabric (or any future model that needs audio). */
  showAudio: boolean;
  requirePrompt: boolean;
  requireSeedImage: boolean;
  requireAudio: boolean;
}

export function generateFormShape(input: {
  modelId: string;
  requiresSeedImage?: boolean;
  requiresAudioUrl?: boolean;
}): GenerateFormShape {
  const isFabric = input.modelId === 'VEED_FABRIC';
  const needsAudio = isFabric || input.requiresAudioUrl === true;

  return {
    isFabric,
    showPrompt: !isFabric,
    showFormat: !isFabric,
    showDuration: !isFabric,
    showAudio: needsAudio,
    // Fabric: media + consent instead of a prompt.
    requirePrompt: !isFabric,
    requireSeedImage: input.requiresSeedImage === true || isFabric,
    requireAudio: needsAudio,
  };
}

/** True when the form may be submitted for this model. */
export function canSubmitGenerateForm(
  shape: GenerateFormShape,
  values: { prompt: string; seedImageUrl: string; audioUrl: string; consent: boolean },
): boolean {
  if (shape.requirePrompt && !values.prompt.trim()) return false;
  if (shape.requireSeedImage && !values.seedImageUrl.trim()) return false;
  if (shape.requireAudio && (!values.audioUrl.trim() || !values.consent)) return false;
  return true;
}
