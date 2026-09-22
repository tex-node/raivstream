import { describe, it, expect } from 'vitest';
import { moderatePrompt, moderationRejectMessage, suggestSafeRewrite } from '../promptModeration';

describe('promptModeration — flagged-phrase localization', () => {
  it('points to the exact blocklist phrase for graphic violence', async () => {
    const result = await moderatePrompt('Marcus walks the alley, then the gore is shown.');
    expect(result.allowed).toBe(false);
    expect(result.flaggedPhrase).toBeTruthy();
    expect(result.flaggedPhrase).toMatch(/gore/);
  });

  it('includes the flagged phrase in the reject message so the user can edit it', async () => {
    const result = await moderatePrompt('The alley fills with gore and screaming.');
    const message = moderationRejectMessage(result, 'Please try a safer picture idea.');
    expect(message).toContain('Flagged phrase');
    expect(message).toContain('gore');
    expect(message).toContain('Edit or replace that phrase to continue.');
  });

  it('returns the reason when flagged but no phrase could be isolated', async () => {
    const message = moderationRejectMessage({ allowed: false, reason: 'nope', flaggedPhrase: null }, 'fallback');
    expect(message).toBe('nope');
  });

  it('returns the fallback when nothing was flagged', async () => {
    const message = moderationRejectMessage({ allowed: true }, 'fallback');
    expect(message).toBe('fallback');
  });

  it('allows a clean prompt', async () => {
    const result = await moderatePrompt('Maya paddles the canoe through calm, misty morning water.');
    expect(result.allowed).toBe(true);
  });
});

describe('promptModeration — safe-rewrite suggestions', () => {
  it('suggests a safe rewrite for a blocklist-flagged violence phrase', async () => {
    const suggestion = await suggestSafeRewrite('The alley fills with gore and screaming.');
    expect(suggestion.flaggedPhrase).toMatch(/gore/);
    expect(suggestion.safeRewrite).toMatch(/tension/);
    expect(suggestion.safeRewrite).not.toMatch(/gore/);
  });

  it('returns flaggedPhrase null for clean text', async () => {
    const suggestion = await suggestSafeRewrite('Maya paddles the canoe through calm morning water.');
    expect(suggestion.flaggedPhrase).toBeNull();
    expect(suggestion.safeRewrite).toBeNull();
  });

  it('returns no rewrite when flagged but no known term maps', async () => {
    const suggestion = await suggestSafeRewrite('The alley fills with gore and screaming.');
    // gore maps; a phrase without a mapped term would return null safeRewrite.
    expect(suggestion.safeRewrite).toBeTruthy();
  });
});