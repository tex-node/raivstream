import { describe, it, expect } from 'vitest';
import {
  CREATE_DRAFT_VERSION,
  clearDraft,
  createDraftKey,
  isMeaningfulDraft,
  loadDraft,
  parseDraft,
  pickResumeProject,
  saveDraft,
  serializeDraft,
  type CreateDraft,
} from './creativeDraft';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

function draft(overrides: Partial<CreateDraft> = {}): CreateDraft {
  return {
    version: CREATE_DRAFT_VERSION,
    text: 'Create a cinematic short film about a woman returning home.',
    attachments: ['Image'],
    sourceSupplied: false,
    interpreted: true,
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('create-session autosave', () => {
  it('survives reload (save → load round-trip)', () => {
    const storage = fakeStorage();
    saveDraft(storage, draft({ text: 'Promote my skincare product' }), 'u1');
    // "reload" = a fresh read from the same storage
    const restored = loadDraft(storage, 'u1');
    expect(restored?.text).toBe('Promote my skincare product');
    expect(restored?.interpreted).toBe(true);
  });

  it('keeps attachments/references associated with the session', () => {
    const storage = fakeStorage();
    saveDraft(storage, draft({ attachments: ['Product', 'Image'] }), 'u1');
    expect(loadDraft(storage, 'u1')?.attachments).toEqual(['Product', 'Image']);
  });

  it('does not persist an empty/meaningless draft', () => {
    const storage = fakeStorage();
    saveDraft(storage, draft({ text: '', attachments: [] }), 'u1');
    expect(storage.map.size).toBe(0);
    // and it removes a previously saved draft
    saveDraft(storage, draft(), 'u1');
    expect(storage.map.size).toBe(1);
    saveDraft(storage, draft({ text: '', attachments: [] }), 'u1');
    expect(storage.map.size).toBe(0);
  });

  it('is per-user and clearable', () => {
    const storage = fakeStorage();
    saveDraft(storage, draft({ text: 'alice idea' }), 'alice');
    saveDraft(storage, draft({ text: 'bob idea' }), 'bob');
    expect(loadDraft(storage, 'alice')?.text).toBe('alice idea');
    expect(loadDraft(storage, 'bob')?.text).toBe('bob idea');
    clearDraft(storage, 'alice');
    expect(loadDraft(storage, 'alice')).toBeNull();
    expect(loadDraft(storage, 'bob')?.text).toBe('bob idea');
    expect(createDraftKey('alice')).toContain('alice');
  });

  it('rejects malformed or version-mismatched drafts (never crashes)', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 999, text: 'x' }))).toBeNull();
    expect(parseDraft(JSON.stringify(draft()))?.text).toContain('cinematic');
  });

  it('restoring a saved draft is meaningful for resume', () => {
    expect(isMeaningfulDraft(parseDraft(serializeDraft(draft())))).toBe(true);
    expect(isMeaningfulDraft(draft({ text: '', attachments: [] }))).toBe(false);
  });

  it('autosave does not duplicate records — one key per user, overwritten in place', () => {
    const storage = fakeStorage();
    saveDraft(storage, draft({ text: 'first' }), 'u1');
    saveDraft(storage, draft({ text: 'second' }), 'u1');
    expect(storage.map.size).toBe(1);
    expect(loadDraft(storage, 'u1')?.text).toBe('second');
  });
});

describe('resume existing project', () => {
  const projects = [
    { id: 'p-old', status: 'REVIEW', updatedAt: '2026-09-01T00:00:00Z' },
    { id: 'p-new', status: 'PLANNING', updatedAt: '2026-09-20T00:00:00Z' },
    { id: 'p-arch', status: 'ARCHIVED', updatedAt: '2026-09-25T00:00:00Z' },
    { id: 'p-pub', status: 'PUBLISHED', updatedAt: '2026-09-26T00:00:00Z' },
  ];

  it('picks the most recently updated resumable project', () => {
    expect(pickResumeProject(projects)?.id).toBe('p-new');
  });

  it('ignores archived/published projects and returns null when none remain', () => {
    expect(pickResumeProject([projects[2], projects[3]])).toBeNull();
    expect(pickResumeProject([])).toBeNull();
  });
});
