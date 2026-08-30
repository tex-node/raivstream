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
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-8 flex flex-col items-center text-center gap-5" style={{ background: 'var(--noc-bar)', border: '1px solid var(--noc-hairline)' }}>

        {/* Icon */}
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(178,90,217,0.16)' }}>
          <svg className="w-8 h-8" style={{ color: 'var(--noc-lavender-tint)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>

        {/* Copy */}
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--noc-t1)' }}>
            You've watched {watched} free episodes
          </h2>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--noc-t5)' }}>
            Sign up free and get{' '}
            <span className="font-semibold" style={{ color: 'var(--noc-t1)' }}>10 more episodes</span>, or
            subscribe for <span className="font-semibold" style={{ color: 'var(--noc-t1)' }}>unlimited watching</span>.
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--noc-t6)' }}>
            <span>{watched} watched</span>
            <span>{limit} free limit</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(233,233,237,0.1)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (watched / limit) * 100)}%`, background: 'var(--noc-purple)' }}
            />
          </div>
        </div>

        {/* CTAs */}
        <div className="w-full flex flex-col gap-3">
          {/* Primary: sign up (gives 10 more) */}
          <button
            onClick={() => router.push('/sign-up')}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-colors"
            style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
          >
            Sign up free — get 10 more episodes
          </button>
          {/* Secondary: subscribe (unlimited) */}
          <button
            onClick={() => router.push('/pricing')}
            className="w-full py-3 rounded-2xl font-semibold text-sm transition-colors hover:opacity-90"
            style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
          >
            Subscribe — ₦1,500/mo unlimited
          </button>
          {/* Tertiary: returning subscriber */}
          <button
            onClick={() => router.push('/sign-in')}
            className="w-full py-2.5 rounded-2xl text-sm transition-colors text-[var(--noc-t5)] hover:text-[var(--noc-t1)]"
            style={{ border: '1px solid var(--noc-hairline)' }}
          >
            Already subscribed? Sign in
          </button>
        </div>

        <p className="text-xs" style={{ color: 'var(--noc-t6)' }}>
          No ads · HD quality · Cancel anytime
        </p>
      </div>
    </div>
  );
}
