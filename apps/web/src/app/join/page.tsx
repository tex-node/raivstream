'use client';

/**
 * `/join` - same form for people who arrive without a code in the URL.
 */

import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { JoinOrgForm } from '@/components/org/JoinOrgForm';

export default function JoinPage() {
  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-black text-[var(--noc-t1)]">Join your school</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          Enter the code your coordinator gave you.
        </p>
        <div className="mt-6">
          <JoinOrgForm />
        </div>
        <Link href="/" className="mt-6 inline-block text-xs text-[var(--noc-t5)] underline">
          Back to feed
        </Link>
      </main>
    </div>
  );
}
