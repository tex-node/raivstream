'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreateHero } from '@/components/creative/CreateHero';
import { CreativeInput } from '@/components/creative/CreativeInput';
import { InterpretationPanel } from '@/components/creative/InterpretationPanel';

export default function CreatePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [text, setText] = useState('');
  const [interpreted, setInterpreted] = useState<boolean>(false);

  const interpretationQuery = trpc.creative.intent.interpret.useQuery(
    { text },
    { enabled: Boolean(isLoaded && isSignedIn && text.trim().length > 3 && interpreted), retry: false },
  );
  const createProject = trpc.creative.project.create.useMutation({
    onSuccess: (project) => router.push(`/projects/${project.id}`),
  });

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
              onSubmit={() => {
                setInterpreted(true);
                interpretationQuery.refetch();
              }}
              disabled={createProject.isPending}
            />
          </>
        ) : (
          <InterpretationPanel
            isLoading={interpretationQuery.isLoading}
            error={interpretationQuery.error?.message}
            interpretation={interpretationQuery.data}
            onBack={() => setInterpreted(false)}
            onStart={() => createProject.mutate({ text })}
            starting={createProject.isPending}
            startError={createProject.error?.message}
          />
        )}
      </div>
    </div>
  );
}