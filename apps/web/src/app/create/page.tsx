'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreateHero } from '@/components/creative/CreateHero';
import { CreativeInput } from '@/components/creative/CreativeInput';
import { InterpretationPanel } from '@/components/creative/InterpretationPanel';
import { ReadinessGate, type ReadinessResolution } from '@/components/creative/ReadinessGate';

export default function CreatePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sourceSupplied, setSourceSupplied] = useState(false);
  const [interpreted, setInterpreted] = useState(false);

  const hasSourceAsset = attachments.length > 0 || sourceSupplied;

  // One call returns the interpretation AND the readiness gate (the gate reuses
  // the existing Intent Engine — it does not re-implement it).
  const readinessQuery = trpc.creative.intent.readiness.useQuery(
    { text, hasSourceAsset },
    { enabled: Boolean(isLoaded && isSignedIn && interpreted && text.trim().length > 3), retry: false },
  );

  const planMutation = trpc.creative.production.plan.useMutation();
  const createProject = trpc.creative.project.create.useMutation({
    onSuccess: async (project) => {
      // "Build this" → create the project, then build the plan.
      try {
        await planMutation.mutateAsync({ projectId: project.id });
      } catch {
        /* the workspace can still build the plan */
      }
      router.push(`/projects/${project.id}`);
    },
  });

  const toggleAttachment = (label: string) =>
    setAttachments((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));

  const appendText = (addition: string) =>
    setText((current) => `${current.trim().replace(/[.;]?$/, '')}. ${addition}`);

  const resolveReadiness = (resolution: ReadinessResolution) => {
    if (resolution.kind === 'asset') {
      setSourceSupplied(true);
    } else if (resolution.kind === 'describe') {
      setSourceSupplied(true);
      appendText(resolution.text);
    } else {
      // Explicit authorization to invent a fictional source entity.
      appendText('Use a fictional concept — invent it rather than using a real one.');
    }
  };

  const readiness = readinessQuery.data?.readiness;
  const showGate = Boolean(readiness && readiness.ready === false);

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-16">
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
