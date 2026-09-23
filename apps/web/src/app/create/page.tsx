'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreateHero } from '@/components/creative/CreateHero';
import { CreativeInput } from '@/components/creative/CreativeInput';
import { InterpretationPanel } from '@/components/creative/InterpretationPanel';
import { ReadinessGate, type ReadinessResolution } from '@/components/creative/ReadinessGate';
import { clearDraft, loadDraft, pickResumeProject, saveDraft, CREATE_DRAFT_VERSION, type CreateDraft } from '@/lib/creativeDraft';

type SaveState = 'idle' | 'saving' | 'saved';

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export default function CreatePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const userId = user?.id ?? null;

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sourceSupplied, setSourceSupplied] = useState(false);
  const [interpreted, setInterpreted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const hydratedRef = useRef(false);

  const hasSourceAsset = attachments.length > 0 || sourceSupplied;

  // Restore an interrupted create session (client only).
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const storage = browserStorage();
    const draft = storage ? loadDraft(storage, userId) : null;
    if (draft) {
      setText(draft.text);
      setAttachments(draft.attachments);
      setSourceSupplied(draft.sourceSupplied);
      setInterpreted(draft.interpreted);
      setRestored(true);
    }
    hydratedRef.current = true;
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
  const createProject = trpc.creative.project.create.useMutation({
    onSuccess: async (project) => {
      const storage = browserStorage();
      if (storage) clearDraft(storage, userId);
      try {
        await planMutation.mutateAsync({ projectId: project.id });
      } catch {
        /* the workspace can still build the plan */
      }
      router.push(`/projects/${project.id}`);
    },
  });

  const projectList = trpc.creative.project.list.useQuery(undefined, { enabled: Boolean(isLoaded && isSignedIn) });
  const resumable = pickResumeProject(
    (projectList.data ?? []) as Array<{ id: string; title: string; status?: string; updatedAt?: string | Date }>,
  );

  const toggleAttachment = (label: string) =>
    setAttachments((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));

  const appendText = (addition: string) => setText((current) => `${current.trim().replace(/[.;]?$/, '')}. ${addition}`);

  const resolveReadiness = (resolution: ReadinessResolution) => {
    if (resolution.kind === 'asset') {
      setSourceSupplied(true);
    } else if (resolution.kind === 'describe') {
      setSourceSupplied(true);
      appendText(resolution.text);
    } else {
      appendText('Use a fictional concept — invent it rather than using a real one.');
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
  };

  const readiness = readinessQuery.data?.readiness;
  const showGate = Boolean(readiness && readiness.ready === false);

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

        {!interpreted ? (
          <>
            <CreateHero />
            <CreativeInput
              text={text}
              onChange={setText}
              attachments={attachments}
              onToggleAttachment={toggleAttachment}
              onSubmit={() => setInterpreted(true)}
              disabled={createProject.isPending}
            />
          </>
        ) : showGate && readiness && readiness.ready === false ? (
          <ReadinessGate
            question={readiness.question}
            contextType={readiness.contextType}
            busy={readinessQuery.isFetching}
            onResolve={resolveReadiness}
            onBack={() => setInterpreted(false)}
          />
        ) : (
          <InterpretationPanel
            isLoading={readinessQuery.isLoading}
            error={readinessQuery.error?.message}
            interpretation={readinessQuery.data?.interpretation}
            onBack={() => setInterpreted(false)}
            onStart={() => createProject.mutate({ text })}
            starting={createProject.isPending || planMutation.isPending}
            startError={createProject.error?.message}
          />
        )}
      </div>
    </div>
  );
}
