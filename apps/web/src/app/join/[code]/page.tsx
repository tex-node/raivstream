'use client';

/**
 * `/join/[code]` - the code comes from the URL.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { JoinOrgForm } from '@/components/org/JoinOrgForm';

export default function JoinWithCodePage() {
  const params = useParams<{ code: string }>();

  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-black text-[var(--noc-t1)]">Join your school</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          Joining links your work to your school so your coordinator can see it.
        </p>
        <div className="mt-6">
          <JoinOrgForm initialCode={params?.code ?? ''} />
        </div>
        <Link href="/" className="mt-6 inline-block text-xs text-[var(--noc-t5)] underline">
          Back to feed
        </Link>
      </main>
    </div>
  );
}
