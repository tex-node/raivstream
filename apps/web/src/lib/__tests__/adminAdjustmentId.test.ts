import { describe, expect, it } from 'vitest';
import { newAdjustmentId, shouldSubmitAdjustment } from '../adminAdjustmentId';

describe('newAdjustmentId', () => {
  it('returns a valid v4 uuid', () => {
    expect(newAdjustmentId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('two identical submits get different ids → both grants are issued', () => {
    expect(newAdjustmentId()).not.toBe(newAdjustmentId());
  });
});

describe('shouldSubmitAdjustment', () => {
  it('ignores a double-click while the mutation is in flight', () => {
    expect(shouldSubmitAdjustment(true)).toBe(false);
    expect(shouldSubmitAdjustment(false)).toBe(true);
  });
});
