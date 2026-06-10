'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Bell,
  BookOpen,
  Clapperboard,
  Compass,
  CreditCard,
  Grid3X3,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
} from 'lucide-react';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { VideoFeed } from '@/components/feed/VideoFeed';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

const mainNav = [
  { href: '/', label: 'Feed', icon: Compass },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/generate', label: 'AI Studio', icon: Sparkles },
  { href: '/story-studio', label: 'Story Studio', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/credits', label: 'Credits', icon: CreditCard },
];

function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'cyan' | 'green' | 'amber' }) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/5 text-white/60',
    cyan: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    green: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    amber: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedType>('forYou');
  const { isSignedIn, isLoaded, user } = useUser();
  const isR16 = useR16();

  if (!isLoaded) {
    return (
      <div className="h-screen bg-[#080b10] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/20 border-t-cyan-300 rounded-full animate-spin" />
      </div>
    );
  }

  const visibleNav = isR16
    ? mainNav.filter((item) => item.href === '/' || item.href === '/search')
    : mainNav;

  return (
    <main className="h-screen overflow-hidden bg-[#080b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_70%_10%,rgba(168,85,247,0.16),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.72),rgba(2,6,23,0.96))]" />

      <div className="relative z-10 grid h-full grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_320px]">
        <aside className="hidden min-h-0 border-r border-white/10 bg-black/30 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-300 text-sm font-black text-slate-950">
              R
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Raivstream</div>
              <div className="text-xs text-white/40">Video + AI creation OS</div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
              {isR16 ? 'Kids mode' : 'Create'}
            </div>
            <div className="space-y-1">
              {visibleNav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                    href === '/'
                      ? 'bg-cyan-300/12 text-cyan-100 ring-1 ring-cyan-300/20'
                      : 'text-white/52 hover:bg-white/6 hover:text-white'
                  }`}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>

            {!isR16 && (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clapperboard size={17} className="text-cyan-300" />
                  Story workflow
                </div>
                <p className="mt-2 text-xs leading-5 text-white/42">
                  Build characters, environments, storyboard shots, and generation prompts from one workspace.
                </p>
                <Link
                  href="/story-studio"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-950"
                >
                  Open Story Studio
                </Link>
              </div>
            )}
          </nav>

          <div className="border-t border-white/10 p-3">
            <Link
              href={isSignedIn && user?.username ? `/${user.username}` : '/sign-in'}
              className="flex items-center gap-3 rounded-lg bg-white/[0.035] px-3 py-2.5"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-300 via-fuchsia-400 to-violet-500 text-xs font-bold">
                {isSignedIn ? (user?.displayName?.[0] ?? user?.username?.[0] ?? 'U').toUpperCase() : '?'}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{isSignedIn ? user?.displayName ?? user?.username : 'Guest viewer'}</div>
                <div className="truncate text-xs text-white/40">{isSignedIn ? user?.premiumTier : '50 free episodes'}</div>
              </div>
            </Link>
          </div>
        </aside>

        <section className="relative min-w-0 min-h-0 overflow-hidden">
          <div className="absolute left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#080b10]/72 px-3 py-3 backdrop-blur-xl sm:px-5">
            <div className="mx-auto flex max-w-5xl items-center gap-3">
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-300 text-xs font-black text-slate-950">
                  R
                </div>
                <span className="font-semibold tracking-tight">{isR16 ? 'R16 Kids' : 'Raivstream'}</span>
              </Link>

              <div className="hidden items-center gap-2 lg:flex">
                <StatusPill tone={isR16 ? 'green' : 'cyan'}>{isR16 ? 'R16 safe feed' : 'Live feed'}</StatusPill>
                <StatusPill>AI powered</StatusPill>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {!isR16 && (
                  <Link
                    href="/generate"
                    className="hidden items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 sm:inline-flex"
                  >
                    <Sparkles size={15} />
                    Generate
                  </Link>
                )}
                <Link
                  href="/notifications"
                  className="hidden rounded-md border border-white/10 bg-white/[0.035] p-2 text-white/64 sm:inline-flex"
                  aria-label="Notifications"
                >
                  <Bell size={16} />
                </Link>
                {isSignedIn ? (
                  <Link
                    href={user?.username ? `/${user.username}` : '/settings'}
                    className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-300 via-fuchsia-400 to-violet-500 text-xs font-bold"
                  >
                    {(user?.displayName?.[0] ?? user?.username?.[0] ?? 'U').toUpperCase()}
                  </Link>
                ) : (
                  <Link href="/sign-in" className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-950">
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            <div className="pointer-events-auto mt-3 flex justify-center">
              <FeedTabs
                activeTab={activeTab}
                onChange={setActiveTab}
                signedIn={isSignedIn}
              />
            </div>
          </div>

          <div className="absolute inset-0 pt-[104px] lg:px-5 lg:pb-5">
            <div className="relative h-full overflow-hidden bg-black shadow-[0_30px_120px_rgba(0,0,0,0.4)] lg:rounded-2xl lg:border lg:border-white/10">
              <VideoFeed feedType={activeTab} />
            </div>
          </div>

          {!isSignedIn && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-16">
              <div className="pointer-events-auto mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0f16]/92 p-4 text-center shadow-2xl backdrop-blur-xl sm:flex-row sm:text-left">
                <div className="flex-1">
                  <p className="font-semibold text-white">Join free to unlock more episodes</p>
                  <p className="mt-1 text-xs text-white/45">Watch, follow creators, and save AI-generated story references.</p>
                </div>
                <div className="flex gap-2">
                  <Link href="/sign-up" className="rounded-md bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950">
                    Sign up
                  </Link>
                  <Link href="/pricing" className="rounded-md border border-white/10 px-4 py-2 text-xs font-semibold text-white/70">
                    Pricing
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 border-l border-white/10 bg-black/24 p-4 backdrop-blur-xl xl:block">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Studio status</h2>
                <StatusPill tone="green">Online</StatusPill>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-black/24 p-3">
                  <div className="text-2xl font-semibold">2K</div>
                  <div className="mt-1 text-xs text-white/38">Prompt limit</div>
                </div>
                <div className="rounded-lg bg-black/24 p-3">
                  <div className="text-2xl font-semibold">R16</div>
                  <div className="mt-1 text-xs text-white/38">Safe mode</div>
                </div>
              </div>
            </div>

            {!isR16 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <h2 className="text-sm font-semibold">Creator shortcuts</h2>
                <div className="mt-3 space-y-2">
                  {[
                    { href: '/upload', label: 'Upload video', icon: Upload },
                    { href: '/generate', label: 'Generate media', icon: Sparkles },
                    { href: '/story-studio', label: 'Build storyboard', icon: BookOpen },
                    { href: '/admin/credits', label: 'Manual credits', icon: ShieldCheck },
                  ].map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href} className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2.5 text-sm text-white/70 transition hover:border-cyan-300/30 hover:text-white">
                      <Icon size={16} className="text-cyan-300" />
                      <span>{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-amber-300" />
                <h2 className="text-sm font-semibold">Episode gate</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Guests get 50 free episodes. Free accounts get 10 before premium-only videos lock.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2">
                <Grid3X3 size={16} className="text-cyan-300" />
                <h2 className="text-sm font-semibold">Media library</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Thumbnails now fall back to playable videos or stable placeholders when source images are missing.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
