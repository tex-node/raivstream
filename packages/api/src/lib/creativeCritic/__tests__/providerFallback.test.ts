import { describe, expect, it } from 'vitest';
import { CreativeCriticUnavailableError } from '../creativeCriticProvider';
import { creativeCriticResultSchema, parseJsonObject } from '../criticTypes';

describe('creative critic provider fallback validation', () => {
  it('parses embedded JSON and rejects malformed schema results', () => {
    const parsed = parseJsonObject('```json\n{"overallScore":95}\n```');
    expect(parsed).toEqual({ overallScore: 95 });
    expect(() => creativeCriticResultSchema.parse(parsed)).toThrow();
  });

  it('models missing provider configuration as unavailable', () => {
    const error = new CreativeCriticUnavailableError();
    expect(error.name).toBe('CreativeCriticUnavailableError');
    expect(error.message).toContain('not configured');
  });
});
