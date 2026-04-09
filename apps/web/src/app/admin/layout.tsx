'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/admin',          label: 'Overview',    icon: '◈' },
  { href: '/admin/users',    label: 'Users',       icon: '👥' },
  { href: '/admin/credits',  label: 'Credits',     icon: '⚡' },
  { href: '/admin/jobs',     label: 'AI Jobs',     icon: '🎬' },
  { href: '/admin/revenue',  label: 'Revenue',     icon: '💳' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, isLoaded } = useAuth();

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

  if (!isLoaded || !user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
    return null;
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#050b18' }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col border-r"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <Link href="/" className="text-white font-extrabold text-lg">
            Raiv<span style={{ color: '#a78bfa' }}>stream</span>
          </Link>
          <div className="mt-1 text-xs font-semibold px-2 py-0.5 rounded-full inline-block"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
            Admin
          </div>
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
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
