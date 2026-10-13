import { describe, it, expect, vi } from 'vitest';
import { resolveNarrationScript, NarrationModerationError, type ResolveNarrationScriptDeps } from '../narrationScript';

const REJECTED = { allowed: false, reason: 'blocked by guidelines', flaggedPhrase: 'gore' };
const ALLOWED = { allowed: true };

function deps(overrides: Partial<ResolveNarrationScriptDeps> = {}): ResolveNarrationScriptDeps {
  return {
    generate: vi.fn(async () => 'a gentle forest walk at sunrise'),
    moderate: vi.fn(async () => ALLOWED),
    persist: vi.fn(async () => undefined),
    rejectMessage: (m) => `rejected: ${m.reason ?? 'unknown'}`,
    ...overrides,
  };
}

describe('resolveNarrationScript — moderate-before-persist invariant', () => {
  it('does NOT persist a moderation-rejected script', async () => {
    const persist = vi.fn(async () => undefined);
    const d = deps({
      generate: vi.fn(async () => 'a graphic gore scene'),
      moderate: vi.fn(async () => REJECTED),
      persist,
    });

    await expect(resolveNarrationScript(null, d)).rejects.toBeInstanceOf(NarrationModerationError);
    expect(persist).not.toHaveBeenCalled();
  });

  it('a retry generates and moderates a FRESH script (the rejected one is never stored)', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce('a graphic gore scene')  // attempt 1 → rejected
      .mockResolvedValueOnce('a warm, gentle evening'); // attempt 2 → approved
    const moderate = vi.fn()
      .mockResolvedValueOnce(REJECTED)
      .mockResolvedValueOnce(ALLOWED);
    const persist = vi.fn(async () => undefined);
    const d = deps({ generate, moderate, persist });

    // First attempt: rejected, nothing persisted.
    await expect(resolveNarrationScript(null, d)).rejects.toBeInstanceOf(NarrationModerationError);
    expect(persist).not.toHaveBeenCalled();

    // Retry: a fresh script is generated, moderated, then persisted.
    const second = await resolveNarrationScript(null, d);
    expect(second).toEqual({ script: 'a warm, gentle evening', generated: true });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('a warm, gentle evening');
  });

  it('reuses an existing approved script without generating or persisting again (idempotent)', async () => {
    const generate = vi.fn(); const moderate = vi.fn(); const persist = vi.fn();
    const result = await resolveNarrationScript('an existing approved script', deps({ generate, moderate, persist }));

    expect(result).toEqual({ script: 'an existing approved script', generated: false });
    expect(generate).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
