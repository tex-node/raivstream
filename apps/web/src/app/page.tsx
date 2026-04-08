'use client';

import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { VideoFeed } from '@/components/feed/VideoFeed';
import { useUser } from '@/lib/auth';
import Link from 'next/link';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

// ─── Marketing landing page (shown to signed-out visitors) ───────────────────

function LandingPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: '#050b18' }}>
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(120,60,220,0.22) 0%, transparent 70%),' +
            'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(30,80,200,0.10) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10">
        <Navbar />

        {/* ── Hero ── */}
        <section className="max-w-6xl mx-auto px-4 pt-28 pb-20 text-center">
          {/* Announcement pill */}
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8 text-xs text-white/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            New · AI Video Studio is live — generate videos with Grok Imagine, Wan 2.5 &amp; more
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.06] tracking-tight mb-6">
            The short-form video<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #a78bfa 0%, #818cf8 40%, #38bdf8 100%)' }}
            >
              platform for creators.
            </span>
          </h1>

          <p className="text-white/50 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Raivstream centralises your content, AI video generation, and audience growth
            in one place. Upload, create, and go viral — all from a single dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Link
              href="/sign-up"
              className="px-7 py-3.5 rounded-2xl font-semibold text-sm text-white transition-all hover:scale-[1.03] active:scale-100"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              Start for free
            </Link>
            <Link
              href="/pricing"
              className="px-7 py-3.5 rounded-2xl font-semibold text-sm text-white/70 hover:text-white border border-white/15 hover:border-white/30 bg-white/[0.04] hover:bg-white/[0.08] transition-all"
            >
              See pricing
            </Link>
          </div>

          {/* Product screenshot */}
          <div
            className="relative mx-auto max-w-5xl rounded-2xl overflow-hidden border"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#0d1420' }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <span className="w-3 h-3 rounded-full bg-green-500/60" />
              <div className="flex-1 mx-4 bg-white/5 rounded-md h-6 flex items-center px-3">
                <span className="text-white/25 text-xs">app.raivstream.com</span>
              </div>
            </div>

            {/* Feed preview */}
            <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-black/40" style={{ aspectRatio: '16/8' }}>
              {[
                { gradient: 'from-purple-900 via-violet-800 to-purple-950', label: 'AI Generated · Wan 2.5' },
                { gradient: 'from-blue-900 via-indigo-800 to-blue-950', label: 'Trending · Music' },
                { gradient: 'from-pink-900 via-rose-800 to-pink-950', label: 'For You · Comedy' },
              ].map((card, i) => (
                <div
                  key={i}
                  className={`relative bg-gradient-to-b ${card.gradient} rounded-sm overflow-hidden flex flex-col justify-between p-3`}
                >
                  {/* Simulated video content */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/20" />
                    <div className="h-2 w-16 bg-white/20 rounded" />
                  </div>
                  <div>
                    <div className="h-2 w-3/4 bg-white/30 rounded mb-1.5" />
                    <div className="h-1.5 w-1/2 bg-white/15 rounded mb-3" />
                    <span className="text-[10px] text-white/40 bg-black/30 rounded px-1.5 py-0.5">{card.label}</span>
                  </div>
                  {/* Interaction buttons */}
                  <div className="absolute right-2 bottom-8 flex flex-col items-center gap-3">
                    {['❤️', '💬', '↗️'].map((icon, j) => (
                      <div key={j} className="text-sm opacity-70">{icon}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Glow under the screenshot */}
            <div
              className="absolute -bottom-10 left-1/4 right-1/4 h-20 blur-2xl rounded-full opacity-30"
              style={{ background: 'linear-gradient(90deg, #7c3aed, #2563eb)' }}
            />
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="max-w-6xl mx-auto px-4 py-24">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-4 text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              How it works
            </div>
            <h2 className="text-4xl font-extrabold">From sign-up to viral in minutes.</h2>
            <p className="text-white/40 mt-3 max-w-lg mx-auto">Launch your channel and reach an audience in four simple steps.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                n: '01',
                title: 'Create your account',
                body: 'Sign up in seconds. No credit card required for the free tier.',
                icon: '🙋',
              },
              {
                n: '02',
                title: 'Upload or generate',
                body: 'Upload existing clips or generate new ones instantly with our AI Studio.',
                icon: '🎬',
              },
              {
                n: '03',
                title: 'Grow your audience',
                body: 'Get discovered via the For You feed, trending charts, and Viewer\'s Pick.',
                icon: '🚀',
              },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-2xl p-6 border relative overflow-hidden"
                style={{ background: '#0a1020', borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <span
                  className="absolute top-4 right-5 text-5xl font-black leading-none select-none"
                  style={{ color: 'rgba(255,255,255,0.04)' }}
                >
                  {step.n}
                </span>
                <div className="text-3xl mb-4">{step.icon}</div>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Platform capabilities bento ── */}
        <section className="max-w-6xl mx-auto px-4 py-24">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-4 text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              Platform capabilities
            </div>
            <h2 className="text-4xl font-extrabold">Everything you need to grow.</h2>
            <p className="text-white/40 mt-3 max-w-lg mx-auto">Replace scattered tools with a single creator command centre.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: '⚡',
                title: 'Snap-scroll feed',
                body: 'TikTok-style vertical feed with instant snap-scroll. Desktop and mobile.',
                accent: '#7c3aed',
              },
              {
                icon: '🎨',
                title: 'AI Video Studio',
                body: 'Generate videos with Grok Imagine, Wan 2.5, LTX-2, and more — pay per generation with credits.',
                accent: '#0ea5e9',
              },
              {
                icon: '📊',
                title: 'Creator analytics',
                body: 'Views, likes, watch-time, follower growth — all in a live dashboard.',
                accent: '#10b981',
              },
              {
                icon: '🔒',
                title: 'Premium content',
                body: 'Gate your best content behind a paywall. Keep 70% of every subscription.',
                accent: '#f59e0b',
              },
              {
                icon: '🌍',
                title: 'Multi-currency payments',
                body: 'Paystack for NGN, Stripe for international — both run seamlessly in parallel.',
                accent: '#ec4899',
              },
              {
                icon: '🏆',
                title: 'Weekly badges',
                body: 'Top viewed, most liked, Viewer\'s Pick — automated badges keep your audience engaged.',
                accent: '#a78bfa',
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="rounded-2xl p-5 border group hover:border-white/20 transition-colors"
                style={{ background: '#0a1020', borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-4"
                  style={{ background: `${feat.accent}22` }}
                >
                  {feat.icon}
                </div>
                <h3 className="font-semibold text-white text-sm mb-1">{feat.title}</h3>
                <p className="text-white/40 text-xs leading-relaxed">{feat.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing preview ── */}
        <section className="max-w-5xl mx-auto px-4 py-24">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-4 text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
              Simple, transparent pricing
            </div>
            <h2 className="text-4xl font-extrabold">Start free. Scale as you grow.</h2>
            <p className="text-white/40 mt-3">All plans include the full viewing experience.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                name: 'Free',
                price: '₦0',
                period: 'forever',
                highlight: false,
                badge: null,
                features: ['5 free episodes/day', 'Public feed access', 'Standard quality', 'Create account'],
                cta: 'Get started',
                href: '/sign-up',
              },
              {
                name: 'Viewer',
                price: '₦1,500',
                period: '/month',
                highlight: true,
                badge: 'Most Popular',
                features: ['Unlimited viewing', 'Ad-free experience', 'HD quality', 'Exclusive content'],
                cta: 'Start watching',
                href: '/pricing',
              },
              {
                name: 'Creator',
                price: '$4.99',
                period: '/month',
                highlight: false,
                badge: null,
                features: ['Everything in Viewer', 'AI Video Studio', 'Creator analytics', '70% revenue share'],
                cta: 'Start creating',
                href: '/pricing',
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className="relative rounded-2xl p-6 border flex flex-col"
                style={{
                  background: plan.highlight ? 'rgba(124,58,237,0.12)' : '#0a1020',
                  borderColor: plan.highlight ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)',
                  boxShadow: plan.highlight ? '0 0 40px rgba(124,58,237,0.15)' : 'none',
                }}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span
                      className="text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="font-bold text-lg text-white">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-white/40 text-sm">{plan.period}</span>
                  </div>
                </div>

                <ul className="flex-1 space-y-2.5 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-white/70">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className="w-full py-3 rounded-xl font-semibold text-sm text-center transition-all block"
                  style={
                    plan.highlight
                      ? { background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)' }
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-white/25 text-xs mt-8">
            Cancel anytime · No hidden fees · NGN payments via Paystack · International via Stripe
          </p>
        </section>

        {/* ── Footer ── */}
        <footer
          className="border-t py-10 px-4"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="font-extrabold text-lg tracking-tight">
              Raiv<span className="text-violet-400">stream</span>
            </span>
            <div className="flex items-center gap-6 text-sm text-white/30">
              <Link href="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
              <Link href="/generate" className="hover:text-white/60 transition-colors">AI Studio</Link>
              <Link href="/sign-in" className="hover:text-white/60 transition-colors">Sign in</Link>
            </div>
            <p className="text-white/20 text-xs">© 2026 Raivstream. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Main home page — feed for signed-in, landing for signed-out ─────────────

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedType>('forYou');
  const { isSignedIn, isLoaded } = useUser();

  // Show nothing until auth state resolves to prevent flash
  if (!isLoaded) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Signed-in users get the TikTok-style video feed
  if (isSignedIn) {
    return (
      <main className="h-screen bg-black flex flex-col overflow-hidden">
        <div className="absolute top-0 left-0 right-0 z-50 flex flex-col items-center gap-2 pt-3 pb-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div className="pointer-events-auto w-full">
            <Navbar />
          </div>
          <div className="pointer-events-auto mt-10">
            <FeedTabs activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
        <VideoFeed feedType={activeTab} />
      </main>
    );
  }

  // Signed-out visitors get the marketing landing page
  return <LandingPage />;
}
