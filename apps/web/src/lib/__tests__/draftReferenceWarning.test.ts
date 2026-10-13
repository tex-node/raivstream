import { describe, expect, it } from 'vitest';
import { shouldShowDraftReferenceWarning } from '../draftReferenceWarning';

describe('shouldShowDraftReferenceWarning', () => {
  it('shows when a scene character lacks an approved reference (main app)', () => {
    expect(shouldShowDraftReferenceWarning({ hasDraftReferences: true, isR16: false, dismissed: false })).toBe(true);
  });

  it('hides when there are no draft references', () => {
    expect(shouldShowDraftReferenceWarning({ hasDraftReferences: false, isR16: false, dismissed: false })).toBe(false);
    expect(shouldShowDraftReferenceWarning({ hasDraftReferences: undefined, isR16: false, dismissed: false })).toBe(false);
    expect(shouldShowDraftReferenceWarning({ hasDraftReferences: null, isR16: false, dismissed: false })).toBe(false);
  });

  it('hides entirely on R16', () => {
    expect(shouldShowDraftReferenceWarning({ hasDraftReferences: true, isR16: true, dismissed: false })).toBe(false);
  });

  it('stays hidden once dismissed for the session', () => {
    expect(shouldShowDraftReferenceWarning({ hasDraftReferences: true, isR16: false, dismissed: true })).toBe(false);
  });
});
