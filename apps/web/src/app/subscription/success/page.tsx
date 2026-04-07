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
    <div className="min-h-screen bg-black flex items-center justify-center text-white px-4">
      <div className="text-center flex flex-col items-center gap-6 max-w-md">
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold mb-2">You're subscribed!</h1>
          <p className="text-white/60">
            Welcome to the premium Raivstream experience. Your account has been upgraded.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="px-6 py-2.5 bg-pink-500 hover:bg-pink-600 rounded-full text-sm font-semibold transition-colors"
          >
            Start watching
          </Link>
          <Link
            href="/settings"
            className="px-6 py-2.5 border border-white/20 hover:border-white/40 rounded-full text-sm transition-colors"
          >
            Manage subscription
          </Link>
        </div>

        <p className="text-white/30 text-xs">Redirecting to feed in 5 seconds…</p>
      </div>
    </div>
  );
}
