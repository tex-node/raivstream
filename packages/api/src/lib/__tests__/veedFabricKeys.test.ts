import { describe, it, expect } from 'vitest';
import { veedFabricFeatureKey } from '../credits';

/**
 * D-002 - each VEED tier must resolve to its own rate key. The previous
 * implementation mapped everything except '720p' to 480p, so a 1080p job would
 * have been charged at the 480p rate - a silent undercharge, not an error.
 */
describe('veedFabricFeatureKey', () => {
  it('resolves each tier explicitly', () => {
    expect(veedFabricFeatureKey('480p')).toBe('generate:veed_fabric_480p');
    expect(veedFabricFeatureKey('720p')).toBe('generate:veed_fabric_720p');
    expect(veedFabricFeatureKey('1080p')).toBe('generate:veed_fabric_1080p');
  });

  it('is case-insensitive', () => {
    expect(veedFabricFeatureKey('1080P')).toBe('generate:veed_fabric_1080p');
  });

  it('falls back to 480p for unknown tiers rather than throwing', () => {
    expect(veedFabricFeatureKey('2160p')).toBe('generate:veed_fabric_480p');
  });
});