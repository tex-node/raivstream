/**
 * The relight renderer — reaching fal through the adapter that already exists (2026-11-14).
 *
 * The previous record said "the repo has no fal client at all". **That was wrong.** fal is fully present:
 * `mediaProviders/fal/falMediaProvider.ts` (queue transport over `@fal-ai/client`), `falStorage.ts`
 * (`persistFalOutput`), and per-model adapters (`generators/falFlux2.ts`, `falFlux2Edit.ts`, `falH3Max.ts`).
 * What was actually missing is an **adapter function for the relight endpoint** plus a call site that
 * supplies `render` — not a transport.
 *
 * Two facts about the existing adapter shape the wiring:
 *   1. It is **disabled by default**. `readFalMediaConfig()` + `isFalCapabilityLive()` gate every call, so a
 *      render throws `PROVIDER_DISABLED` without touching the network unless fal is switched on and
 *      `FAL_MAX_REQUESTS` allows it. That is the correct behaviour for an operation with no live proof.
 *   2. Its endpoints are a **contract set** — an endpoint id that is not allowed is refused by the same
 *      dispatch that refuses a disabled provider, rather than by an error path invented here.
 *
 * What this module refuses to do: guess a slug. The minimax relight endpoint has a verified **price** and an
 * **unread contract** (its queue schema 404s), so calling it with an invented input shape would be the
 * migration-directory mistake with a request body. The endpoint must be stated explicitly in configuration;
 * without it the renderer fails closed with a named reason.
 */
import type { TransformOperation } from './derivedAsset';

export interface RelightRendererConfig {
  /** Explicitly configured endpoint id, e.g. 'fal-ai/<vendor>/<model>/relight'. No default slug is guessed. */
  endpointId?: string;
  /** Injected for tests: the actual submit-and-persist call. */
  submit?: (input: { endpointId: string; videoUrl: string; prompt: string }) => Promise<string>;
}

export interface RelightRenderer {
  (input: { sourceAssetUrl: string; operation: TransformOperation; resolution: string; outputSeconds: number }): Promise<string>;
}

export class TransformEndpointUnconfigured extends Error {
  constructor(operation: TransformOperation) {
    super(`TRANSFORM_ENDPOINT_CONTRACT_UNVERIFIED: no endpoint configured for ${operation}; its contract has not been read, so no slug is guessed.`);
    this.name = 'TransformEndpointUnconfigured';
  }
}

/**
 * Build the `render` dependency `deriveTransformTake` expects. The transformation is expressed as an edit
 * instruction over the source video, which is the shape the verified fal edit contracts take
 * (`fal-ai/kling-video/v4/video-to-video/edit`: required `prompt` + `video_url`).
 */
export function createRelightRenderer(config: RelightRendererConfig = {}): RelightRenderer {
  const endpointId = config.endpointId ?? process.env.FAL_RELIGHT_ENDPOINT;

  return async (input) => {
    if (!endpointId) throw new TransformEndpointUnconfigured(input.operation);

    const prompt = `Relight this shot: ${input.resolution}, preserving the subject and composition. Match the lighting to the scene.`;
    if (config.submit) {
      return config.submit({ endpointId, videoUrl: input.sourceAssetUrl, prompt });
    }

    // Reuse the existing fal dispatch rather than opening a second transport. `submitFalRelight` is the
    // thin adapter beside falFlux2Edit/falH3Max and shares persistFalOutput, the queue poll and the
    // contract set; it is the only new code the wiring needs.
    const { submitFalRelight } = await import('../../generators/falRelight');
    return submitFalRelight({ endpointId, videoUrl: input.sourceAssetUrl, prompt, resolution: input.resolution });
  };
}
