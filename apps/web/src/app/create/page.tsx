'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { useAuth, useUser, type AuthUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreateHero } from '@/components/creative/CreateHero';
import { CreativeInput } from '@/components/creative/CreativeInput';
import { InterpretationPanel } from '@/components/creative/InterpretationPanel';
import { HomerUnderstandingView, type HomerStateSummary } from '@/components/creative/HomerUnderstandingView';
import { HomerDirectingView, type DirectingDecisionUI, type DirectingQuestionUI } from '@/components/creative/HomerDirectingView';
import { AnimaticView, type AnimaticFrameUI, type AnimaticSceneUI } from '@/components/creative/AnimaticView';
import { ReadinessGate, type ReadinessResolution } from '@/components/creative/ReadinessGate';
import { InlineSignIn } from '@/components/auth/InlineSignIn';
import { clearDraft, isMeaningfulDraft, loadDraft, pickResumeProject, saveDraft, CREATE_DRAFT_VERSION, type CreateDraft } from '@/lib/creativeDraft';
import { useR16 } from '@/lib/r16';

// ─── Types ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved';
type PendingSource = { file: File; label: string; kind: 'image' | 'video' };

/**
 * Conversational stage within the STORY branch.
 *  idle              — initial input screen (not yet STORY-detected)
 *  story_branch      — "Do you have a story to tell?" YES/NO
 *  story_input       — large story textarea
 *  story_interpreting — Homer API call in-flight
 *  story_understanding — Homer result shown ("Here's what I understand")
 *  story_directing   — Homer Directing flow (Phase 2)
 *  story_animatic    — First-Frame Animatic review (Phase 3)
 */
type ConvStage =
  | 'idle'
  | 'story_branch'
  | 'story_input'
  | 'story_interpreting'
  | 'story_understanding'
  | 'story_directing'
  | 'story_animatic';

