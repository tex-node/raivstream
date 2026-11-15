import { describe, expect, it } from 'vitest';
import { getFalRelightStatus } from '../generators/falRelight';
describe('the relight job id carries its endpoint', () => {
  it('refuses a malformed id instead of polling a bogus app', async () => {
    const result = await getFalRelightStatus('fal:relight:no-endpoint-here');
    expect(result.status).toBe('failed');
    expect(String(result.error)).toMatch(/malformed/);
  });
});
