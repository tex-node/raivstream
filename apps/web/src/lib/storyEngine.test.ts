import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineLabel } from './storyEngine';

/**
 * The engine record, surfaced to its creator (2026-11-11).
 *
 * The record already existed — `StoryChapter.providerMetadata`, written by both chapter paths with
 * the provider and the model — and its only reader was `/admin/prompt-quality`. These tests pin the
 * three rules of showing it: every provider renders distinctly (including the deterministic
 * fallback), absence renders nothing rather than a guess, and the creator-facing query actually
 * fetches the field instead of relying on it being somewhere in the response.
 */

const STORY_ROUTER = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'packages', 'api', 'src', 'routers', 'story.ts'),
  'utf8',
);
const STORY_SCREEN = readFileSync(
  join(__dirname, '..', 'components', 'mobile-handoff', 'StoryScreen.tsx'),
  'utf8',
);

describe('every engine says something different', () => {
  it('names Claude and its model', () => {
    const label = engineLabel({ provider: 'claude-narrative', model: 'claude-3-5-sonnet' });
    expect(label).toContain('Claude');
    expect(label).toContain('claude-3-5-sonnet');
  });

  it('names an external language model without leaking vendor jargon', () => {
    const label = engineLabel({ provider: 'openai-compatible', model: 'gpt-4o-mini' });
    expect(label).toContain('external language model');
    expect(label).toContain('gpt-4o-mini');
    expect(label).not.toContain('openai-compatible');
  });

  it('says plainly that the deterministic fallback used no model', () => {
    const label = engineLabel({ provider: 'local-fallback' });
    expect(label).toContain('built-in story writer');
    expect(label).toContain('no language model');
    // The fallback must never be dressed as Claude, or as a generic "AI".
    expect(label).not.toContain('Claude');
  });

  it('the three providers produce three distinct labels', () => {
    const labels = [
      engineLabel({ provider: 'claude-narrative' }),
      engineLabel({ provider: 'openai-compatible' }),
      engineLabel({ provider: 'local-fallback' }),
    ];
    expect(new Set(labels).size).toBe(3);
    for (const label of labels) expect(label).toBeTruthy();
  });
});

describe('absence is not evidence', () => {
  it('renders nothing for a chapter with no metadata', () => {
    expect(engineLabel(null)).toBeNull();
    expect(engineLabel(undefined)).toBeNull();
    expect(engineLabel({})).toBeNull();
  });

  it('renders nothing for an unknown provider rather than guessing', () => {
    expect(engineLabel({ provider: 'some-future-engine' })).toBeNull();
    expect(engineLabel({ provider: '' })).toBeNull();
    expect(engineLabel({ provider: 42 })).toBeNull();
  });
});

describe('the creator-facing path actually carries it', () => {
  it('the shared chapter select fetches providerMetadata', () => {
    const chapterSelect = STORY_ROUTER.slice(STORY_ROUTER.indexOf('function chapterSelect'));
    const block = chapterSelect.slice(0, 1200);
    expect(block).toContain('providerMetadata: true');
  });

  it('the story screen renders the label per chapter and hides it on R16', () => {
    expect(STORY_SCREEN).toContain('engineLabel');
    expect(STORY_SCREEN).toContain('latestChapter.providerMetadata');
    expect(STORY_SCREEN).toContain('!isR16 && engineLabel(');
  });
});