const CONTEXT_ATTACHMENT: Record<string, string> = { PRODUCT: 'Product', BRAND: 'Brand', LOGO: 'Logo', PERSON: 'Reference', SOURCE: 'Source' };

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { setUser } = useAuth();
  const isR16 = useR16();
  const userId = user?.id ?? null;

  // Initial intent text and attachments
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sourceSupplied, setSourceSupplied] = useState(false);
  const [interpreted, setInterpreted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [authPendingFor, setAuthPendingFor] = useState<'continue' | 'start' | null>(null);
  const hydratedRef = useRef(false);
  const pendingSourceRef = useRef<PendingSource | null>(null);

  // ─── STORY branch state ───────────────────────────────────────────────────
  const [convStage, setConvStage] = useState<ConvStage>('idle');
  const [storyText, setStoryText] = useState('');
  const [homerState, setHomerState] = useState<HomerStateSummary | null>(null);
  const [homerError, setHomerError] = useState<string | null>(null);
  // Accumulated corrections appended to each re-interpretation
  const correctionsRef = useRef<string[]>([]);

  // ─── Directing state (Phase 2) ────────────────────────────────────────────
  const [directingDecisions, setDirectingDecisions] = useState<DirectingDecisionUI[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<DirectingQuestionUI | null>(null);
  const [directingComplete, setDirectingComplete] = useState(false);

  // ─── Animatic state (Phase 3) ─────────────────────────────────────────────
  const [animaticId, setAnimaticId] = useState<string | null>(null);
  const [animaticScenes, setAnimaticScenes] = useState<AnimaticSceneUI[]>([]);
  const [animaticFrames, setAnimaticFrames] = useState<AnimaticFrameUI[]>([]);
  const [animaticOverallStatus, setAnimaticOverallStatus] = useState<'PENDING' | 'GENERATING' | 'READY' | 'FAILED'>('PENDING');
  const [animaticGenerationEnabled, setAnimaticGenerationEnabled] = useState(false);

  const hasSourceAsset = attachments.length > 0 || sourceSupplied;

  // ─── Draft hydration ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isLoaded) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const storage = browserStorage();
    if (!storage) return;

    if (isMeaningfulDraft({ version: CREATE_DRAFT_VERSION, text, attachments, sourceSupplied, interpreted, updatedAt: '' })) return;

    let draft = isSignedIn ? loadDraft(storage, userId) : null;
    if (!isMeaningfulDraft(draft)) {
      const anonDraft = loadDraft(storage, null);
      if (isMeaningfulDraft(anonDraft)) {
        draft = anonDraft;
        if (isSignedIn) clearDraft(storage, null);
      }
    }

    if (draft && isMeaningfulDraft(draft)) {
      setText(draft.text);
      setAttachments(draft.attachments);
      setSourceSupplied(draft.sourceSupplied);
      setInterpreted(draft.interpreted);
      setRestored(true);
      // Restore STORY branch state where possible
      if (draft.storyText) setStoryText(draft.storyText);
      if (draft.convStage) {
        if (draft.convStage === 'story_branch') {
          setConvStage('story_branch');
        } else if (draft.convStage === 'story_directing' && draft.directingDecisions && draft.directingDecisions.length > 0) {
          setDirectingDecisions(draft.directingDecisions as DirectingDecisionUI[]);
          setConvStage('story_input'); // Return to story_input — Homer state is ephemeral
        } else {
          setConvStage('story_input');
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId]);

  // ─── Draft autosave ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!hydratedRef.current) return;
    const storage = browserStorage();
    if (!storage) return;
    setSaveState('saving');
    const draftableStage =
      convStage === 'story_branch' || convStage === 'story_input' || convStage === 'story_directing'
        ? convStage
        : undefined;
    const handle = setTimeout(() => {
      try {
        const draft: CreateDraft = {
          version: CREATE_DRAFT_VERSION,
          text,
          attachments,
          sourceSupplied,
          interpreted,
          updatedAt: new Date().toISOString(),
          convStage: draftableStage,
          storyText: storyText || undefined,
          directingDecisions: directingDecisions.length > 0 ? directingDecisions : undefined,
        };
        saveDraft(storage, draft, userId);
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [text, attachments, sourceSupplied, interpreted, userId, convStage, storyText, directingDecisions]);

  // ─── Existing intent readiness query ─────────────────────────────────────

  const readinessQuery = trpc.creative.intent.readiness.useQuery(
    { text, hasSourceAsset },
    { enabled: Boolean(isLoaded && isSignedIn && interpreted && text.trim().length > 3), retry: false },
  );

  // ─── Animatic mutations (Phase 3) ─────────────────────────────────────────

  const generateAnimatic = trpc.creative.homer.generateAnimatic.useMutation({
    onSuccess: (data) => {
      setAnimaticId(data.animaticId);
      setAnimaticGenerationEnabled(data.generationEnabled);
    },
    onError: () => {
      // Fall back to direct project creation on animatic error
      createProject.mutate({
        text: storyText.trim() || text,
        attachments,
        projectType: 'STORY',
        homerStoryState: homerState as unknown as Record<string, unknown>,
        directingDecisions: directingDecisions.length > 0
          ? (directingDecisions as unknown as Record<string, unknown>[])
          : undefined,
      });
    },
  });

  const isAnimaticPolling = animaticOverallStatus === 'GENERATING' || animaticOverallStatus === 'PENDING';
  const animaticStateQuery = trpc.creative.homer.getAnimaticState.useQuery(
    { animaticId: animaticId ?? '' },
    {
      enabled: Boolean(animaticId && convStage === 'story_animatic'),
      refetchInterval: isAnimaticPolling ? 3000 : false,
    },
  );

  // Sync animatic state from query into local state
  useEffect(() => {
    const data = animaticStateQuery.data;
    if (!data) return;
    setAnimaticScenes((data.scenes ?? []) as AnimaticSceneUI[]);
    setAnimaticFrames((data.frames ?? []) as AnimaticFrameUI[]);
    setAnimaticOverallStatus(data.overallStatus as 'PENDING' | 'GENERATING' | 'READY' | 'FAILED');
  }, [animaticStateQuery.data]);

  const directSceneMutation = trpc.creative.homer.directScene.useMutation({
    onSuccess: () => { void animaticStateQuery.refetch(); },
  });

  const approveAnimaticMutation = trpc.creative.homer.approveAnimatic.useMutation({
    onSuccess: () => {
      // Animatic approved — now create the project
      createProject.mutate({
        text: storyText.trim() || text,
        attachments,
        projectType: 'STORY',
        homerStoryState: homerState as unknown as Record<string, unknown>,
        directingDecisions: directingDecisions.length > 0
          ? (directingDecisions as unknown as Record<string, unknown>[])
          : undefined,
      });
    },
  });

  // ─── Directing mutations (Phase 2) ────────────────────────────────────────

  const nextDirectingQuestion = trpc.creative.homer.nextDirectingQuestion.useMutation({
    onSuccess: (data) => {
      if (data.inferred.length > 0) {
        setDirectingDecisions((prev) => [...prev, ...(data.inferred as DirectingDecisionUI[])]);
      }
      setCurrentQuestion(data.question as DirectingQuestionUI | null);
      if (data.isComplete) setDirectingComplete(true);
    },
    onError: () => {
      setConvStage('story_understanding');
    },
  });

  const proposeDecision = trpc.creative.homer.proposeDecision.useMutation({
    onSuccess: (data) => {
      handleDecisionMade(
        (data.decision as DirectingDecisionUI).value,
        (data.decision as DirectingDecisionUI).value,
        data.decision as DirectingDecisionUI,
      );
    },
    onError: () => {
      // Fall back to the deterministic question so the UI stays unblocked
      if (currentQuestion) {
        setCurrentQuestion(currentQuestion);
      }
    },
  });

  // ─── Homer interpret mutation ─────────────────────────────────────────────

  const homerInterpret = trpc.creative.homer.interpret.useMutation({
    onSuccess: (data) => {
      setHomerState(data.state as unknown as HomerStateSummary);
      setHomerError(null);
      setConvStage('story_understanding');
    },
    onError: (err) => {
      setHomerError(err.message);
      setConvStage('story_input');
    },
  });

  // ─── Project creation ─────────────────────────────────────────────────────

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

      if (readyForPlan && readiness?.ready === true) {
        try {
          await planMutation.mutateAsync({ projectId: project.id });
        } catch {
          /* workspace can still build the plan */
        }
      }
      router.push(`/projects/${project.id}`);
    },
  });

  // ─── Detect STORY branch from readiness result ────────────────────────────

  useEffect(() => {
    if (!interpreted || convStage !== 'idle') return;
    if (!readinessQuery.data) return;
    const { interpretation, readiness } = readinessQuery.data;
    if (interpretation.projectType === 'STORY' && readiness.ready === true) {
      setConvStage('story_branch');
    }
  }, [interpreted, convStage, readinessQuery.data]);

  // ─── Auth ────────────────────────────────────────────────────────────────

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

  // ─── Intent text handlers ─────────────────────────────────────────────────

  const toggleAttachment = (label: string) =>
    setAttachments((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));

  const appendText = (addition: string) => setText((current) => `${current.trim().replace(/[.;]?$/, '')}. ${addition}`);

  const resolveReadiness = (resolution: ReadinessResolution) => {
    if (resolution.kind === 'fictional') {
      appendText('Use a fictional concept — invent it rather than using a real one.');
      return;
    }
    if (resolution.kind === 'asset') {
      setSourceSupplied(true);
      const label = readiness && readiness.ready === false ? (CONTEXT_ATTACHMENT[readiness.contextType] ?? 'Source') : 'Source';
      const chip = resolution.fileName ? `${label}: ${resolution.fileName}` : label;
      setAttachments((current) => (current.includes(chip) ? current : [...current, chip]));
      if (resolution.file) {
        const isVideo = resolution.file.type.startsWith('video/');
        pendingSourceRef.current = { file: resolution.file, label, kind: isVideo ? 'video' : 'image' };
      }
    } else if (resolution.kind === 'describe') {
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
    setConvStage('idle');
    setStoryText('');
    setHomerState(null);
    setHomerError(null);
    setDirectingDecisions([]);
    setCurrentQuestion(null);
    setDirectingComplete(false);
    setAnimaticId(null);
    setAnimaticScenes([]);
    setAnimaticFrames([]);
    setAnimaticOverallStatus('PENDING');
    setAnimaticGenerationEnabled(false);
    correctionsRef.current = [];
  };

  const handleContinue = () => {
    if (!isLoaded) return;
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

  // ─── STORY branch handlers ────────────────────────────────────────────────

  const handleStoryYes = () => setConvStage('story_input');
  const handleStoryNo = () => {
    // User has a story intent but no written story yet — fall back to existing InterpretationPanel
    setConvStage('idle');
    // keep interpreted=true so the existing panel shows
  };

  const handleStorySubmit = () => {
    if (storyText.trim().length < 10) return;
    setHomerError(null);
    setConvStage('story_interpreting');
    const allCorrections = correctionsRef.current;
    const correctionText = allCorrections.length > 0 ? allCorrections.join('. ') : undefined;
    homerInterpret.mutate({ storyText: storyText.trim(), correctionText });
  };

  const handleHomerCorrection = (correction: string) => {
    correctionsRef.current.push(correction);
    setConvStage('story_interpreting');
    homerInterpret.mutate({
      storyText: storyText.trim(),
      correctionText: correctionsRef.current.join('. '),
    });
  };

  const handleBuildThis = () => {
    if (!isSignedIn) {
      setAuthPendingFor('start');
      return;
    }
    // Phase 3: go through animatic before project creation
    setConvStage('story_animatic');
    generateAnimatic.mutate({
      storyState: homerState as unknown as Record<string, unknown>,
      decisions: directingDecisions.length > 0
        ? (directingDecisions as unknown as Record<string, unknown>[])
        : [],
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
    });
  };

  const handleAnimaticApprove = () => {
    if (!animaticId) {
      // No animatic — create project directly
      createProject.mutate({
        text: storyText.trim() || text,
        attachments,
        projectType: 'STORY',
        homerStoryState: homerState as unknown as Record<string, unknown>,
        directingDecisions: directingDecisions.length > 0
          ? (directingDecisions as unknown as Record<string, unknown>[])
          : undefined,
      });
      return;
    }
    approveAnimaticMutation.mutate({ animaticId });
  };

  // ─── Directing handlers (Phase 2) ─────────────────────────────────────────

  const handleDirectMyself = () => {
    setDirectingDecisions([]);
    setCurrentQuestion(null);
    setDirectingComplete(false);
    setConvStage('story_directing');
    nextDirectingQuestion.mutate({
      storyState: homerState as unknown as Record<string, unknown>,
      existingDecisions: [],
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
    });
  };

  const handleDecisionMade = (
    value: string,
    label: string,
    prebuilt?: DirectingDecisionUI,
  ) => {
    const decision: DirectingDecisionUI = prebuilt ?? {
      id: `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      category: currentQuestion?.category ?? 'VISUAL_TREATMENT',
      label: currentQuestion?.label ?? label,
      value,
      rationale: `Creator chose: ${label}`,
      provenance: 'USER_APPROVED',
      createdAt: new Date().toISOString(),
    };
    const updated = [...directingDecisions, decision];
    setDirectingDecisions(updated);
    nextDirectingQuestion.mutate({
      storyState: homerState as unknown as Record<string, unknown>,
      existingDecisions: updated as unknown as Record<string, unknown>[],
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
    });
  };

  const handleLetHomerDecide = () => {
    if (!currentQuestion) return;
    proposeDecision.mutate({
      storyState: homerState as unknown as Record<string, unknown>,
      category: currentQuestion.category as 'VISUAL_TREATMENT' | 'MOOD' | 'WORLD_TREATMENT' | 'TIME_OF_DAY' | 'PACING' | 'CHARACTER_PRESENTATION' | 'CAMERA_PERSPECTIVE',
      existingDecisions: directingDecisions as unknown as Record<string, unknown>[],
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
    });
  };

  const handleCustomAnswer = (text: string) => {
    if (!currentQuestion) return;
    const decision: DirectingDecisionUI = {
      id: `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      category: currentQuestion.category,
      label: currentQuestion.label,
      value: text,
      rationale: `Creator described: ${text}`,
      provenance: 'USER_EXPLICIT',
      createdAt: new Date().toISOString(),
    };
    const updated = [...directingDecisions, decision];
    setDirectingDecisions(updated);
    nextDirectingQuestion.mutate({
      storyState: homerState as unknown as Record<string, unknown>,
      existingDecisions: updated as unknown as Record<string, unknown>[],
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
    });
  };

  // ─── Derived flags ────────────────────────────────────────────────────────

  const showGate = Boolean(readiness && readiness.ready === false);
  const isStoryBranch = convStage !== 'idle';
  const isDirecting = convStage === 'story_directing';
  const starting = createProject.isPending || planMutation.isPending || approveAnimaticMutation.isPending;

  // ─── Loading guard ────────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-16">
        {(text.trim().length > 3 || interpreted || isStoryBranch) && (
          <div className="mb-4 flex items-center justify-end gap-3 text-xs text-[var(--noc-t5)]">
            {restored && (
              <button type="button" onClick={startOver} className="font-bold text-[var(--noc-purple)]">
                Start over
              </button>
            )}
            <span aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : ''}</span>
          </div>
        )}

        {/* Resume banner */}
        {!interpreted && !isStoryBranch && resumable && (
          <a
            href={`/projects/${resumable.id}`}
            className="mb-6 flex items-center justify-between rounded-2xl border border-[rgba(79,139,214,0.25)] bg-[rgba(79,139,214,0.07)] px-4 py-3 text-sm hover:border-[var(--noc-blue)]"
          >
            <span className="font-bold text-[var(--noc-blue)]">Continue where you left off</span>
            <span className="truncate pl-3 text-[var(--noc-t4)]">{resumable.title}</span>
          </a>
        )}

        {/* ── Auth gate ──────────────────────────────────────────────── */}
        {authPendingFor ? (
          <InlineSignIn
            heading="Your draft is saved"
            subtext="Sign in to continue — it'll still be here."
            onSuccess={handleAuthSuccess}
            onBack={() => setAuthPendingFor(null)}
          />

        /* ── Initial input ──────────────────────────────────────────── */
        ) : !interpreted && !isStoryBranch ? (
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

        /* ── STORY: "Do you have a story to tell?" ──────────────────── */
        ) : convStage === 'story_branch' ? (
          <div className="space-y-4">
            <button type="button" onClick={() => { setConvStage('idle'); setInterpreted(false); }} className="text-sm font-semibold text-[var(--noc-purple)]">
              ← Edit my idea
            </button>
            <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-8 text-center">
              <h2 className="text-2xl font-black tracking-tight text-[var(--noc-t1)]">
                Do you have a story to tell?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--noc-t4)]">
                Share it and Homer will understand what you&apos;re making.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleStoryYes}
                  className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-8 py-3 font-black text-white"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={handleStoryNo}
                  className="rounded-xl border border-[rgba(233,233,237,0.2)] px-8 py-3 font-semibold text-[var(--noc-t3)]"
                >
                  Not yet
                </button>
              </div>
            </div>
          </div>

        /* ── STORY: story input textarea ────────────────────────────── */
        ) : convStage === 'story_input' ? (
          <div className="space-y-4">
            <button type="button" onClick={() => setConvStage('story_branch')} className="text-sm font-semibold text-[var(--noc-purple)]">
              ← Back
            </button>
            <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
              <h2 className="text-xl font-black tracking-tight text-[var(--noc-t1)]">Tell me the story.</h2>
              <p className="mt-1 text-sm text-[var(--noc-t4)]">
                Describe it in your own words — rough, detailed, or anywhere in between.
              </p>
              <textarea
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                autoFocus
                rows={8}
                placeholder="Amina enters an abandoned observatory and finds an old radio that whispers her name…"
                className="mt-4 w-full resize-none rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-3 text-base text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)] placeholder:text-[var(--noc-t6)] leading-relaxed"
              />
              {homerError && (
                <p className="mt-2 text-sm text-[#e35d5d]">{homerError}</p>
              )}
              <button
                type="button"
                disabled={storyText.trim().length < 10}
                onClick={handleStorySubmit}
                className="mt-4 w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white disabled:opacity-40"
              >
                Homer, understand my story
              </button>
            </div>
          </div>

        /* ── STORY: Homer is thinking ───────────────────────────────── */
        ) : convStage === 'story_interpreting' ? (
          <div className="py-16 text-center">
            <p className="text-[var(--noc-t4)]">Understanding your story…</p>
          </div>

        /* ── STORY: "Here's what I understand" ──────────────────────── */
        ) : convStage === 'story_understanding' && homerState ? (
          <HomerUnderstandingView
            state={homerState}
            starting={starting}
            startError={createProject.error?.message}
            onBuildThis={handleBuildThis}
            onCorrect={handleHomerCorrection}
            onBack={() => setConvStage('story_input')}
            onDirectMyself={handleDirectMyself}
          />

        /* ── STORY: Directing console (Phase 2) ─────────────────────── */
        ) : convStage === 'story_directing' && homerState ? (
          <HomerDirectingView
            premiseLine={homerState.premise.value}
            toneLine={[homerState.genre?.value, homerState.tone?.value].filter(Boolean).join(' / ') || undefined}
            question={currentQuestion}
            decisions={directingDecisions}
            loading={nextDirectingQuestion.isPending}
            proposing={proposeDecision.isPending}
            complete={directingComplete}
            starting={starting}
            startError={createProject.error?.message}
            onSelectChoice={(value, label) => handleDecisionMade(value, label)}
            onLetHomerDecide={handleLetHomerDecide}
            onCustomAnswer={handleCustomAnswer}
            onBuildThis={handleBuildThis}
            onBack={() => setConvStage('story_understanding')}
          />

        /* ── STORY: First-Frame Animatic (Phase 3) ──────────────────── */
        ) : convStage === 'story_animatic' ? (
          animaticId ? (
            <AnimaticView
              animaticId={animaticId}
              scenes={animaticScenes}
              frames={animaticFrames}
              overallStatus={animaticOverallStatus}
              generationEnabled={animaticGenerationEnabled}
              starting={starting}
              startError={createProject.error?.message ?? approveAnimaticMutation.error?.message}
              onDirectScene={(sceneId, note) => {
                directSceneMutation.mutate({ animaticId, sceneId, directorNote: note });
              }}
              onApprove={handleAnimaticApprove}
              onBack={() => setConvStage('story_directing')}
            />
          ) : (
            <div className="py-16 text-center">
              <p className="text-[var(--noc-t4)]">Preparing your animatic…</p>
            </div>
          )

        /* ── Readiness gate (non-story) ─────────────────────────────── */
        ) : interpreted && showGate && readiness && readiness.ready === false ? (
          <ReadinessGate
            question={readiness.question}
            contextType={readiness.contextType}
            need={readiness.need}
            busy={readinessQuery.isFetching}
            onResolve={resolveReadiness}
            onBack={() => setInterpreted(false)}
          />

        /* ── Interpretation panel (non-story / fallback) ────────────── */
        ) : (
          <InterpretationPanel
            isLoading={readinessQuery.isLoading || readinessQuery.isFetching}
            error={readinessQuery.error?.message}
            interpretation={readinessQuery.data?.interpretation}
            onBack={() => { setInterpreted(false); setConvStage('idle'); }}
            onStart={handleStart}
            starting={starting}
            startError={createProject.error?.message}
          />
        )}
      </div>
    </div>
  );
}
