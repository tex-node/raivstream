'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function SubscriptionSuccessPage() {
  const router = useRouter();

  // Auto-redirect to home after 5s
  useEffect(() => {
    const timer = setTimeout(() => router.push('/'), 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--noc-page)', color: 'var(--noc-t1)' }}>
      <div className="text-center flex flex-col items-center gap-6 max-w-md">
        <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(47,191,113,0.15)' }}>
          <svg className="w-12 h-12" style={{ color: '#2fbf71' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold mb-2">You're subscribed!</h1>
          <p style={{ color: 'var(--noc-t5)' }}>
            Welcome to the premium Raivstream experience. Your account has been upgraded.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-full text-sm font-semibold transition-colors hover:opacity-90"
            style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
          >
            Start watching
          </Link>
          <Link
            href="/settings"
            className="px-6 py-2.5 rounded-full text-sm transition-colors text-[var(--noc-t4)] hover:text-[var(--noc-t1)]"
            style={{ border: '1px solid var(--noc-hairline)' }}
          >
            Manage subscription
          </Link>
        </div>

        <p className="text-xs" style={{ color: 'var(--noc-t6)' }}>Redirecting to feed in 5 seconds…</p>
      </div>
    </div>
  );
}
