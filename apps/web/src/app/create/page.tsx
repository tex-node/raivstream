'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { useAuth, useUser, type AuthUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreateHero } from '@/components/creative/CreateHero';
import { CreativeInput } from '@/components/creative/CreativeInput';
import { InterpretationPanel } from '@/components/creative/InterpretationPanel';
import { ReadinessGate, type ReadinessResolution } from '@/components/creative/ReadinessGate';
import { InlineSignIn } from '@/components/auth/InlineSignIn';
import { clearDraft, isMeaningfulDraft, loadDraft, pickResumeProject, saveDraft, CREATE_DRAFT_VERSION, type CreateDraft } from '@/lib/creativeDraft';

type SaveState = 'idle' | 'saving' | 'saved';
type PendingSource = { file: File; label: string; kind: 'image' | 'video' };

const CONTEXT_ATTACHMENT: Record<string, string> = { PRODUCT: 'Product', BRAND: 'Brand', LOGO: 'Logo', PERSON: 'Reference', SOURCE: 'Source' };

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export default function CreatePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { setUser } = useAuth();
  const userId = user?.id ?? null;

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sourceSupplied, setSourceSupplied] = useState(false);
  const [interpreted, setInterpreted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // 'continue' = user tried to proceed past input; 'start' = user tried to start the project
  const [authPendingFor, setAuthPendingFor] = useState<'continue' | 'start' | null>(null);
  const hydratedRef = useRef(false);
  const pendingSourceRef = useRef<PendingSource | null>(null);

  const hasSourceAsset = attachments.length > 0 || sourceSupplied;

  // Restore an interrupted create session (client only).
  // Runs as soon as auth resolves (isLoaded), regardless of sign-in state, so
  // anonymous drafts are loaded and autosave is unblocked for logged-out users.
  useEffect(() => {
    if (!isLoaded) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const storage = browserStorage();
    if (!storage) return;

    // If text is already meaningful (inline auth — state lives in React), don't overwrite.
    if (isMeaningfulDraft({ version: CREATE_DRAFT_VERSION, text, attachments, sourceSupplied, interpreted, updatedAt: '' })) return;

    // Try user-keyed draft first (when signed in); fall back to anon draft.
    let draft = isSignedIn ? loadDraft(storage, userId) : null;
    if (!isMeaningfulDraft(draft)) {
      const anonDraft = loadDraft(storage, null);
      if (isMeaningfulDraft(anonDraft)) {
        draft = anonDraft;
        if (isSignedIn) clearDraft(storage, null); // adopt it once signed in
      }
    }

    if (draft && isMeaningfulDraft(draft)) {
      setText(draft.text);
      setAttachments(draft.attachments);
      setSourceSupplied(draft.sourceSupplied);
      setInterpreted(draft.interpreted);
      setRestored(true);
    }
  // text + attachments checked at effect time — deps intentionally omitted to avoid restore loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId]);

  // Quiet autosave (debounced): Saving… → ✓ Saved. Failures never destroy the
  // local state because the state lives in React; only persistence is skipped.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const storage = browserStorage();
    if (!storage) return;
    setSaveState('saving');
    const handle = setTimeout(() => {
      try {
        const draft: CreateDraft = { version: CREATE_DRAFT_VERSION, text, attachments, sourceSupplied, interpreted, updatedAt: new Date().toISOString() };
        saveDraft(storage, draft, userId);
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [text, attachments, sourceSupplied, interpreted, userId]);

  const readinessQuery = trpc.creative.intent.readiness.useQuery(
    { text, hasSourceAsset },
    { enabled: Boolean(isLoaded && isSignedIn && interpreted && text.trim().length > 3), retry: false },
  );

  const planMutation = trpc.creative.production.plan.useMutation();
  const requestUpload = trpc.creative.project.requestAttachmentUpload.useMutation();
  const confirmUpload = trpc.creative.project.confirmAttachment.useMutation();
  const createProject = trpc.creative.project.create.useMutation({
    onSuccess: async (project) => {
      const storage = browserStorage();
      if (storage) clearDraft(storage, userId);

      const pending = pendingSourceRef.current;
      pendingSourceRef.current = null;
      let readyForPlan = !pending;

      if (pending) {
        try {
          const { uploadUrl, key } = await requestUpload.mutateAsync({
            projectId: project.id,
            fileName: pending.file.name,
            contentType: pending.file.type || 'image/jpeg',
          });
          await fetch(uploadUrl, {
            method: 'PUT',
            body: pending.file,
            headers: { 'Content-Type': pending.file.type || 'image/jpeg' },
          });
          await confirmUpload.mutateAsync({ projectId: project.id, key, label: pending.label, kind: pending.kind });
          readyForPlan = true;
        } catch {
          // Upload failed — navigate to project; user can re-upload there
        }
      }

      if (readyForPlan) {
        try {
          await planMutation.mutateAsync({ projectId: project.id });
        } catch {
          /* the workspace can still build the plan */
        }
      }
      router.push(`/projects/${project.id}`);
    },
  });

  // Called by InlineSignIn after successful auth — continues the deferred flow without a page reload.
  const handleAuthSuccess = useCallback((authedUser: AuthUser) => {
    setUser(authedUser);
    const pending = authPendingFor;
    setAuthPendingFor(null);
    if (pending === 'continue') {
      setInterpreted(true);
    } else if (pending === 'start') {
      createProject.mutate({ text, attachments });
    }
  }, [authPendingFor, setUser, text, attachments, createProject]);

  const projectList = trpc.creative.project.list.useQuery(undefined, { enabled: Boolean(isLoaded && isSignedIn) });
  const resumable = pickResumeProject(
    (projectList.data ?? []) as Array<{ id: string; title: string; status?: string; updatedAt?: string | Date }>,
  );

  const readiness = readinessQuery.data?.readiness;

  const toggleAttachment = (label: string) =>
    setAttachments((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));

  const appendText = (addition: string) => setText((current) => `${current.trim().replace(/[.;]?$/, '')}. ${addition}`);

  const resolveReadiness = (resolution: ReadinessResolution) => {
    if (resolution.kind === 'fictional') {
      appendText('Use a fictional concept — invent it rather than using a real one.');
      return;
    }
    if (resolution.kind === 'asset') {
      // Real file selected — mark source supplied, add chip, store file for upload
      setSourceSupplied(true);
      const label = readiness && readiness.ready === false ? (CONTEXT_ATTACHMENT[readiness.contextType] ?? 'Source') : 'Source';
      const chip = resolution.fileName ? `${label}: ${resolution.fileName}` : label;
      setAttachments((current) => (current.includes(chip) ? current : [...current, chip]));
      if (resolution.file) {
        const isVideo = resolution.file.type.startsWith('video/');
        pendingSourceRef.current = { file: resolution.file, label, kind: isVideo ? 'video' : 'image' };
      }
    } else if (resolution.kind === 'describe') {
      // NAME-gate response: append brand/product name to intent text only.
      // Does NOT mark source as supplied — readiness will re-evaluate on next query.
      appendText(resolution.text);
    }
  };

  const startOver = () => {
    const storage = browserStorage();
    if (storage) clearDraft(storage, userId);
    setText('');
    setAttachments([]);
    setSourceSupplied(false);
    setInterpreted(false);
    setRestored(false);
    setSaveState('idle');
    setAuthPendingFor(null);
  };

  const handleContinue = () => {
    if (!isLoaded) return; // auth still resolving — button is harmless dead zone
    if (!isSignedIn) {
      setAuthPendingFor('continue');
      return;
    }
    setInterpreted(true);
  };

  const handleStart = () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAuthPendingFor('start');
      return;
    }
    createProject.mutate({ text, attachments });
  };

  const showGate = Boolean(readiness && readiness.ready === false);

  // While auth is resolving show an intentional loading state — never blank.
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 pt-28 pb-16 text-center">
          <p className="text-sm text-[var(--noc-t5)]">Preparing your creative workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-16">
        {(text.trim().length > 3 || interpreted) && (
          <div className="mb-4 flex items-center justify-end gap-3 text-xs text-[var(--noc-t5)]">
            {restored && (
              <button type="button" onClick={startOver} className="font-bold text-[var(--noc-purple)]">
                Start over
              </button>
            )}
            <span aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : ''}</span>
          </div>
        )}

        {!interpreted && resumable && (
          <a
            href={`/projects/${resumable.id}`}
            className="mb-6 flex items-center justify-between rounded-2xl border border-[rgba(79,139,214,0.25)] bg-[rgba(79,139,214,0.07)] px-4 py-3 text-sm hover:border-[var(--noc-blue)]"
          >
            <span className="font-bold text-[var(--noc-blue)]">Continue where you left off</span>
            <span className="truncate pl-3 text-[var(--noc-t4)]">{resumable.title}</span>
          </a>
        )}

        {authPendingFor ? (
          <InlineSignIn
            heading="Your draft is saved"
            subtext="Sign in to continue — it'll still be here."
            onSuccess={handleAuthSuccess}
            onBack={() => setAuthPendingFor(null)}
          />
        ) : !interpreted ? (
          <>
            <CreateHero />
            <CreativeInput
              text={text}
              onChange={setText}
              attachments={attachments}
              onToggleAttachment={toggleAttachment}
              onSubmit={handleContinue}
              disabled={createProject.isPending}
            />
          </>
        ) : showGate && readiness && readiness.ready === false ? (
          <ReadinessGate
            question={readiness.question}
            contextType={readiness.contextType}
            need={readiness.need}
            busy={readinessQuery.isFetching}
            onResolve={resolveReadiness}
            onBack={() => setInterpreted(false)}
          />
        ) : (
          <InterpretationPanel
            isLoading={readinessQuery.isLoading || readinessQuery.isFetching}
            error={readinessQuery.error?.message}
            interpretation={readinessQuery.data?.interpretation}
            onBack={() => setInterpreted(false)}
            onStart={handleStart}
            starting={createProject.isPending || planMutation.isPending}
            startError={createProject.error?.message}
          />
        )}
      </div>
    </div>
  );
}
