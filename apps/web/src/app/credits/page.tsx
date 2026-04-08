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
      <div className="min-h-screen bg-black text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-white/60">Sign in to manage your credits</p>
          <button
            onClick={() => router.push('/sign-in')}
            className="px-6 py-3 bg-pink-500 rounded-xl font-semibold text-sm"
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
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto pt-24 px-4 pb-20">

        {/* Balance card */}
        <div className="rounded-3xl bg-gradient-to-br from-pink-500/20 to-purple-500/10 border border-pink-500/20 p-6 mb-10 flex items-center justify-between">
          <div>
            <p className="text-white/50 text-sm mb-1">Your credit balance</p>
            {balanceLoading ? (
              <div className="h-8 w-24 bg-white/10 rounded-lg animate-pulse" />
            ) : (
              <p className="text-4xl font-extrabold text-white">
                {(balanceData?.balance ?? 0).toLocaleString()}
                <span className="text-lg font-normal text-white/50 ml-1.5">credits</span>
              </p>
            )}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-pink-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className={`relative rounded-2xl p-5 border flex items-center justify-between transition-all ${
                  isPopular
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-4 bg-pink-500 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                    Most Popular
                  </span>
                )}

                <div>
                  <p className="font-bold text-white text-lg">
                    {pkg.credits.toLocaleString()} credits
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-white/50 text-sm">{naira}</span>
                    {'saving' in pkg && (
                      <span className="text-green-400 text-xs font-semibold">{pkg.saving}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handlePurchase(pkg.tag)}
                  disabled={!!loading}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                    isPopular
                      ? 'bg-pink-500 hover:bg-pink-600 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/5 mb-12">
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
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-white/70 text-sm">{icon} {label}</span>
              <span className="text-white/50 text-sm font-medium">{cost} credits</span>
            </div>
          ))}
        </div>

        {/* Transaction history */}
        <h2 className="text-lg font-bold mb-4">Transaction History</h2>
        {historyLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : !history?.length ? (
          <p className="text-white/30 text-sm text-center py-8">No transactions yet</p>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/5">
            {history.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-white text-sm font-medium">{tx.description ?? tx.featureKey ?? tx.type}</p>
                  <p className="text-white/30 text-xs mt-0.5">
                    {new Date(tx.createdAt).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`font-semibold text-sm ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </span>
                  <p className="text-white/30 text-xs">{tx.balanceAfter.toLocaleString()} bal</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
