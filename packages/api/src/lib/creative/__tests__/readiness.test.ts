import { describe, it, expect } from 'vitest';
import { assessIntentReadiness, type IntentReadiness } from '../intent/readiness';
import { interpret } from '../intent/interpreter';

function assess(text: string, signals: { hasSourceAsset?: boolean; hasStudioProduct?: boolean } = {}): IntentReadiness {
  return assessIntentReadiness(text, interpret(text), signals);
}

function notReady(r: IntentReadiness) {
  if (r.ready) throw new Error('expected not ready');
  return r;
}

describe('intent readiness — creative freedom vs essential source', () => {
  it('story: ready without asking (Raivstream infers treatment)', () => {
    expect(assess('Create a cinematic short film about a woman returning home.').ready).toBe(true);
  });

  it('education: ready without asking', () => {
    expect(assess('Create a 3-minute lesson explaining photosynthesis to eight-year-olds.').ready).toBe(true);
  });

  it('commercial concept (no ownership): ready', () => {
    expect(assess('Create a 60-second cinematic commercial for a new premium skincare brand.').ready).toBe(true);
  });

  it('real product without asset: not ready, asks for PRODUCT (never invents it)', () => {
    const r = notReady(assess('Create an advertisement for my skincare product.'));
    expect(r.contextType).toBe('PRODUCT');
    expect(r.reason).toBe('MISSING_ESSENTIAL_CONTEXT');
    expect(r.question.length).toBeGreaterThan(0);
  });

  it('real product with asset supplied: ready', () => {
    expect(assess('Create an advertisement for my skincare product.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('existing Studio product: ready without asking again', () => {
    expect(assess('Create an advertisement for my product.', { hasStudioProduct: true }).ready).toBe(true);
  });

  it('explicit fictional product: ready (invention authorized)', () => {
    expect(assess('Invent a luxury whiskey brand and create a cinematic advertisement.').ready).toBe(true);
  });

  it('transform without a source: not ready', () => {
    const r = notReady(assess('Turn my product into a cinematic commercial.'));
    expect(['PRODUCT', 'SOURCE']).toContain(r.contextType);
  });

  it('transform with a source attached: ready', () => {
    expect(assess('Turn this image into a cinematic video.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('transform of an attached source with no attachment: asks for SOURCE', () => {
    const r = notReady(assess('Turn this image into a cinematic video.'));
    expect(r.contextType).toBe('SOURCE');
  });

  it('bare "Promote something": asks what the creator is promoting', () => {
    const r = notReady(assess('Promote something'));
    expect(r.contextType).toBe('PRODUCT');
  });

  it('owned brand without assets: asks for BRAND', () => {
    const r = notReady(assess('Create a campaign for my fashion brand.'));
    expect(r.contextType).toBe('BRAND');
  });

  it('owned logo without assets: asks for LOGO', () => {
    const r = notReady(assess('Make an ad featuring my logo.'));
    expect(r.contextType).toBe('LOGO');
  });

  it('real-person likeness without a reference: asks for PERSON', () => {
    const r = notReady(assess('Create a video using a photo of me.'));
    expect(r.contextType).toBe('PERSON');
  });
});
