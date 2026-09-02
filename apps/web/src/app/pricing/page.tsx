'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { Navbar } from '@/components/layout/Navbar';
import { CREDIT_PACKAGES } from '@/lib/paystack';
import Link from 'next/link';

type BillingCycle = 'monthly' | 'annual';

const VIEWER_PLAN = {
  monthly: { price: '₦1,500', saving: null },
  annual:  { price: '₦1,200', saving: 'Save 20%' },
};

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);

  const handleViewerSubscribe = async () => {
    if (!isSignedIn) { router.push('/sign-in'); return; }
    setLoadingPlan('viewer');
    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'SUBSCRIPTION', packageTag: 'viewer' }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleCreditPurchase = async (tag: string) => {
    if (!isSignedIn) { router.push('/sign-in'); return; }
    setLoadingPkg(tag);
    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CREDIT_PURCHASE', packageTag: tag }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setLoadingPkg(null);
    }
  };

  const viewerPrice = VIEWER_PLAN[billing];

  return (
    <div className="min-h-screen text-[var(--noc-t1)]" style={{ background: 'var(--noc-page)' }}>
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(120,60,220,0.20) 0%, transparent 70%),' +
            'radial-gradient(ellipse 50% 40% at 85% 90%, rgba(30,80,200,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10">
        <Navbar />

        <div className="max-w-5xl mx-auto pt-28 px-4 pb-24">

          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-full px-3 py-1 mb-6 text-xs text-[var(--noc-t4)]">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Simple, transparent pricing
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight mb-4">
              Unlock the full{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--noc-lavender-tint), var(--noc-purple), var(--noc-blue))' }}
              >
                Raivstream
              </span>
            </h1>
            <p className="text-[var(--noc-t4)] text-lg max-w-xl mx-auto leading-relaxed">
              Go ad-free, generate AI videos, and support your favourite creators.
            </p>

            {/* Billing toggle */}
            <div
              className="inline-flex items-center mt-8 p-1 rounded-full border"
              style={{ background: 'var(--noc-page)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {(['monthly', 'annual'] as BillingCycle[]).map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setBilling(cycle)}
                  className="px-5 py-1.5 rounded-full text-sm font-medium transition-all capitalize"
                  style={
                    billing === cycle
                      ? { background: 'linear-gradient(135deg, var(--noc-purple), var(--noc-blue))', color: '#fff' }
                      : { color: 'rgba(255,255,255,0.45)' }
                  }
                >
                  {cycle}
                  {cycle === 'annual' && billing !== 'annual' && (
                    <span className="ml-2 text-[10px] text-emerald-400 font-semibold">-20%</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Subscription tiers ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-20">
            {/* Free */}
            <div
              className="rounded-2xl p-6 border flex flex-col"
              style={{ background: 'var(--noc-page)', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="mb-5">
                <p className="text-[var(--noc-t4)] text-sm font-medium mb-1">Free</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">₦0</span>
                  <span className="text-[var(--noc-t5)] text-sm">forever</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2.5 mb-7">
                {['5 episodes per day', 'Access to public feed', 'Standard quality', 'No credit card needed'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-[var(--noc-t6)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[var(--noc-t4)]">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className="w-full py-3 rounded-xl text-sm font-semibold text-center text-[var(--noc-t3)] hover:text-white transition-colors block"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                Get started free
              </Link>
            </div>

            {/* Viewer — highlighted */}
            <div
              className="relative rounded-2xl p-6 border flex flex-col"
              style={{
                background: 'rgba(124,58,237,0.12)',
                borderColor: 'rgba(124,58,237,0.45)',
                boxShadow: '0 0 50px rgba(124,58,237,0.15)',
              }}
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span
                  className="text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg, var(--noc-purple), var(--noc-blue))' }}
                >
                  Most Popular
                </span>
              </div>

              <div className="mb-5">
                <p className="text-violet-300 text-sm font-medium mb-1">Viewer</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{viewerPrice.price}</span>
                  <span className="text-[var(--noc-t5)] text-sm">/month</span>
                  {viewerPrice.saving && (
                    <span className="ml-2 text-xs font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                      {viewerPrice.saving}
                    </span>
                  )}
                </div>
              </div>

              <ul className="flex-1 space-y-2.5 mb-7">
                {[
                  'Unlimited episodes',
                  'Ad-free experience',
                  'HD quality streams',
                  'Exclusive premium content',
                  '24-hour support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[var(--noc-t2)]">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={handleViewerSubscribe}
                disabled={!!loadingPlan}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, var(--noc-purple), var(--noc-blue))' }}
              >
                {loadingPlan === 'viewer' ? 'Redirecting…' : isSignedIn ? 'Subscribe now' : 'Sign in to subscribe'}
              </button>
            </div>

            {/* Creator */}
            <div
              className="rounded-2xl p-6 border flex flex-col"
              style={{ background: 'var(--noc-page)', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="mb-5">
                <p className="text-sky-400 text-sm font-medium mb-1">Creator</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">$4.99</span>
                  <span className="text-[var(--noc-t5)] text-sm">/month</span>
                </div>
                <p className="text-[var(--noc-t6)] text-xs mt-1">International billing via Stripe</p>
              </div>

              <ul className="flex-1 space-y-2.5 mb-7">
                {[
                  'Everything in Viewer',
                  'Upload unlimited videos',
                  'AI Video Studio access',
                  'Creator analytics dashboard',
                  '70% revenue share',
                  'Priority support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[var(--noc-t2)]">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={isSignedIn ? '/api/stripe/create-checkout?plan=CREATOR' : '/sign-in'}
                className="w-full py-3 rounded-xl text-sm font-semibold text-center text-[var(--noc-t2)] hover:text-white transition-all block"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {isSignedIn ? 'Get Creator' : 'Sign in to subscribe'}
              </Link>
            </div>
          </div>

          {/* ── AI Credits section ── */}
          <div className="mb-6">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-full px-3 py-1 mb-4 text-xs text-[var(--noc-t4)]">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                AI Credits — pay as you go
              </div>
              <h2 className="text-3xl font-extrabold mb-2">Generate with credits</h2>
              <p className="text-[var(--noc-t5)] text-sm max-w-md mx-auto">
                Buy credits once, use them across all AI models. No subscription required. 1,000 credits = ₦1,000.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CREDIT_PACKAGES.map((pkg) => {
                const isPopular = pkg.tag === 'popular';
                const naira = (pkg.amountKobo / 100).toLocaleString('en-NG', {
                  style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
                });
                const isLoading = loadingPkg === pkg.tag;

                return (
                  <div
                    key={pkg.tag}
                    className="relative rounded-2xl p-5 border flex flex-col"
                    style={{
                      background: isPopular ? 'rgba(217,70,168,0.08)' : 'var(--noc-page)',
                      borderColor: isPopular ? 'rgba(217,70,168,0.35)' : 'rgba(233,233,237,0.08)',
                    }}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-4">
                        <span className="bg-[var(--noc-magenta)] text-white text-xs font-bold px-3 py-0.5 rounded-full">
                          Best value
                        </span>
                      </div>
                    )}

                    <div className="flex-1 mb-5">
                      <p className="text-3xl font-extrabold text-white mb-1">
                        {pkg.credits.toLocaleString()}
                        <span className="text-base font-normal text-[var(--noc-t5)] ml-1.5">credits</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--noc-t4)] text-sm">{naira}</span>
                        {'saving' in pkg && (
                          <span className="text-emerald-400 text-xs font-semibold">{pkg.saving}</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCreditPurchase(pkg.tag)}
                      disabled={!!loadingPkg}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                      style={
                        isPopular
                          ? { background: 'var(--noc-magenta)', color: '#fff' }
                          : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)' }
                      }
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-[var(--noc-hairline)] border-t-[var(--noc-t1)] rounded-full animate-spin" />
                          Wait…
                        </span>
                      ) : 'Buy credits'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Credit rates reference */}
          <div
            className="rounded-2xl border mt-8 overflow-hidden"
            style={{ background: 'var(--noc-page)', borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <h3 className="font-semibold text-sm text-[var(--noc-t2)]">What each credit unlocks</h3>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {[
                { label: 'Nano Banana generation', cost: 50,  icon: '⚡', color: 'text-yellow-400' },
                { label: 'Grok Imagine generation', cost: 100, icon: '✨', color: 'text-violet-400' },
                { label: 'LTX-2 generation',        cost: 150, icon: '🎬', color: 'text-blue-400'   },
                { label: 'Wan 2.5 generation',      cost: 200, icon: '🌊', color: 'text-cyan-400'   },
                { label: 'Higgsfield generation',   cost: 400, icon: '🎥', color: 'text-pink-400'   },
                { label: 'Kling generation',         cost: 500, icon: '👑', color: 'text-amber-400'  },
                { label: 'AI thumbnail',             cost: 20,  icon: '🖼️', color: 'text-green-400' },
                { label: 'Video transcription',      cost: 30,  icon: '📝', color: 'text-teal-400'  },
                { label: 'Video enhance / upscale',  cost: 100, icon: '🔮', color: 'text-indigo-400' },
              ].map(({ label, cost, icon, color }) => (
                <div key={label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-[var(--noc-t3)] text-sm flex items-center gap-2">
                    <span className={color}>{icon}</span> {label}
                  </span>
                  <span className="text-[var(--noc-t5)] text-sm font-medium tabular-nums">{cost} cr</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[var(--noc-t6)] text-xs mt-10">
            Cancel anytime · Instant activation · NGN via Paystack · International via Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
