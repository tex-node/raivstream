'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { CREDIT_PACKAGES } from '@/lib/paystack';

export default function CreditsPage() {
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const [loading, setLoading] = useState<string | null>(null);

  const { data: balanceData, isLoading: balanceLoading } = trpc.user.creditBalance.useQuery(
    undefined, { enabled: isSignedIn }
  );
  const { data: history, isLoading: historyLoading } = trpc.user.creditHistory.useQuery(
    undefined, { enabled: isSignedIn }
  );

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--noc-page)', color: 'var(--noc-t1)' }}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p style={{ color: 'var(--noc-t5)' }}>Sign in to manage your credits</p>
          <button
            onClick={() => router.push('/sign-in')}
            className="px-6 py-3 rounded-xl font-semibold text-sm hover:opacity-90"
            style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handlePurchase = async (tag: string) => {
    setLoading(tag);
    try {
      const res = await fetch('/api/paystack/initialize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'CREDIT_PURCHASE', packageTag: tag }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? 'Failed to initialize payment');
      }
    } catch {
      alert('Network error — please try again');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--noc-page)', color: 'var(--noc-t1)' }}>
      <Navbar />

      <div className="max-w-2xl mx-auto pt-24 px-4 pb-20">

        {/* Balance card */}
        <div className="rounded-3xl p-6 mb-10 flex items-center justify-between" style={{ background: 'rgba(178,90,217,0.10)', border: '1px solid rgba(178,90,217,0.25)' }}>
          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--noc-t6)' }}>Your credit balance</p>
            {balanceLoading ? (
              <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background: 'rgba(233,233,237,0.1)' }} />
            ) : (
              <p className="text-4xl font-extrabold">
                {(balanceData?.balance ?? 0).toLocaleString()}
                <span className="text-lg font-normal ml-1.5" style={{ color: 'var(--noc-t6)' }}>credits</span>
              </p>
            )}
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(178,90,217,0.18)' }}>
            <svg className="w-7 h-7" style={{ color: 'var(--noc-lavender-tint)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Packages */}
        <h2 className="text-lg font-bold mb-4">Buy Credits</h2>
        <div className="grid grid-cols-1 gap-4 mb-12">
          {CREDIT_PACKAGES.map((pkg) => {
            const isPopular = pkg.tag === 'popular';
            const isLoading = loading === pkg.tag;
            const naira = (pkg.amountKobo / 100).toLocaleString('en-NG', {
              style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
            });

            return (
              <div
                key={pkg.tag}
                className="relative rounded-2xl p-5 border flex items-center justify-between transition-all"
                style={
                  isPopular
                    ? { borderColor: 'var(--noc-magenta)', background: 'rgba(217,70,168,0.10)' }
                    : { borderColor: 'var(--noc-hairline)', background: 'var(--noc-card)' }
                }
              >
                {isPopular && (
                  <span className="absolute -top-3 left-4 text-xs font-bold px-3 py-0.5 rounded-full" style={{ background: 'var(--noc-magenta)', color: '#0B0D14' }}>
                    Most Popular
                  </span>
                )}

                <div>
                  <p className="font-bold text-lg">
                    {pkg.credits.toLocaleString()} credits
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm" style={{ color: 'var(--noc-t6)' }}>{naira}</span>
                    {'saving' in pkg && (
                      <span className="text-xs font-semibold" style={{ color: '#2fbf71' }}>{pkg.saving}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handlePurchase(pkg.tag)}
                  disabled={!!loading}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:opacity-90"
                  style={
                    isPopular
                      ? { background: 'var(--noc-magenta)', color: '#0B0D14' }
                      : { background: 'var(--noc-card)', border: '1px solid var(--noc-hairline)', color: 'var(--noc-t1)' }
                  }
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(233,233,237,0.3)', borderTopColor: 'currentColor' }} />
                      Wait…
                    </span>
                  ) : 'Buy'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Credit rates reference */}
        <h2 className="text-lg font-bold mb-4">What credits unlock</h2>
        <div className="rounded-2xl divide-y mb-12" style={{ border: '1px solid var(--noc-hairline)', background: 'var(--noc-card)' }}>
          {[
            { label: 'Nano Banana generation',  cost: 50,  icon: '⚡' },
            { label: 'Grok Imagine generation', cost: 100, icon: '🎨' },
            { label: 'LTX-2 generation',        cost: 150, icon: '🎬' },
            { label: 'Wan 2.5 generation',      cost: 200, icon: '🌊' },
            { label: 'Higgsfield generation',   cost: 400, icon: '🎥' },
            { label: 'Kling generation',        cost: 500, icon: '👑' },
            { label: 'AI thumbnail',            cost: 20,  icon: '🖼️' },
            { label: 'Transcription',           cost: 30,  icon: '📝' },
            { label: 'Video enhance',           cost: 100, icon: '✨' },
          ].map(({ label, cost, icon }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3" style={{ borderColor: 'var(--noc-rule)' }}>
              <span className="text-sm" style={{ color: 'var(--noc-t4)' }}>{icon} {label}</span>
              <span className="text-sm font-medium" style={{ color: 'var(--noc-t6)' }}>{cost} credits</span>
            </div>
          ))}
        </div>

        {/* Transaction history */}
        <h2 className="text-lg font-bold mb-4">Transaction History</h2>
        {historyLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-2xl animate-pulse" style={{ background: 'var(--noc-card)' }} />
            ))}
          </div>
        ) : !history?.length ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--noc-t6)' }}>No transactions yet</p>
        ) : (
          <div className="rounded-2xl divide-y" style={{ border: '1px solid var(--noc-hairline)', background: 'var(--noc-card)' }}>
            {history.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3.5" style={{ borderColor: 'var(--noc-rule)' }}>
                <div>
                  <p className="text-sm font-medium">{tx.description ?? tx.featureKey ?? tx.type}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--noc-t6)' }}>
                    {new Date(tx.createdAt).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-sm" style={{ color: tx.amount > 0 ? '#2fbf71' : '#e35d5d' }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </span>
                  <p className="text-xs" style={{ color: 'var(--noc-t6)' }}>{tx.balanceAfter.toLocaleString()} bal</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
