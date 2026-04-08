'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { Navbar } from '@/components/layout/Navbar';
import { STRIPE_PLANS, type StripePlanKey } from '@/lib/stripe';

const PLAN_KEYS: StripePlanKey[] = ['VIEWER', 'CREATOR'];

const HIGHLIGHT: StripePlanKey = 'CREATOR';

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState<StripePlanKey | null>(null);

  const handleSubscribe = async (planKey: StripePlanKey) => {
    if (!isSignedIn) return;
    setLoading(planKey);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });
      const { url } = await res.json();
      if (url) router.push(url);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto pt-24 px-4 pb-20">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-extrabold mb-4">
            Unlock the full <span className="text-pink-500">Raivstream</span>
          </h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            Go ad-free, support creators directly, and unlock exclusive features.
          </p>
        </div>

        {/* Free tier */}
        <div className="mb-8 p-5 rounded-2xl border border-white/10 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">Free</h3>
            <p className="text-white/50 text-sm mt-1">
              All public content · Ads · Standard quality
            </p>
          </div>
          <span className="text-white/40 text-sm">Current plan (no sign-up required)</span>
        </div>

        {/* Paid plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_KEYS.map((key) => {
            const plan = STRIPE_PLANS[key];
            const isHighlighted = key === HIGHLIGHT;
            const isLoadingThis = loading === key;

            return (
              <div
                key={key}
                className={`relative flex flex-col rounded-2xl p-6 border transition-all ${
                  isHighlighted
                    ? 'border-pink-500 bg-pink-500/10 shadow-xl shadow-pink-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">${plan.price}</span>
                    <span className="text-white/50 text-sm">/month</span>
                  </div>
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <svg
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isHighlighted ? 'text-pink-400' : 'text-green-400'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>

                {isSignedIn ? (
                  <button
                    onClick={() => handleSubscribe(key)}
                    disabled={!!loading}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                      isHighlighted
                        ? 'bg-pink-500 hover:bg-pink-600 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    } disabled:opacity-50`}
                  >
                    {isLoadingThis ? 'Redirecting…' : `Get ${plan.name}`}
                  </button>
                ) : (
                  <a
                    href="/sign-in"
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all text-center block ${
                      isHighlighted
                        ? 'bg-pink-500 hover:bg-pink-600 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                  >
                    Sign in to subscribe
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-white/30 text-xs mt-10">
          Cancel anytime · Billed monthly · International payments via Stripe
        </p>
      </div>
    </div>
  );
}
