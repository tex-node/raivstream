/**
 * Raivstream 5.0 — durable create-session drafts.
 *
 * A creative session should be resumable by default. Before a project exists,
 * the in-progress create state (intent, references, readiness) is persisted so
 * an interrupted session can continue. Pure + storage-injectable so the
 * behaviour is unit-testable without a browser.
 *
 * After a project exists, all meaningful state is already persisted server-side
 * (Brief/Bible/Plan/Assets/Versions/Approvals/Outputs) — no second store.
 */

/** Minimal directing decision shape for draft persistence — avoids cross-package imports. */
export interface DirectingDecisionDraft {
  id: string;
  category: string;
  label: string;
  value: string;
  rationale: string;
  provenance: string;
  createdAt: string;
}

export interface CreateDraft {
  version: 1;
  text: string;
  attachments: string[];
  sourceSupplied: boolean;
  interpreted: boolean;
  updatedAt: string;
  /** Conversational stage for the STORY branch. story_directing is restored as-is. */
  convStage?: 'story_branch' | 'story_input' | 'story_directing';
  /** The creator's submitted story text (STORY branch). */
  storyText?: string;
  /** Approved directing decisions for the Homer Directing flow (Phase 2). */
  directingDecisions?: DirectingDecisionDraft[];
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CREATE_DRAFT_VERSION = 1;

export function createDraftKey(userId?: string | null): string {
  return `raivstream:create-draft:${userId ?? 'anon'}`;
}

/** A draft worth restoring/resuming. */
export function isMeaningfulDraft(draft: Partial<CreateDraft> | null | undefined): boolean {
  if (!draft) return false;
  return Boolean(draft.text && draft.text.trim().length > 3) || (draft.attachments?.length ?? 0) > 0;
}

export function serializeDraft(draft: CreateDraft): string {
  return JSON.stringify(draft);
}

export function parseDraft(raw: string | null): CreateDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CreateDraft>;
    if (parsed?.version !== CREATE_DRAFT_VERSION) return null;
    const convStageRaw = parsed.convStage;
    const validStages = ['story_branch', 'story_input', 'story_directing'] as const;
    const convStage = validStages.includes(convStageRaw as (typeof validStages)[number])
      ? (convStageRaw as (typeof validStages)[number])
      : undefined;
    const rawDecisions = parsed.directingDecisions;
    const directingDecisions: DirectingDecisionDraft[] | undefined =
      Array.isArray(rawDecisions)
        ? rawDecisions.filter(
            (item): item is DirectingDecisionDraft =>
              typeof item === 'object' && item !== null &&
              typeof (item as DirectingDecisionDraft).id === 'string' &&
              typeof (item as DirectingDecisionDraft).category === 'string' &&
              typeof (item as DirectingDecisionDraft).value === 'string',
          )
        : undefined;
    return {
      version: CREATE_DRAFT_VERSION,
      text: typeof parsed.text === 'string' ? parsed.text : '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments.filter((item): item is string => typeof item === 'string') : [],
      sourceSupplied: Boolean(parsed.sourceSupplied),
      interpreted: Boolean(parsed.interpreted),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      convStage,
      storyText: typeof parsed.storyText === 'string' ? parsed.storyText : undefined,
      directingDecisions: directingDecisions && directingDecisions.length > 0 ? directingDecisions : undefined,
    };
  } catch {
    return null;
  }
}

export function loadDraft(storage: DraftStorage, userId?: string | null): CreateDraft | null {
  return parseDraft(storage.getItem(createDraftKey(userId)));
}

export function saveDraft(storage: DraftStorage, draft: CreateDraft, userId?: string | null): void {
  if (!isMeaningfulDraft(draft)) {
    storage.removeItem(createDraftKey(userId));
    return;
  }
  storage.setItem(createDraftKey(userId), serializeDraft(draft));
}

export function clearDraft(storage: DraftStorage, userId?: string | null): void {
  storage.removeItem(createDraftKey(userId));
}

/** Pick the most recently updated resumable project ("Continue where you left off"). */
export function pickResumeProject<T extends { id: string; status?: string; updatedAt?: string | Date }>(projects: T[]): T | null {
  const resumable = projects.filter((project) => project.status !== 'ARCHIVED' && project.status !== 'PUBLISHED');
  if (resumable.length === 0) return null;
  return resumable.reduce((latest, project) => {
    const a = new Date(project.updatedAt ?? 0).getTime();
    const b = new Date(latest.updatedAt ?? 0).getTime();
    return a >= b ? project : latest;
  }, resumable[0]);
}
