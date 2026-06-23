'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useR16 } from '@/lib/r16';

export default function StorybookErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ projectId: string }>();
  const isR16 = useR16();

  useEffect(() => {
    console.error('[storybook.client_error]', {
      projectId: params.projectId,
      route: '/story-playground/[projectId]/storybook',
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error, isR16, params.projectId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8ec] px-4 text-[#172033]">
      <section className="w-full max-w-xl rounded-2xl border-2 border-[#172033]/10 bg-white p-8 text-center shadow-[0_18px_0_rgba(23,32,51,0.08)]">
        <h1 className="text-3xl font-black">
          {isR16 ? 'Oops, the storybook needs a quick refresh.' : 'Something went wrong while opening this storybook.'}
        </h1>
        <p className="mt-3 text-lg font-bold text-[#596070]">
          {isR16 ? 'Go back' : 'Try refreshing or go back to Story Playground.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white"
          >
            <RotateCcw size={18} />
            {isR16 ? 'Refresh' : 'Try Again'}
          </button>
          <Link href="/story-playground" className="inline-flex items-center gap-2 rounded-xl bg-[#172033] px-5 py-3 font-black text-white">
            <ArrowLeft size={18} />
            {isR16 ? 'Go back' : 'Story Playground'}
          </Link>
        </div>
      </section>
    </main>
  );
}
