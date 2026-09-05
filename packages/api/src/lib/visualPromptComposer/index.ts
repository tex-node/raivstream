// Visual Prompt Composer V2 — public interface
//
// Usage:
//   if (isVisualPromptComposerV2Enabled()) {
//     return composeV2(input);
//   }
//   // fall back to V1 behavior

export { compose as composeV2 } from './composer';
export { isVisualPromptComposerV2Enabled, VPC_VERSION, VpcError } from './types';
export type {
  CanonicalVisualPrompt,
  VpcComposerInput,
  VpcComposerOutput,
  CharacterVisualLock,
  CameraSpec,
  VpcMedium,
  VpcVersion,
} from './types';

// Re-export utilities useful to callers
export { isProblematicallySimilar, promptSimilarityRatio } from './budget';
export { containsInjectionAttempt } from './injection';
