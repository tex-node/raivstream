'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/admin',             label: 'Overview',    icon: '◈' },
  { href: '/admin/users',       label: 'Users',       icon: '👥' },
  { href: '/admin/moderation',  label: 'Moderation',  icon: '🛡️' },
  { href: '/admin/credits',     label: 'Credits',     icon: '⚡' },
  { href: '/admin/jobs',        label: 'AI Jobs',     icon: '🎬' },
  { href: '/admin/story-analytics', label: 'Story Analytics', icon: 'A' },
  { href: '/admin/prompt-quality', label: 'Prompt Quality', icon: 'P' },
  { href: '/admin/character-insights', label: 'Character Insights', icon: 'C' },
  { href: '/admin/academy', label: 'Academy', icon: 'L' },
  { href: '/admin/revenue',     label: 'Revenue',     icon: '💳' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, isLoaded } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (isLoaded && (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR'))) {
      router.replace('/');
    }
  }, [user, isLoaded, router]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050b18' }}>
        <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
    return null;
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div>
          <Link href="/" className="text-white font-extrabold text-lg">
            Raiv<span style={{ color: '#a78bfa' }}>stream</span>
          </Link>
          <div className="mt-1 text-xs font-semibold px-2 py-0.5 rounded-full inline-block"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
            Admin
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          className="md:hidden text-white/40 hover:text-white p-1"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? 'rgba(167,139,250,0.15)' : 'transparent',
                color:      active ? '#a78bfa' : 'rgba(255,255,255,0.55)',
              }}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="text-xs text-white/30 mb-0.5">Logged in as</div>
        <div className="text-sm text-white/70 font-medium truncate">@{user.username}</div>
        <div className="text-xs mt-0.5 font-semibold" style={{ color: '#a78bfa' }}>{user.role}</div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex" style={{ background: '#050b18' }}>

      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar — desktop: always visible, mobile: slide-in drawer ── */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-56 flex-shrink-0 flex flex-col border-r
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#080f1f' }}
      >
        <SidebarContent />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-30"
          style={{ background: '#080f1f', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/50 hover:text-white p-1 -ml-1"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-white font-bold text-sm">
            {NAV.find((n) => n.href === pathname)?.label ?? 'Admin'}
          </span>
          <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
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
