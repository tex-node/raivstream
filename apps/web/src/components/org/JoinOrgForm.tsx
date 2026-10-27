'use client';

/**
 * D-004 - redeem an invite code.
 *
 * Lives at `/join/[code]`, with `/join` as the same form for people arriving
 * without a link. Errors are mapped to human sentences: NOT_FOUND and FORBIDDEN
 * mean different things and a generic "something went wrong" would hide that.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

export function JoinOrgForm({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [code, setCode] = useState(initialCode);
  const [joined, setJoined] = useState<{ name: string; slug: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = trpc.organization.joinWithCode.useMutation({
    onSuccess: async (result) => {
      setJoined({ name: result.name, slug: result.slug });
      setError(null);
      await utils.organization.myOrganizations.invalidate();
    },
    onError: (err) => {
      if (err.data?.code === 'NOT_FOUND') setError('Invalid code. Check it with your teacher or coordinator.');
      else if (err.data?.code === 'FORBIDDEN') setError('Your access was removed from this organization. Ask an admin to re-add you.');
      else setError(err.message);
    },
  });

  if (joined) {
    return (
      <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-6 text-center">
        <p className="text-sm font-bold text-[#34d399]">You&apos;ve joined {joined.name}!</p>
        <p className="mt-1 text-xs text-[var(--noc-t5)]">
          Your work now appears on that organization&apos;s dashboard.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/org/${joined.slug}`)}
          className="mt-4 rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white"
        >
          View organization
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-6">
      <label className="block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
        Enter your school&apos;s join code
      </label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
        placeholder="e.g. f0446811e8fe"
        className="mt-2 w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 font-mono text-sm text-[var(--noc-t1)] outline-none"
      />

      {error && <p className="mt-2 text-xs font-semibold text-[var(--noc-magenta)]">{error}</p>}

      <button
        type="button"
        disabled={code.length < 4 || join.isPending}
        onClick={() => join.mutate({ code })}
        className="mt-4 w-full rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        {join.isPending ? 'Joining…' : 'Join'}
      </button>

      <p className="mt-3 text-[10px] text-[var(--noc-t6)]">
        Ask your coordinator for the code. If you were removed from an organization, a code will not let you back in.
      </p>
    </div>
  );
}

/** `/join/[code]` - the code is prefilled from the URL. */
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
