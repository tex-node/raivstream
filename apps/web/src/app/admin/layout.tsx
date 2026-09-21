'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/admin',                    label: 'Overview',           icon: '◈' },
  { href: '/admin/users',              label: 'Users',              icon: '👥' },
  { href: '/admin/moderation',         label: 'Moderation',         icon: '🛡️' },
  { href: '/admin/credits',            label: 'Credits',            icon: '⚡' },
  { href: '/admin/jobs',               label: 'AI Jobs',            icon: '🎬' },
  { href: '/admin/providers',           label: 'Providers',          icon: '▲' },
  { href: '/admin/story-analytics',    label: 'Story Analytics',    icon: 'A' },
  { href: '/admin/prompt-quality',     label: 'Prompt Quality',     icon: 'P' },
  { href: '/admin/character-insights', label: 'Character Insights', icon: 'C' },
  { href: '/admin/sequence',           label: 'Sequence',           icon: 'S' },
  { href: '/admin/movie-renders',      label: 'Movie Renders',      icon: 'M' },
  { href: '/admin/fal-refunds',        label: 'FAL Refunds',        icon: 'R' },
  { href: '/admin/academy',            label: 'Academy',            icon: 'L' },
  { href: '/admin/revenue',            label: 'Revenue',            icon: '💳' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, isLoaded } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (isLoaded && (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR'))) {
      router.replace('/');
    }
  }, [user, isLoaded, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--noc-page)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--noc-blue)]/30 border-t-[var(--noc-blue)]" />
      </div>
    );
  }

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
    return null;
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-[var(--noc-hairline)] px-6 py-5">
        <div>
          <Link
            href="/"
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/raivstream-logofull.png" alt="Raivstream" className="h-6 w-auto" />
          </Link>
          <div className="mt-1 inline-block rounded-full bg-[var(--noc-purple)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--noc-purple)]">
            Admin
          </div>
        </div>
        <button
          className="p-1 text-[var(--noc-t4)] hover:text-[var(--noc-t1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Admin navigation">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60 ${
                active
                  ? 'bg-[var(--noc-blue)]/12 text-[var(--noc-blue)]'
                  : 'text-[var(--noc-t3)] hover:bg-[var(--noc-card)] hover:text-[var(--noc-t1)]'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="text-base" aria-hidden="true">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-[var(--noc-hairline)] px-4 py-4">
        <div className="mb-0.5 text-xs text-[var(--noc-t5)]">Logged in as</div>
        <div className="truncate text-sm font-medium text-[var(--noc-t2)]">@{user.username}</div>
        <div className="mt-0.5 text-xs font-semibold text-[var(--noc-purple)]">{user.role}</div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[var(--noc-page)]">

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible, mobile: slide-in drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-shrink-0 flex-col border-r border-[var(--noc-hairline)] bg-[var(--noc-bar)] transition-transform duration-200 ease-in-out md:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--noc-hairline)] bg-[var(--noc-bar)] px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 p-1 text-[var(--noc-t4)] hover:text-[var(--noc-t1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold text-[var(--noc-t1)]">
            {NAV.find((n) => n.href === pathname)?.label ?? 'Admin'}
          </span>
          <span className="ml-auto rounded-full bg-[var(--noc-purple)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--noc-purple)]">
            {user.role}
          </span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
