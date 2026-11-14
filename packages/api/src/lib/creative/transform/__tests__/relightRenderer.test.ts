import { describe, expect, it } from 'vitest';
import { createRelightRenderer, TransformEndpointUnconfigured } from '../relightRenderer';

/**
 * The renderer reuses the existing fal adapter (2026-11-14).
 *
 * The earlier record claimed there was no fal client. It was wrong: mediaProviders/fal/ supplies the queue
 * transport and persistFalOutput, and generators/falFlux2Edit.ts is the pattern. What was missing was a
 * relight adapter and a call site. These tests pin the two things that keep the wiring honest: no guessed
 * slug, and no second transport.
 */
describe('the relight renderer', () => {
  const source = { sourceAssetUrl: 'https://cdn/src.mp4', operation: 'relight' as const, resolution: '480p', outputSeconds: 10 };

  it('fails closed with a named reason when no endpoint is configured - no slug is guessed', async () => {
    const render = createRelightRenderer({});
    await expect(render(source)).rejects.toBeInstanceOf(TransformEndpointUnconfigured);
    await expect(render(source)).rejects.toThrow(/TRANSFORM_ENDPOINT_CONTRACT_UNVERIFIED/);
  });

  it('passes the source url and an edit instruction to the injected submit', async () => {
    const calls: Array<{ endpointId: string; videoUrl: string; prompt: string }> = [];
    const render = createRelightRenderer({
      endpointId: 'fal-ai/test/relight',
      submit: async (input) => { calls.push(input); return 'https://cdn/relit.mp4'; },
    });
    await expect(render(source)).resolves.toBe('https://cdn/relit.mp4');
    expect(calls[0]!.videoUrl).toBe('https://cdn/src.mp4');
    expect(calls[0]!.endpointId).toBe('fal-ai/test/relight');
    expect(calls[0]!.prompt).toMatch(/[Rr]elight/);
  });

  it('reads its endpoint from configuration rather than a constant', () => {
    // The environment is the contract surface: an operator states the endpoint, the code does not invent it.
    expect(createRelightRenderer.toString()).toContain('FAL_RELIGHT_ENDPOINT');
  });
});
