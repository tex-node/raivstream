'use client';

import { useRouter } from 'next/navigation';

/**
 * Hard-overlay modal shown to GUESTS after they hit the 5-episode free limit.
 *
 * Signed-in FREE users who hit their 10-episode limit do NOT see this modal.
 * They get a sticky top banner + per-video lock overlays instead.
 */
interface PaywallModalProps {
  watched: number;
  limit:   number;
}

export function PaywallModal({ watched, limit }: PaywallModalProps) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl p-8 flex flex-col items-center text-center gap-5">

        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>

        {/* Copy */}
        <div>
          <h2 className="text-xl font-bold text-white">
            You've watched {watched} free episodes
          </h2>
          <p className="text-white/50 text-sm mt-2 leading-relaxed">
            Sign up free and get{' '}
            <span className="text-white font-semibold">10 more episodes</span>, or
            subscribe for <span className="text-white font-semibold">unlimited watching</span>.
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>{watched} watched</span>
            <span>{limit} free limit</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (watched / limit) * 100)}%` }}
            />
          </div>
        </div>

        {/* CTAs */}
        <div className="w-full flex flex-col gap-3">
          {/* Primary: sign up (gives 10 more) */}
          <button
            onClick={() => router.push('/sign-up')}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm transition-colors"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            Sign up free — get 10 more episodes
          </button>
          {/* Secondary: subscribe (unlimited) */}
          <button
            onClick={() => router.push('/pricing')}
            className="w-full py-3 rounded-2xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-sm transition-colors"
          >
            Subscribe — ₦1,500/mo unlimited
          </button>
          {/* Tertiary: returning subscriber */}
          <button
            onClick={() => router.push('/sign-in')}
            className="w-full py-2.5 rounded-2xl border border-white/10 hover:border-white/20 text-white/50 hover:text-white text-sm transition-colors"
          >
            Already subscribed? Sign in
          </button>
        </div>

        <p className="text-white/25 text-xs">
          No ads · HD quality · Cancel anytime
        </p>
      </div>
    </div>
  );
}
